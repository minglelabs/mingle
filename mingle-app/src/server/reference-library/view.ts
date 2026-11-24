import { prisma } from '@/lib/prisma'
import { listReferencePhotos, releaseAbandonedReferences, type ReferencePhoto } from './library'

/** Whether what a used photo went into is out in the app: 게시됨, or still waiting (검수 중·예약). */
export type ReferenceUseStatus = 'published' | 'pending'

/** A library photo as the page shows it: with the account it went to, and whether that went out. */
export type ReferencePhotoView = ReferencePhoto & {
  usedByAccount: { userId: string; name: string | null; handle: string; image: string | null } | null
  useStatus: ReferenceUseStatus | null
}

export async function listReferencePhotoViews(): Promise<ReferencePhotoView[]> {
  // Uses that never went out (deleted unpublished) free their photo first.
  await releaseAbandonedReferences()
  const items = await listReferencePhotos()
  const imageKeys = items.flatMap((item) => (item.usedBy?.kind === 'post' && item.usedBy.imageKey ? [item.usedBy.imageKey] : []))
  const reserves = imageKeys.length
    ? await prisma.operatorPostReserve.findMany({ where: { imageObjectKey: { in: imageKeys } }, select: { imageObjectKey: true, state: true } })
    : []
  const reserveState = new Map(reserves.map((row) => [row.imageObjectKey, row.state]))
  const userIds = [...new Set(items.flatMap((item) => (item.usedBy && item.usedBy.userId !== 'pending' ? [item.usedBy.userId] : [])))]
  const users = userIds.length
    ? await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true, handle: true, image: true, operatorAccount: { select: { reviewState: true } } } })
    : []
  const byId = new Map(users.map((user) => [user.id, user]))
  return items.map((item) => {
    const user = item.usedBy ? byId.get(item.usedBy.userId) : undefined
    const useStatus: ReferenceUseStatus | null = !item.usedBy
      ? null
      : item.usedBy.kind === 'avatar'
        ? (user?.operatorAccount?.reviewState ?? 'approved') === 'approved' ? 'published' : 'pending'
        : item.usedBy.imageKey && reserveState.get(item.usedBy.imageKey) === 'published' ? 'published' : 'pending'
    return { ...item, usedByAccount: user ? { userId: user.id, name: user.name, handle: user.handle, image: user.image } : null, useStatus }
  })
}
