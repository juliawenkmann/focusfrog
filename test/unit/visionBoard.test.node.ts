import {
  chooseNewestVisionBoardDocument,
  normalizeVisionBoardDocument,
  normalizeVisionBoardItems,
  validateVisionImage,
  visionBoardItemNeedsAttention,
  visionImageUrl,
  VisionBoardItem,
  VISION_IMAGE_MAX_BYTES,
} from '../../src/util/visionBoard';

const item = (overrides: Partial<VisionBoardItem> = {}): VisionBoardItem => ({
  id: 'dream-northern-lights',
  title: 'See the northern lights',
  notes: 'Take the train north and stay somewhere quiet.',
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

describe('vision board data', () => {
  test('normalizes valid items and ignores malformed records', () => {
    expect(
      normalizeVisionBoardItems([
        item({ title: '  See   the northern lights  ' }),
        { id: '', title: 'Missing id' },
        { id: 'missing-title', title: '' },
        null,
      ])
    ).toEqual([item({ title: 'See the northern lights' })]);
  });

  test('keeps the newest copy when an item id appears more than once', () => {
    const older = item({ title: 'Old title' });
    const newer = item({
      title: 'New title',
      updatedAt: '2026-08-17T09:00:00.000Z',
    });

    expect(normalizeVisionBoardItems([older, newer])).toEqual([newer]);
  });

  test('preserves manual input order while replacing a duplicate in its original slot', () => {
    const first = item({
      id: 'first',
      title: 'First despite being achieved',
      status: 'achieved',
      achievedAt: '2026-08-01T08:00:00.000Z',
      createdAt: '2026-08-01T08:00:00.000Z',
    });
    const duplicateOlder = item({
      id: 'duplicate',
      title: 'Older duplicate',
      createdAt: '2026-08-17T08:00:00.000Z',
      updatedAt: '2026-08-17T08:00:00.000Z',
    });
    const third = item({
      id: 'third',
      title: 'Third despite being newest',
      createdAt: '2026-08-20T08:00:00.000Z',
      updatedAt: '2026-08-20T08:00:00.000Z',
    });
    const duplicateNewer = item({
      id: 'duplicate',
      title: 'Newest duplicate',
      createdAt: duplicateOlder.createdAt,
      updatedAt: '2026-08-18T08:00:00.000Z',
    });

    const normalized = normalizeVisionBoardItems([first, duplicateOlder, third, duplicateNewer]);

    expect(normalized.map(normalizedItem => normalizedItem.id)).toEqual([
      'first',
      'duplicate',
      'third',
    ]);
    expect(normalized[1].title).toBe('Newest duplicate');
  });

  test('defaults accountability fields when loading a legacy item', () => {
    const legacyItem: Partial<VisionBoardItem> = { ...item() };
    delete legacyItem.nextAction;
    delete legacyItem.targetDate;
    delete legacyItem.progress;
    delete legacyItem.counterCurrent;
    delete legacyItem.counterTarget;
    delete legacyItem.counterUnit;
    delete legacyItem.lastCheckInAt;

    expect(normalizeVisionBoardItems([legacyItem])[0]).toMatchObject({
      nextAction: '',
      targetDate: '',
      progress: 0,
      counterCurrent: 0,
      counterTarget: 0,
      counterUnit: '',
      lastCheckInAt: '',
    });
  });

  test('normalizes accountability text, dates, progress, and check-in timestamps', () => {
    expect(
      normalizeVisionBoardItems([
        item({
          nextAction: '  Book   the sleeper train  ',
          targetDate: '2026-02-30',
          progress: 140.4,
          lastCheckInAt: 'not-a-timestamp',
        }),
      ])[0]
    ).toMatchObject({
      nextAction: 'Book the sleeper train',
      targetDate: '',
      progress: 100,
      lastCheckInAt: '',
    });

    expect(
      normalizeVisionBoardItems([
        item({
          targetDate: '2026-12-31',
          progress: 42.6,
          lastCheckInAt: '2026-08-16T12:00:00.000Z',
        }),
      ])[0]
    ).toMatchObject({
      targetDate: '2026-12-31',
      progress: 43,
      lastCheckInAt: '2026-08-16T12:00:00.000Z',
    });

    expect(
      normalizeVisionBoardItems([item({ status: 'achieved', progress: 12 })])[0].progress
    ).toBe(100);

    expect(
      normalizeVisionBoardItems([
        item({ progress: '42' as unknown as number }),
        item({ id: 'boolean-progress', progress: true as unknown as number }),
      ]).map(normalized => normalized.progress)
    ).toEqual([0, 0]);
  });

  test('normalizes counters and derives progress when a counter is enabled', () => {
    expect(
      normalizeVisionBoardItems([
        item({
          counterCurrent: 3,
          counterTarget: 8,
          counterUnit: '  books  ',
          progress: 99,
        }),
      ])[0]
    ).toMatchObject({
      counterCurrent: 3,
      counterTarget: 8,
      counterUnit: 'books',
      progress: 38,
    });

    expect(
      normalizeVisionBoardItems([
        item({
          counterCurrent: 12,
          counterTarget: 5,
          counterUnit: 'workouts',
          progress: 10,
        }),
      ])[0]
    ).toMatchObject({
      counterCurrent: 5,
      counterTarget: 5,
      counterUnit: 'workouts',
      progress: 100,
    });

    expect(
      normalizeVisionBoardItems([
        item({ counterCurrent: 9998, counterTarget: 9999, progress: 100 }),
      ])[0].progress
    ).toBe(99);

    expect(
      normalizeVisionBoardItems([
        item({
          counterCurrent: '3' as unknown as number,
          counterTarget: true as unknown as number,
          counterUnit: 4 as unknown as string,
          progress: 25,
        }),
      ])[0]
    ).toMatchObject({
      counterCurrent: 0,
      counterTarget: 0,
      counterUnit: '',
      progress: 25,
    });
  });

  test('keeps next actions optional while flagging genuine review triggers', () => {
    const now = new Date(2026, 7, 17, 12).getTime();
    const oneDayAgo = new Date(now - 24 * 60 * 60 * 1000).toISOString();
    const sevenDaysAgo = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();
    const legacy = item({
      nextAction: '',
      targetDate: '',
      progress: 0,
      lastCheckInAt: '',
    });
    const current = item({
      nextAction: 'Book the sleeper train',
      targetDate: '2026-08-25',
      progress: 25,
      lastCheckInAt: oneDayAgo,
    });

    expect(visionBoardItemNeedsAttention(legacy, now)).toBe(false);
    expect(
      visionBoardItemNeedsAttention(
        item({
          nextAction: '',
          targetDate: '',
          progress: 0,
          counterCurrent: 0,
          counterTarget: 5,
          counterUnit: 'books',
          lastCheckInAt: '',
        }),
        now
      )
    ).toBe(false);
    expect(visionBoardItemNeedsAttention(current, now)).toBe(false);
    expect(visionBoardItemNeedsAttention(item({ ...current, nextAction: '' }), now)).toBe(false);
    expect(visionBoardItemNeedsAttention(item({ ...current, progress: 100 }), now)).toBe(true);
    expect(visionBoardItemNeedsAttention(item({ ...current, targetDate: '2026-08-24' }), now)).toBe(
      true
    );
    expect(visionBoardItemNeedsAttention(item({ ...current, targetDate: '2026-08-16' }), now)).toBe(
      true
    );
    expect(
      visionBoardItemNeedsAttention(
        item({ ...current, createdAt: oneDayAgo, lastCheckInAt: '' }),
        now
      )
    ).toBe(false);
    expect(
      visionBoardItemNeedsAttention(
        item({ ...current, createdAt: sevenDaysAgo, lastCheckInAt: '' }),
        now
      )
    ).toBe(true);
    expect(
      visionBoardItemNeedsAttention(item({ ...current, lastCheckInAt: sevenDaysAgo }), now)
    ).toBe(true);
    expect(
      visionBoardItemNeedsAttention(
        item({ ...current, nextAction: '', lastCheckInAt: sevenDaysAgo }),
        now
      )
    ).toBe(true);
    expect(
      visionBoardItemNeedsAttention(
        item({ ...current, status: 'achieved', nextAction: '', lastCheckInAt: '' }),
        now
      )
    ).toBe(false);
  });

  test('chooses the newest whole-board document so deletions do not reappear', () => {
    const localDocument = {
      version: 1,
      updatedAt: '2026-08-17T10:00:00.000Z',
      items: [],
    };
    const olderServerDocument = {
      version: 1,
      updatedAt: '2026-08-17T09:00:00.000Z',
      items: [item()],
    };

    expect(chooseNewestVisionBoardDocument(localDocument, olderServerDocument)).toEqual(
      localDocument
    );
  });

  test('supports the legacy item-array shape without trusting invalid image ids', () => {
    const normalized = normalizeVisionBoardDocument([item({ imageId: '../../private-photo.jpg' })]);

    expect(normalized.version).toBe(1);
    expect(normalized.items[0].imageId).toBe('');
  });

  test('builds same-origin image URLs only for opaque server ids', () => {
    expect(visionImageUrl(item().imageId)).toBe(
      '/focusfrog-vision-images/3f2504e0-4f89-41d3-9a0c-0305e82c3301'
    );
    expect(visionImageUrl('../photo.jpg')).toBe('');
  });

  test('accepts supported photos within the upload limit', () => {
    expect(validateVisionImage({ type: 'image/jpeg', size: 1024 })).toBe('');
    expect(validateVisionImage({ type: 'image/gif', size: 1024 })).toMatch(/JPEG, PNG, or WebP/);
    expect(validateVisionImage({ type: 'image/png', size: VISION_IMAGE_MAX_BYTES + 1 })).toMatch(
      /smaller than 8 MB/
    );
  });
});
