import fs from 'fs';
import path from 'path';
import {
  DEFAULT_FLOWER_BACKGROUND,
  FLOWER_BACKGROUNDS,
  nextFlowerBackground,
  normalizeFlowerBackground,
} from '../../src/util/flowerBackgrounds';

describe('flower backgrounds', () => {
  test('every background picture ships in static/', () => {
    for (const background of FLOWER_BACKGROUNDS) {
      const file = path.join(__dirname, '../../static', background.url);
      expect(fs.existsSync(file)).toBe(true);
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

  test('can reach every other background', () => {
    const others = FLOWER_BACKGROUNDS.filter(background => background.id !== 'roses');
    const reached = others.map((_, index) =>
      nextFlowerBackground('roses', () => (index + 0.5) / others.length)
    );
    expect(reached).toEqual(others.map(background => background.id));
  });
});
