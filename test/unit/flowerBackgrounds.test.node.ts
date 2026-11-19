import fs from 'fs';
import path from 'path';
import {
  DEFAULT_FLOWER_BACKGROUND,
  FLOWER_BACKGROUNDS,
  isUploadedBackground,
  newUploadedBackgroundId,
  nextFlowerBackground,
  normalizeFlowerBackground,
  normalizeHiddenBackgrounds,
  tuneFlowerBackground,
} from '../../src/util/flowerBackgrounds';

describe('flower backgrounds', () => {
  test('every shared background picture ships in static/', () => {
    for (const background of FLOWER_BACKGROUNDS.filter(candidate => !candidate.private)) {
      const file = path.join(__dirname, '../../static', background.url);
      expect(fs.existsSync(file)).toBe(true);
    }
  });

  test('private pictures are kept out of git', () => {
    const ignored = fs
      .readFileSync(path.join(__dirname, '../../.gitignore'), 'utf8')
      .split('\n')
      .map(line => line.trim());
    for (const background of FLOWER_BACKGROUNDS.filter(candidate => candidate.private)) {
      expect(ignored).toContain(`static${background.url}`);
    }
  });

  test('every picture says how much to frost it (flower) and dim it (black flower)', () => {
    for (const background of FLOWER_BACKGROUNDS) {
      expect(background.veil).toBeGreaterThan(0);
      expect(background.veil).toBeLessThan(1);
      expect(background.shade).toBeGreaterThan(0);
      expect(background.shade).toBeLessThan(1);
    }
  });

  test('has the frog pictures', () => {
    const ids = FLOWER_BACKGROUNDS.map(background => background.id);
    expect(ids).toEqual(
      expect.arrayContaining(['frog-nouveau', 'frog-silhouettes', 'glass-frogs'])
    );
  });

  test('has the dark, silk and painting pictures', () => {
    const ids = FLOWER_BACKGROUNDS.map(background => background.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        'dark-grass',
        'black-silk',
        'great-wave',
        'grande-jatte',
        'dark-leaves',
      ])
    );
  });

  test('keeps the original roses as the default', () => {
    expect(DEFAULT_FLOWER_BACKGROUND).toBe('roses');
    expect(normalizeFlowerBackground('unknown')).toBe('roses');
    expect(normalizeFlowerBackground('peacock')).toBe('peacock');
  });

  test('always picks a different background than the current one', () => {
    for (const background of FLOWER_BACKGROUNDS) {
      for (const roll of [0, 0.3, 0.6, 0.999999, 1]) {
        const next = nextFlowerBackground(background.id, () => roll);
        expect(next).not.toBe(background.id);
        expect(FLOWER_BACKGROUNDS.some(candidate => candidate.id === next)).toBe(true);
      }
    }
  });

  test('keeps an uploaded picture as chosen, before the cloud has answered', () => {
    const uploaded = newUploadedBackgroundId();
    expect(isUploadedBackground(uploaded)).toBe(true);
    expect(normalizeFlowerBackground(uploaded)).toBe(uploaded);
    expect(isUploadedBackground('background-not-a-uuid')).toBe(false);
    expect(normalizeFlowerBackground('background-not-a-uuid')).toBe('roses');
  });

  test('the flower button also picks uploaded pictures', () => {
    const uploaded = [newUploadedBackgroundId(), newUploadedBackgroundId()];
    const total = FLOWER_BACKGROUNDS.length + uploaded.length;
    const reached = new Set(
      Array.from({ length: total }, (_, index) =>
        nextFlowerBackground(uploaded[0], () => (index + 0.5) / (total - 1), uploaded)
      )
    );
    expect(reached.has(uploaded[1])).toBe(true);
    expect(reached.has(uploaded[0])).toBe(false);
    expect(nextFlowerBackground('roses', () => 0.999999, ['junk'])).not.toBe('junk');
  });

  // The averages and the values the tuning script found for the five pictures added with it.
  test.each([
    ['dark grass', [22, 43, 40], 0.58, 0.15],
    ['black silk', [17, 17, 17], 0.62, 0.15],
    ['dark leaves', [6, 52, 40], 0.58, 0.15],
    ['great wave', [191, 193, 182], 0.18, 0.66],
    ['grande jatte', [115, 119, 101], 0.34, 0.43],
  ])('frosts and dims %s so its text stays readable', (_, average, veil, shade) => {
    const tuned = tuneFlowerBackground(average as [number, number, number]);
    expect(tuned.veil).toBeCloseTo(veil, 5);
    expect(tuned.shade).toBeCloseTo(shade, 5);
  });

  test('keeps only built-in pictures in the removed list', () => {
    expect(
      normalizeHiddenBackgrounds(['peacock', 'peacock', 'unknown', newUploadedBackgroundId(), 3])
    ).toEqual(['peacock']);
    expect(normalizeHiddenBackgrounds('peacock')).toEqual([]);
    expect(normalizeHiddenBackgrounds(undefined)).toEqual([]);
  });

  test('the flower button never picks a removed picture', () => {
    const hidden = FLOWER_BACKGROUNDS.map(background => background.id).filter(
      id => !['roses', 'waves', 'smoke'].includes(id)
    );
    for (const roll of [0, 0.3, 0.6, 0.999999, 1]) {
      expect(['waves', 'smoke']).toContain(nextFlowerBackground('roses', () => roll, [], hidden));
    }
  });

  test('keeps the current picture when every other one is removed', () => {
    const hidden = FLOWER_BACKGROUNDS.map(background => background.id).filter(id => id !== 'roses');
    expect(nextFlowerBackground('roses', () => 0.5, [], hidden)).toBe('roses');
    const uploaded = newUploadedBackgroundId();
    expect(nextFlowerBackground('roses', () => 0.5, [uploaded], hidden)).toBe(uploaded);
  });

  test('tiles the frog nouveau pattern, four copies along the longer side', () => {
    const frogs = FLOWER_BACKGROUNDS.find(background => background.id === 'frog-nouveau');
    expect(frogs?.size).toBe('max(25vw, 25vh)');
    expect(frogs?.repeat).toBe('repeat');
  });

  test('can reach every other background', () => {
    const others = FLOWER_BACKGROUNDS.filter(background => background.id !== 'roses');
    const reached = others.map((_, index) =>
      nextFlowerBackground('roses', () => (index + 0.5) / others.length)
    );
    expect(reached).toEqual(others.map(background => background.id));
  });
});
