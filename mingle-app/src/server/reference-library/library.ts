import { REFERENCE_SEASON_OUTFIT_LINE } from './direction'
import { randomUUID } from 'node:crypto'
import type { Prisma } from '@prisma/client'
import sharp from 'sharp'
import { prisma } from '@/lib/prisma'
import { deletePostImage, getPostImage, putPostImage } from '@/server/posts/post-image-storage'
import type { ReferenceAttributes } from './classify'

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
export const REFERENCE_MAX_BYTES = 30 * 1024 * 1024
export const REFERENCE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'] as const

export type ReferenceGender = 'female' | 'male'
/**
 * By how many people it shows: thing (nobody: food, a place, an object, an
 * animal) · face / person (one person, face shown / not shown) · group (two
 * or more people).
 */
export type ReferenceKind = 'face' | 'person' | 'thing' | 'group'
export const REFERENCE_KINDS: readonly ReferenceKind[] = ['face', 'person', 'thing', 'group']

export function isReferenceKind(value: unknown): value is ReferenceKind {
  return value === 'face' || value === 'person' || value === 'thing' || value === 'group'
}

/** Gender is kept only for a photo of one person. */
export function referenceKindHasGender(kind: ReferenceKind | null): boolean {
  return kind === null || kind === 'face' || kind === 'person'
}
/** `imageKey`: the post photo drawn from it, so the review queue can put that post first. */
export type ReferenceUse = { userId: string; kind: 'avatar' | 'post'; at: string; imageKey?: string }
export type ReferencePhoto = {
  id: string
  objectKey: string
  width: number | null
  height: number | null
  gender: ReferenceGender | null
  /** Null for a photo added before kinds existed: counted as a face photo. */
  kind: ReferenceKind | null
  /** One line on what the photo shows (from the automatic look at upload). */
  summary: string | null
  /** Staff's own one-line note on the photo; goes into the drawing prompt. */
  note: string | null
  /** What the automatic look read off the photo, axis by axis (classify.ts). */
  attributes: ReferenceAttributes | null
  createdAt: string
  usedBy: ReferenceUse | null
}

function parseGender(value: unknown): ReferenceGender | null {
  return value === 'female' || value === 'male' ? value : null
}

function parseKind(value: unknown): ReferenceKind | null {
  return isReferenceKind(value) ? value : null
}

/** The kind a photo is used as (an untagged one counts as a face photo). */
export function referenceKindOf(photo: Pick<ReferencePhoto, 'kind'>): ReferenceKind {
  return photo.kind ?? 'face'
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
      kind: parseKind(row.kind),
      summary: typeof row.summary === 'string' ? row.summary : null,
      note: typeof row.note === 'string' && row.note.trim() ? row.note : null,
      attributes: row.attributes && typeof row.attributes === 'object' && !Array.isArray(row.attributes) ? row.attributes as ReferenceAttributes : null,
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
  // The pooled connection can be slow to answer (a script run from a laptop): more than Prisma's 5 s default.
  }, { maxWait: 15_000, timeout: 30_000 })
}

/** Stores one uploaded photo (re-encoded, at most 1600 px) and adds it to the library. */
export async function addReferencePhoto(bytes: Buffer, tags: { gender: ReferenceGender | null; kind: ReferenceKind | null; summary?: string | null; note?: string | null; attributes?: ReferenceAttributes | null }): Promise<ReferencePhoto> {
  const { data, info } = await sharp(bytes, { limitInputPixels: 80_000_000 })
    .rotate()
    .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 88 })
    .toBuffer({ resolveWithObject: true })
  const id = randomUUID()
  const objectKey = `${OBJECT_PREFIX}/${id}.jpg`
  await putPostImage(objectKey, data)
  const photo: ReferencePhoto = {
    id, objectKey, width: info.width ?? null, height: info.height ?? null,
    gender: referenceKindHasGender(tags.kind) ? tags.gender : null, kind: tags.kind, summary: tags.summary ?? null, note: normalizeReferenceNote(tags.note), attributes: tags.attributes ?? null,
    createdAt: new Date().toISOString(), usedBy: null,
  }
  await updateLibrary((items) => ({ items: [photo, ...items], result: null }))
  return photo
}

/** Stores a fresh automatic look (description and attributes); kind and gender stay as they are. */
export async function setReferenceAnalysis(id: string, analysis: { summary: string | null; attributes: ReferenceAttributes | null }): Promise<boolean> {
  return updateLibrary((items) => {
    const found = items.some((item) => item.id === id)
    return { items: items.map((item) => (item.id === id ? { ...item, ...analysis } : item)), result: found }
  })
}

export const REFERENCE_NOTE_MAX_LENGTH = 200

export function normalizeReferenceNote(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const note = value.replace(/\s+/g, ' ').trim().slice(0, REFERENCE_NOTE_MAX_LENGTH)
  return note || null
}

export async function updateReferenceTags(id: string, tags: { gender?: ReferenceGender | null; kind?: ReferenceKind; note?: string | null }): Promise<boolean> {
  return updateLibrary((items) => {
    const found = items.some((item) => item.id === id)
    return {
      items: items.map((item) => (item.id === id
        ? {
          ...item,
          ...(tags.kind ? { kind: tags.kind } : {}),
          ...(tags.gender !== undefined ? { gender: tags.gender } : {}),
          ...(tags.kind && !referenceKindHasGender(tags.kind) ? { gender: null } : {}),
          ...(tags.note !== undefined ? { note: normalizeReferenceNote(tags.note) } : {}),
        }
        : item)),
      result: found,
    }
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
  /** Only photos of these kinds (any kind when absent). */
  kinds?: readonly ReferenceKind[]
  id?: string | null
  /** Skip photos that should not be used now (e.g. the wrong season, direction.ts). */
  skip?: (item: ReferencePhoto) => boolean
}): Promise<ReferencePhoto | null> {
  return updateLibrary((items) => {
    const fits = (item: ReferencePhoto) => !item.usedBy
      && !(args.skip && !args.id && args.skip(item))
      && (args.id
        ? item.id === args.id
        : (!args.kinds || args.kinds.includes(referenceKindOf(item)))
          && (!args.gender || !item.gender || !referenceKindHasGender(item.kind) || item.gender === args.gender))
    const candidates = items.filter(fits)
    // Prefer a photo tagged with the gender asked for over an untagged one.
    const pick = (args.gender ? candidates.filter((item) => item.gender === args.gender).at(-1) : null) ?? candidates.at(-1) ?? null
    if (!pick) return { items, result: null }
    const usedBy: ReferenceUse = { userId: args.userId, kind: args.kind, at: new Date().toISOString() }
    const claimed = { ...pick, usedBy }
    return { items: items.map((item) => (item.id === pick.id ? claimed : item)), result: claimed }
  })
}

/** Records the post photo drawn from a claimed library photo. */
export async function markReferenceImage(id: string, imageKey: string): Promise<void> {
  await updateLibrary((items) => ({
    items: items.map((item) => (item.id === id && item.usedBy ? { ...item, usedBy: { ...item.usedBy, imageKey } } : item)),
    result: null,
  }))
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

const SNAPSHOT_LINE = 'It must look like a real, unedited snapshot from an ordinary person\'s phone, not a photoshoot. Everyone in the image is an adult.'
const NO_INTERFACE_LINE = 'If the attached photo is a screenshot of an app or a video (top bar, buttons, usernames, likes, captions, timers), draw only the photo itself, edge to edge, with none of that interface. No writing, stickers or emoji added on top.'

/**
 * The prompt lines that recreate a library photo for an account, by the
 * photo's kind: the shot stays (composition, angle, light, mood), the person
 * is the account's own and never the one in the photo; a thing photo becomes
 * another photo of the same kind of subject, not a copy.
 * `poster` = the attachment is two photos side by side, the reference LEFT and
 * the poster RIGHT, whose face the new photo keeps.
 */
export function referenceRecreateLines(input: {
  kind: ReferenceKind
  look: string | null
  poster?: boolean
  fit?: string | null
  note?: string | null
  /** The shot's analyzed direction (direction.ts), reproduced exactly. */
  direction?: readonly string[]
  /** Who the account is (direction.ts): the person and the life the photo shows. */
  persona?: string | null
}): string[] {
  const fit = input.fit?.trim()
  const note = input.note?.trim()
  const persona = input.persona?.trim()
  const fitLine = [
    ...(input.direction ?? []),
    ...(input.kind === 'thing' ? [] : [REFERENCE_SEASON_OUTFIT_LINE]),
    ...(persona ? [persona] : []),
    ...(note ? [`Staff note about the reference photo, to follow: ${note}`] : []),
    ...(fit ? [`What the photo is for (change details so it fits, keeping the shot): ${fit}`] : []),
  ]
  const ownLife = persona
    ? 'Everything that says who they are comes from the persona, not from the reference: hairstyle, outfit and accessories in their own style, and the place recast as the same kind of place in their own life and city.'
    : null
  if (input.kind === 'group') {
    const posterLines = input.poster
      ? [
          'The attached image is two photos side by side. LEFT: the shot to recreate. RIGHT: the poster, the person this account belongs to.',
          'The poster from the RIGHT photo is one of the people in the new photo (the most central or nearest one): the same eye shape, nose, mouth, jawline, skin tone and apparent ethnicity. Take nothing else from the RIGHT photo. Draw one single photo, never two side by side.',
        ]
      : input.look ? [`One of the people (the most central or nearest one): ${input.look}.`] : []
    const source = input.poster ? 'the LEFT photo' : 'the attached photo'
    return [
      `Recreate ${source} as a new phone photo of a different group of friends, as many people as in it.`,
      ...posterLines,
      `Keep from ${source}: the shot's direction (composition, camera angle and distance, shake, focus and exposure), how the people stand or sit and what they do, the light and the mood.${persona ? ' Outfits and the place fit the persona and their friends.' : ' Also the kind of outfits and the place.'}`,
      ...fitLine,
      `Nobody's face may resemble anyone in ${source}: everyone gets a new, ordinary everyday face, so nobody could be recognized. Faces that do not show in ${source} stay hidden.`,
      NO_INTERFACE_LINE,
      SNAPSHOT_LINE,
    ]
  }
  if (input.kind === 'thing') {
    return [
      'Recreate the attached photo as a new phone photo, as if the same person took another photo of the same kind of thing.',
      'Keep the kind of subject and the shot\'s direction: composition, camera angle and distance, shake, focus and exposure, the light, the colors and the mood. It is not a copy: change the details (another dish or arrangement, another spot, other small objects) so the two photos are clearly different, and so they fit the persona\'s own life.',
      ...fitLine,
      'No people in it, unless the attached photo shows some; then only hands, backs or people far away, with no face that can be made out.',
      NO_INTERFACE_LINE,
      SNAPSHOT_LINE,
    ]
  }
  const who = input.poster
    ? [
        'The attached image is two photos side by side. LEFT: the shot to recreate. RIGHT: the poster, the person this account belongs to.',
        'The person in the new photo is the poster from the RIGHT photo: the same eye shape, nose, mouth, jawline, skin tone and apparent ethnicity. Take nothing else from the RIGHT photo (no background, clothes, pose or light). Draw one single photo, never two side by side.',
      ]
    : [`The person in the new photo: ${input.look ?? 'an ordinary adult'}.`]
  const source = input.poster ? 'the LEFT photo' : 'the attached photo'
  return [
    `Recreate ${source} as a new phone photo of a different person.`,
    ...who,
    ...(ownLife
      ? [`Keep from ${source}: the shot's direction (who took it, composition, camera angle and distance, shake, focus and exposure), the pose, gesture, expression and gaze, the light and the mood.`, ownLife]
      : [`Keep from ${source}: the composition and camera angle, the pose and gesture, the hairstyle, the outfit and accessories, the place and background, the light and the mood.`]),
    ...fitLine,
    input.kind === 'person'
      ? `The face does not show, exactly as in ${source} (turned away, from behind, covered, cropped out or in shadow). Never show a face.`
      : `The face must NOT be the face of the person in ${source}: it must not resemble them, so nobody could recognize them.${input.poster ? '' : ' Give the person a new, ordinary everyday face of their own; nobody looks like a celebrity or a model.'}`,
    NO_INTERFACE_LINE,
    SNAPSHOT_LINE,
  ]
}
