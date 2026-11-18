import {
  normalizeFocusFrogTheme,
  pageTheme,
  showsFlowerPictures,
} from '../../src/util/focusFrogTheme';

describe('FocusFrog styles', () => {
  test('four styles; anything else is bright', () => {
    expect(['bright', 'contrast', 'flower', 'blackflower'].map(normalizeFocusFrogTheme)).toEqual([
      'bright',
      'contrast',
      'flower',
      'blackflower',
    ]);
    expect(normalizeFocusFrogTheme('dark')).toBe('bright');
    expect(normalizeFocusFrogTheme(undefined)).toBe('bright');
  });

  test('black flower draws the pages in the dark style', () => {
    expect(pageTheme('blackflower')).toBe('contrast');
    expect(pageTheme('flower')).toBe('flower');
    expect(pageTheme('contrast')).toBe('contrast');
    expect(pageTheme('nonsense')).toBe('bright');
  });

  test('both flower styles show the pictures', () => {
    expect(showsFlowerPictures('flower')).toBe(true);
    expect(showsFlowerPictures('blackflower')).toBe(true);
    expect(showsFlowerPictures('contrast')).toBe(false);
    expect(showsFlowerPictures('bright')).toBe(false);
  });
});
