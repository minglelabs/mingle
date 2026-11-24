import { prisma } from '@/lib/prisma'
import { listReferencePhotos, type ReferencePhoto } from './library'

/** A library photo as the page shows it: with the account it went to. */
export type ReferencePhotoView = ReferencePhoto & {
  usedByAccount: { userId: string; name: string | null; handle: string; image: string | null } | null
}

export async function listReferencePhotoViews(): Promise<ReferencePhotoView[]> {
  const items = await listReferencePhotos()
  const userIds = [...new Set(items.flatMap((item) => (item.usedBy && item.usedBy.userId !== 'pending' ? [item.usedBy.userId] : [])))]
  const users = userIds.length
    ? await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true, handle: true, image: true } })
    : []
  const byId = new Map(users.map((user) => [user.id, user]))
  return items.map((item) => {
    const user = item.usedBy ? byId.get(item.usedBy.userId) : undefined
    return { ...item, usedByAccount: user ? { userId: user.id, name: user.name, handle: user.handle, image: user.image } : null }
  })
}
