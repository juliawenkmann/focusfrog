// Keeps one stored value (todos, the vision board, ...) in step with its cloud documents.
// The cloud is the source of truth while signed in; the page gets every change from
// another device through `onChange`, and each save writes only what changed.
import {
  DocStamp,
  entryDoc,
  diffEntries,
  fingerprint,
  fromRemote,
  KeySpec,
  RemoteDocs,
  toEntries,
  tombstoneDoc,
} from '~/sync/model';

export interface SnapshotInfo {
  // True while the documents come from this device's cache, before the server answered.
  fromCache: boolean;
}

type Writes = [string, Record<string, unknown>][];

// The small slice of Firestore the engine needs; replaced by a fake in tests.
export interface SyncBackend {
  listen(
    spec: KeySpec,
    onDocs: (docs: RemoteDocs, info: SnapshotInfo) => void,
    onError: (error: unknown) => void
  ): () => void;
  write(spec: KeySpec, writes: Writes): Promise<void>;
}

export type ChangeListener = (value: unknown) => void;

// Content of a value independent of list order (todo order is the page's business).
function canonical(prints: Map<string, string>): string {
  return JSON.stringify(Array.from(prints.entries()).sort(([a], [b]) => a.localeCompare(b)));
}

export class KeySync {
  private remote: RemoteDocs = new Map();
  private baseline = new Map<string, string>();
  private delivered = '';
  private listeners = new Set<ChangeListener>();
  private stopListening: (() => void) | null = null;
  private resolveReady: (() => void) | null = null;
  private ready: Promise<void>;
  // True once loads stop waiting: the server answered, or the wait timed out (offline).
  private settled = false;
  private serverSeen = false;
  // True once the page has the cloud's value (loaded it or got it through onChange).
  private pageLoaded = false;
  private pendingImport: unknown = undefined;

  constructor(
    readonly spec: KeySpec,
    private backend: SyncBackend,
    private stamp: () => DocStamp,
    private onWrite: (write: Promise<void>) => void = () => undefined
  ) {
    this.ready = new Promise(resolve => {
      this.resolveReady = resolve;
    });
  }

  start(): void {
    if (this.stopListening) return;
    this.stopListening = this.backend.listen(
      this.spec,
      (docs, info) => this.receive(docs, info),
      error => {
        console.warn('FocusFrog cloud: could not listen to', this.spec.collection, error);
        this.resolveReady?.();
      }
    );
  }

  stop(): void {
    this.stopListening?.();
    this.stopListening = null;
    this.listeners.clear();
  }

  // Resolves once the cloud answered. Offline it gives up after `timeoutMs` once, and
  // later loads use the cached copy straight away.
  async whenReady(timeoutMs = 4000): Promise<void> {
    if (this.settled) return;
    await Promise.race([this.ready, new Promise(resolve => setTimeout(resolve, timeoutMs))]);
    this.settled = true;
  }

  // The current value without taking it as a page's baseline: for readers that never
  // save this value (the frog reminder, the phone's Hours, the uploaders). Only the page
  // that saves a value may call value(), or a stale copy could pass the save guard.
  peek(): unknown {
    return fromRemote(this.spec, this.remote);
  }

  // The current value, and from now on the page's baseline.
  value(): unknown {
    const value = this.peek();
    this.adopt(value);
    return value;
  }

  onChange(listener: ChangeListener): void {
    this.listeners.add(listener);
  }

  offChange(listener: ChangeListener): void {
    this.listeners.delete(listener);
  }

  // Writes what changed since the page's baseline. Before the page has the cloud's
  // value, its copy may be stale, so it may only add what the cloud has never seen.
  save(value: unknown): void {
    if (!this.pageLoaded) {
      this.importLocal(value);
      return;
    }
    const entries = toEntries(this.spec, value);
    const { changed, removed } = diffEntries(this.baseline, entries);
    this.baseline = fingerprint(entries);
    this.delivered = canonical(this.baseline);
    if (!changed.length && !removed.length) return;
    const stamp = this.stamp();
    const writes: Writes = changed.map(([id, entry]) => [id, entryDoc(this.spec, entry, stamp)]);
    if (this.spec.kind === 'items' || this.spec.kind === 'board') {
      removed.forEach(id => writes.push([id, tombstoneDoc(id, stamp)]));
    }
    this.track(this.backend.write(this.spec, writes));
  }

  // Uploads what this device has that the cloud has never seen (no document, not even a
  // tombstone), once the server answered: a cached copy could miss tombstones.
  importLocal(local: unknown): void {
    if (local === null || local === undefined) return;
    if (!this.serverSeen) {
      this.pendingImport = local;
      return;
    }
    const stamp = this.stamp();
    const writes: Writes = Array.from(toEntries(this.spec, local))
      .filter(([id]) => !this.remote.has(id))
      .map(([id, entry]) => [id, entryDoc(this.spec, entry, stamp)]);
    if (!writes.length) return;
    // Visible at once, so a page loading right now already sees what was uploaded.
    writes.forEach(([id, doc]) => this.remote.set(id, doc));
    this.track(this.backend.write(this.spec, writes));
  }

  private receive(docs: RemoteDocs, info: SnapshotInfo): void {
    this.remote = docs;
    if (!info.fromCache) {
      this.serverSeen = true;
      if (this.pendingImport !== undefined) {
        const local = this.pendingImport;
        this.pendingImport = undefined;
        this.importLocal(local);
      }
      this.resolveReady?.();
    }
    // Only a page that listens gets changes (one that has not loaded yet picks the value
    // up then), and the page's own saves coming back here are not passed on.
    if (!this.listeners.size) return;
    const value = fromRemote(this.spec, docs);
    if (canonical(fingerprint(toEntries(this.spec, value))) === this.delivered) return;
    this.adopt(value);
    this.listeners.forEach(listener => listener(value));
  }

  private adopt(value: unknown): void {
    this.pageLoaded = true;
    this.baseline = fingerprint(toEntries(this.spec, value));
    this.delivered = canonical(this.baseline);
  }

  private track(write: Promise<void>): void {
    // A stale write is refused by the rules; the snapshot then brings the newer copy.
    this.onWrite(
      write.catch(error => {
        console.warn('FocusFrog cloud: write refused for', this.spec.collection, error);
      })
    );
  }
}
