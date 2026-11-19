// Pictures the flower styles rotate through. Each click on a flower button (light or black)
// switches to another one at random; the choice is kept in the settings.
export interface FlowerBackground {
  id: string;
  // Served from static/.
  url: string;
  // Flower: how frosted the glass panels are (white overlay, 0-1). Darker pictures need more
  // so dark text on the glass stays readable (at least 3:1 straight on the page, measured
  // against each picture's average colour).
  veil: number;
  // Black flower: how much the picture is dimmed (black overlay, 0-1). Brighter pictures
  // need more so light text on the smoked glass stays readable.
  shade: number;
  // How the picture fills the window: stretched to cover it (the default), a seamless pattern
  // repeated at its own size, or copies side by side. `color` fills what the picture leaves free.
  size?: string;
  repeat?: string;
  color?: string;
  // The owner's own picture: kept on this Mac only (listed in .gitignore), never on GitHub.
  private?: boolean;
}

export const FLOWER_BACKGROUNDS: FlowerBackground[] = [
  { id: 'roses', url: '/focusfrog-flower-clean-bg-v2.webp', veil: 0.18, shade: 0.72 },
  { id: 'waves', url: '/focusfrog-flower-bg-waves.webp', veil: 0.18, shade: 0.7 },
  {
    id: 'botanical-night',
    url: '/focusfrog-flower-bg-botanical-night.webp',
    veil: 0.56,
    shade: 0.25,
  },
  { id: 'monstera', url: '/focusfrog-flower-bg-monstera.webp', veil: 0.3, shade: 0.5 },
  { id: 'smoke', url: '/focusfrog-flower-bg-smoke.webp', veil: 0.22, shade: 0.6 },
  { id: 'pebbles', url: '/focusfrog-flower-bg-pebbles.webp', veil: 0.3, shade: 0.52 },
  { id: 'peacock', url: '/focusfrog-flower-bg-peacock.webp', veil: 0.56, shade: 0.25 },
  { id: 'aurora', url: '/focusfrog-flower-bg-aurora.webp', veil: 0.42, shade: 0.4 },
  {
    id: 'frog-nouveau',
    url: '/focusfrog-flower-bg-frog-nouveau.webp',
    veil: 0.4,
    shade: 0.35,
    // A seamless pattern: four copies along the window's longer side (4 across on the Mac,
    // 4 down on the phone), repeated over the rest.
    size: 'max(25vw, 25vh)',
    repeat: 'repeat',
    private: true,
  },
  {
    id: 'frog-silhouettes',
    url: '/focusfrog-flower-bg-frog-silhouettes.webp',
    veil: 0.24,
    shade: 0.62,
    size: '560px',
    repeat: 'repeat',
    private: true,
  },
  {
    id: 'glass-frogs',
    url: '/focusfrog-flower-bg-glass-frogs.webp',
    veil: 0.56,
    shade: 0.15,
    // Three of the tall picture side by side, each a third of the window wide, or as tall as
    // the window when that is more (415 × 738, so 56.24vh), so it is never left short.
    size: 'max(33.34vw, 56.24vh) auto',
    repeat: 'repeat-x',
    color: '#000000',
    private: true,
  },
  // Veils and shades keep the faintest text at the same contrast as the pictures above
  // (about 3:1 in flower, 6:1 in black flower, against each picture's average colour).
  {
    id: 'dark-grass',
    url: '/focusfrog-flower-bg-dark-grass.webp',
    veil: 0.58,
    shade: 0.15,
    private: true,
  },
  {
    id: 'black-silk',
    url: '/focusfrog-flower-bg-black-silk.webp',
    veil: 0.62,
    shade: 0.15,
    color: '#000000',
    private: true,
  },
  {
    id: 'great-wave',
    url: '/focusfrog-flower-bg-great-wave.webp',
    veil: 0.18,
    shade: 0.68,
    private: true,
  },
  {
    id: 'grande-jatte',
    url: '/focusfrog-flower-bg-grande-jatte.webp',
    veil: 0.34,
    shade: 0.45,
    private: true,
  },
  {
    id: 'dark-leaves',
    url: '/focusfrog-flower-bg-dark-leaves.webp',
    veil: 0.58,
    shade: 0.15,
    private: true,
  },
];

export const DEFAULT_FLOWER_BACKGROUND = FLOWER_BACKGROUNDS[0].id;

export function flowerBackground(id: unknown): FlowerBackground {
  return FLOWER_BACKGROUNDS.find(background => background.id === id) || FLOWER_BACKGROUNDS[0];
}

// Pictures the owner uploads (the lock button's panel) live in the owner's cloud, under ids
// like background-<uuid>. They are kept as chosen even before the cloud has answered.
const UPLOADED_ID = /^background-[0-9a-f-]{36}$/;

export function newUploadedBackgroundId(): string {
  return `background-${crypto.randomUUID()}`;
}

export function isUploadedBackground(id: unknown): id is string {
  return typeof id === 'string' && UPLOADED_ID.test(id);
}

export function normalizeFlowerBackground(id: unknown): string {
  if (isUploadedBackground(id)) return id;
  return flowerBackground(id).id;
}

// Built-in pictures the owner removed in the lock button's panel. They stay in the app (and can
// be brought back there), but are no longer listed or picked by the flower buttons.
export function normalizeHiddenBackgrounds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const builtIn = new Set(FLOWER_BACKGROUNDS.map(background => background.id));
  const ids = value.filter((id): id is string => typeof id === 'string' && builtIn.has(id));
  return [...new Set(ids)];
}

// A random background that differs from the current one: a built-in one (unless removed) or an
// uploaded one. Keeps the current one when there is no other.
export function nextFlowerBackground(
  currentId: unknown,
  random: () => number = Math.random,
  uploadedIds: string[] = [],
  hiddenIds: string[] = []
): string {
  const current = normalizeFlowerBackground(currentId);
  const ids = [
    ...FLOWER_BACKGROUNDS.map(background => background.id).filter(id => !hiddenIds.includes(id)),
    ...uploadedIds.filter(isUploadedBackground),
  ];
  const others = ids.filter(id => id !== current);
  if (others.length === 0) return current;
  const index = Math.min(others.length - 1, Math.floor(random() * others.length));
  return others[Math.max(0, index)];
}

type Rgb = [number, number, number];

function luminance([r, g, b]: Rgb): number {
  const channel = (value: number) => {
    const v = value / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrast(a: Rgb, b: Rgb): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

// `layer` laid over `base` at `opacity`.
function over(base: Rgb, layer: Rgb, opacity: number): Rgb {
  return base.map((value, i) => value * (1 - opacity) + layer[i] * opacity) as Rgb;
}

// The faintest text straight on the page: dark.css's muted and slate text (flower), its
// muted and body text on the smoked glass (black flower).
const FLOWER_TEXT: Rgb[] = [
  [0x26, 0x3f, 0x5f],
  [0x47, 0x55, 0x69],
];
const BLACK_FLOWER_TEXT: Rgb[] = [
  [0x94, 0xa3, 0xb8],
  [0xcb, 0xd5, 0xe1],
];

// How much to frost (flower) and dim (black flower) a picture of this average colour so its
// faintest text reads like on the built-in pictures: 3:1 on the flower glass, 6.1:1 on the
// black flower smoke. Never less frost or dimming than the lightest built-in settings.
export function tuneFlowerBackground(average: Rgb): { veil: number; shade: number } {
  const flowerContrast = (veil: number) => {
    const sheet = over(average, [255, 255, 255], veil);
    return Math.min(...FLOWER_TEXT.map(text => contrast(sheet, text)));
  };
  const blackContrast = (shade: number) => {
    const sheet = over(over(average, [4, 6, 9], shade), [6, 9, 14], 0.56);
    return Math.min(...BLACK_FLOWER_TEXT.map(text => contrast(sheet, text)));
  };
  let veil = 18;
  while (veil < 80 && flowerContrast(veil / 100) < 3) veil += 2;
  let shade = 15;
  while (shade < 85 && blackContrast(shade / 100) < 6.1) shade += 1;
  return { veil: veil / 100, shade: shade / 100 };
}

export function applyFlowerBackground(id: unknown): void {
  applyFlowerBackgroundStyle(flowerBackground(id));
}

// Shows this picture behind the flower styles (an uploaded one comes with a blob: url).
export function applyFlowerBackgroundStyle(
  background: Pick<FlowerBackground, 'url' | 'veil' | 'shade' | 'size' | 'repeat' | 'color'>
): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.style.setProperty('--focusfrog-flower-bg', `url('${background.url}')`);
  root.style.setProperty('--focusfrog-flower-veil', String(background.veil));
  root.style.setProperty('--focusfrog-flower-shade', String(background.shade));
  root.style.setProperty('--focusfrog-flower-size', background.size || 'cover');
  root.style.setProperty('--focusfrog-flower-repeat', background.repeat || 'no-repeat');
  // Each style has its own fill (dark.css) unless the picture brings one.
  if (background.color) root.style.setProperty('--focusfrog-flower-color', background.color);
  else root.style.removeProperty('--focusfrog-flower-color');
}
