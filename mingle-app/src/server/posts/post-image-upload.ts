/**
 * Shared upload pipeline for post images: validate the multipart file, strip
 * EXIF + resize with sharp, and store it under a server-issued key owned by the
 * uploader. Used by both the draft/compose upload route and the per-post image
 * route, so every stored post image goes through the same checks.
 */

import sharp from 'sharp'
import { newPostImageKey } from '@/server/posts/post-image-keys'
import { POST_IMAGE_MAX_BYTES, putPostImage } from '@/server/posts/post-image-storage'

export type StoredPostImage = { objectKey: string; width: number; height: number }

export type StorePostImageResult =
  | { ok: true; image: StoredPostImage }
  | { ok: false; status: number; error: string }

const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp']

export function contentLengthTooLarge(headers: Headers): boolean {
  return Number(headers.get('content-length')) > POST_IMAGE_MAX_BYTES + 65536
}

export async function storeUploadedPostImage(
  form: FormData,
  uploaderId: string,
): Promise<StorePostImageResult> {
  const file = form.get('file')
  if (!(file instanceof File)
    || !ACCEPTED_TYPES.includes(file.type)
    || !file.size
    || file.size > POST_IMAGE_MAX_BYTES) {
    return { ok: false, status: 400, error: 'invalid_image' }
  }

  const bytes = Buffer.from(await file.arrayBuffer())

  let image: { data: Buffer; info: sharp.OutputInfo }
  try {
    const input = sharp(bytes, { limitInputPixels: 80_000_000, animated: false })
    const info = await input.metadata()
    if (!['jpeg', 'png', 'webp'].includes(info.format ?? '')) throw new Error('unsupported_image')
    image = await input
      .rotate() // auto-orient from EXIF
      .resize({ width: 2048, height: 2048, fit: 'inside', withoutEnlargement: true })
      .flatten({ background: '#ffffff' })
      .jpeg({ quality: 85 })
      .toBuffer({ resolveWithObject: true })
  } catch {
    return { ok: false, status: 400, error: 'invalid_image' }
  }

  const objectKey = newPostImageKey(uploaderId)
  try {
    await putPostImage(objectKey, image.data)
  } catch {
    return { ok: false, status: 503, error: 'image_upload_failed' }
  }

  return { ok: true, image: { objectKey, width: image.info.width, height: image.info.height } }
}
