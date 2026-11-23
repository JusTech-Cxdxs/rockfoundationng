/** Job Card photos (pure): what may be uploaded, and the stages a photo belongs to. */

export const PHOTO_STAGES = [
  { key: 'CHECK_IN', label: 'At check-in' },
  { key: 'WORK', label: 'During the work' },
  { key: 'QUALITY', label: 'Quality check' },
  { key: 'COLLECTION', label: 'At collection' },
] as const;
export type PhotoStage = (typeof PHOTO_STAGES)[number]['key'];
export const isPhotoStage = (v: unknown): v is PhotoStage => PHOTO_STAGES.some((s) => s.key === v);
export const photoStageLabel = (v: string): string => PHOTO_STAGES.find((s) => s.key === v)?.label ?? 'Photo';

/** Resized in the browser first (about 1280 px JPEG); this is the most the server takes. */
export const MAX_PHOTO_BYTES = 1_500_000;
export const MAX_PHOTOS_PER_JOB = 40;
/** The longest side the browser resizes a photo to before upload. */
export const RESIZE_TO = 1280;

/** What the bytes really are (from their first bytes), whatever the browser said: JPEG, PNG or WebP only. */
export function sniffImage(bytes: Uint8Array): 'image/jpeg' | 'image/png' | 'image/webp' | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png';
  if (bytes.length >= 12 && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return 'image/webp';
  return null;
}
