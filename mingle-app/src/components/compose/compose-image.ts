'use client'

/**
 * Client-side image preparation for post attachments.
 *
 * Re-encodes the picked file through a canvas before upload, which:
 * - shrinks large photos so the upload is small, and
 * - drops all EXIF metadata (including GPS location), because a canvas
 *   re-encode keeps only pixels — orientation is applied first via
 *   `createImageBitmap({ imageOrientation: 'from-image' })` so the picture is
 *   not rotated wrong once the EXIF orientation tag is gone.
 *
 * The server's sharp pipeline still runs and is the source of truth; this is a
 * best-effort pre-shrink so mobile uploads are fast and private.
 *
 * The original pixel width/height (from the decoded bitmap) are returned so the
 * caller can send them to the server for aspect-ratio preservation.
 */

export const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const
/**
 * HEIC/HEIF: offered in the picker and attempted, because a browser that can
 * decode them (Safari) re-encodes them to JPEG here like any other photo. One
 * that cannot gets a specific "choose a JPG" message instead of a generic one.
 */
export const HEIC_IMAGE_TYPES = ['image/heic', 'image/heif'] as const
/** What the file picker offers. */
export const PICKER_IMAGE_TYPES = [...ACCEPTED_IMAGE_TYPES, ...HEIC_IMAGE_TYPES] as const
/** Upload cap AFTER the re-encode — matches the server's POST_IMAGE_MAX_BYTES. */
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024 // 10 MB
/**
 * Cap on the ORIGINAL file before decoding. The original is never uploaded —
 * it is shrunk to 2048px first — so a large camera photo (48 MP JPEG ≈ 15-25
 * MB) is accepted; this only keeps a pathological file from exhausting memory.
 */
export const MAX_SOURCE_IMAGE_BYTES = 50 * 1024 * 1024 // 50 MB
const MAX_EDGE = 2048
const OUTPUT_QUALITY = 0.85

export type PreparedImage = {
  /** JPEG file, EXIF-stripped and downscaled, ready to POST as multipart. */
  file: File
  /** Original decoded pixel size (before downscale), for the server. */
  originalWidth: number
  originalHeight: number
}

export type ImagePrepError =
  | 'unsupported'
  | 'heic_unsupported'
  | 'too_large'
  | 'decode_failed'
  | 'encode_failed'
  | 'unavailable'

export class ComposeImageError extends Error {
  constructor(public readonly reason: ImagePrepError) {
    super(reason)
    this.name = 'ComposeImageError'
  }
}

/** HEIC/HEIF by MIME type, or by extension when the picker reports no type. */
export function isHeicFile(file: Pick<File, 'type' | 'name'>): boolean {
  if (HEIC_IMAGE_TYPES.includes(file.type.toLowerCase() as (typeof HEIC_IMAGE_TYPES)[number])) return true
  return !file.type && /\.(heic|heif)$/i.test(file.name)
}

/**
 * Pre-decode check: an accepted type (or HEIC, which is attempted) within the
 * ORIGINAL-file cap. The upload size is judged after shrinking, not here.
 */
export function validatePickedImage(file: File): ImagePrepError | null {
  const accepted = ACCEPTED_IMAGE_TYPES.includes(file.type as (typeof ACCEPTED_IMAGE_TYPES)[number])
  if (!accepted && !isHeicFile(file)) return 'unsupported'
  if (file.size > MAX_SOURCE_IMAGE_BYTES) return 'too_large'
  return null
}

/** The upload limit, judged on the re-encoded file. */
export function preparedSizeError(bytes: number): ImagePrepError | null {
  return bytes > MAX_IMAGE_BYTES ? 'too_large' : null
}

/** Fit dimensions inside a square bound, never enlarging. */
export function scaleToFit(
  width: number,
  height: number,
  maxEdge = MAX_EDGE,
): { width: number; height: number } {
  const longest = Math.max(width, height)
  if (longest <= maxEdge) return { width, height }
  const ratio = maxEdge / longest
  return {
    width: Math.max(1, Math.round(width * ratio)),
    height: Math.max(1, Math.round(height * ratio)),
  }
}

/**
 * Decode, orient, downscale and re-encode to a JPEG File. Throws
 * ComposeImageError on any failure so the UI can map it to copy.
 */
export async function prepareComposeImage(file: File): Promise<PreparedImage> {
  const invalid = validatePickedImage(file)
  if (invalid) throw new ComposeImageError(invalid)

  if (typeof document === 'undefined' || typeof createImageBitmap === 'undefined') {
    throw new ComposeImageError('unavailable')
  }

  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch {
    // A HEIC this browser cannot decode gets its own message.
    throw new ComposeImageError(isHeicFile(file) ? 'heic_unsupported' : 'decode_failed')
  }

  const originalWidth = bitmap.width
  const originalHeight = bitmap.height
  const target = scaleToFit(originalWidth, originalHeight)

  try {
    const canvas = document.createElement('canvas')
    canvas.width = target.width
    canvas.height = target.height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new ComposeImageError('encode_failed')
    // White matte so any transparency flattens to the server's JPEG background.
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, target.width, target.height)
    ctx.drawImage(bitmap, 0, 0, target.width, target.height)

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', OUTPUT_QUALITY),
    )
    if (!blob) throw new ComposeImageError('encode_failed')
    const sizeError = preparedSizeError(blob.size)
    if (sizeError) throw new ComposeImageError(sizeError)

    const outName = file.name.replace(/\.[^./\\]+$/, '') || 'photo'
    return {
      file: new File([blob], `${outName}.jpg`, { type: 'image/jpeg' }),
      originalWidth,
      originalHeight,
    }
  } finally {
    bitmap.close?.()
  }
}
