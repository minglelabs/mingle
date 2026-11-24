import { prisma } from '@/lib/prisma'
import { PROFILE_IMAGE_MIN_SCALE } from '@/lib/profile-image-crop'
import type { AdminContext } from '@/server/admin/guard'
import { writeAdminAudit } from '@/server/admin/audit'
import { Prisma } from '@prisma/client'
import { putProfileImage } from '@/server/profile-image-storage'
import { operatorAvatarObjectKey, renderOperatorAvatar } from './operator-avatar'

/**
 * A new profile photo for a live operator account goes to staff review first
 * (staff 2026-11-24): it is stored next to the current one, which stays on the
 * profile until staff take the new one in the review queue. Replaced and
 * discarded photos stay in storage, like every replaced operator photo.
 */

/** A drawing that started longer ago than this is taken to have died with its server. */
export const CANDIDATE_DRAW_CUTOFF_MS = 15 * 60_000

export function candidateDrawing(startedAt: Date | null | undefined, now: Date = new Date()): boolean {
  return Boolean(startedAt) && now.getTime() - startedAt!.getTime() < CANDIDATE_DRAW_CUTOFF_MS
}

export type CandidateResult = { ok: true; image: string } | { ok: false; error: 'not_found' | 'invalid_image' | 'image_upload_failed' }

/** Stores `bytes` as the account's photo waiting for review, with the spec it was drawn from. */
export async function storeAvatarCandidate(userId: string, bytes: Buffer, spec: unknown): Promise<CandidateResult> {
  let rendered: Buffer
  try {
    rendered = await renderOperatorAvatar(bytes)
  } catch {
    return { ok: false, error: 'invalid_image' }
  }
  const objectKey = operatorAvatarObjectKey(userId)
  let image: string
  try {
    image = await putProfileImage({ objectKey, body: new Uint8Array(rendered), contentType: 'image/jpeg' })
  } catch (error) {
    console.error('[operator-avatar] candidate_upload_failed', { error: error instanceof Error ? error.name : 'unknown' })
    return { ok: false, error: 'image_upload_failed' }
  }
  const updated = await prisma.operatorAccount.updateMany({
    where: { userId },
    data: { pendingImage: image, pendingImageObjectKey: objectKey, pendingAvatarSpec: (spec ?? undefined) as Prisma.InputJsonValue | undefined },
  })
  return updated.count ? { ok: true, image } : { ok: false, error: 'not_found' }
}

const CLEARED = { pendingImage: null, pendingImageObjectKey: null, pendingDrawingAt: null } as const

/** Staff took the new photo: it becomes the profile photo. */
export async function applyAvatarCandidate(ctx: AdminContext | null, userId: string, now: Date = new Date()): Promise<CandidateResult> {
  const account = await prisma.operatorAccount.findUnique({
    where: { userId },
    select: { pendingImage: true, pendingImageObjectKey: true, pendingAvatarSpec: true, user: { select: { imageObjectKey: true } } },
  })
  if (!account?.pendingImage || !account.pendingImageObjectKey) return { ok: false, error: 'not_found' }
  await prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data: { image: account.pendingImage, imageObjectKey: account.pendingImageObjectKey, imageCropScale: PROFILE_IMAGE_MIN_SCALE, imageCropX: 0, imageCropY: 0 },
    }),
    prisma.operatorAccount.update({
      where: { userId },
      data: {
        ...CLEARED,
        pendingAvatarSpec: Prisma.DbNull,
        ...(account.pendingAvatarSpec ? { avatarSpec: account.pendingAvatarSpec as Prisma.InputJsonValue, avatarGeneratedAt: now } : {}),
      },
    }),
  ])
  await writeAdminAudit(ctx, {
    action: 'operator.avatar',
    operatorUserId: userId,
    targetType: 'user',
    targetId: userId,
    metadata: { objectKey: account.pendingImageObjectKey, replacedObjectKey: account.user.imageObjectKey, decision: 'candidate_taken' },
  })
  return { ok: true, image: account.pendingImage }
}

/** Staff passed on the new photo: the profile keeps its current one. */
export async function discardAvatarCandidate(ctx: AdminContext | null, userId: string): Promise<{ ok: true } | { ok: false; error: 'not_found' }> {
  const account = await prisma.operatorAccount.findUnique({ where: { userId }, select: { pendingImageObjectKey: true, pendingDrawingAt: true } })
  if (!account || (!account.pendingImageObjectKey && !account.pendingDrawingAt)) return { ok: false, error: 'not_found' }
  await prisma.operatorAccount.update({ where: { userId }, data: { ...CLEARED, pendingAvatarSpec: Prisma.DbNull } })
  await writeAdminAudit(ctx, {
    action: 'operator.avatar',
    operatorUserId: userId,
    targetType: 'user',
    targetId: userId,
    metadata: { discardedObjectKey: account.pendingImageObjectKey, decision: 'candidate_discarded' },
  })
  return { ok: true }
}
