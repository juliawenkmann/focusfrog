import { defineStore } from 'pinia';
import { connectCloudSettings } from '~/stores/settings';
import {
  cloudState,
  CloudSnapshot,
  CloudStatus,
  createAccount,
  onCloudState,
  sendPasswordReset,
  signIn,
  signOut,
  startCloud,
} from '~/sync/cloud';
import { IS_CLOUD_BUILD } from '~/sync/config';
import { startDaySumUploads } from '~/sync/daySums';
import { startVisionImageBackfill } from '~/sync/visionImages';

const USABLE: CloudStatus[] = ['synced', 'saving', 'offline'];

const LABELS: Record<CloudStatus, string> = {
  off: 'Cloud off',
  starting: 'Connecting…',
  signedOut: 'Not signed in',
  notAllowed: 'This account cannot use FocusFrog',
  synced: 'Synced',
  saving: 'Saving…',
  offline: 'Offline — changes wait on this device',
  error: 'Cloud problem',
};

// The cloud sign-in state for the interface (lock button, sign-in screen on the phone).
export const useCloudStore = defineStore('cloud', {
  state: (): CloudSnapshot => ({ ...cloudState() }),
  getters: {
    available: (state): boolean => state.status !== 'off',
    // The owner is signed in, so the app's pages can show.
    canUse: (state): boolean => USABLE.includes(state.status),
    signedIn: (state): boolean => USABLE.includes(state.status) || state.status === 'notAllowed',
    statusLabel: (state): string => LABELS[state.status],
  },
  actions: {
    // Phone sync for the whole app; called once at start. Does nothing until FocusFrog
    // has a cloud project (or the emulators are requested).
    start() {
      onCloudState(snapshot => this.$patch(snapshot));
      void startCloud();
      connectCloudSettings();
      if (!IS_CLOUD_BUILD) {
        startDaySumUploads();
        startVisionImageBackfill();
      }
    },
    signIn,
    createAccount,
    sendPasswordReset,
    signOut,
  },
});
