// Security-rule tests. Run with `npm run test:rules` (starts a Firestore emulator).
import { readFileSync } from 'node:fs';
import { after, before, beforeEach, describe, test } from 'node:test';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import { collection, deleteDoc, doc, getDoc, getDocs, setDoc } from 'firebase/firestore';

const OWNER_UID = 'owner-uid';
const OWNER_EMAIL = 'juliawenkmann@gmail.com';
let env;

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-focusfrog',
    firestore: {
      rules: readFileSync(new URL('../../firebase/firestore.rules', import.meta.url), 'utf8'),
    },
  });
});

after(async () => {
  await env.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
});

const owner = () => env.authenticatedContext(OWNER_UID, { email: OWNER_EMAIL }).firestore();
const ownerDoc = (...path) => doc(owner(), 'users', OWNER_UID, ...path);

const todoDoc = (id = 'todo-1', overrides = {}) => ({
  item: { id, title: 'Write the paper', completed: false },
  updatedAt: '2026-11-05T10:00:00.000Z',
  deletedAt: null,
  device: 'mac-1',
  ...overrides,
});

const sums = {
  activeDuration: 3600,
  workDuration: 3000,
  notWorkDuration: 600,
  categoryDurations: [{ category: ['Work', 'Programming'], duration: 3000 }],
  computedAt: '2026-11-05T10:00:00.000Z',
};

async function seed(path, data) {
  await env.withSecurityRulesDisabled(async context => {
    await setDoc(doc(context.firestore(), ...path), data);
  });
}

describe('only the owner sees FocusFrog data', () => {
  test('the owner can write and read their todos', async () => {
    await assertSucceeds(setDoc(ownerDoc('todos', 'todo-1'), todoDoc()));
    await assertSucceeds(getDoc(ownerDoc('todos', 'todo-1')));
    await assertSucceeds(getDocs(collection(owner(), 'users', OWNER_UID, 'todos')));
  });

  test('signed-out visitors can read nothing', async () => {
    await seed(['users', OWNER_UID, 'todos', 'todo-1'], todoDoc());
    const visitor = env.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(visitor, 'users', OWNER_UID, 'todos', 'todo-1')));
    await assertFails(getDocs(collection(visitor, 'users', OWNER_UID, 'todos')));
  });

  test('another account can neither read nor write the owner data', async () => {
    await seed(['users', OWNER_UID, 'todos', 'todo-1'], todoDoc());
    const stranger = env
      .authenticatedContext('stranger-uid', { email: 'someone@example.com' })
      .firestore();
    await assertFails(getDoc(doc(stranger, 'users', OWNER_UID, 'todos', 'todo-1')));
    await assertFails(getDocs(collection(stranger, 'users', OWNER_UID, 'todos')));
    await assertFails(setDoc(doc(stranger, 'users', OWNER_UID, 'todos', 'todo-2'), todoDoc('todo-2')));
  });

  test('another account cannot use FocusFrog for its own data either', async () => {
    const stranger = env
      .authenticatedContext('stranger-uid', { email: 'someone@example.com' })
      .firestore();
    await assertFails(setDoc(doc(stranger, 'users', 'stranger-uid', 'todos', 't'), todoDoc('t')));
  });

  test('the owner email on someone else uid is not enough', async () => {
    const impostor = env
      .authenticatedContext('impostor-uid', { email: OWNER_EMAIL })
      .firestore();
    await seed(['users', OWNER_UID, 'todos', 'todo-1'], todoDoc());
    await assertFails(getDoc(doc(impostor, 'users', OWNER_UID, 'todos', 'todo-1')));
  });

  test('collections outside the allowed list are refused', async () => {
    await assertFails(setDoc(ownerDoc('secrets', 'x'), todoDoc('x')));
    await assertFails(setDoc(doc(owner(), 'shared', 'x'), { value: 1 }));
  });
});

describe('item documents', () => {
  test('a tombstone keeps a deleted todo deleted', async () => {
    await assertSucceeds(
      setDoc(ownerDoc('todos', 'todo-1'), todoDoc('todo-1', { deletedAt: '2026-11-05T11:00:00Z' }))
    );
  });

  test('the item id must match the document id', async () => {
    await assertFails(setDoc(ownerDoc('todos', 'todo-2'), todoDoc('todo-1')));
  });

  test('unexpected top-level fields are refused', async () => {
    await assertFails(setDoc(ownerDoc('todos', 'todo-1'), { ...todoDoc(), url: 'https://x' }));
  });

  test('dreams carry their board position', async () => {
    await assertSucceeds(
      setDoc(ownerDoc('visionItems', 'dream-1'), { ...todoDoc('dream-1'), position: 3 })
    );
  });

  test('an older offline edit cannot overwrite a newer one', async () => {
    await seed(['users', OWNER_UID, 'todos', 'todo-1'], todoDoc('todo-1', {
      updatedAt: '2026-11-05T10:05:00.000Z',
    }));
    await assertFails(setDoc(ownerDoc('todos', 'todo-1'), todoDoc('todo-1', {
      updatedAt: '2026-11-05T10:00:00.000Z',
    })));
    await assertSucceeds(setDoc(ownerDoc('todos', 'todo-1'), todoDoc('todo-1', {
      updatedAt: '2026-11-05T10:06:00.000Z',
    })));
  });

  test('the owner can delete documents', async () => {
    await seed(['users', OWNER_UID, 'todos', 'todo-1'], todoDoc());
    await assertSucceeds(deleteDoc(ownerDoc('todos', 'todo-1')));
  });
});

describe('time sums never carry window titles or URLs', () => {
  test('a day with only sums is accepted', async () => {
    await assertSucceeds(setDoc(ownerDoc('days', '2026-11-05'), { date: '2026-11-05', ...sums }));
  });

  test('a day with a title, url or app is refused', async () => {
    for (const field of ['title', 'url', 'app', 'events']) {
      await assertFails(
        setDoc(ownerDoc('days', '2026-11-05'), { date: '2026-11-05', ...sums, [field]: 'x' })
      );
    }
  });

  test('the day field must match the document', async () => {
    await assertFails(setDoc(ownerDoc('days', '2026-11-05'), { date: '2026-11-04', ...sums }));
  });

  test('weekly sums keep the shape the Hours page stores', async () => {
    const week = {
      version: 1,
      weekStart: '2026-11-02',
      contextKey: 'abc123',
      keptAfterContextChange: true,
      ...sums,
    };
    await assertSucceeds(setDoc(ownerDoc('weeks', '2026-11-02'), week));
    await assertFails(setDoc(ownerDoc('weeks', '2026-11-02'), { ...week, title: 'Inbox' }));
  });
});

describe('state and photos', () => {
  test('known state documents are accepted, others refused', async () => {
    const state = { value: { date: '2026-11-05', todoIds: [] }, updatedAt: 'now', device: 'mac' };
    await assertSucceeds(setDoc(ownerDoc('state', 'todoDayPlan'), state));
    await assertFails(setDoc(ownerDoc('state', 'everything'), state));
  });

  test('photos must be small WebP or JPEG images', async () => {
    const photo = {
      data: 'UklGRg==',
      mimeType: 'image/webp',
      width: 1280,
      height: 853,
      updatedAt: '2026-11-05T10:00:00.000Z',
      device: 'mac',
    };
    await assertSucceeds(setDoc(ownerDoc('visionImages', 'img-1'), photo));
    await assertFails(setDoc(ownerDoc('visionImages', 'img-2'), { ...photo, mimeType: 'text/html' }));
    await assertFails(
      setDoc(ownerDoc('visionImages', 'img-3'), { ...photo, data: 'x'.repeat(900001) })
    );
  });
});
