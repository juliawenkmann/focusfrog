// FocusFrog's four styles. Black flower is the dark (contrast) style with the flower pictures
// behind smoked glass: the page gets every dark colour of the contrast style
// (data-dashboard-theme="contrast") and, on top, the ff-black-flower class (static/dark.css).
export type FocusFrogTheme = 'bright' | 'contrast' | 'flower' | 'blackflower';

// The style the pages are drawn in (their theme-* classes and data-dashboard-theme).
export type PageTheme = 'bright' | 'contrast' | 'flower';

export const BLACK_FLOWER_CLASS = 'ff-black-flower';

export function normalizeFocusFrogTheme(theme: unknown): FocusFrogTheme {
  return theme === 'contrast' || theme === 'flower' || theme === 'blackflower' ? theme : 'bright';
}

export function pageTheme(theme: unknown): PageTheme {
  const normalized = normalizeFocusFrogTheme(theme);
  return normalized === 'blackflower' ? 'contrast' : normalized;
}

// The styles that show the flower pictures (a click on their button brings another one).
export function showsFlowerPictures(theme: unknown): boolean {
  const normalized = normalizeFocusFrogTheme(theme);
  return normalized === 'flower' || normalized === 'blackflower';
}

export function applyFocusFrogTheme(theme: unknown): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.dataset.dashboardTheme = pageTheme(theme);
  root.classList.toggle(BLACK_FLOWER_CLASS, normalizeFocusFrogTheme(theme) === 'blackflower');
}
