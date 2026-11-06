import { createPinia, setActivePinia } from 'pinia';
import { nextTick } from 'vue';

import { connectCloudSettings, useSettingsStore } from '~/stores/settings';
import { saveStoredValue } from '~/util/focusfrogStorage';

jest.mock('~/sync/cloud', () => ({ onOwnerSignIn: jest.fn() }));
jest.mock('~/util/focusfrogStorage', () => ({
  loadStoredValue: jest.fn(),
  onStoredValueChange: jest.fn(),
  saveStoredValue: jest.fn(),
}));

describe('settings shared through the cloud', () => {
  setActivePinia(createPinia());
  const store = useSettingsStore();
  connectCloudSettings();

  beforeEach(() => jest.clearAllMocks());

  // $patch merges into the nested object, so its reference stays the same.
  test('a change inside a nested setting goes up', async () => {
    store.$patch({ holidayData: { added: ['2026-11-03'], notCounted: [] } });
    await nextTick();
    expect(saveStoredValue).toHaveBeenCalledTimes(1);
    expect(saveStoredValue).toHaveBeenCalledWith(
      'settings',
      expect.objectContaining({
        holidayData: expect.objectContaining({ added: ['2026-11-03'] }),
      })
    );
  });

  test('settings that are not shared stay on the device', async () => {
    store.$patch({ devmode: !store.devmode });
    await nextTick();
    expect(saveStoredValue).not.toHaveBeenCalled();
  });
});
