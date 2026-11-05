// Shrinks a photo for the cloud: at most 1280 px on the long side, WebP where the browser
// can encode it (Safari falls back to JPEG), small enough for one Firestore document.

export interface ResizedImage {
  // Base64 without the data: prefix.
  data: string;
  mimeType: 'image/webp' | 'image/jpeg';
  width: number;
  height: number;
}

const MAX_BASE64_LENGTH = 880000;

function canvasBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      blob => (blob ? resolve(blob) : reject(new Error('Could not encode the photo.'))),
      type,
      quality
    );
  });
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).replace(/^data:[^,]+,/, ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

export function base64ToBlob(data: string, mimeType: string): Blob {
  return new Blob([Uint8Array.from(atob(data), char => char.charCodeAt(0))], { type: mimeType });
}

// Safari cannot encode WebP (it returns a PNG); checked once on a 1×1 canvas.
let webpEncoding: boolean | undefined;
function canEncodeWebp(): boolean {
  if (webpEncoding === undefined) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1;
    webpEncoding = canvas.toDataURL('image/webp').startsWith('data:image/webp');
  }
  return webpEncoding;
}

export async function resizeImageForCloud(source: Blob, maxSide = 1280): Promise<ResizedImage> {
  const bitmap = await createImageBitmap(source);
  try {
    for (const [side, quality] of [
      [maxSide, 0.8],
      [maxSide, 0.65],
      [960, 0.65],
    ] as [number, number][]) {
      const scale = Math.min(1, side / Math.max(bitmap.width, bitmap.height));
      const width = Math.max(1, Math.round(bitmap.width * scale));
      const height = Math.max(1, Math.round(bitmap.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      canvas.getContext('2d')?.drawImage(bitmap, 0, 0, width, height);
      const mimeType = canEncodeWebp() ? 'image/webp' : 'image/jpeg';
      const data = await blobToBase64(await canvasBlob(canvas, mimeType, quality));
      if (data.length <= MAX_BASE64_LENGTH) return { data, mimeType, width, height };
    }
    throw new Error('This photo is too large to sync. Please choose a smaller one.');
  } finally {
    bitmap.close?.();
  }
}
