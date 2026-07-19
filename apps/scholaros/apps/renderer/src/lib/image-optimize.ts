/**
 * Resize and re-encode an image to webp before persistence.
 *
 * Images pasted or uploaded to `.assets/` are otherwise saved as raw base64
 * data URLs, which bloat both editor state and any markdown file they're
 * embedded in. For images >500KB we downscale to `maxWidth` (preserving
 * aspect ratio) and re-encode at 0.85 quality webp. Smaller images are
 * returned untouched so we don't pay the canvas cost for icons.
 *
 * Returns the original file if the browser lacks the APIs we need.
 */
export async function optimizeImage(
  file: File | Blob,
  maxWidth = 1920,
  quality = 0.85,
): Promise<Blob> {
  if (!("createImageBitmap" in window) || typeof document === "undefined") {
    return file;
  }
  if (file.size < 500 * 1024) {
    return file;
  }

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return file;
  }

  try {
    const scale = Math.min(1, maxWidth / bitmap.width);
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, "image/webp", quality);
    });
    return blob ?? file;
  } finally {
    bitmap.close();
  }
}

/**
 * Convert a Blob to a data URL. Used to embed optimized images in markdown
 * via the same data: URI pipeline the editor already uses.
 */
export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/**
 * Combined helper: optimize (if needed) and produce a data URL ready to be
 * pasted into the editor.
 */
export async function optimizeImageToDataUrl(
  file: File,
  maxWidth?: number,
  quality?: number,
): Promise<string> {
  const optimized = await optimizeImage(file, maxWidth, quality);
  return blobToDataUrl(optimized);
}
