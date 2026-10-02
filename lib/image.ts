// Browser only. Phone photos are often 4-12MB; the API caps uploads at 4MB, and receipts read
// fine at about 2000px on the long edge, so shrink before sending.
const LONG_EDGE = 2000;
const TARGET_BYTES = 3_500_000;

function toBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not encode the image.'))), 'image/jpeg', quality),
  );
}

export async function downscale(file: Blob): Promise<Blob> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    throw new Error('This browser could not open that image. Try a JPEG or PNG.');
  }
  let edge = Math.min(LONG_EDGE, Math.max(bitmap.width, bitmap.height));
  for (let attempt = 0; attempt < 5; attempt++) {
    const scale = edge / Math.max(bitmap.width, bitmap.height);
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await toBlob(canvas, attempt < 2 ? 0.85 : 0.75);
    if (blob.size <= TARGET_BYTES) {
      bitmap.close();
      return blob;
    }
    edge = Math.round(edge * 0.8);
  }
  bitmap.close();
  throw new Error('That image is too large even after shrinking it.');
}
