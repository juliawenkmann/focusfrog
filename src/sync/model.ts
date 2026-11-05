// How each stored FocusFrog value maps to cloud documents under users/{uid}.
// Pure functions only, so the merge rules can be tested without Firebase.

export type SyncedKey =
  | 'todos'
  | 'todoProjects'
  | 'timeBlocks'
  | 'manualWork'
  | 'pomodoroSessions'
  | 'visionBoard'
  | 'todoDayPlan'
  | 'todoFrog'
  | 'weeklySummaries'
  | 'daySums'
  | 'settings';

// items: a list of records with an `id`, one document each. Their order is not kept:
//   the pages sort todos, projects, blocks and entries themselves, and keeping an order
//   would rewrite many documents whenever a due date moves a todo.
// board: the vision board document { version, updatedAt, items }, stored like items plus
//   a `position` per dream for "My order".
// state: one small document holding the whole value.
// records: an object keyed by id (weekly sums), one document per key.
export type SyncKind = 'items' | 'board' | 'state' | 'records';

export interface KeySpec {
  kind: SyncKind;
  collection: string;
  // For state values: the document id inside `collection`.
  docId?: string;
  // Also kept by the Mac's local server in storage.json (under the same key).
  localServer?: true;
}

export const KEY_SPECS: Record<SyncedKey, KeySpec> = {
  todos: { kind: 'items', collection: 'todos', localServer: true },
  todoProjects: { kind: 'items', collection: 'todoProjects', localServer: true },
  timeBlocks: { kind: 'items', collection: 'timeBlocks', localServer: true },
  manualWork: { kind: 'items', collection: 'manualWork', localServer: true },
  // Pomodoro sessions, including the one running now.
  pomodoroSessions: { kind: 'items', collection: 'pomodoroSessions', localServer: true },
  visionBoard: { kind: 'board', collection: 'visionItems', localServer: true },
  todoDayPlan: { kind: 'state', collection: 'state', docId: 'todoDayPlan', localServer: true },
  todoFrog: { kind: 'state', collection: 'state', docId: 'todoFrog', localServer: true },
  weeklySummaries: { kind: 'records', collection: 'weeks', localServer: true },
  // Daily sums the Mac sends for the phone's Hours page (see util/daySums.ts).
  daySums: { kind: 'records', collection: 'days' },
  // The look (theme, flower picture) and day boundaries, shared by all devices.
  settings: { kind: 'state', collection: 'state', docId: 'settings' },
};

export const SYNCED_KEYS = Object.keys(KEY_SPECS) as SyncedKey[];

type JsonObject = Record<string, unknown>;

// The cloud documents of one key, by document id.
export type RemoteDocs = Map<string, JsonObject>;

// One document's content as the app sees it; compared as JSON to find changes.
export type Entries = Map<string, unknown>;

const BOARD_VERSION = 1;

function isObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function validId(id: unknown): id is string {
  return typeof id === 'string' && id.length > 0 && id.length <= 200 && !id.includes('/');
}

function listEntries(list: unknown, keepOrder: boolean): Entries {
  const entries: Entries = new Map();
  if (!Array.isArray(list)) return entries;
  list.forEach((item, position) => {
    if (isObject(item) && validId(item.id) && !entries.has(item.id)) {
      entries.set(item.id, keepOrder ? { item, position } : { item });
    }
  });
  return entries;
}

// The app value -> one entry per cloud document.
export function toEntries(spec: KeySpec, value: unknown): Entries {
  switch (spec.kind) {
    case 'items':
      return listEntries(value, false);
    case 'board':
      return listEntries(isObject(value) ? value.items : null, true);
    case 'state':
      return isObject(value) ? new Map([[spec.docId as string, value]]) : new Map();
    case 'records': {
      const entries: Entries = new Map();
      if (isObject(value)) {
        for (const [id, record] of Object.entries(value)) {
          if (validId(id) && isObject(record)) entries.set(id, record);
        }
      }
      return entries;
    }
  }
}

function liveItems(docs: RemoteDocs): unknown[] {
  return Array.from(docs.entries())
    .filter(([, doc]) => !doc.deletedAt && isObject(doc.item))
    .sort(
      ([idA, a], [idB, b]) =>
        Number(a.position ?? 0) - Number(b.position ?? 0) || idA.localeCompare(idB)
    )
    .map(([, doc]) => doc.item);
}

// Cloud documents -> the app value, or null when the cloud holds nothing for it.
export function fromRemote(spec: KeySpec, docs: RemoteDocs): unknown {
  switch (spec.kind) {
    case 'items':
      return liveItems(docs);
    case 'board': {
      const items = liveItems(docs);
      const updatedAt = Array.from(docs.values())
        .map(doc => String(doc.updatedAt || ''))
        .sort()
        .pop();
      return { version: BOARD_VERSION, updatedAt: updatedAt || '', items };
    }
    case 'state': {
      const doc = docs.get(spec.docId as string);
      return doc && isObject(doc.value) ? doc.value : null;
    }
    case 'records': {
      const records: JsonObject = {};
      docs.forEach((doc, id) => {
        const record = { ...doc };
        delete record.device;
        records[id] = record;
      });
      return records;
    }
  }
}

export function fingerprint(entries: Entries): Map<string, string> {
  const prints = new Map<string, string>();
  entries.forEach((entry, id) => prints.set(id, JSON.stringify(entry)));
  return prints;
}

interface EntryDiff {
  changed: [string, unknown][];
  removed: string[];
}

// What a save changes compared with the value the page last had. Only items that were
// in that baseline can be removed, so a page that saves before it loaded never deletes.
export function diffEntries(baseline: Map<string, string>, next: Entries): EntryDiff {
  const changed: [string, unknown][] = [];
  next.forEach((entry, id) => {
    if (baseline.get(id) !== JSON.stringify(entry)) changed.push([id, entry]);
  });
  const removed = Array.from(baseline.keys()).filter(id => !next.has(id));
  return { changed, removed };
}

export interface DocStamp {
  updatedAt: string;
  device: string;
}

// The cloud document for one changed entry.
export function entryDoc(spec: KeySpec, entry: unknown, stamp: DocStamp): JsonObject {
  switch (spec.kind) {
    case 'items':
    case 'board': {
      const { item, position } = entry as { item: JsonObject; position?: number };
      return {
        item,
        ...(position === undefined ? {} : { position }),
        updatedAt: stamp.updatedAt,
        deletedAt: null,
        device: stamp.device,
      };
    }
    case 'state':
      return { value: entry, updatedAt: stamp.updatedAt, device: stamp.device };
    case 'records':
      return { ...(entry as JsonObject), device: stamp.device };
  }
}

// A deleted item stays as a tombstone so other devices drop it too.
export function tombstoneDoc(id: string, stamp: DocStamp): JsonObject {
  return {
    item: { id },
    updatedAt: stamp.updatedAt,
    deletedAt: stamp.updatedAt,
    device: stamp.device,
  };
}
