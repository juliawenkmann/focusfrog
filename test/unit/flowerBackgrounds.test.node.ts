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
