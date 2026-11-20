/**
 * Shrinks a logo or icon in the browser before upload, so people can pick a
 * large photo or export (up to 10 MB) and the app still loads a small, sharp
 * image on every page. SVG and ICO are kept as they are.
 */
export const MAX_PICK_BYTES = 10 * 1024 * 1024;
export const MAX_UPLOAD_BYTES = 1024 * 1024;
const MAX_SIDE = { logo: 512, favicon: 128 } as const;

export class BrandImageError extends Error {
  constructor(public reason: 'too_large' | 'unsupported' | 'unreadable') {
    super(reason);
  }
}

export async function prepareBrandImage(file: File, kind: 'logo' | 'favicon'): Promise<File> {
  if (file.size > MAX_PICK_BYTES) throw new BrandImageError('too_large');
  if (file.type === 'image/svg+xml' || file.type === 'image/x-icon' || file.type === 'image/vnd.microsoft.icon') {
    if (file.size > MAX_UPLOAD_BYTES) throw new BrandImageError('too_large');
    return file;
  }
  if (!/^image\/(png|jpe?g|webp|gif|avif|heic|heif)$/.test(file.type)) throw new BrandImageError('unsupported');

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new BrandImageError('unreadable');
  }
  const max = MAX_SIDE[kind];
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  // Already small: keep the original bytes.
  if (scale === 1 && file.size <= 300 * 1024 && /png|webp|jpe?g/.test(file.type)) {
    bitmap.close();
    return file;
  }
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new BrandImageError('unreadable');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();

  // WebP keeps transparency and is small; PNG where WebP isn't supported.
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', 0.9));
  const out = blob && blob.type === 'image/webp' ? blob : await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!out) throw new BrandImageError('unreadable');
  if (out.size > MAX_UPLOAD_BYTES) throw new BrandImageError('too_large');
  const ext = out.type === 'image/webp' ? 'webp' : 'png';
  return new File([out], `${kind}.${ext}`, { type: out.type });
}
