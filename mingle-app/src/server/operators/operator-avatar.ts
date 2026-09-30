import { randomUUID } from 'node:crypto'
import sharp from 'sharp'
import { prisma } from '@/lib/prisma'
import { PROFILE_IMAGE_MIN_SCALE } from '@/lib/profile-image-crop'
import type { AdminContext } from '@/server/admin/guard'
import { writeAdminAudit } from '@/server/admin/audit'
import { deleteProfileImage, putProfileImage } from '@/server/profile-image-storage'

/**
 * Operator profile photos. Unlike the user upload route (which stores the
 * original bytes), every photo is re-encoded: auto-rotated, cover-cropped to a
 * 1024 px square, flattened, and written as JPEG q85, which also drops EXIF
 * (GPS, camera) and any other metadata. It is stored in the public profile
 * bucket under the account's own prefix with the default crop (1, 0, 0).
 */

export const OPERATOR_AVATAR_MAX_BYTES = 10 * 1024 * 1024
export const OPERATOR_AVATAR_SIZE = 1024
export const OPERATOR_AVATAR_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const

export type OperatorAvatarResult =
  | { ok: true; image: string; objectKey: string }
  | { ok: false; status: number; error: string }

/** Pre-check before reading the body: the multipart envelope may add a little over the file size. */
export function avatarRequestTooLarge(headers: Headers): boolean {
  return Number(headers.get('content-length')) > OPERATOR_AVATAR_MAX_BYTES + 65_536
}

export async function renderOperatorAvatar(bytes: Buffer): Promise<Buffer> {
  const input = sharp(bytes, { limitInputPixels: 80_000_000, animated: false })
  const metadata = await input.metadata()
  if (!['jpeg', 'png', 'webp'].includes(metadata.format ?? '')) throw new Error('unsupported_image')
  return input
    .rotate() // auto-orient from EXIF before it is dropped
    .resize({ width: OPERATOR_AVATAR_SIZE, height: OPERATOR_AVATAR_SIZE, fit: 'cover', position: 'attention' })
    .flatten({ background: '#ffffff' })
    .jpeg({ quality: 85 })
    .toBuffer()
}

export function operatorAvatarObjectKey(userId: string): string {
  return `profiles/${userId}/${randomUUID()}.jpg`
}

/** Replaces the operator's avatar. The caller has already run `requireOperatorAccount(userId)`. */
export async function setOperatorAvatar(ctx: AdminContext, userId: string, file: unknown): Promise<OperatorAvatarResult> {
  if (!(file instanceof File)) return { ok: false, status: 400, error: 'image_required' }
  const type = file.type.toLowerCase()
  if (!(OPERATOR_AVATAR_TYPES as readonly string[]).includes(type) || file.size <= 0 || file.size > OPERATOR_AVATAR_MAX_BYTES) {
    return { ok: false, status: 400, error: 'invalid_image' }
  }

  let rendered: Buffer
  try {
    rendered = await renderOperatorAvatar(Buffer.from(await file.arrayBuffer()))
  } catch {
    return { ok: false, status: 400, error: 'invalid_image' }
  }

  const objectKey = operatorAvatarObjectKey(userId)
  let image: string
  try {
    image = await putProfileImage({ objectKey, body: new Uint8Array(rendered), contentType: 'image/jpeg' })
  } catch (error) {
    if (error instanceof Error && error.message === 'profile_image_storage_not_configured') {
      return { ok: false, status: 503, error: 'image_storage_not_configured' }
    }
    console.error('[operator-avatar] upload_failed', { error: error instanceof Error ? error.name : 'unknown' })
    return { ok: false, status: 502, error: 'image_upload_failed' }
  }

  let previousObjectKey: string | null = null
  try {
    const existing = await prisma.user.findUnique({ where: { id: userId }, select: { imageObjectKey: true } })
    previousObjectKey = existing?.imageObjectKey ?? null
    await prisma.user.update({
      where: { id: userId },
      data: {
        image,
        imageObjectKey: objectKey,
        imageCropScale: PROFILE_IMAGE_MIN_SCALE,
        imageCropX: 0,
        imageCropY: 0,
      },
      select: { id: true },
    })
  } catch (error) {
    console.error('[operator-avatar] profile_update_failed', { error: error instanceof Error ? error.name : 'unknown' })
    try {
      await deleteProfileImage(objectKey)
    } catch {
      // Keep the original error when cleanup also fails.
    }
    return { ok: false, status: 500, error: 'profile_update_failed' }
  }

  // Only ever delete an object under this account's own prefix.
  if (previousObjectKey && previousObjectKey !== objectKey && previousObjectKey.startsWith(`profiles/${userId}/`)) {
    try {
      await deleteProfileImage(previousObjectKey)
    } catch (error) {
      console.warn('[operator-avatar] previous_object_delete_failed', { error: error instanceof Error ? error.name : 'unknown' })
    }
  }

  await writeAdminAudit(ctx, {
    action: 'operator.avatar',
    operatorUserId: userId,
    targetType: 'user',
    targetId: userId,
    metadata: { objectKey, replacedObjectKey: previousObjectKey },
  })
  return { ok: true, image, objectKey }
}
