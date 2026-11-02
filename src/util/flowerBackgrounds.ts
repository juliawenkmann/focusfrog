// Pictures the flower theme rotates through. Each click on the flower button
// switches to another one at random; the choice is kept in the settings.
export interface FlowerBackground {
  id: string;
  // Served from static/.
  url: string;
  // How frosted the glass panels are (white overlay, 0-1). Darker pictures need more
  // so dark text on the glass keeps at least 4.5:1 contrast.
  veil: number;
}

export const FLOWER_BACKGROUNDS: FlowerBackground[] = [
  { id: 'roses', url: '/focusfrog-flower-clean-bg-v2.webp', veil: 0.18 },
  { id: 'waves', url: '/focusfrog-flower-bg-waves.webp', veil: 0.18 },
  { id: 'botanical-night', url: '/focusfrog-flower-bg-botanical-night.webp', veil: 0.4 },
  { id: 'monstera', url: '/focusfrog-flower-bg-monstera.webp', veil: 0.22 },
  { id: 'smoke', url: '/focusfrog-flower-bg-smoke.webp', veil: 0.22 },
  { id: 'pebbles', url: '/focusfrog-flower-bg-pebbles.webp', veil: 0.22 },
  { id: 'peacock', url: '/focusfrog-flower-bg-peacock.webp', veil: 0.4 },
  { id: 'aurora', url: '/focusfrog-flower-bg-aurora.webp', veil: 0.26 },
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
}
