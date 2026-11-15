import { KeySync, SnapshotInfo, SyncBackend } from '../../src/sync/engine';
import { fromRemote, KEY_SPECS, KeySpec, RemoteDocs, toEntries } from '../../src/sync/model';

type Docs = Map<string, Record<string, unknown>>;

type Listener = { spec: KeySpec; onDocs: (docs: RemoteDocs, info: SnapshotInfo) => void };

// An in-memory cloud shared by several devices. Writes are visible to every listener
// at once, like Firestore after the server acknowledged them.
class FakeCloud {
  collections = new Map<string, Docs>();
  writes: [string, string, Record<string, unknown>][] = [];
  private listeners: Listener[] = [];
  online = true;

  docs(collection: string): Docs {
    if (!this.collections.has(collection)) this.collections.set(collection, new Map());
    return this.collections.get(collection) as Docs;
  }

  backend(): SyncBackend {
    return {
      listen: (spec, onDocs) => {
        const listener = { spec, onDocs };
        this.listeners.push(listener);
        this.emitTo(listener);
        return () => {
          this.listeners = this.listeners.filter(candidate => candidate !== listener);
        };
      },
      // Like the rules (`macWins`): a document from another device must name the version
      // it changed; each document is accepted or refused on its own.
      write: async (spec, writes) => {
        let refused = 0;
        writes.forEach(([id, data]) => {
          const current = this.docs(spec.collection).get(id);
          if (current && data.mac !== true && 'base' in data && data.base !== current.updatedAt) {
            refused += 1;
            return;
          }
          this.docs(spec.collection).set(id, data);
          this.writes.push([spec.collection, id, data]);
        });
        this.listeners
          .filter(l => l.spec.collection === spec.collection)
          .forEach(l => this.emitTo(l));
        if (refused) throw new Error(`${refused} change(s) refused`);
      },
    };
  }

  private emitTo(listener: Listener) {
    const all = this.docs(listener.spec.collection);
    const docs: RemoteDocs = listener.spec.docId
      ? new Map(Array.from(all).filter(([id]) => id === listener.spec.docId))
      : new Map(all);
    listener.onDocs(docs, { fromCache: !this.online });
  }
}

let clock = 0;
const stamp = (name: string) => () => ({
  updatedAt: new Date(Date.UTC(2026, 10, 5, 10, 0, clock++)).toISOString(),
  device: name,
  mac: name === 'mac',
});

const todo = (id: string, title = id, extra: Record<string, unknown> = {}) => ({
  id,
  title,
  completed: false,
  ...extra,
});

function device(cloud: FakeCloud, name: string, spec = KEY_SPECS.todos) {
  const sync = new KeySync(spec, cloud.backend(), stamp(name));
  sync.start();
  return sync;
}

describe('cloud document model', () => {
  test('todos round-trip without their order', () => {
    const value = [todo('b'), todo('a')];
    const docs: RemoteDocs = new Map(
      Array.from(toEntries(KEY_SPECS.todos, value)).map(([id, entry]) => [
        id,
        { ...(entry as object), updatedAt: 'x', deletedAt: null, device: 'mac' },
      ])
    );
    expect(fromRemote(KEY_SPECS.todos, docs)).toEqual([todo('a'), todo('b')]);
  });

  test('the vision board keeps "My order"', () => {
    const board = { version: 1, updatedAt: 'u', items: [todo('z'), todo('a'), todo('m')] };
    const docs: RemoteDocs = new Map(
      Array.from(toEntries(KEY_SPECS.visionBoard, board)).map(([id, entry]) => [
        id,
        { ...(entry as object), updatedAt: '2026-11-05T10:00:00.000Z', deletedAt: null },
      ])
    );
    const value = fromRemote(KEY_SPECS.visionBoard, docs) as { items: { id: string }[] };
    expect(value.items.map(item => item.id)).toEqual(['z', 'a', 'm']);
  });

  test('weekly sums drop the device stamp', () => {
    const docs: RemoteDocs = new Map([['2026-11-02', { workDuration: 5, device: 'mac' }]]);
    expect(fromRemote(KEY_SPECS.weeklySummaries, docs)).toEqual({
      '2026-11-02': { workDuration: 5 },
    });
  });

  test('items without a usable id are not synced', () => {
    const entries = toEntries(KEY_SPECS.todos, [todo('ok'), { title: 'no id' }, todo('a/b')]);
    expect(Array.from(entries.keys())).toEqual(['ok']);
  });
});

describe('syncing between two devices', () => {
  test('a save writes only what changed', () => {
    const cloud = new FakeCloud();
    const mac = device(cloud, 'mac');
    mac.value();
    mac.save([todo('a'), todo('b')]);
    cloud.writes = [];
    mac.save([todo('a', 'A renamed'), todo('b')]);
    expect(cloud.writes.map(([, id]) => id)).toEqual(['a']);
  });

  test('an edit on the phone reaches the Mac', () => {
    const cloud = new FakeCloud();
    const mac = device(cloud, 'mac');
    const phone = device(cloud, 'phone');
    const seen: unknown[] = [];
    mac.onChange(value => seen.push(value));
    mac.value();
    mac.save([todo('a')]);
    phone.value();
    phone.save([todo('a', 'from phone')]);
    expect(seen).toEqual([[todo('a', 'from phone')]]);
  });

  test("a device's own save does not come back as a change", () => {
    const cloud = new FakeCloud();
    const mac = device(cloud, 'mac');
    const seen: unknown[] = [];
    mac.onChange(value => seen.push(value));
    mac.value();
    mac.save([todo('b'), todo('a')]);
    expect(seen).toEqual([]);
  });

  test('a todo deleted on the phone stays deleted on the Mac', () => {
    const cloud = new FakeCloud();
    const mac = device(cloud, 'mac');
    const phone = device(cloud, 'phone');
    mac.value();
    mac.save([todo('a'), todo('b')]);
    phone.value();
    phone.save([todo('a')]);
    expect(cloud.docs('todos').get('b')?.deletedAt).toBeTruthy();

    // The Mac page applies the change, then saves its list again.
    const macTodos = mac.value() as unknown[];
    expect(macTodos).toEqual([todo('a')]);
    mac.save(macTodos);
    expect(cloud.docs('todos').get('b')?.deletedAt).toBeTruthy();
  });

  test('a page that saves before it loaded cannot delete anything', () => {
    const cloud = new FakeCloud();
    const mac = device(cloud, 'mac');
    mac.value();
    mac.save([todo('a'), todo('b')]);
    const fresh = device(cloud, 'phone');
    fresh.save([todo('c'), todo('a', 'stale copy')]);
    expect(cloud.docs('todos').get('a')).toMatchObject({ item: todo('a'), deletedAt: null });
    expect(cloud.docs('todos').get('b')?.deletedAt).toBeNull();
    // Something genuinely new is still kept.
    expect(cloud.docs('todos').get('c')?.item).toEqual(todo('c'));
  });

  test('a reader peeking does not let a stale page overwrite or delete', () => {
    const cloud = new FakeCloud();
    const phone = device(cloud, 'phone');
    phone.value();
    phone.save([todo('a', 'edited on the phone'), todo('b')]);

    // On the Mac the frog reminder only reads; the Todos page then saves its old copy
    // (from before the phone's edits) before it has loaded the cloud's.
    const mac = device(cloud, 'mac');
    expect(mac.peek()).toEqual([todo('a', 'edited on the phone'), todo('b')]);
    mac.save([todo('a', 'old title')]);

    expect(cloud.docs('todos').get('a')?.item).toEqual(todo('a', 'edited on the phone'));
    expect(cloud.docs('todos').get('b')?.deletedAt).toBeNull();
  });

  test('importing uploads only what the cloud has never seen', () => {
    const cloud = new FakeCloud();
    const phone = device(cloud, 'phone');
    phone.value();
    phone.save([todo('kept'), todo('deleted')]);
    phone.save([todo('kept')]);
    cloud.writes = [];

    const mac = device(cloud, 'mac');
    mac.importLocal([todo('kept', 'old title'), todo('deleted'), todo('new on mac')]);
    expect(cloud.writes.map(([, id]) => id)).toEqual(['new on mac']);
    expect(mac.value()).toEqual([todo('kept'), todo('new on mac')]);
  });

  test('importing waits for the server so cached gaps cannot revive deleted items', () => {
    const cloud = new FakeCloud();
    cloud.online = false;
    const mac = device(cloud, 'mac');
    mac.importLocal([todo('a')]);
    expect(cloud.writes).toEqual([]);
    cloud.online = true;
    cloud.backend().write(KEY_SPECS.todos, []);
    expect(cloud.writes.map(([, id]) => id)).toEqual(['a']);
  });

  test('state documents sync whole', () => {
    const cloud = new FakeCloud();
    const mac = device(cloud, 'mac', KEY_SPECS.todoDayPlan);
    const phone = device(cloud, 'phone', KEY_SPECS.todoDayPlan);
    const seen: unknown[] = [];
    phone.onChange(value => seen.push(value));
    mac.value();
    mac.save({ date: '2026-11-05', todoIds: ['a', 'b'] });
    expect(seen).toEqual([{ date: '2026-11-05', todoIds: ['a', 'b'] }]);
  });
});

describe('the Mac wins', () => {
  // The phone page holds a copy; the Mac changes the same todo; the phone, still on its
  // old copy, saves its own change to it.
  function staleSetup() {
    const cloud = new FakeCloud();
    const mac = device(cloud, 'mac');
    const phone = device(cloud, 'phone');
    mac.value();
    mac.save([todo('a'), todo('b')]);
    phone.value();
    mac.value();
    mac.save([todo('a', 'renamed on the Mac'), todo('b')]);
    return { cloud, mac, phone };
  }

  test('a phone change to a copy the Mac has replaced is refused', async () => {
    const { cloud, phone } = staleSetup();
    phone.save([todo('a', 'stale phone edit'), todo('b')]);
    await Promise.resolve();
    expect(cloud.docs('todos').get('a')?.item).toEqual(todo('a', 'renamed on the Mac'));
  });

  test("the phone's other changes in the same save still go through", async () => {
    const { cloud, phone } = staleSetup();
    phone.save([todo('a', 'stale phone edit'), todo('b', 'phone edit')]);
    await Promise.resolve();
    expect(cloud.docs('todos').get('b')?.item).toEqual(todo('b', 'phone edit'));
    expect(cloud.docs('todos').get('a')?.item).toEqual(todo('a', 'renamed on the Mac'));
  });

  test('a phone that has the latest version can change it', () => {
    const { cloud, phone } = staleSetup();
    const current = phone.value() as unknown[];
    phone.save(current.map(item => ({ ...(item as object), completed: true })));
    expect(cloud.docs('todos').get('a')?.item).toMatchObject({ completed: true });
  });

  test('a phone that kept editing builds on its own last save', () => {
    const cloud = new FakeCloud();
    const phone = device(cloud, 'phone');
    phone.value();
    phone.save([todo('a')]);
    phone.save([todo('a', 'second edit')]);
    phone.save([todo('a', 'third edit')]);
    expect(cloud.docs('todos').get('a')?.item).toEqual(todo('a', 'third edit'));
  });

  test('the Mac overwrites whatever the phone did', () => {
    const cloud = new FakeCloud();
    const mac = device(cloud, 'mac');
    const phone = device(cloud, 'phone');
    mac.value();
    mac.save([todo('a')]);
    phone.value();
    phone.save([todo('a', 'phone edit')]);
    mac.save([todo('a', 'Mac edit')]);
    expect(cloud.docs('todos').get('a')?.item).toEqual(todo('a', 'Mac edit'));
    expect(cloud.docs('todos').get('a')).toMatchObject({ mac: true });
  });

  test('the same content saved again elsewhere keeps the phone current', () => {
    const cloud = new FakeCloud();
    const mac = device(cloud, 'mac');
    const phone = device(cloud, 'phone');
    mac.value();
    mac.save([todo('a')]);
    phone.value();
    // The Mac saves the very same todo again (a newer stamp, nothing new in it).
    cloud
      .backend()
      .write(KEY_SPECS.todos, [
        [
          'a',
          { item: todo('a'), updatedAt: '2026-12-01T00:00:00.000Z', deletedAt: null, mac: true },
        ],
      ]);
    phone.save([todo('a', 'phone edit')]);
    expect(cloud.docs('todos').get('a')?.item).toEqual(todo('a', 'phone edit'));
  });

  test('a stale phone cannot delete what the Mac changed', async () => {
    const { cloud, phone } = staleSetup();
    phone.save([todo('b')]);
    await Promise.resolve();
    expect(cloud.docs('todos').get('a')?.deletedAt).toBeNull();
  });

  test('state documents follow the same rule', async () => {
    const cloud = new FakeCloud();
    const mac = device(cloud, 'mac', KEY_SPECS.todoDayPlan);
    const phone = device(cloud, 'phone', KEY_SPECS.todoDayPlan);
    mac.value();
    mac.save({ date: '2026-11-10', todoIds: ['a'] });
    phone.value();
    mac.value();
    mac.save({ date: '2026-11-10', todoIds: ['a', 'b'] });
    phone.save({ date: '2026-11-10', todoIds: [] });
    await Promise.resolve();
    expect(cloud.docs('state').get('todoDayPlan')?.value).toEqual({
      date: '2026-11-10',
      todoIds: ['a', 'b'],
    });
  });
});
