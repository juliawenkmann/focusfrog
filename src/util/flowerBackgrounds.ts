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
  // How the picture fills the window: stretched to cover it (the default), shown whole, or a
  // seamless pattern repeated at its own size. `color` fills what the picture leaves free.
  size?: string;
  repeat?: string;
  color?: string;
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
  { id: 'frog-nouveau', url: '/focusfrog-flower-bg-frog-nouveau.webp', veil: 0.4, shade: 0.35 },
  {
    id: 'frog-silhouettes',
    url: '/focusfrog-flower-bg-frog-silhouettes.webp',
    veil: 0.24,
    shade: 0.62,
    size: '560px',
    repeat: 'repeat',
  },
  {
    id: 'glass-frogs',
    url: '/focusfrog-flower-bg-glass-frogs.webp',
    veil: 0.56,
    shade: 0.15,
    size: 'contain',
    color: '#000000',
  },
];

export const DEFAULT_FLOWER_BACKGROUND = FLOWER_BACKGROUNDS[0].id;

export function flowerBackground(id: unknown): FlowerBackground {
  return FLOWER_BACKGROUNDS.find(background => background.id === id) || FLOWER_BACKGROUNDS[0];
}

export function normalizeFlowerBackground(id: unknown): string {
  return flowerBackground(id).id;
}

// A random background that differs from the current one.
export function nextFlowerBackground(currentId: unknown, random: () => number = Math.random) {
  const current = normalizeFlowerBackground(currentId);
  const others = FLOWER_BACKGROUNDS.filter(background => background.id !== current);
  const index = Math.min(others.length - 1, Math.floor(random() * others.length));
  return others[Math.max(0, index)].id;
}

export function applyFlowerBackground(id: unknown): void {
  if (typeof document === 'undefined') return;
  const background = flowerBackground(id);
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
