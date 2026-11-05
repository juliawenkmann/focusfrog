// FocusFrog's connection to Firebase: sign-in, and one KeySync per stored value while
// the owner is signed in. Firebase is loaded only when a project is configured (or the
// emulators are requested), so the Mac app without the cloud stays exactly as before.
import type { FirebaseApp } from 'firebase/app';
import type { Auth, User } from 'firebase/auth';
import type { Firestore } from 'firebase/firestore';
import { cloudConfig, OWNER_EMAILS } from '~/sync/config';
import { ChangeListener, KeySync, SyncBackend } from '~/sync/engine';
import { KEY_SPECS, KeySpec, RemoteDocs, SYNCED_KEYS, SyncedKey } from '~/sync/model';
import type { ResizedImage } from '~/util/imageResize';

export type CloudStatus =
  | 'off' // no Firebase project configured
  | 'starting'
  | 'signedOut'
  | 'notAllowed' // signed in with an account that may not use FocusFrog
  | 'synced'
  | 'saving'
  | 'offline'
  | 'error';

export interface CloudSnapshot {
  status: CloudStatus;
  email: string;
  emulators: boolean;
  error: string;
}

type Listener = (state: CloudSnapshot) => void;

interface Firebase {
  app: FirebaseApp;
  auth: Auth;
  db: Firestore;
  authApi: typeof import('firebase/auth');
  firestoreApi: typeof import('firebase/firestore');
}

let firebasePromise: Promise<Firebase | null> | null = null;
let authResolved: Promise<void> | null = null;
let currentUser: User | null = null;
let syncs = new Map<SyncedKey, KeySync>();
let pendingWrites = 0;
let state: CloudSnapshot = { status: 'off', email: '', emulators: false, error: '' };
const stateListeners = new Set<Listener>();
const valueListeners = new Map<SyncedKey, Set<ChangeListener>>();
// Hooks run when the owner signs in (the Mac uploads what the cloud has never seen).
const signInHooks = new Set<(running: Map<SyncedKey, KeySync>) => void>();

function setState(patch: Partial<CloudSnapshot>): void {
  state = { ...state, ...patch };
  stateListeners.forEach(listener => listener(state));
}

function settledStatus(): CloudStatus {
  if (!currentUser) return 'signedOut';
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return 'offline';
  return pendingWrites > 0 ? 'saving' : 'synced';
}

function deviceId(): string {
  const key = 'focusfrog.cloudDevice';
  try {
    const existing = localStorage.getItem(key);
    if (existing) return existing;
    const kind = /iPhone|iPad|Android/i.test(navigator.userAgent) ? 'phone' : 'computer';
    const id = `${kind}-${Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem(key, id);
    return id;
  } catch {
    return 'device';
  }
}

function isOwner(user: User | null): boolean {
  return Boolean(user?.email && OWNER_EMAILS.includes(user.email.toLowerCase()));
}

function firestoreBackend(firebase: Firebase, uid: string): SyncBackend {
  const { collection, doc, onSnapshot, writeBatch } = firebase.firestoreApi;
  const path = (spec: KeySpec) => ['users', uid, spec.collection] as const;
  return {
    listen(spec, onDocs, onError) {
      if (spec.docId) {
        return onSnapshot(
          doc(firebase.db, ...path(spec), spec.docId),
          { includeMetadataChanges: true },
          snapshot => {
            const docs: RemoteDocs = snapshot.exists()
              ? new Map([[snapshot.id, snapshot.data()]])
              : new Map();
            onDocs(docs, { fromCache: snapshot.metadata.fromCache });
          },
          onError
        );
      }
      return onSnapshot(
        collection(firebase.db, ...path(spec)),
        { includeMetadataChanges: true },
        snapshot => {
          const docs: RemoteDocs = new Map(snapshot.docs.map(item => [item.id, item.data()]));
          onDocs(docs, { fromCache: snapshot.metadata.fromCache });
        },
        onError
      );
    },
    // One batch per save, so the page sees one change instead of one per document.
    async write(spec, writes) {
      for (let start = 0; start < writes.length; start += 400) {
        const batch = writeBatch(firebase.db);
        writes
          .slice(start, start + 400)
          .forEach(([id, data]) => batch.set(doc(firebase.db, ...path(spec), id), data));
        await batch.commit();
      }
    },
  };
}

function trackWrite(write: Promise<void>): void {
  pendingWrites += 1;
  setState({ status: settledStatus() });
  write
    .catch(() => undefined)
    .finally(() => {
      pendingWrites = Math.max(0, pendingWrites - 1);
      setState({ status: settledStatus() });
    });
}

function stopSyncs(): void {
  syncs.forEach(sync => sync.stop());
  syncs = new Map();
}

function startSyncs(firebase: Firebase, user: User): void {
  stopSyncs();
  const backend = firestoreBackend(firebase, user.uid);
  const device = deviceId();
  const stamp = () => ({ updatedAt: new Date().toISOString(), device });
  for (const key of SYNCED_KEYS) {
    const sync = new KeySync(KEY_SPECS[key], backend, stamp, trackWrite);
    valueListeners.get(key)?.forEach(listener => sync.onChange(listener));
    sync.start();
    syncs.set(key, sync);
  }
  signInHooks.forEach(hook => hook(syncs));
}

async function loadFirebase(): Promise<Firebase | null> {
  const config = cloudConfig();
  if (!config) return null;
  setState({ status: 'starting', emulators: config.emulators });
  const [appApi, authApi, firestoreApi] = await Promise.all([
    import(/* webpackChunkName: "firebase" */ 'firebase/app'),
    import(/* webpackChunkName: "firebase" */ 'firebase/auth'),
    import(/* webpackChunkName: "firebase" */ 'firebase/firestore'),
  ]);
  const app = appApi.initializeApp(config.options, 'focusfrog');
  // Keeps a copy on the device, so FocusFrog opens offline and edits wait for a connection.
  const db = firestoreApi.initializeFirestore(app, {
    localCache: firestoreApi.persistentLocalCache({
      tabManager: firestoreApi.persistentMultipleTabManager(),
    }),
  });
  // getAuth() without its pop-up sign-in helper, which loads a Google script that
  // FocusFrog's content security policy blocks (and email sign-in never needs).
  const auth = authApi.initializeAuth(app, {
    persistence: [
      authApi.indexedDBLocalPersistence,
      authApi.browserLocalPersistence,
      authApi.browserSessionPersistence,
    ],
  });
  if (config.emulators) {
    authApi.connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    firestoreApi.connectFirestoreEmulator(db, '127.0.0.1', 8080);
  }
  const firebase: Firebase = { app, auth, db, authApi, firestoreApi };

  authResolved = new Promise(resolve => {
    authApi.onAuthStateChanged(auth, user => {
      currentUser = user;
      if (!user) {
        stopSyncs();
        setState({ status: 'signedOut', email: '', error: '' });
      } else if (!isOwner(user)) {
        stopSyncs();
        setState({ status: 'notAllowed', email: user.email || '', error: '' });
      } else {
        startSyncs(firebase, user);
        setState({ status: settledStatus(), email: user.email || '', error: '' });
      }
      resolve();
    });
  });
  if (typeof window !== 'undefined') {
    window.addEventListener('online', () => currentUser && setState({ status: settledStatus() }));
    window.addEventListener('offline', () => currentUser && setState({ status: 'offline' }));
  }
  return firebase;
}

// Starts Firebase if FocusFrog has a cloud project. Safe to call many times.
export function startCloud(): Promise<Firebase | null> {
  if (!firebasePromise) {
    firebasePromise = loadFirebase().catch(error => {
      console.error('FocusFrog cloud could not start:', error);
      setState({ status: 'error', error: String(error?.message || error) });
      return null;
    });
  }
  return firebasePromise;
}

export function cloudState(): CloudSnapshot {
  return state;
}

export function onCloudState(listener: Listener): void {
  stateListeners.add(listener);
  listener(state);
}

// Firebase once it has answered whether someone is signed in (null without a project).
async function signedInFirebase(): Promise<Firebase | null> {
  const firebase = await startCloud();
  if (firebase) await authResolved;
  return firebase;
}

// The sync for a stored value; null when there is no cloud or the owner is not signed in.
export async function keySync(key: SyncedKey): Promise<KeySync | null> {
  await signedInFirebase();
  return syncs.get(key) || null;
}

// Without waiting: the sync if it is already running.
export function activeKeySync(key: SyncedKey): KeySync | null {
  return syncs.get(key) || null;
}

// Changes to a stored value that come from another device. Returns a function that stops
// listening (on whichever sync runs by then).
export function onCloudValue(key: SyncedKey, listener: ChangeListener): () => void {
  if (!valueListeners.has(key)) valueListeners.set(key, new Set());
  valueListeners.get(key)?.add(listener);
  syncs.get(key)?.onChange(listener);
  return () => {
    valueListeners.get(key)?.delete(listener);
    syncs.get(key)?.offChange(listener);
  };
}

export function onOwnerSignIn(hook: (running: Map<SyncedKey, KeySync>) => void): void {
  signInHooks.add(hook);
  if (syncs.size) hook(syncs);
}

// The signed-in owner's id, or '' (used to remember per account what this device sent).
// Syncs run only for the owner.
export function cloudUserId(): string {
  return syncs.size && currentUser ? currentUser.uid : '';
}

// Vision board photos are fetched one by one when shown, not listened to as a whole:
// together they are several megabytes.
async function visionImageRef(id: string) {
  const firebase = await signedInFirebase();
  const uid = cloudUserId();
  if (!firebase || !uid) return null;
  const api = firebase.firestoreApi;
  return { api, ref: api.doc(firebase.db, 'users', uid, 'visionImages', id) };
}

export async function readCloudImage(id: string): Promise<ResizedImage | null> {
  const image = await visionImageRef(id);
  if (!image) return null;
  try {
    // A photo never changes under its id, so a cached copy saves the download.
    const snapshot = await image.api
      .getDocFromCache(image.ref)
      .catch(() => image.api.getDoc(image.ref));
    return snapshot.exists() ? (snapshot.data() as ResizedImage) : null;
  } catch (error) {
    console.warn('FocusFrog cloud: could not load a vision photo', error);
    return null;
  }
}

export async function writeCloudImage(id: string, photo: ResizedImage): Promise<boolean> {
  const image = await visionImageRef(id);
  if (!image) return false;
  const write = image.api.setDoc(image.ref, {
    ...photo,
    updatedAt: new Date().toISOString(),
    device: deviceId(),
  });
  trackWrite(write);
  await write;
  return true;
}

export async function deleteCloudImage(id: string): Promise<void> {
  const image = await visionImageRef(id);
  if (!image) return;
  const write = image.api.deleteDoc(image.ref);
  trackWrite(write);
  await write.catch(error => console.warn('FocusFrog cloud: could not delete a photo', error));
}

function authMessage(error: any): string {
  const code = String(error?.code || '');
  const messages: Record<string, string> = {
    'auth/invalid-credential': 'Email or password is not right.',
    'auth/wrong-password': 'Email or password is not right.',
    'auth/user-not-found': 'Email or password is not right.',
    'auth/invalid-email': 'Please enter a valid email address.',
    'auth/missing-password': 'Please enter your password.',
    'auth/email-already-in-use': 'There is already an account with this email. Sign in instead.',
    'auth/weak-password': 'Please choose a password with at least 6 characters.',
    'auth/too-many-requests': 'Too many attempts. Please wait a moment and try again.',
    'auth/network-request-failed': 'No connection. Please try again when you are online.',
    'auth/operation-not-allowed': 'New accounts cannot be created here.',
    'auth/admin-restricted-operation': 'New accounts cannot be created here.',
  };
  return messages[code] || 'That did not work. Please try again.';
}

async function withAuth(action: (firebase: Firebase) => Promise<unknown>): Promise<void> {
  const firebase = await startCloud();
  if (!firebase) throw new Error('FocusFrog has no cloud project yet.');
  try {
    setState({ error: '' });
    await action(firebase);
  } catch (error) {
    const message = authMessage(error);
    setState({ error: message });
    throw new Error(message);
  }
}

export function signIn(email: string, password: string): Promise<void> {
  return withAuth(({ auth, authApi }) =>
    authApi.signInWithEmailAndPassword(auth, email.trim(), password)
  );
}

export function createAccount(email: string, password: string): Promise<void> {
  return withAuth(({ auth, authApi }) =>
    authApi.createUserWithEmailAndPassword(auth, email.trim(), password)
  );
}

export function sendPasswordReset(email: string): Promise<void> {
  return withAuth(({ auth, authApi }) => authApi.sendPasswordResetEmail(auth, email.trim()));
}

export function signOut(): Promise<void> {
  return withAuth(({ auth, authApi }) => authApi.signOut(auth));
}
