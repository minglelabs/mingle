import { randomUUID } from 'node:crypto'
import type { Prisma } from '@prisma/client'
import sharp from 'sharp'
import { prisma } from '@/lib/prisma'
import { deletePostImage, getPostImage, putPostImage } from '@/server/posts/post-image-storage'

/**
 * 레퍼런스 짤 저장소 (staff, 2026-11-24): photos staff pour in so new operator
 * accounts get a profile photo drawn from one (the same shot, a new face), and
 * an account whose profile shows no face gets its first selfie drawn from one.
 * Each photo is used once. The index is one admin setting row (no table); the
 * images sit in the private post-image bucket, which the admin image route
 * already serves to staff.
 */
export const REFERENCE_LIBRARY_KEY = 'reference_library'
const OBJECT_PREFIX = 'post-images/reference-library'
export const REFERENCE_MAX_BYTES = 15 * 1024 * 1024
export const REFERENCE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'] as const

export type ReferenceGender = 'female' | 'male'
export type ReferenceUse = { userId: string; kind: 'avatar' | 'post'; at: string }
export type ReferencePhoto = {
  id: string
  objectKey: string
  width: number | null
  height: number | null
  gender: ReferenceGender | null
  createdAt: string
  usedBy: ReferenceUse | null
}

function parseGender(value: unknown): ReferenceGender | null {
  return value === 'female' || value === 'male' ? value : null
}

function parseItems(value: unknown): ReferencePhoto[] {
  const raw = value && typeof value === 'object' && !Array.isArray(value) ? (value as { items?: unknown }).items : null
  if (!Array.isArray(raw)) return []
  return raw.flatMap((item): ReferencePhoto[] => {
    if (!item || typeof item !== 'object') return []
    const row = item as Record<string, unknown>
    if (typeof row.id !== 'string' || typeof row.objectKey !== 'string') return []
    const used = row.usedBy && typeof row.usedBy === 'object' ? row.usedBy as Record<string, unknown> : null
    return [{
      id: row.id,
      objectKey: row.objectKey,
      width: typeof row.width === 'number' ? row.width : null,
      height: typeof row.height === 'number' ? row.height : null,
      gender: parseGender(row.gender),
      createdAt: typeof row.createdAt === 'string' ? row.createdAt : new Date(0).toISOString(),
      usedBy: used && typeof used.userId === 'string' && (used.kind === 'avatar' || used.kind === 'post')
        ? { userId: used.userId, kind: used.kind, at: typeof used.at === 'string' ? used.at : new Date(0).toISOString() }
        : null,
    }]
  })
}

export async function listReferencePhotos(): Promise<ReferencePhoto[]> {
  const row = await prisma.adminSetting.findUnique({ where: { key: REFERENCE_LIBRARY_KEY }, select: { value: true } })
  return parseItems(row?.value)
}

/**
 * Read-modify-write of the index under a row lock, so two uploads or two
 * claims never overwrite each other. `change` returns the new list and a result.
 */
async function updateLibrary<T>(change: (items: ReferencePhoto[]) => { items: ReferencePhoto[]; result: T }): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.adminSetting.upsert({
      where: { key: REFERENCE_LIBRARY_KEY },
      create: { key: REFERENCE_LIBRARY_KEY, value: { items: [] } },
      update: {},
    })
    await tx.$queryRaw`SELECT key FROM app.app_admin_settings WHERE key = ${REFERENCE_LIBRARY_KEY} FOR UPDATE`
    const row = await tx.adminSetting.findUnique({ where: { key: REFERENCE_LIBRARY_KEY }, select: { value: true } })
    const { items, result } = change(parseItems(row?.value))
    await tx.adminSetting.update({
      where: { key: REFERENCE_LIBRARY_KEY },
      data: { value: { items } as unknown as Prisma.InputJsonValue },
    })
    return result
  })
}

/** Stores one uploaded photo (re-encoded, at most 1600 px) and adds it to the library. */
export async function addReferencePhoto(bytes: Buffer, gender: ReferenceGender | null): Promise<ReferencePhoto> {
  const { data, info } = await sharp(bytes, { limitInputPixels: 80_000_000 })
    .rotate()
    .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 88 })
    .toBuffer({ resolveWithObject: true })
  const id = randomUUID()
  const objectKey = `${OBJECT_PREFIX}/${id}.jpg`
  await putPostImage(objectKey, data)
  const photo: ReferencePhoto = {
    id, objectKey, width: info.width ?? null, height: info.height ?? null, gender, createdAt: new Date().toISOString(), usedBy: null,
  }
  await updateLibrary((items) => ({ items: [photo, ...items], result: null }))
  return photo
}

export async function setReferenceGender(id: string, gender: ReferenceGender | null): Promise<boolean> {
  return updateLibrary((items) => {
    const found = items.some((item) => item.id === id)
    return { items: items.map((item) => (item.id === id ? { ...item, gender } : item)), result: found }
  })
}

export async function removeReferencePhoto(id: string): Promise<boolean> {
  const removed = await updateLibrary((items) => {
    const target = items.find((item) => item.id === id) ?? null
    return { items: items.filter((item) => item.id !== id), result: target }
  })
  if (removed) await deletePostImage(removed.objectKey).catch(() => {})
  return Boolean(removed)
}

/**
 * Takes one unused photo for `userId` (oldest first, so the library is used
 * in the order it was filled). With a gender, only a photo of that gender or
 * an untagged one; without, any. Null when none is left.
 */
export async function claimReferencePhoto(args: {
  userId: string
  kind: ReferenceUse['kind']
  gender?: ReferenceGender | null
  id?: string | null
}): Promise<ReferencePhoto | null> {
  return updateLibrary((items) => {
    const fits = (item: ReferencePhoto) => !item.usedBy
      && (args.id ? item.id === args.id : !args.gender || !item.gender || item.gender === args.gender)
    const candidates = items.filter(fits)
    // Prefer a photo tagged with the gender asked for over an untagged one.
    const pick = (args.gender ? candidates.filter((item) => item.gender === args.gender).at(-1) : null) ?? candidates.at(-1) ?? null
    if (!pick) return { items, result: null }
    const usedBy: ReferenceUse = { userId: args.userId, kind: args.kind, at: new Date().toISOString() }
    const claimed = { ...pick, usedBy }
    return { items: items.map((item) => (item.id === pick.id ? claimed : item)), result: claimed }
  })
}

/** Puts a claimed photo back when the drawing it was claimed for failed. */
export async function releaseReferencePhoto(id: string): Promise<void> {
  await updateLibrary((items) => ({ items: items.map((item) => (item.id === id ? { ...item, usedBy: null } : item)), result: null }))
}

/** Re-attributes a photo claimed before its account existed. */
export async function assignReferencePhoto(id: string, userId: string): Promise<void> {
  await updateLibrary((items) => ({
    items: items.map((item) => (item.id === id && item.usedBy ? { ...item, usedBy: { ...item.usedBy, userId } } : item)),
    result: null,
  }))
}

export async function loadReferenceBytes(photo: Pick<ReferencePhoto, 'objectKey'>): Promise<{ bytes: Buffer; mimeType: string }> {
  return { bytes: Buffer.from(await getPostImage(photo.objectKey)), mimeType: 'image/jpeg' }
}

/**
 * The prompt lines that recreate a library photo with someone else's face:
 * the shot stays (composition, pose, outfit, hair, place, light), the face is
 * the account's own, never the face of whoever is in the reference.
 */
export function referenceRecreateLines(look: string): string[] {
  return [
    'Recreate the attached photo as a new phone photo of a different person.',
    `The person in the new photo: ${look}.`,
    'Keep from the attached photo: the composition and camera angle, the pose and gesture, the hairstyle, the outfit and accessories, the place and background, the light and the mood.',
    'The face must NOT be the face of the person in the attached photo: it must not resemble them, so nobody could recognize them. Give the person a new, ordinary everyday face of their own; nobody looks like a celebrity or a model.',
    'If the attached photo is a screenshot of an app or a video (top bar, buttons, usernames, likes, captions, timers), draw only the photo itself, edge to edge, with none of that interface. No writing, stickers or emoji added on top.',
    'It must look like a real, unedited snapshot from an ordinary person\'s phone. Everyone in the image is an adult.',
  ]
}
