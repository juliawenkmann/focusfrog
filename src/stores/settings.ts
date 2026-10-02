import { defineStore } from 'pinia';
import moment, { Moment } from 'moment';
import { getClient } from '~/util/awclient';
import {
  Category,
  CategorySet,
  defaultCategories,
  cleanCategory,
  normalizeFocusFrogCategories,
} from '~/util/classes';
import { SavedQuery } from '~/util/savedQueries';
import { View, defaultViews } from '~/stores/views';
import type { PrivacyFilterRule } from '~/util/privacyFilters';
import { isEqual } from 'lodash';

function jsonEq(a: any, b: any) {
  const jsonA = JSON.parse(JSON.stringify(a));
  const jsonB = JSON.parse(JSON.stringify(b));
  return isEqual(jsonA, jsonB);
}

let settingsLoadPromise: Promise<void> | null = null;

export type FocusFrogTheme = 'bright' | 'contrast' | 'flower';

function normalizeFocusFrogTheme(theme: unknown): FocusFrogTheme {
  return theme === 'contrast' || theme === 'flower' ? theme : 'bright';
}

const LEGACY_THEME_KEYS = ['timetracker.dashboardTheme', 'dayBloomTheme'];
// Settings of removed pages (the Timeline view used `durationDefault`).
const OBSOLETE_SETTING_KEYS = ['durationDefault'];
const LANDING_PAGE_REDIRECTS: Record<string, string> = { '/timeline': '/time-blocking' };

function normalizeLegacySettingsKey(key: string): string {
  return LEGACY_THEME_KEYS.includes(key) ? 'focusFrogTheme' : key;
}

// Backoffs for NewReleaseNotification
export const SHORT_BACKOFF_PERIOD = 24 * 60 * 60;
export const LONG_BACKOFF_PERIOD = 5 * 24 * 60 * 60;

// Initial wait period for UserSatisfactionPoll
export const INITIAL_WAIT_PERIOD = 7 * 24 * 60 * 60;

interface State {
  // Timestamp when user was first seen (first time webapp is run)
  initialTimestamp: Moment;

  startOfDay: string;
  startOfWeek: string;
  useColorFallback: boolean;
  landingpage: string;
  theme: 'light' | 'dark' | 'auto';
  focusFrogTheme: FocusFrogTheme;

  newReleaseCheckData: Record<string, any>;
  userSatisfactionPollData: {
    isEnabled: boolean;
    nextPollTime: Moment;
    timesPollIsShown: number;
  };
  uncategorizedNotificationData: {
    isEnabled: boolean;
    // Below this total tracked duration (seconds) the hint is hidden —
    // avoids nagging on quiet days.
    minTotalSeconds: number;
    // Hint shows when the uncategorized fraction crosses this ratio.
    minRatio: number;
  };
  always_active_pattern: string;
  privacy_filters: PrivacyFilterRule[];
  classes: Category[];
  // Named category sets — each set is an independent collection of category rules.
  // The active_set_ids list controls which sets are combined (in priority order).
  category_sets: CategorySet[];
  // Ordered list of active set IDs. First entry has highest priority when merging.
  active_set_ids: string[];
  views: View[];
  saved_queries: SavedQuery[];

  // Whether to show certain WIP features
  devmode: boolean;
  showYearly: boolean;
  useMultidevice: boolean;
  requestTimeout: number;

  // Set to true if settings loaded
  _loaded: boolean;
}

export const useSettingsStore = defineStore('settings', {
  state: (): State => ({
    initialTimestamp: moment(),

    startOfDay: '04:00',
    startOfWeek: 'Monday',
    useColorFallback: false,
    landingpage: '/home',

    theme: 'auto',
    focusFrogTheme: 'bright',

    newReleaseCheckData: {
      isEnabled: true,
      nextCheckTime: moment().add(SHORT_BACKOFF_PERIOD, 'seconds'),
      howOftenToCheck: SHORT_BACKOFF_PERIOD,
      timesChecked: 0,
    },
    userSatisfactionPollData: {
      isEnabled: true,
      nextPollTime: moment().add(INITIAL_WAIT_PERIOD, 'seconds'),
      timesPollIsShown: 0,
    },
    uncategorizedNotificationData: {
      isEnabled: true,
      minTotalSeconds: 60 * 60, // 1 hour
      minRatio: 0.3, // 30%
    },

    always_active_pattern: '',
    privacy_filters: [],
    classes: defaultCategories,
    category_sets: [],
    active_set_ids: ['default'],
    views: defaultViews,
    saved_queries: [],

    // Developer settings
    // NOTE: PRODUCTION might be undefined (in tests, for example)
    devmode: typeof PRODUCTION === 'undefined' ? true : !PRODUCTION,
    showYearly: false,
    useMultidevice: false,
    requestTimeout: 30,

    _loaded: false,
  }),

  getters: {
    loaded(state: State) {
      return state._loaded;
    },
  },

  actions: {
    async ensureLoaded() {
      if (this.loaded) {
        return;
      }

      if (!settingsLoadPromise) {
        settingsLoadPromise = this.load().finally(() => {
          settingsLoadPromise = null;
        });
      }

      await settingsLoadPromise;
    },
    async load({ save }: { save?: boolean } = {}) {
      if (typeof localStorage === 'undefined') {
        console.error('localStorage is not supported');
        return;
      }
      const client = getClient();

      // Fetch from server, fall back to localStorage
      const server_settings = await client.get_settings();

      // Build a unified map: server value wins, localStorage is fallback.
      // Skip keys that are missing from BOTH sources — otherwise `null` from
      // localStorage.getItem overrides the defaults defined in `state()`.
      const storage: Record<string, unknown> = {};
      const used = new Set<string>();
      // Only known settings are loaded. Other keys (obsolete settings, or FocusFrog data that
      // older versions copied from localStorage into the server settings) are cleaned up below.
      const knownKeys = new Set(Object.keys(this.$state).filter(key => !key.startsWith('_')));
      const staleServerKeys: string[] = [];

      // 1. Server settings take priority
      for (const key of Object.keys(server_settings)) {
        if (key.startsWith('_')) continue;
        const targetKey = normalizeLegacySettingsKey(key);
        const isLegacyKey = targetKey !== key;
        if (!knownKeys.has(targetKey) || isLegacyKey) {
          if (server_settings[key] !== null) staleServerKeys.push(key);
        }
        if (!knownKeys.has(targetKey) || server_settings[key] === null) continue;
        // A legacy key only fills in when the current key was never saved.
        if (isLegacyKey && server_settings[targetKey] !== undefined) continue;
        storage[targetKey] = server_settings[key];
        used.add(targetKey);
      }

      // 2. localStorage fills in gaps, but skip missing keys (null)
      for (const key of Object.keys(localStorage)) {
        const targetKey = normalizeLegacySettingsKey(key);
        if (OBSOLETE_SETTING_KEYS.includes(key)) localStorage.removeItem(key);
        if (!knownKeys.has(targetKey) || used.has(targetKey)) continue;
        const raw = localStorage.getItem(key);
        if (raw === null || raw === 'null') continue; // key absent or stored as null → keep state() default

        // Keys ending with 'Data' are JSON-serialized objects in localStorage
        const isJsonKey =
          targetKey.endsWith('Data') ||
          targetKey == 'views' ||
          targetKey == 'classes' ||
          targetKey == 'category_sets' ||
          targetKey == 'active_set_ids' ||
          targetKey == 'saved_queries';
        try {
          if (isJsonKey) {
            let parsed = JSON.parse(raw);
            if (targetKey == 'classes') {
              parsed = parsed.map(cleanCategory);
            }
            storage[targetKey] = parsed;
          } else if (raw === 'true' || raw === 'false') {
            storage[targetKey] = raw === 'true';
          } else {
            storage[targetKey] = raw;
          }
          used.add(targetKey);
        } catch (e) {
          console.error('failed to parse', key, raw, e);
        }
      }
      const landingRedirect = LANDING_PAGE_REDIRECTS[storage.landingpage as string];
      if (landingRedirect) storage.landingpage = landingRedirect;

      this.$patch({ ...storage, _loaded: true });
      this.$patch({
        focusFrogTheme: normalizeFocusFrogTheme(this.focusFrogTheme),
        classes: normalizeFocusFrogCategories(this.classes || []),
        category_sets: (this.category_sets || []).map(set => ({
          ...set,
          categories: normalizeFocusFrogCategories(set.categories || []),
        })),
      });

      // Since `requestTimeout` is used to initialize the client, we need to set it again
      // https://github.com/ActivityWatch/activitywatch/issues/979
      client.req.defaults.timeout = this.requestTimeout * 1000;

      if (staleServerKeys.length > 0) {
        void this.removeServerSettings(staleServerKeys);
      }
      if (save || landingRedirect) {
        await this.save();
      }
    },
    async removeServerSettings(keys: string[]) {
      const client = getClient();
      for (const key of keys) {
        try {
          await client.req.delete('/0/settings/' + key);
        } catch (err) {
          // The Python aw-server cannot delete settings, so clear the stored value instead.
          try {
            await client.req.post('/0/settings/' + key, 'null', {
              headers: { 'Content-Type': 'application/json' },
            });
          } catch (clearErr) {
            console.warn('Could not remove obsolete setting', key, clearErr);
          }
        }
      }
    },
    async save() {
      // Important check, to avoid saving settings before they are loaded (potentially overwriting them with defaults)
      if (!this.loaded) {
        console.error('Settings not loaded, not saving');
        return;
      }
      // We want to avoid saving to localStorage to not accidentally mess up pre-migration data
      // For example, if the user is using several browsers, and opened in their non-main browser on first run after upgrade.
      const saveToLocalStorage = false;

      // Save to localStorage and backend
      // NOTE: localStorage deprecated, will be removed in future
      const client = getClient();

      // Fetch current settings from server
      const server_settings = await client.get_settings();

      // Save settings
      for (const key of Object.keys(this.$state)) {
        // Skip keys starting with underscore, as they are local to the vuex store.
        if (key.startsWith('_')) {
          continue;
        }

        const value = this.$state[key];

        // Save to localStorage
        // NOTE: we always save the theme and landingpage to localStorage, since they are used before the settings are loaded
        if (
          saveToLocalStorage ||
          key == 'theme' ||
          key == 'landingpage' ||
          key == 'focusFrogTheme'
        ) {
          if (typeof value === 'object') {
            localStorage.setItem(key, JSON.stringify(value));
          } else {
            localStorage.setItem(key, value);
          }
        }

        // Save changed settings to backend
        if (server_settings[key] === undefined || !jsonEq(server_settings[key], value)) {
          if (server_settings[key] === undefined && value === false) {
            // Skip saving settings that are set to false and not already saved on the server
            continue;
          }
          console.log('Saving', { [key]: value });
          //console.log('Was:', server_settings[key]);
          //console.log('Now:', value);
          await client.req.post('/0/settings/' + key, value, {
            headers: {
              'Content-Type': 'application/json',
            },
          });
        }
      }

      // After save, reload
      await this.load({ save: false });
    },
    async update(new_state: Record<string, any>) {
      console.log('Updating state', new_state);
      await this.ensureLoaded();
      this.$patch(new_state);
      await this.save();
    },
  },
});
