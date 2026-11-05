// Vision board photos. The Mac keeps the originals in its local folder; the cloud holds a
// downscaled copy of each, which the phone shows (and adds when you pick a photo on the
// phone). Pages ask visionPhotoUrl() and never need to know where a photo lives.
import Vue from 'vue';
import {
  cloudUserId,
  deleteCloudImage,
  onOwnerSignIn,
  readCloudImage,
  writeCloudImage,
} from '~/sync/cloud';
import { IS_CLOUD_BUILD } from '~/sync/config';
import { peekStoredValue } from '~/util/focusfrogStorage';
import { base64ToBlob, resizeImageForCloud } from '~/util/imageResize';
import {
  normalizeVisionBoardDocument,
  VISION_BOARD_SERVER_KEY,
  visionImageUrl,
} from '~/util/visionBoard';

// Reactive, so a card shows its photo as soon as the cloud copy arrives.
const photos = Vue.observable({
  cloudUrls: {} as Record<string, string>,
  // Photos the Mac's folder does not have (added on the phone).
  missingLocally: {} as Record<string, boolean>,
});

async function loadCloudPhoto(id: string): Promise<void> {
  Vue.set(photos.cloudUrls, id, '');
  const image = await readCloudImage(id);
  if (image) {
    Vue.set(photos.cloudUrls, id, URL.createObjectURL(base64ToBlob(image.data, image.mimeType)));
  }
}

// The URL to show for a photo; '' while the cloud copy is on its way.
export function visionPhotoUrl(id: string): string {
  if (!id) return '';
  if (!IS_CLOUD_BUILD && !photos.missingLocally[id]) return visionImageUrl(id);
  if (photos.cloudUrls[id] === undefined) void loadCloudPhoto(id);
  return photos.cloudUrls[id] || '';
}

// The Mac's copy failed to load: show the cloud's.
export function visionPhotoMissingLocally(id: string): void {
  if (id && !IS_CLOUD_BUILD) Vue.set(photos.missingLocally, id, true);
}

function uploadedKey(): string {
  return `focusfrog.cloudImages.${cloudUserId()}`;
}

function uploadedIds(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(uploadedKey()) || '[]'));
  } catch {
    return new Set();
  }
}

async function uploadCloudCopy(id: string, source: Blob): Promise<boolean> {
  if (!cloudUserId()) return false;
  if (!(await writeCloudImage(id, await resizeImageForCloud(source)))) return false;
  try {
    localStorage.setItem(uploadedKey(), JSON.stringify([...uploadedIds(), id]));
  } catch {
    // Only an optimisation: without it the next sign-in sends the photo again.
  }
  return true;
}

// Stores a new photo and returns its id: on the Mac in its folder (plus a copy for the
// phone, when signed in), on the phone only in the cloud.
export async function storeVisionPhoto(file: File): Promise<string> {
  if (IS_CLOUD_BUILD) {
    const id = crypto.randomUUID();
    if (!(await uploadCloudCopy(id, file))) {
      throw new Error('FocusFrog could not store this photo. Are you online?');
    }
    Vue.set(photos.cloudUrls, id, URL.createObjectURL(file));
    return id;
  }
  const response = await fetch('/focusfrog-vision-images', {
    method: 'POST',
    headers: { 'content-type': file.type },
    body: file,
  });
  const payload = response.headers.get('content-type')?.includes('application/json')
    ? await response.json()
    : null;
  if (!response.ok || !payload?.id) {
    throw new Error(payload?.error || 'FocusFrog could not store this photo.');
  }
  void uploadCloudCopy(payload.id, file).catch(error => {
    console.warn('Could not copy the photo to the cloud:', error);
  });
  return payload.id;
}

export async function deleteVisionPhoto(id: string): Promise<void> {
  if (!id) return;
  if (photos.cloudUrls[id]) URL.revokeObjectURL(photos.cloudUrls[id]);
  Vue.delete(photos.cloudUrls, id);
  void deleteCloudImage(id);
  if (IS_CLOUD_BUILD || typeof fetch === 'undefined') return;
  try {
    await fetch(visionImageUrl(id), { method: 'DELETE' });
  } catch (error) {
    console.warn('Could not remove an unused vision board image:', error);
  }
}

// On the Mac: copies every photo this account has not received from this Mac yet.
async function backfillVisionImages(): Promise<void> {
  try {
    const board = normalizeVisionBoardDocument(
      (await peekStoredValue(VISION_BOARD_SERVER_KEY)).value
    );
    const sent = uploadedIds();
    const ids = new Set(board.items.map(item => item.imageId).filter(id => id && !sent.has(id)));
    for (const id of ids) {
      const response = await fetch(visionImageUrl(id));
      if (response.ok) await uploadCloudCopy(id, await response.blob());
    }
  } catch (error) {
    console.warn('FocusFrog could not copy vision photos to the cloud:', error);
  }
}

// Started once by the Mac app (not the phone build).
export function startVisionImageBackfill(): void {
  onOwnerSignIn(() => void backfillVisionImages());
}
