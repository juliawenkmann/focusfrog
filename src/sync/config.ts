import type { FirebaseOptions } from 'firebase/app';

// Public web configuration of the FocusFrog Firebase project. Firebase web keys only
// identify the project; firebase/firestore.rules decide who may read and write.
// Never put a service-account key or any other secret here.
// Lives in the Google account wenkmannjulia2000@gmail.com, next to Tree Tracker and
// CampusGarten. The app's own sign-in (OWNER_EMAILS) is a separate email + password.
const PROJECT_CONFIG: FirebaseOptions | null = {
  apiKey: 'AIzaSyCtfR0DgFeqd7UD8NzHCxaT11p9oi9x0gU',
  authDomain: 'focusfrog-wenkmann.firebaseapp.com',
  projectId: 'focusfrog-wenkmann',
  storageBucket: 'focusfrog-wenkmann.firebasestorage.app',
  messagingSenderId: '170113711931',
  appId: '1:170113711931:web:805e36f7f8357550e8811e',
};

// The accounts allowed to use FocusFrog. Must match isOwner() in firebase/firestore.rules.
export const OWNER_EMAILS = ['juliawenkmann@gmail.com'];

const EMULATOR_CONFIG: FirebaseOptions = {
  apiKey: 'demo-focusfrog-key',
  authDomain: 'demo-focusfrog.firebaseapp.com',
  projectId: 'demo-focusfrog',
  appId: '1:1:web:focusfrog-emulator',
};

// Local test data: open the app on this computer with ?firebase-emulator=1 while
// `npm run emulators` runs. Never the live data.
export function cloudConfig(): { options: FirebaseOptions; emulators: boolean } | null {
  if (typeof window === 'undefined') return null;
  const { hostname, search } = window.location;
  if (
    ['127.0.0.1', 'localhost'].includes(hostname) &&
    new URLSearchParams(search).get('firebase-emulator') === '1'
  ) {
    return { options: EMULATOR_CONFIG, emulators: true };
  }
  return PROJECT_CONFIG ? { options: PROJECT_CONFIG, emulators: false } : null;
}

// The hosted phone build has no local FocusFrog server (no tracking, no storage.json).
export const IS_CLOUD_BUILD = process.env.VUE_APP_FOCUSFROG_TARGET === 'cloud';
