// Where FocusFrog pages load and save their data (todos, projects, the vision board, ...).
//
// - On the Mac the local FocusFrog server keeps everything in storage.json, as before.
// - When the owner is signed in to the cloud, the cloud is the source of truth: loads
//   come from it, saves go to both, and changes made on another device arrive through
//   onStoredValueChange.
import { activeKeySync, keySync, onCloudValue, onOwnerSignIn } from '~/sync/cloud';
import { IS_CLOUD_BUILD } from '~/sync/config';
import type { KeySync } from '~/sync/engine';
import { KEY_SPECS, SYNCED_KEYS, SyncedKey } from '~/sync/model';

export interface StoredValue {
  value: unknown;
  // True when the value is the cloud's: pages then replace their copy instead of merging,
  // so something deleted on another device does not come back.
  fromCloud: boolean;
}

// The phone build has no local server; on the Mac it keeps only some values.
const onLocalServer = (key: SyncedKey) =>
  !IS_CLOUD_BUILD && typeof fetch !== 'undefined' && Boolean(KEY_SPECS[key].localServer);

async function loadServerValue(key: SyncedKey): Promise<unknown> {
  if (!onLocalServer(key)) return null;
  try {
    const response = await fetch(`/focusfrog-storage/${key}`, { cache: 'no-store' });
    return response.ok ? (await response.json())?.value ?? null : null;
  } catch (error) {
    console.warn('Could not load FocusFrog server storage:', key, error);
    return null;
  }
}

function saveServerValue(key: SyncedKey, value: unknown): Promise<boolean> {
  if (!onLocalServer(key)) return Promise.resolve(false);
  return fetch(`/focusfrog-storage/${key}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ value }),
  })
    .then(response => response.ok)
    .catch(error => {
      console.warn('Could not save FocusFrog server storage:', key, error);
      return false;
    });
}

// When the owner signs in on the Mac, everything in storage.json that the cloud has
// never seen is uploaded (the first time: all of it).
const imports = new Map<SyncedKey, Promise<void>>();
onOwnerSignIn(syncs => {
  SYNCED_KEYS.filter(onLocalServer).forEach(key => {
    const sync = syncs.get(key);
    if (!sync) return;
    imports.set(
      key,
      loadServerValue(key).then(local => sync.importLocal(local))
    );
  });
});

async function read(key: SyncedKey, take: (sync: KeySync) => unknown): Promise<StoredValue> {
  const sync = await keySync(key);
  if (!sync) return { value: await loadServerValue(key), fromCloud: false };
  await imports.get(key);
  await sync.whenReady();
  return { value: take(sync), fromCloud: true };
}

// For the page that saves this value: the cloud's copy becomes its baseline.
export const loadStoredValue = (key: SyncedKey) => read(key, sync => sync.value());

// For code that only reads a value and never saves it (see KeySync.peek).
export const peekStoredValue = (key: SyncedKey) => read(key, sync => sync.peek());

// Saves to the Mac's storage.json (if there is one) and to the cloud (if signed in).
// Resolves to whether at least one of them took it.
export function saveStoredValue(key: SyncedKey, value: unknown): Promise<boolean> {
  const sync = activeKeySync(key);
  sync?.save(value);
  return saveServerValue(key, value).then(saved => saved || Boolean(sync));
}

// Changes from another device. Returns a function that stops listening.
export const onStoredValueChange = onCloudValue;
