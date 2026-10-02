import { shallowMount } from '@vue/test-utils';
import VisionBoard from '~/views/VisionBoard.vue';

const dream = (overrides = {}) => ({
  id: 'dream-northern-lights',
  title: 'See the northern lights',
  notes: '',
  nextAction: 'Book the sleeper train',
  targetDate: '2026-12-01',
  progress: 25,
  counterCurrent: 0,
  counterTarget: 0,
  counterUnit: '',
  lastCheckInAt: '2026-08-16T08:00:00.000Z',
  imageId: '3f2504e0-4f89-41d3-9a0c-0305e82c3301',
  status: 'dreaming',
  createdAt: '2026-08-17T08:00:00.000Z',
  updatedAt: '2026-08-17T08:00:00.000Z',
  achievedAt: '',
  ...overrides,
});

const visionBoardStubs = {
  icon: true,
  'b-alert': true,
  'b-button': true,
  'b-modal': true,
  'b-form-checkbox': true,
  'b-form-group': true,
  'b-form-input': true,
  'b-form-textarea': true,
  'b-spinner': true,
};

const mountLoadedVisionBoard = items =>
  shallowMount(
    { ...VisionBoard, mounted: () => undefined },
    {
      data: () => ({ items, loading: false, saving: false }),
      stubs: visionBoardStubs,
    }
  );

const renderedCardTitles = wrapper =>
  wrapper.findAll('.vision-card h4').wrappers.map(cardTitle => cardTitle.text());

describe('Vision Board persistence', () => {
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  test('repairs stale app storage when the local board is newer', async () => {
    const localDocument = {
      version: 1,
      updatedAt: '2026-08-17T10:00:00.000Z',
      items: [dream({ updatedAt: '2026-08-17T10:00:00.000Z' })],
    };
    const serverDocument = {
      version: 1,
      updatedAt: '2026-08-17T09:00:00.000Z',
      items: [],
    };
    const vm = {
      readLocalDocument: jest.fn(() => localDocument),
      loadServerDocument: jest.fn(async () => serverDocument),
      writeLocalDocument: jest.fn(() => true),
      saveServerDocument: jest.fn(async () => true),
      items: [],
      boardUpdatedAt: '',
      loading: true,
    };

    await VisionBoard.methods.loadBoard.call(vm);

    expect(vm.items).toEqual(localDocument.items);
    expect(vm.saveServerDocument).toHaveBeenCalledWith(localDocument);
    expect(vm.loading).toBe(false);
  });

  test('keeps a warning visible when stale app storage cannot be repaired', async () => {
    const localDocument = {
      version: 1,
      updatedAt: '2026-08-17T10:00:00.000Z',
      items: [dream({ updatedAt: '2026-08-17T10:00:00.000Z' })],
    };
    const vm = {
      readLocalDocument: jest.fn(() => localDocument),
      loadServerDocument: jest.fn(async () => null),
      writeLocalDocument: jest.fn(() => true),
      saveServerDocument: jest.fn(async () => false),
      items: [],
      boardUpdatedAt: '',
      loading: true,
      syncWarning: '',
    };

    await VisionBoard.methods.loadBoard.call(vm);

    expect(vm.syncWarning).toMatch(/could not copy it to app storage/i);
    expect(vm.loading).toBe(false);
  });

  test('rolls back a new card when neither storage destination can save it', async () => {
    const vm = {
      draft: {
        title: 'Learn to surf',
        notes: 'Somewhere warm',
        nextAction: 'Find a beginner lesson',
        targetDate: '2026-12-01',
        progress: 10,
        useCounter: false,
        counterCurrent: 0,
        counterTarget: 0,
        counterUnit: '',
        imageId: '',
      },
      saving: false,
      formError: '',
      items: [],
      editingId: '',
      boardUpdatedAt: '2026-08-17T08:00:00.000Z',
      pendingImage: null,
      removeExistingImage: false,
      persistBoard: jest.fn(async () => ({ localSaved: false, serverSaved: false })),
      deleteImage: jest.fn(async () => undefined),
      closeEditor: jest.fn(),
    };

    await VisionBoard.methods.saveItem.call(vm);

    expect(vm.items).toEqual([]);
    expect(vm.boardUpdatedAt).toBe('2026-08-17T08:00:00.000Z');
    expect(vm.formError).toMatch(/could not save/i);
    expect(vm.closeEditor).not.toHaveBeenCalled();
  });

  test('keeps the previous image while server metadata is still stale', async () => {
    const existing = dream();
    const vm = {
      draft: {
        title: existing.title,
        notes: existing.notes,
        nextAction: existing.nextAction,
        targetDate: existing.targetDate,
        progress: existing.progress,
        useCounter: existing.counterTarget > 0,
        counterCurrent: existing.counterCurrent,
        counterTarget: existing.counterTarget,
        counterUnit: existing.counterUnit,
        imageId: existing.imageId,
      },
      saving: false,
      formError: '',
      items: [existing],
      editingId: existing.id,
      boardUpdatedAt: existing.updatedAt,
      pendingImage: null,
      removeExistingImage: true,
      persistBoard: jest.fn(async () => ({ localSaved: true, serverSaved: false })),
      deleteImage: jest.fn(async () => undefined),
      closeEditor: jest.fn(),
    };

    await VisionBoard.methods.saveItem.call(vm);

    expect(vm.items[0].imageId).toBe('');
    expect(vm.deleteImage).not.toHaveBeenCalled();
    expect(vm.closeEditor).toHaveBeenCalled();
  });

  test('does not start a second card mutation while one is saving', async () => {
    const vm = {
      saving: true,
      items: [dream()],
      persistBoard: jest.fn(),
    };

    await VisionBoard.methods.toggleAchieved.call(vm, vm.items[0]);

    expect(vm.persistBoard).not.toHaveBeenCalled();
    expect(vm.items[0].status).toBe('dreaming');
  });

  test('renders each card status as a native, accessible checkbox instead of a Dreaming pill', async () => {
    const dreaming = dream({
      id: 'dreaming-card',
      title: 'Learn pottery',
      nextAction: '',
      targetDate: '',
      progress: 0,
      lastCheckInAt: '',
      imageId: '',
    });
    const achieved = dream({
      id: 'achieved-card',
      title: 'Visit Iceland',
      status: 'achieved',
      progress: 100,
      achievedAt: '2026-08-17T08:00:00.000Z',
      imageId: '',
    });
    const wrapper = mountLoadedVisionBoard([dreaming, achieved]);
    await wrapper.vm.$nextTick();

    const cards = wrapper.findAll('.vision-card');
    const dreamingCheckbox = cards.at(0).find('input[type="checkbox"]');
    const achievedCheckbox = cards.at(1).find('input[type="checkbox"]');

    expect(dreamingCheckbox.exists()).toBe(true);
    expect(dreamingCheckbox.element.checked).toBe(false);
    expect(dreamingCheckbox.attributes('aria-label')).toBe('Mark Learn pottery as done');
    expect(cards.at(0).find('button.vision-status-button').exists()).toBe(false);
    expect(cards.at(0).text()).not.toMatch(/\bDreaming\b/);

    expect(achievedCheckbox.exists()).toBe(true);
    expect(achievedCheckbox.element.checked).toBe(true);
    expect(achievedCheckbox.attributes('aria-label')).toBe('Mark Visit Iceland as not done');

    await wrapper.setData({ saving: true });
    expect(cards.at(0).find('input[type="checkbox"]').element.disabled).toBe(true);
    expect(cards.at(1).find('input[type="checkbox"]').element.disabled).toBe(true);
    wrapper.destroy();
  });

  test('status checkbox changes preserve the achieved toggle behavior in both directions', async () => {
    const dreaming = dream({
      id: 'dreaming-card',
      title: 'Learn pottery',
      nextAction: '',
      targetDate: '',
      progress: 0,
      lastCheckInAt: '',
      imageId: '',
    });
    const achieved = dream({
      id: 'achieved-card',
      title: 'Visit Iceland',
      status: 'achieved',
      progress: 100,
      achievedAt: '2026-08-17T08:00:00.000Z',
      imageId: '',
    });
    const persistBoard = jest.fn(async () => ({ localSaved: true, serverSaved: true }));
    const wrapper = mountLoadedVisionBoard([dreaming, achieved]);
    wrapper.vm.persistBoard = persistBoard;
    await wrapper.vm.$nextTick();

    await wrapper.findAll('.vision-card').at(0).find('input[type="checkbox"]').setChecked(true);
    await Promise.resolve();
    await wrapper.vm.$nextTick();

    expect(wrapper.vm.items[0]).toMatchObject({ status: 'achieved', progress: 100 });

    await wrapper.findAll('.vision-card').at(1).find('input[type="checkbox"]').setChecked(false);
    await Promise.resolve();
    await wrapper.vm.$nextTick();

    expect(wrapper.vm.items[1]).toMatchObject({ status: 'dreaming', achievedAt: '' });
    expect(persistBoard).toHaveBeenCalledTimes(2);
    wrapper.destroy();
  });

  test('keeps next actions optional and renders no counter controls for one-time cards', async () => {
    const checkedInAt = new Date().toISOString();
    const oneTime = dream({
      id: 'one-time-card',
      title: 'Learn one guitar solo',
      nextAction: '',
      targetDate: '',
      progress: 25,
      counterCurrent: 0,
      counterTarget: 0,
      counterUnit: '',
      lastCheckInAt: checkedInAt,
      createdAt: checkedInAt,
      imageId: '',
    });
    const wrapper = mountLoadedVisionBoard([oneTime]);
    await wrapper.vm.$nextTick();

    const card = wrapper.find('.vision-card');
    expect(card.find('.vision-add-next-action').exists()).toBe(false);
    expect(card.text()).not.toMatch(/Add a concrete next step/i);
    expect(card.classes()).not.toContain('vision-card--attention');
    expect(card.find('.vision-accountability-state').text()).toBe('On track');
    expect(card.find('.vision-counter-summary').exists()).toBe(false);
    expect(card.find('.vision-counter-increment').exists()).toBe(false);
    expect(card.find('.vision-card-progress-copy').text()).toContain('25%');
    wrapper.destroy();
  });

  test('shows a live repeatable counter caption and progress after each check-off', async () => {
    const checkedInAt = new Date().toISOString();
    const repeatable = dream({
      id: 'repeatable-card',
      title: 'Read five books',
      nextAction: '',
      targetDate: '',
      progress: 40,
      counterCurrent: 2,
      counterTarget: 5,
      counterUnit: 'books',
      lastCheckInAt: checkedInAt,
      createdAt: checkedInAt,
      imageId: '',
    });
    const persistBoard = jest.fn(async () => ({ localSaved: true, serverSaved: true }));
    const wrapper = mountLoadedVisionBoard([repeatable]);
    wrapper.vm.persistBoard = persistBoard;
    wrapper.vm.readLocalDocument = undefined;
    wrapper.vm.loadServerDocument = undefined;
    await wrapper.vm.$nextTick();

    expect(wrapper.find('.vision-counter-summary').text()).toBe('2/5 books');
    expect(wrapper.find('[role="progressbar"]').attributes()).toMatchObject({
      'aria-valuemax': '5',
      'aria-valuenow': '2',
      'aria-valuetext': '2 of 5 books',
    });

    await wrapper.find('.vision-counter-increment').trigger('click');
    await Promise.resolve();
    await wrapper.vm.$nextTick();

    expect(wrapper.find('.vision-counter-summary').text()).toBe('3/5 books');
    expect(wrapper.find('[role="progressbar"]').attributes()).toMatchObject({
      'aria-valuemax': '5',
      'aria-valuenow': '3',
      'aria-valuetext': '3 of 5 books',
    });
    expect(wrapper.find('.vision-card-progress-track > span').attributes('style')).toContain(
      'width: 60%'
    );
    expect(wrapper.vm.items[0].progress).toBe(60);
    expect(persistBoard).toHaveBeenCalledTimes(1);
    wrapper.destroy();
  });

  test('marking a dream achieved preserves its explicit check-in history', async () => {
    const previousCheckIn = '2026-08-10T08:00:00.000Z';
    const existing = dream({ lastCheckInAt: previousCheckIn });
    const vm = {
      saving: false,
      loading: false,
      items: [existing],
      boardUpdatedAt: existing.updatedAt,
      persistBoard: jest.fn(async () => ({ localSaved: true, serverSaved: true })),
    };

    await VisionBoard.methods.toggleAchieved.call(vm, existing);

    expect(vm.items[0]).toMatchObject({
      status: 'achieved',
      progress: 100,
      lastCheckInAt: previousCheckIn,
    });
  });

  test('uses the factual counter percentage for an achieved counter card', () => {
    const achievedCounter = dream({
      status: 'achieved',
      progress: 100,
      counterCurrent: 2,
      counterTarget: 5,
      counterUnit: 'books',
    });

    expect(VisionBoard.methods.counterPercentage.call({}, achievedCounter)).toBe(40);
  });

  test('toggles from the current board item instead of a stale card reference', async () => {
    const current = dream({ status: 'achieved', progress: 100 });
    const stale = { ...current, status: 'dreaming', progress: 25 };
    const vm = {
      saving: false,
      loading: false,
      items: [current],
      boardUpdatedAt: current.updatedAt,
      persistBoard: jest.fn(async () => ({ localSaved: true, serverSaved: true })),
    };

    await VisionBoard.methods.toggleAchieved.call(vm, stale);

    expect(vm.items[0].status).toBe('dreaming');
  });

  test('does not save a new card before the initial board load finishes', async () => {
    const vm = {
      draft: {
        title: 'Learn to sail',
        notes: '',
        nextAction: '',
        targetDate: '',
        progress: 0,
        useCounter: false,
        counterCurrent: 0,
        counterTarget: 0,
        counterUnit: '',
        imageId: '',
      },
      saving: false,
      loading: true,
      items: [],
      persistBoard: jest.fn(),
    };

    await VisionBoard.methods.saveItem.call(vm);

    expect(vm.persistBoard).not.toHaveBeenCalled();
    expect(vm.items).toEqual([]);
  });

  test('rejects a non-numeric progress value without changing the board', async () => {
    const vm = {
      draft: {
        title: 'Learn to sail',
        notes: '',
        nextAction: 'Find a beginner course',
        targetDate: '',
        progress: '25',
        useCounter: false,
        counterCurrent: 0,
        counterTarget: 0,
        counterUnit: '',
        imageId: '',
      },
      saving: false,
      loading: false,
      formError: '',
      items: [],
      persistBoard: jest.fn(),
    };

    await VisionBoard.methods.saveItem.call(vm);

    expect(vm.persistBoard).not.toHaveBeenCalled();
    expect(vm.items).toEqual([]);
    expect(vm.formError).toMatch(/progress value/i);
  });

  test('saves a measurable counter and derives its percentage progress', async () => {
    const vm = {
      draft: {
        title: 'Read 5 books',
        notes: '',
        nextAction: 'Choose the first book',
        targetDate: '',
        progress: 0,
        useCounter: true,
        counterCurrent: 2,
        counterTarget: 5,
        counterUnit: ' books ',
        imageId: '',
      },
      saving: false,
      loading: false,
      formError: '',
      items: [],
      editingId: '',
      boardUpdatedAt: '',
      pendingImage: null,
      removeExistingImage: false,
      persistBoard: jest.fn(async () => ({ localSaved: true, serverSaved: true })),
      deleteImage: jest.fn(),
      closeEditor: jest.fn(),
    };

    await VisionBoard.methods.saveItem.call(vm);

    expect(vm.items[0]).toMatchObject({
      title: 'Read 5 books',
      counterCurrent: 2,
      counterTarget: 5,
      counterUnit: 'books',
      progress: 40,
      status: 'dreaming',
    });
    expect(vm.persistBoard).toHaveBeenCalledTimes(1);
    expect(vm.closeEditor).toHaveBeenCalledTimes(1);
  });

  test('keeps manual progress when an invalid counter is switched off', () => {
    const vm = {
      draft: {
        useCounter: true,
        counterCurrent: 2,
        counterTarget: '',
        progress: 60,
      },
    };

    VisionBoard.methods.handleCounterToggle.call(vm, false);

    expect(vm.draft.useCounter).toBe(false);
    expect(vm.draft.progress).toBe(60);
  });

  test('does not turn unfinished manual progress into a completed counter', () => {
    const vm = {
      draft: {
        useCounter: false,
        counterCurrent: 0,
        counterTarget: 5,
        progress: 95,
      },
    };

    VisionBoard.methods.handleCounterToggle.call(vm, true);

    expect(vm.draft.counterCurrent).toBe(4);
  });

  test('uses the same attention predicate for the filter, badge, and filter count', () => {
    const attentionItem = dream({ id: 'needs-attention' });
    const currentItem = dream({ id: 'current' });
    const achievedItem = dream({ id: 'achieved', status: 'achieved' });
    const vm = {
      activeFilter: 'attention',
      items: [attentionItem, currentItem, achievedItem],
      needsAttention: jest.fn(item => item.id === attentionItem.id),
    };

    expect(VisionBoard.computed.filteredItems.call(vm)).toEqual([attentionItem]);
    expect(VisionBoard.computed.attentionCount.call(vm)).toBe(1);
    expect(VisionBoard.methods.filterCount.call(vm, 'attention')).toBe(1);
    expect(vm.needsAttention).toHaveBeenCalledWith(attentionItem);
  });

  test('offers the supported sort modes and keeps board order as My order', async () => {
    localStorage.removeItem('focusfrog.visionBoard.sort.v1');
    const items = [
      dream({ id: 'middle', title: 'Middle', createdAt: '2026-08-10T08:00:00.000Z' }),
      dream({ id: 'oldest', title: 'Oldest', createdAt: '2026-08-01T08:00:00.000Z' }),
      dream({ id: 'newest', title: 'Newest', createdAt: '2026-08-17T08:00:00.000Z' }),
    ];
    const wrapper = mountLoadedVisionBoard(items);
    await wrapper.vm.$nextTick();

    const sortSelect = wrapper.find('.vision-sort-select');
    const options = sortSelect.findAll('option').wrappers.map(option => ({
      label: option.text(),
      value: option.attributes('value'),
    }));

    expect(sortSelect.exists()).toBe(true);
    expect(wrapper.find('label[for="vision-board-sort"]').text()).toMatch(/sort by/i);
    expect(sortSelect.element.value).toBe('board');
    expect(options).toEqual([
      { value: 'board', label: 'My order' },
      { value: 'newest', label: 'Newest first' },
      { value: 'oldest', label: 'Oldest first' },
      { value: 'title', label: 'A–Z' },
      { value: 'target', label: 'Target date' },
      { value: 'progress', label: 'Closest to done' },
    ]);
    expect(renderedCardTitles(wrapper)).toEqual(['Middle', 'Oldest', 'Newest']);
    wrapper.destroy();
  });

  test('sorts dated dreams by their nearest target and leaves undated dreams last', async () => {
    localStorage.removeItem('focusfrog.visionBoard.sort.v1');
    const items = [
      dream({ id: 'undated-first', title: 'Undated first', targetDate: '' }),
      dream({ id: 'later', title: 'Later', targetDate: '2027-01-15' }),
      dream({ id: 'soon-first', title: 'Soon first', targetDate: '2026-09-01' }),
      dream({ id: 'undated-second', title: 'Undated second', targetDate: '' }),
      dream({ id: 'soon-second', title: 'Soon second', targetDate: '2026-09-01' }),
    ];
    const wrapper = mountLoadedVisionBoard(items);
    await wrapper.vm.$nextTick();

    await wrapper.find('.vision-sort-select').setValue('target');

    expect(renderedCardTitles(wrapper)).toEqual([
      'Soon first',
      'Soon second',
      'Later',
      'Undated first',
      'Undated second',
    ]);
    expect(wrapper.vm.items).toBe(items);
    wrapper.destroy();
  });

  test('sorts a copy by date or title without changing the saved board order', async () => {
    localStorage.removeItem('focusfrog.visionBoard.sort.v1');
    const items = [
      dream({ id: 'middle', title: 'Middle', createdAt: '2026-08-10T08:00:00.000Z' }),
      dream({ id: 'newest', title: 'Zulu', createdAt: '2026-08-17T08:00:00.000Z' }),
      dream({ id: 'oldest', title: 'Apple', createdAt: '2026-08-01T08:00:00.000Z' }),
    ];
    const originalIds = items.map(item => item.id);
    const wrapper = mountLoadedVisionBoard(items);
    await wrapper.vm.$nextTick();

    await wrapper.find('.vision-sort-select').setValue('newest');
    expect(renderedCardTitles(wrapper)).toEqual(['Zulu', 'Middle', 'Apple']);

    await wrapper.find('.vision-sort-select').setValue('oldest');
    expect(renderedCardTitles(wrapper)).toEqual(['Apple', 'Middle', 'Zulu']);

    await wrapper.find('.vision-sort-select').setValue('title');
    expect(renderedCardTitles(wrapper)).toEqual(['Apple', 'Middle', 'Zulu']);

    await wrapper.find('.vision-sort-select').setValue('board');
    expect(renderedCardTitles(wrapper)).toEqual(['Middle', 'Zulu', 'Apple']);
    expect(wrapper.vm.items).toBe(items);
    expect(wrapper.vm.items.map(item => item.id)).toEqual(originalIds);
    wrapper.destroy();
  });

  test('sorts closest to done using derived counter progress and keeps ties stable', async () => {
    localStorage.removeItem('focusfrog.visionBoard.sort.v1');
    const items = [
      dream({ id: 'first-tie', title: 'First tie', progress: 50 }),
      dream({ id: 'manual', title: 'Manual 70', progress: 70 }),
      dream({
        id: 'counter',
        title: 'Counter 4 of 5',
        progress: 1,
        counterCurrent: 4,
        counterTarget: 5,
        counterUnit: 'books',
      }),
      dream({ id: 'second-tie', title: 'Second tie', progress: 50 }),
      dream({ id: 'starting', title: 'Starting', progress: 10 }),
    ];
    const wrapper = mountLoadedVisionBoard(items);
    await wrapper.vm.$nextTick();

    await wrapper.find('.vision-sort-select').setValue('progress');

    expect(renderedCardTitles(wrapper)).toEqual([
      'Counter 4 of 5',
      'Manual 70',
      'First tie',
      'Second tie',
      'Starting',
    ]);
    expect(wrapper.vm.items).toBe(items);
    wrapper.destroy();
  });

  test('filters before sorting so hidden cards never reappear', async () => {
    localStorage.removeItem('focusfrog.visionBoard.sort.v1');
    const wrapper = mountLoadedVisionBoard([
      dream({ id: 'open-zulu', title: 'Zulu', status: 'dreaming' }),
      dream({
        id: 'achieved-apple',
        title: 'Apple',
        status: 'achieved',
        progress: 100,
        achievedAt: '2026-08-17T08:00:00.000Z',
      }),
      dream({ id: 'open-beta', title: 'Beta', status: 'dreaming' }),
    ]);
    await wrapper.setData({ activeFilter: 'dreaming' });
    await wrapper.find('.vision-sort-select').setValue('title');

    expect(renderedCardTitles(wrapper)).toEqual(['Beta', 'Zulu']);
    expect(wrapper.findAll('.vision-card')).toHaveLength(2);
    wrapper.destroy();
  });

  test('persists the sort preference separately from the board document', async () => {
    const sortStorageKey = 'focusfrog.visionBoard.sort.v1';
    const boardStorageKey = 'focusfrog.visionBoard.v1';
    const boardSentinel = JSON.stringify({ version: 1, updatedAt: 'unchanged', items: [] });
    localStorage.removeItem(sortStorageKey);
    localStorage.setItem(boardStorageKey, boardSentinel);

    const firstWrapper = mountLoadedVisionBoard([dream()]);
    firstWrapper.vm.persistBoard = jest.fn();
    await firstWrapper.vm.$nextTick();
    await firstWrapper.find('.vision-sort-select').setValue('oldest');

    expect(localStorage.getItem(sortStorageKey)).toBe('oldest');
    expect(localStorage.getItem(boardStorageKey)).toBe(boardSentinel);
    expect(firstWrapper.vm.persistBoard).not.toHaveBeenCalled();
    firstWrapper.destroy();

    const secondWrapper = mountLoadedVisionBoard([dream()]);
    secondWrapper.vm.loadSortPreference();
    await secondWrapper.vm.$nextTick();
    expect(secondWrapper.find('.vision-sort-select').element.value).toBe('oldest');
    secondWrapper.destroy();

    localStorage.removeItem(sortStorageKey);
    localStorage.removeItem(boardStorageKey);
  });

  test('offers one accessible drag handle per card only in All and My order', async () => {
    localStorage.removeItem('focusfrog.visionBoard.sort.v1');
    const wrapper = mountLoadedVisionBoard([
      dream({ id: 'first', title: 'First' }),
      dream({ id: 'second', title: 'Second' }),
    ]);
    await wrapper.vm.$nextTick();

    expect(wrapper.vm.canReorder).toBe(true);
    expect(wrapper.find('.vision-sort-select').exists()).toBe(true);
    expect(wrapper.findAll('.vision-drag-handle')).toHaveLength(2);
    expect(wrapper.findAll('.vision-drag-handle').at(0).element.disabled).toBe(false);
    expect(wrapper.findAll('.vision-drag-handle').at(0).attributes('aria-label')).toMatch(
      /reorder first.*arrow keys/i
    );
    expect(wrapper.findAll('.vision-drag-handle').at(0).attributes('aria-label')).toMatch(
      /position 1 of 2/i
    );
    expect(wrapper.findAll('.vision-drag-handle').at(1).attributes('aria-label')).toMatch(
      /position 2 of 2/i
    );

    await wrapper.find('.vision-sort-select').setValue('title');

    expect(wrapper.vm.canReorder).toBe(false);
    expect(wrapper.findAll('.vision-drag-handle').at(0).element.disabled).toBe(true);

    await wrapper.setData({ sortMode: 'board', activeFilter: 'dreaming' });

    expect(wrapper.vm.canReorder).toBe(false);
    expect(wrapper.findAll('.vision-drag-handle').at(0).element.disabled).toBe(true);
    wrapper.destroy();
  });

  test.each([
    ['a sorted view', { activeFilter: 'all', sortMode: 'title', loading: false, saving: false }],
    [
      'a filtered view',
      { activeFilter: 'dreaming', sortMode: 'board', loading: false, saving: false },
    ],
    ['the loading state', { activeFilter: 'all', sortMode: 'board', loading: true, saving: false }],
    ['the saving state', { activeFilter: 'all', sortMode: 'board', loading: false, saving: true }],
  ])('does not allow manual reordering in %s', (_label, vm) => {
    expect(VisionBoard.computed.canReorder.call(vm)).toBe(false);
  });

  test('drags a card to a new position in My order and persists the canonical order', async () => {
    const items = [
      dream({ id: 'first', title: 'Zulu' }),
      dream({ id: 'second', title: 'Middle' }),
      dream({ id: 'third', title: 'Apple' }),
    ];
    const wrapper = mountLoadedVisionBoard(items);
    const persistBoard = jest.fn(async () => ({ localSaved: true, serverSaved: true }));
    wrapper.vm.persistBoard = persistBoard;
    await wrapper.vm.$nextTick();

    wrapper.vm.startCardDrag({ oldIndex: 0 });
    await wrapper.vm.dropCard({ oldIndex: 0, newIndex: 2 });
    await wrapper.vm.$nextTick();

    expect(wrapper.vm.items.map(item => item.id)).toEqual(['second', 'third', 'first']);
    expect(persistBoard).toHaveBeenCalledTimes(1);
    expect(wrapper.vm.saving).toBe(false);

    await wrapper.find('.vision-sort-select').setValue('title');
    expect(renderedCardTitles(wrapper)).toEqual(['Apple', 'Middle', 'Zulu']);
    expect(wrapper.vm.items.map(item => item.id)).toEqual(['second', 'third', 'first']);

    await wrapper.find('.vision-sort-select').setValue('board');
    expect(renderedCardTitles(wrapper)).toEqual(['Middle', 'Apple', 'Zulu']);
    wrapper.destroy();
  });

  test('applies a pointer drop immediately while persistence is still pending', async () => {
    const items = [
      dream({ id: 'first', title: 'First' }),
      dream({ id: 'second', title: 'Second' }),
      dream({ id: 'third', title: 'Third' }),
    ];
    let finishPersistence;
    const pendingPersistence = new Promise(resolve => {
      finishPersistence = resolve;
    });
    const wrapper = mountLoadedVisionBoard(items);
    const persistBoard = jest.fn(() => pendingPersistence);
    wrapper.vm.persistBoard = persistBoard;
    wrapper.vm.refreshBoardForReorder = jest.fn(async () => false);
    await wrapper.vm.$nextTick();

    wrapper.vm.startCardDrag({ oldIndex: 0 });
    expect(wrapper.vm.draggedItemId).toBe('first');

    const dropPromise = wrapper.vm.dropCard({ oldIndex: 0, newIndex: 2 });

    expect(wrapper.vm.items.map(item => item.id)).toEqual(['second', 'third', 'first']);
    expect(wrapper.vm.draggedItemId).toBe('');
    expect(wrapper.vm.saving).toBe(true);

    await Promise.resolve();
    expect(persistBoard).toHaveBeenCalledTimes(1);
    finishPersistence({ localSaved: true, serverSaved: true });
    await dropPromise;

    expect(wrapper.vm.saving).toBe(false);
    wrapper.destroy();
  });

  test('moves a card with an arrow key on its drag handle and persists once', async () => {
    const items = [
      dream({ id: 'first', title: 'First' }),
      dream({ id: 'second', title: 'Second' }),
      dream({ id: 'third', title: 'Third' }),
    ];
    const wrapper = mountLoadedVisionBoard(items);
    const persistBoard = jest.fn(async () => ({ localSaved: true, serverSaved: true }));
    wrapper.vm.persistBoard = persistBoard;
    wrapper.vm.refreshBoardForReorder = jest.fn(async () => undefined);
    const moveCard = jest.spyOn(wrapper.vm, 'moveCard');
    await wrapper.vm.$nextTick();

    await wrapper.findAll('.vision-drag-handle').at(1).trigger('keydown', {
      key: 'ArrowLeft',
      code: 'ArrowLeft',
      keyCode: 37,
    });
    expect(moveCard).toHaveBeenCalledWith(expect.objectContaining({ id: 'second' }), -1);
    await moveCard.mock.results[0].value;
    await wrapper.vm.$nextTick();

    expect(wrapper.vm.items.map(item => item.id)).toEqual(['second', 'first', 'third']);
    expect(persistBoard).toHaveBeenCalledTimes(1);
    expect(wrapper.vm.saving).toBe(false);
    wrapper.destroy();
  });

  test('announces when an arrow key cannot move the first or last card any farther', async () => {
    const items = [
      dream({ id: 'first', title: 'First' }),
      dream({ id: 'second', title: 'Second' }),
      dream({ id: 'third', title: 'Third' }),
    ];
    const wrapper = mountLoadedVisionBoard(items);
    wrapper.vm.persistBoard = jest.fn();
    const moveCard = jest.spyOn(wrapper.vm, 'moveCard');
    await wrapper.vm.$nextTick();

    await wrapper.findAll('.vision-drag-handle').at(0).trigger('keydown', {
      key: 'ArrowLeft',
      code: 'ArrowLeft',
      keyCode: 37,
    });
    await moveCard.mock.results[0].value;
    expect(wrapper.vm.checkInAnnouncement).toBe('First is already first.');

    await wrapper.findAll('.vision-drag-handle').at(2).trigger('keydown', {
      key: 'ArrowRight',
      code: 'ArrowRight',
      keyCode: 39,
    });
    await moveCard.mock.results[1].value;
    expect(wrapper.vm.checkInAnnouncement).toBe('Third is already last.');
    expect(wrapper.vm.items).toBe(items);
    expect(wrapper.vm.persistBoard).not.toHaveBeenCalled();
    wrapper.destroy();
  });

  test('ignores drag and keyboard reorder guards without persisting', async () => {
    const items = [
      dream({ id: 'first', title: 'First' }),
      dream({ id: 'second', title: 'Second' }),
      dream({ id: 'third', title: 'Third' }),
    ];
    const wrapper = mountLoadedVisionBoard(items);
    const persistBoard = jest.fn();
    wrapper.vm.persistBoard = persistBoard;
    await wrapper.vm.$nextTick();

    await wrapper.vm.moveCard(items[0], -1);
    await wrapper.vm.moveCard(items[2], 1);
    wrapper.vm.startCardDrag({ oldIndex: 1 });
    await wrapper.vm.dropCard({ oldIndex: 1, newIndex: 1 });

    expect(wrapper.vm.items).toBe(items);
    expect(wrapper.vm.items.map(item => item.id)).toEqual(['first', 'second', 'third']);
    expect(persistBoard).not.toHaveBeenCalled();

    await wrapper.setData({ sortMode: 'title' });
    wrapper.vm.startCardDrag({ oldIndex: 0 });
    await wrapper.vm.dropCard({ oldIndex: 0, newIndex: 2 });
    await wrapper.vm.moveCard(items[1], -1);

    expect(wrapper.vm.items).toBe(items);
    expect(persistBoard).not.toHaveBeenCalled();
    wrapper.destroy();
  });

  test('restores the exact board snapshot when a manual reorder cannot be saved', async () => {
    const items = [
      dream({ id: 'first', title: 'First' }),
      dream({ id: 'second', title: 'Second' }),
      dream({ id: 'third', title: 'Third' }),
    ];
    const previousUpdatedAt = '2026-08-17T08:00:00.000Z';
    const wrapper = mountLoadedVisionBoard(items);
    wrapper.vm.boardUpdatedAt = previousUpdatedAt;
    wrapper.vm.persistBoard = jest.fn(async () => {
      wrapper.vm.boardUpdatedAt = '2026-08-18T08:00:00.000Z';
      return { localSaved: false, serverSaved: false };
    });
    await wrapper.vm.$nextTick();

    await wrapper.vm.moveCard(items[1], -1);
    await wrapper.vm.$nextTick();

    expect(wrapper.vm.items).toBe(items);
    expect(wrapper.vm.items.map(item => item.id)).toEqual(['first', 'second', 'third']);
    expect(wrapper.vm.boardUpdatedAt).toBe(previousUpdatedAt);
    expect(wrapper.vm.saving).toBe(false);
    wrapper.destroy();
  });

  test('focuses the title when the editor opens', () => {
    const titleInput = { focus: jest.fn() };
    const vm = {
      $refs: { titleInput },
      $nextTick: callback => callback(),
    };

    VisionBoard.methods.focusEditorField.call(vm);

    expect(titleInput.focus).toHaveBeenCalledTimes(1);
  });

  test('rolls back a check-in when neither storage destination can save it', async () => {
    const checkedInAt = '2026-08-20T10:00:00.000Z';
    jest.useFakeTimers().setSystemTime(new Date(checkedInAt));
    const existing = dream({
      updatedAt: '2026-08-10T08:00:00.000Z',
      lastCheckInAt: '2026-08-10T08:00:00.000Z',
    });
    const previousItems = [existing];
    const previousUpdatedAt = '2026-08-10T08:00:00.000Z';
    const vm = {
      saving: false,
      loading: false,
      items: previousItems,
      boardUpdatedAt: previousUpdatedAt,
      syncWarning: '',
      persistBoard: jest.fn(async () => {
        vm.boardUpdatedAt = checkedInAt;
        return { localSaved: false, serverSaved: false };
      }),
    };

    await VisionBoard.methods.checkInItem.call(vm, existing);

    expect(vm.persistBoard).toHaveBeenCalledTimes(1);
    expect(vm.items).toBe(previousItems);
    expect(vm.items[0].lastCheckInAt).toBe('2026-08-10T08:00:00.000Z');
    expect(vm.boardUpdatedAt).toBe(previousUpdatedAt);
    expect(vm.saving).toBe(false);
  });

  test('keeps a check-in when browser storage saves it without app storage', async () => {
    const checkedInAt = '2026-08-20T10:00:00.000Z';
    jest.useFakeTimers().setSystemTime(new Date(checkedInAt));
    const existing = dream({
      updatedAt: '2026-08-10T08:00:00.000Z',
      lastCheckInAt: '2026-08-10T08:00:00.000Z',
    });
    const previousItems = [existing];
    const vm = {
      saving: false,
      loading: false,
      items: previousItems,
      boardUpdatedAt: existing.updatedAt,
      syncWarning: '',
      persistBoard: jest.fn(async () => {
        vm.boardUpdatedAt = checkedInAt;
        return { localSaved: true, serverSaved: false };
      }),
    };

    await VisionBoard.methods.checkInItem.call(vm, existing);

    expect(vm.persistBoard).toHaveBeenCalledTimes(1);
    expect(vm.items).not.toBe(previousItems);
    expect(vm.items[0]).toMatchObject({
      lastCheckInAt: checkedInAt,
      updatedAt: checkedInAt,
    });
    expect(vm.boardUpdatedAt).toBe(checkedInAt);
    expect(vm.saving).toBe(false);
  });

  test('increments an enabled counter from current board state and derives progress', async () => {
    const incrementedAt = '2026-08-20T10:00:00.000Z';
    jest.useFakeTimers().setSystemTime(new Date(incrementedAt));
    const existing = dream({
      counterCurrent: 2,
      counterTarget: 5,
      counterUnit: 'books',
      progress: 40,
      lastCheckInAt: '2026-08-10T08:00:00.000Z',
    });
    const staleItem = { ...existing, counterCurrent: 1, progress: 20 };
    const vm = {
      saving: false,
      loading: false,
      activeFilter: 'all',
      items: [existing],
      boardUpdatedAt: existing.updatedAt,
      checkInAnnouncement: '',
      $nextTick: callback => callback(),
      focusReviewFilter: jest.fn(),
      persistBoard: jest.fn(async () => ({ localSaved: true, serverSaved: true })),
    };

    await VisionBoard.methods.incrementCounter.call(vm, staleItem);

    expect(vm.persistBoard).toHaveBeenCalledTimes(1);
    expect(vm.items[0]).toMatchObject({
      counterCurrent: 3,
      counterTarget: 5,
      counterUnit: 'books',
      progress: 60,
      lastCheckInAt: incrementedAt,
      updatedAt: incrementedAt,
      status: 'dreaming',
    });
    expect(vm.saving).toBe(false);
  });

  test('refreshes a newer server counter before incrementing', async () => {
    const local = dream({
      counterCurrent: 2,
      counterTarget: 5,
      counterUnit: 'books',
      progress: 40,
      updatedAt: '2026-08-20T09:00:00.000Z',
    });
    const server = dream({
      counterCurrent: 3,
      counterTarget: 5,
      counterUnit: 'books',
      progress: 60,
      updatedAt: '2026-08-20T10:00:00.000Z',
    });
    const serverDocument = {
      version: 1,
      updatedAt: '2026-08-20T10:00:00.000Z',
      items: [server],
    };
    const vm = {
      saving: false,
      loading: false,
      activeFilter: 'all',
      items: [local],
      boardUpdatedAt: '2026-08-20T09:00:00.000Z',
      checkInAnnouncement: '',
      loadServerDocument: jest.fn(async () => serverDocument),
      writeLocalDocument: jest.fn(() => true),
      persistBoard: jest.fn(async () => ({ localSaved: true, serverSaved: true })),
    };

    await VisionBoard.methods.incrementCounter.call(vm, local);

    expect(vm.items[0].counterCurrent).toBe(4);
    expect(vm.items[0].progress).toBe(80);
    expect(vm.writeLocalDocument).toHaveBeenCalledWith(serverDocument);
  });

  test('refreshes a newer browser-only counter before incrementing', async () => {
    const stale = dream({
      counterCurrent: 2,
      counterTarget: 5,
      counterUnit: 'books',
      progress: 40,
      updatedAt: '2026-08-20T09:00:00.000Z',
    });
    const fresh = dream({
      counterCurrent: 3,
      counterTarget: 5,
      counterUnit: 'books',
      progress: 60,
      updatedAt: '2026-08-20T10:00:00.000Z',
    });
    const freshLocalDocument = {
      version: 1,
      updatedAt: '2026-08-20T10:00:00.000Z',
      items: [fresh],
    };
    const staleServerDocument = {
      version: 1,
      updatedAt: '2026-08-20T09:00:00.000Z',
      items: [stale],
    };
    const vm = {
      saving: false,
      loading: false,
      activeFilter: 'all',
      items: [stale],
      boardUpdatedAt: '2026-08-20T09:00:00.000Z',
      checkInAnnouncement: '',
      readLocalDocument: jest.fn(() => freshLocalDocument),
      loadServerDocument: jest.fn(async () => staleServerDocument),
      writeLocalDocument: jest.fn(() => true),
      persistBoard: jest.fn(async () => ({ localSaved: true, serverSaved: true })),
    };

    await VisionBoard.methods.incrementCounter.call(vm, stale);

    expect(vm.items[0].counterCurrent).toBe(4);
    expect(vm.items[0].progress).toBe(80);
    expect(vm.writeLocalDocument).toHaveBeenCalledWith(freshLocalDocument);
  });

  test('clamps the final counter increment without automatically marking the dream achieved', async () => {
    const existing = dream({
      counterCurrent: 4,
      counterTarget: 5,
      counterUnit: 'workouts',
      progress: 80,
    });
    const vm = {
      saving: false,
      loading: false,
      activeFilter: 'all',
      items: [existing],
      boardUpdatedAt: existing.updatedAt,
      checkInAnnouncement: '',
      $nextTick: callback => callback(),
      focusReviewFilter: jest.fn(),
      persistBoard: jest.fn(async () => ({ localSaved: true, serverSaved: true })),
    };

    await VisionBoard.methods.incrementCounter.call(vm, existing);
    await VisionBoard.methods.incrementCounter.call(vm, vm.items[0]);

    expect(vm.items[0]).toMatchObject({
      counterCurrent: 5,
      counterTarget: 5,
      progress: 100,
      status: 'dreaming',
      achievedAt: '',
    });
    expect(vm.persistBoard).toHaveBeenCalledTimes(1);
  });

  test('rolls back a counter increment when neither storage destination can save it', async () => {
    const incrementedAt = '2026-08-20T10:00:00.000Z';
    jest.useFakeTimers().setSystemTime(new Date(incrementedAt));
    const existing = dream({
      counterCurrent: 2,
      counterTarget: 5,
      counterUnit: 'books',
      progress: 40,
      updatedAt: '2026-08-10T08:00:00.000Z',
      lastCheckInAt: '2026-08-10T08:00:00.000Z',
    });
    const previousItems = [existing];
    const previousUpdatedAt = '2026-08-10T08:00:00.000Z';
    const vm = {
      saving: false,
      loading: false,
      activeFilter: 'all',
      items: previousItems,
      boardUpdatedAt: previousUpdatedAt,
      checkInAnnouncement: '',
      $nextTick: callback => callback(),
      focusReviewFilter: jest.fn(),
      persistBoard: jest.fn(async () => {
        vm.boardUpdatedAt = incrementedAt;
        return { localSaved: false, serverSaved: false };
      }),
    };

    await VisionBoard.methods.incrementCounter.call(vm, existing);

    expect(vm.persistBoard).toHaveBeenCalledTimes(1);
    expect(vm.items).toBe(previousItems);
    expect(vm.items[0]).toMatchObject({
      counterCurrent: 2,
      progress: 40,
      lastCheckInAt: '2026-08-10T08:00:00.000Z',
      updatedAt: '2026-08-10T08:00:00.000Z',
    });
    expect(vm.boardUpdatedAt).toBe(previousUpdatedAt);
    expect(vm.saving).toBe(false);
  });

  test('rolls back a counter increment when persistence throws', async () => {
    const existing = dream({
      counterCurrent: 2,
      counterTarget: 5,
      counterUnit: 'books',
      progress: 40,
    });
    const previousItems = [existing];
    const vm = {
      saving: false,
      loading: false,
      activeFilter: 'all',
      items: previousItems,
      boardUpdatedAt: existing.updatedAt,
      checkInAnnouncement: '',
      syncWarning: '',
      persistBoard: jest.fn(async () => {
        throw new Error('disk unavailable');
      }),
    };

    await VisionBoard.methods.incrementCounter.call(vm, existing);

    expect(vm.items).toBe(previousItems);
    expect(vm.boardUpdatedAt).toBe(existing.updatedAt);
    expect(vm.checkInAnnouncement).toMatch(/could not update/i);
    expect(vm.saving).toBe(false);
  });

  test.each([
    ['while another save is running', { saving: true }, {}],
    ['while the board is loading', { loading: true }, {}],
    ['for an achieved dream', {}, { status: 'achieved' }],
    ['when the counter is disabled', {}, { counterCurrent: 0, counterTarget: 0 }],
    ['when the counter is already complete', {}, { counterCurrent: 5, counterTarget: 5 }],
  ])('does not increment %s', async (_label, vmOverrides, itemOverrides) => {
    const existing = dream({
      counterCurrent: 2,
      counterTarget: 5,
      counterUnit: 'books',
      progress: 40,
      ...itemOverrides,
    });
    const vm = {
      saving: false,
      loading: false,
      activeFilter: 'all',
      items: [existing],
      boardUpdatedAt: existing.updatedAt,
      checkInAnnouncement: '',
      $nextTick: callback => callback(),
      focusReviewFilter: jest.fn(),
      persistBoard: jest.fn(),
      ...vmOverrides,
    };

    await VisionBoard.methods.incrementCounter.call(vm, existing);

    expect(vm.persistBoard).not.toHaveBeenCalled();
    expect(vm.items[0]).toBe(existing);
  });

  test('moves focus to Review and announces a check-in when the card leaves the filter', async () => {
    const checkedInAt = '2026-08-20T10:00:00.000Z';
    jest.useFakeTimers().setSystemTime(new Date(checkedInAt));
    const existing = dream({ lastCheckInAt: '2026-08-10T08:00:00.000Z' });
    const reviewFilter = { dataset: { filter: 'attention' }, focus: jest.fn() };
    const vm = {
      saving: false,
      loading: false,
      activeFilter: 'attention',
      items: [existing],
      boardUpdatedAt: existing.updatedAt,
      checkInAnnouncement: '',
      $refs: { filterButtons: [reviewFilter] },
      $nextTick: callback => callback(),
      persistBoard: jest.fn(async () => ({ localSaved: true, serverSaved: true })),
    };
    vm.focusFilter = filter => VisionBoard.methods.focusFilter.call(vm, filter);
    vm.focusReviewFilter = () => VisionBoard.methods.focusReviewFilter.call(vm);

    await VisionBoard.methods.checkInItem.call(vm, existing);

    expect(reviewFilter.focus).toHaveBeenCalledTimes(1);
    expect(vm.checkInAnnouncement).toBe(`Checked in on ${existing.title}.`);
  });

  test('shows a modal error when deleting an edited card cannot be saved', async () => {
    const item = dream();
    const vm = {
      saving: false,
      formError: '',
      editingId: item.id,
      items: [item],
      boardUpdatedAt: item.updatedAt,
      persistBoard: jest.fn(async () => ({ localSaved: false, serverSaved: false })),
      deleteImage: jest.fn(),
      closeEditor: jest.fn(),
    };
    jest.spyOn(window, 'confirm').mockReturnValueOnce(true);

    await VisionBoard.methods.deleteEditingItem.call(vm);

    expect(vm.items).toEqual([item]);
    expect(vm.formError).toMatch(/could not delete/i);
    expect(vm.saving).toBe(false);
    expect(vm.closeEditor).not.toHaveBeenCalled();
  });
});
