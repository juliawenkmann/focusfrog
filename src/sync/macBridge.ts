// The hosted FocusFrog, opened on the Mac, sends the Mac's day sums to the phone itself, as
// the Mac's own page does (sync/daySums.ts). It reads the tracking from FocusFrog's server on
// this Mac, which lets this one site only read (see scripts/focusfrog-server.mjs), and only
// the sums leave the Mac. The first time, Chrome asks whether the site may reach this Mac.
import Vue from 'vue';
import { useSettingsStore } from '~/stores/settings';
import { cloudUserId } from '~/sync/cloud';
import { cloudConfig, IS_CLOUD_BUILD } from '~/sync/config';
import { startDaySumUploads } from '~/sync/daySums';
import { getClient } from '~/util/awclient';

export type MacBridgeState = 'off' | 'looking' | 'connected' | 'unreachable';

// For the Hours page: whether the hours of this Mac are being sent.
export const macBridge = Vue.observable({ state: 'off' as MacBridgeState });

const MAC_SERVER = 'http://127.0.0.1:27180';

// A Mac with a mouse: an iPad says it is a Mac too, but has touch.
export function onMacDesktop(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    /Macintosh/.test(navigator.userAgent) &&
    navigator.maxTouchPoints === 0
  );
}

// Tests point the bridge at a test server, but only with the local emulators, never live.
function macServer(): string {
  const port = new URLSearchParams(window.location.search).get('mac-port');
  return cloudConfig()?.emulators && port && /^\d+$/.test(port)
    ? `http://127.0.0.1:${port}`
    : MAC_SERVER;
}

async function reachMac(server: string): Promise<boolean> {
  try {
    // No time limit: the first time, the request waits while Chrome asks for access.
    const response = await fetch(`${server}/focusfrog-healthz`, { cache: 'no-store' });
    const health = response.ok ? await response.json() : null;
    return health?.app === 'FocusFrog';
  } catch (error) {
    return false;
  }
}

// A run sends sums only for the signed-in owner, summed with the Mac's own categories. When
// the Mac cannot be read any more, the Hours page says so, and the page looks for it again
// once it is back in front.
async function readyToSend(): Promise<boolean> {
  if (!cloudUserId()) return false;
  let ready = false;
  try {
    ready = await useSettingsStore().loadMacCategories();
  } catch (error) {
    ready = false;
  }
  macBridge.state = ready ? 'connected' : 'unreachable';
  return ready;
}

let looking = false;
let sending = false;

// Looks for FocusFrog on this Mac now, and again whenever the page comes back to the front,
// until it is found; then the day sums are sent from here.
export async function connectMac(): Promise<void> {
  if (!IS_CLOUD_BUILD || !onMacDesktop() || looking || macBridge.state === 'connected') return;
  looking = true;
  macBridge.state = 'looking';
  const server = macServer();
  try {
    if (!(await reachMac(server))) {
      macBridge.state = 'unreachable';
      return;
    }
    const client = getClient();
    client.baseURL = server;
    client.req.defaults.baseURL = `${server}/api`;
    macBridge.state = 'connected';
    if (!sending) startDaySumUploads(readyToSend);
    sending = true;
  } finally {
    looking = false;
  }
}

export function startMacBridge(): void {
  if (!IS_CLOUD_BUILD || !onMacDesktop()) return;
  void connectMac();
  window.addEventListener('focus', () => void connectMac());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void connectMac();
  });
}
