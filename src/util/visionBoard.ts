export type VisionBoardStatus = 'dreaming' | 'achieved';
export type VisionBoardSort = 'board' | 'newest' | 'oldest' | 'title' | 'target' | 'progress';

export interface VisionBoardItem {
  id: string;
  title: string;
  notes: string;
  nextAction: string;
  targetDate: string;
  progress: number;
  counterCurrent: number;
  counterTarget: number;
  counterUnit: string;
  lastCheckInAt: string;
  imageId: string;
  status: VisionBoardStatus;
  createdAt: string;
  updatedAt: string;
  achievedAt: string;
}

export interface VisionBoardDocument {
  version: 1;
  updatedAt: string;
  items: VisionBoardItem[];
}

export const VISION_BOARD_STORAGE_KEY = 'focusfrog.visionBoard.v1';
export const VISION_BOARD_SERVER_KEY = 'visionBoard';
export const VISION_BOARD_SORT_STORAGE_KEY = 'focusfrog.visionBoard.sort.v1';
export const VISION_IMAGE_MAX_BYTES = 8 * 1024 * 1024;
export const VISION_IMAGE_ACCEPT = ['image/jpeg', 'image/png', 'image/webp'] as const;
export const VISION_CHECK_IN_INTERVAL_DAYS = 7;
export const VISION_COUNTER_MAX = 9999;

const IMAGE_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function cleanText(value: unknown, maxLength: number): string {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, maxLength) : '';
}

function cleanNotes(value: unknown): string {
  return typeof value === 'string' ? value.trim().slice(0, 800) : '';
}

function cleanTimestamp(value: unknown): string {
  if (typeof value !== 'string') return '';
  return Number.isFinite(Date.parse(value)) ? value : '';
}

function cleanDate(value: unknown): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return '';
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? value : '';
}

function cleanProgress(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, Math.round(value)));
}

function cleanCounterTarget(value: unknown): number {
  return typeof value === 'number' &&
    Number.isSafeInteger(value) &&
    value >= 1 &&
    value <= VISION_COUNTER_MAX
    ? value
    : 0;
}

function cleanCounterCurrent(value: unknown, target: number): number {
  if (!target || typeof value !== 'number' || !Number.isSafeInteger(value)) return 0;
  return Math.min(target, Math.max(0, value));
}

export function visionBoardCounterProgress(current: number, target: number): number {
  if (
    !Number.isSafeInteger(current) ||
    !Number.isSafeInteger(target) ||
    target < 1 ||
    target > VISION_COUNTER_MAX
  ) {
    return 0;
  }
  if (current >= target) return 100;
  return Math.min(99, Math.round((Math.max(0, current) / target) * 100));
}

export function normalizeVisionBoardSort(value: unknown): VisionBoardSort {
  return value === 'newest' ||
    value === 'oldest' ||
    value === 'title' ||
    value === 'target' ||
    value === 'progress'
    ? value
    : 'board';
}

function createdAtScore(value: string): number | null {
  const score = Date.parse(value || '');
  return Number.isFinite(score) ? score : null;
}

function itemProgress(item: VisionBoardItem): number {
  return item.counterTarget
    ? visionBoardCounterProgress(item.counterCurrent, item.counterTarget)
    : item.progress;
}

export function sortVisionBoardItems(
  values: VisionBoardItem[],
  requestedSort: VisionBoardSort
): VisionBoardItem[] {
  const sortMode = normalizeVisionBoardSort(requestedSort);
  if (sortMode === 'board') return [...values];

  const titleCollator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true });
  return values
    .map((item, index) => ({ item, index }))
    .sort((left, right) => {
      let difference = 0;

      if (sortMode === 'title') {
        difference = titleCollator.compare(left.item.title, right.item.title);
      } else if (sortMode === 'progress') {
        difference = itemProgress(right.item) - itemProgress(left.item);
      } else if (sortMode === 'target') {
        const leftTarget = cleanDate(left.item.targetDate);
        const rightTarget = cleanDate(right.item.targetDate);
        if (!leftTarget && rightTarget) difference = 1;
        else if (leftTarget && !rightTarget) difference = -1;
        else if (leftTarget && rightTarget) difference = leftTarget.localeCompare(rightTarget);
      } else {
        const leftCreatedAt = createdAtScore(left.item.createdAt);
        const rightCreatedAt = createdAtScore(right.item.createdAt);
        if (leftCreatedAt === null && rightCreatedAt !== null) difference = 1;
        else if (leftCreatedAt !== null && rightCreatedAt === null) difference = -1;
        else if (leftCreatedAt !== null && rightCreatedAt !== null) {
          difference =
            sortMode === 'newest' ? rightCreatedAt - leftCreatedAt : leftCreatedAt - rightCreatedAt;
        }
      }

      return difference || left.index - right.index;
    })
    .map(entry => entry.item);
}

function timestampScore(value: string): number {
  return Date.parse(value || '') || 0;
}

export function normalizeVisionBoardItem(value: unknown): VisionBoardItem | null {
  if (!value || typeof value !== 'object') return null;
  const item = value as Partial<VisionBoardItem>;
  const id = cleanText(item.id, 120);
  const title = cleanText(item.title, 120);
  if (!id || !title) return null;

  const createdAt = cleanTimestamp(item.createdAt);
  const updatedAt = cleanTimestamp(item.updatedAt) || createdAt;
  const normalizedStatus: VisionBoardStatus = item.status === 'achieved' ? 'achieved' : 'dreaming';
  const achievedAt = normalizedStatus === 'achieved' ? cleanTimestamp(item.achievedAt) : '';
  const imageId =
    typeof item.imageId === 'string' && IMAGE_ID_PATTERN.test(item.imageId)
      ? item.imageId.toLowerCase()
      : '';
  const counterTarget = cleanCounterTarget(item.counterTarget);
  const counterCurrent = cleanCounterCurrent(item.counterCurrent, counterTarget);
  const counterUnit = counterTarget ? cleanText(item.counterUnit, 24) : '';
  const progress =
    normalizedStatus === 'achieved'
      ? 100
      : counterTarget
      ? visionBoardCounterProgress(counterCurrent, counterTarget)
      : cleanProgress(item.progress);

  return {
    id,
    title,
    notes: cleanNotes(item.notes),
    nextAction: cleanText(item.nextAction, 180),
    targetDate: cleanDate(item.targetDate),
    progress,
    counterCurrent,
    counterTarget,
    counterUnit,
    lastCheckInAt: cleanTimestamp(item.lastCheckInAt),
    imageId,
    status: normalizedStatus,
    createdAt,
    updatedAt,
    achievedAt,
  };
}

export function normalizeVisionBoardItems(values: unknown): VisionBoardItem[] {
  if (!Array.isArray(values)) return [];
  const byId = new Map<string, VisionBoardItem>();

  values.forEach(value => {
    const item = normalizeVisionBoardItem(value);
    if (!item) return;
    const existing = byId.get(item.id);
    if (!existing || timestampScore(item.updatedAt) >= timestampScore(existing.updatedAt)) {
      byId.set(item.id, item);
    }
  });

  return Array.from(byId.values());
}

export function emptyVisionBoardDocument(): VisionBoardDocument {
  return { version: 1, updatedAt: '', items: [] };
}

export function normalizeVisionBoardDocument(value: unknown): VisionBoardDocument {
  if (Array.isArray(value)) {
    return { version: 1, updatedAt: '', items: normalizeVisionBoardItems(value) };
  }
  if (!value || typeof value !== 'object') return emptyVisionBoardDocument();

  const boardDocument = value as Partial<VisionBoardDocument>;
  return {
    version: 1,
    updatedAt: cleanTimestamp(boardDocument.updatedAt),
    items: normalizeVisionBoardItems(boardDocument.items),
  };
}

export function chooseNewestVisionBoardDocument(
  localValue: unknown,
  serverValue: unknown
): VisionBoardDocument {
  const localDocument = normalizeVisionBoardDocument(localValue);
  const serverDocument = normalizeVisionBoardDocument(serverValue);
  const localScore = timestampScore(localDocument.updatedAt);
  const serverScore = timestampScore(serverDocument.updatedAt);

  if (serverScore > localScore) return serverDocument;
  if (localScore > serverScore) return localDocument;
  if (serverDocument.items.length > localDocument.items.length) return serverDocument;
  return localDocument;
}

function localDateKey(timestamp: number): string {
  const date = new Date(timestamp);
  if (!Number.isFinite(date.getTime())) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function visionBoardItemUsesAccountability(value: VisionBoardItem): boolean {
  const item = normalizeVisionBoardItem(value);
  return Boolean(
    item && (item.targetDate || item.progress > 0 || item.counterTarget > 0 || item.lastCheckInAt)
  );
}

export function visionBoardItemNeedsAttention(value: VisionBoardItem, now = Date.now()): boolean {
  const item = normalizeVisionBoardItem(value);
  if (!item || item.status === 'achieved' || !visionBoardItemUsesAccountability(item)) return false;
  if (item.counterTarget ? item.counterCurrent >= item.counterTarget : item.progress >= 100) {
    return true;
  }

  const today = localDateKey(now);
  const reviewDate = new Date(now);
  reviewDate.setHours(0, 0, 0, 0);
  reviewDate.setDate(reviewDate.getDate() + VISION_CHECK_IN_INTERVAL_DAYS);
  const reviewDateKey = localDateKey(reviewDate.getTime());
  if (item.targetDate && today && reviewDateKey && item.targetDate <= reviewDateKey) return true;

  const checkInReference = Date.parse(item.lastCheckInAt || item.createdAt);
  if (!Number.isFinite(checkInReference) || checkInReference > now) return true;
  return now - checkInReference >= VISION_CHECK_IN_INTERVAL_DAYS * 24 * 60 * 60 * 1000;
}

export function visionImageUrl(imageId: string): string {
  return IMAGE_ID_PATTERN.test(imageId) ? `/focusfrog-vision-images/${imageId.toLowerCase()}` : '';
}

export function validateVisionImage(file: { type?: string; size?: number } | null): string {
  if (!file) return 'Choose an image first.';
  if (!VISION_IMAGE_ACCEPT.includes((file.type || '') as (typeof VISION_IMAGE_ACCEPT)[number])) {
    return 'Use a JPEG, PNG, or WebP image.';
  }
  if (!Number.isFinite(file.size) || Number(file.size) <= 0) return 'This image is empty.';
  if (Number(file.size) > VISION_IMAGE_MAX_BYTES) return 'Choose an image smaller than 8 MB.';
  return '';
}
