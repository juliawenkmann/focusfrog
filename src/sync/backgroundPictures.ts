// Background pictures the owner adds in the lock button's panel, for the flower styles. They
// live only in the owner's cloud (users/{uid}/visionImages, ids background-<uuid>, the same
// document shape as the vision board photos), at most 2048 px on the long side: never in the
// app's files, on the hosted site or on GitHub. Each is frosted and dimmed by its own average
// colour (tuneFlowerBackground), so text stays readable on it.
import Vue from 'vue';
import {
  cloudUserId,
  deleteCloudImage,
  onOwnerSignIn,
  readCloudImage,
  readCloudImagesWithPrefix,
  writeCloudImage,
} from '~/sync/cloud';
import {
  applyFlowerBackground,
  applyFlowerBackgroundStyle,
  DEFAULT_FLOWER_BACKGROUND,
  isUploadedBackground,
  newUploadedBackgroundId,
  tuneFlowerBackground,
} from '~/util/flowerBackgrounds';
import { base64ToBlob, resizeImageForCloud } from '~/util/imageResize';
import type { ResizedImage } from '~/util/imageResize';

const ID_PREFIX = 'background-';
const MAX_SIDE = 2048;

export interface UploadedBackground {
  id: string;
  // A blob: url of the picture.
  url: string;
  veil: number;
  shade: number;
  addedAt: string;
}

// Reactive, so the panel and the flower button see pictures as they arrive.
export const backgroundPictures = Vue.observable({
  items: [] as UploadedBackground[],
  // Listed from the cloud since the owner signed in.
  loaded: false,
});

// The background asked for last; a picture that arrives later is shown only if still wanted.
let shownId = '';

async function averageColour(blob: Blob): Promise<[number, number, number]> {
  const bitmap = await createImageBitmap(blob);
  try {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 64;
    const context = canvas.getContext('2d');
    if (!context) return [128, 128, 128];
    context.imageSmoothingQuality = 'high';
    context.drawImage(bitmap, 0, 0, 64, 64);
    const { data } = context.getImageData(0, 0, 64, 64);
    const sum = [0, 0, 0];
    for (let i = 0; i < data.length; i += 4) {
      sum[0] += data[i];
      sum[1] += data[i + 1];
      sum[2] += data[i + 2];
    }
    const pixels = data.length / 4;
    return [sum[0] / pixels, sum[1] / pixels, sum[2] / pixels];
  } finally {
    bitmap.close?.();
  }
}

async function toPicture(
  id: string,
  image: ResizedImage & { updatedAt?: string }
): Promise<UploadedBackground> {
  const blob = base64ToBlob(image.data, image.mimeType);
  const tuned = tuneFlowerBackground(await averageColour(blob));
  return { id, url: URL.createObjectURL(blob), ...tuned, addedAt: image.updatedAt || '' };
}

function setPictures(pictures: UploadedBackground[]): void {
  for (const picture of backgroundPictures.items) {
    if (!pictures.includes(picture) && picture.id !== shownId) URL.revokeObjectURL(picture.url);
  }
  backgroundPictures.items = [...pictures].sort((a, b) => a.addedAt.localeCompare(b.addedAt));
}

// Lists the owner's pictures from the cloud; false when it could not.
export async function refreshBackgroundPictures(): Promise<boolean> {
  const listed = await readCloudImagesWithPrefix(ID_PREFIX);
  if (!listed) return false;
  const known = new Map(backgroundPictures.items.map(picture => [picture.id, picture]));
  const pictures: UploadedBackground[] = [];
  for (const { id, image } of listed) {
    if (!isUploadedBackground(id)) continue;
    const picture = known.get(id) || (await toPicture(id, image).catch(() => null));
    if (picture) pictures.push(picture);
  }
  setPictures(pictures);
  backgroundPictures.loaded = true;
  return true;
}

// Shows the chosen background: a built-in one at once, an uploaded one once it has arrived
// (until then the current picture stays). A picture that was removed falls back to the roses.
export function showFlowerBackground(id: unknown): void {
  const chosen = typeof id === 'string' ? id : '';
  shownId = chosen;
  if (!isUploadedBackground(chosen)) {
    applyFlowerBackground(chosen);
    return;
  }
  const picture = backgroundPictures.items.find(candidate => candidate.id === chosen);
  if (picture) {
    applyFlowerBackgroundStyle(picture);
    return;
  }
  // Not signed in yet: startBackgroundPictures shows it once the owner is.
  if (!cloudUserId()) return;
  void readCloudImage(chosen).then(async image => {
    if (shownId !== chosen) return;
    if (!image) {
      applyFlowerBackground(DEFAULT_FLOWER_BACKGROUND);
      return;
    }
    const loaded = await toPicture(chosen, image);
    if (!backgroundPictures.items.some(candidate => candidate.id === chosen)) {
      setPictures([...backgroundPictures.items, loaded]);
    }
    if (shownId === chosen) applyFlowerBackgroundStyle(loaded);
  });
}

// Stores a picture in the owner's cloud and returns it.
export async function uploadBackgroundPicture(file: File): Promise<UploadedBackground> {
  if (!cloudUserId()) throw new Error('Sign in to add pictures.');
  let resized: ResizedImage;
  try {
    resized = await resizeImageForCloud(file, MAX_SIDE);
  } catch (error) {
    const tooLarge = error instanceof Error && error.message.includes('too large');
    throw new Error(
      tooLarge
        ? 'This picture is too large. Please choose a smaller one.'
        : `FocusFrog cannot read “${file.name}”. Try a JPEG, PNG or WebP picture.`
    );
  }
  const id = newUploadedBackgroundId();
  if (!(await writeCloudImage(id, resized))) {
    throw new Error('FocusFrog could not save this picture. Are you signed in and online?');
  }
  const picture = await toPicture(id, { ...resized, updatedAt: new Date().toISOString() });
  setPictures([...backgroundPictures.items, picture]);
  return picture;
}

// Deletes a picture from the owner's cloud (choose another background first if it is shown).
export async function removeBackgroundPicture(id: string): Promise<void> {
  if (!isUploadedBackground(id)) return;
  await deleteCloudImage(id);
  setPictures(backgroundPictures.items.filter(picture => picture.id !== id));
}

// Started once by App.vue: lists the pictures when the owner signs in, and shows the chosen
// one if it is an uploaded picture that could not be loaded before.
export function startBackgroundPictures(): void {
  onOwnerSignIn(() => {
    void refreshBackgroundPictures().then(() => {
      if (isUploadedBackground(shownId)) showFlowerBackground(shownId);
    });
  });
}
