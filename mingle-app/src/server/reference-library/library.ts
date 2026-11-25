import { randomUUID } from 'node:crypto'
import type { Prisma } from '@prisma/client'
import sharp from 'sharp'
import { prisma } from '@/lib/prisma'
import { deletePostImage, getPostImage, putPostImage } from '@/server/posts/post-image-storage'
import type { ReferenceAttributes } from './classify'
import { isSamePhoto, referenceFingerprint } from './fingerprint'

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
  /** Picture fingerprint (fingerprint.ts), to catch a photo uploaded twice; null until filled in. */
  fingerprint: string | null
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
        ? {
            userId: used.userId, kind: used.kind, at: typeof used.at === 'string' ? used.at : new Date(0).toISOString(),
            ...(typeof used.imageKey === 'string' && used.imageKey ? { imageKey: used.imageKey } : {}),
          }
        : null,
      fingerprint: typeof row.fingerprint === 'string' && /^[0-9a-f]{16}$/.test(row.fingerprint) ? row.fingerprint : null,
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

/** The library photo this one is a copy of (same picture re-saved, resized or recompressed), or null. */
export function findSameReference(items: readonly ReferencePhoto[], photo: { fingerprint: string; width: number | null; height: number | null }): ReferencePhoto | null {
  return items.find((item) => isSamePhoto(item, photo)) ?? null
}

/** Fingerprint and shape of an uploaded photo, as stored (after rotation). */
export async function referencePhotoShape(bytes: Buffer): Promise<{ fingerprint: string; width: number | null; height: number | null }> {
  const meta = await sharp(bytes, { limitInputPixels: 80_000_000 }).rotate().metadata()
  // EXIF orientations 5-8 turn the photo a quarter, which swaps its sides.
  const turned = (meta.orientation ?? 1) >= 5
  return {
    fingerprint: await referenceFingerprint(bytes),
    width: (turned ? meta.height : meta.width) ?? null,
    height: (turned ? meta.width : meta.height) ?? null,
  }
}

let fillingFingerprints: Promise<void> | null = null

/**
 * Gives every library photo added before fingerprints existed its
 * fingerprint, once per server process (a photo that cannot be read is
 * skipped). Only adds the field; nothing else changes. Never throws.
 */
export function ensureReferenceFingerprints(): Promise<void> {
  fillingFingerprints ??= (async () => {
    try {
      const missing = (await listReferencePhotos()).filter((item) => !item.fingerprint)
      if (!missing.length) return
      const found = new Map<string, string>()
      for (const item of missing) {
        try {
          found.set(item.id, await referenceFingerprint(Buffer.from(await getPostImage(item.objectKey))))
        } catch {
          // Unreadable: it just cannot be matched.
        }
      }
      if (!found.size) return
      await updateLibrary((items) => ({
        items: items.map((item) => (!item.fingerprint && found.has(item.id) ? { ...item, fingerprint: found.get(item.id)! } : item)),
        result: null,
      }))
    } catch (error) {
      console.warn('[reference-library] fingerprint_fill_failed', { error: error instanceof Error ? error.name : 'unknown' })
      fillingFingerprints = null
    }
  })()
  return fillingFingerprints
}

/**
 * Stores one uploaded photo (re-encoded, at most 1600 px) and adds it to the
 * library. With `fingerprint`, a photo the library already has is not added
 * (checked under the library lock, so two uploads of one photo at once keep
 * one): the result is then `{ duplicateOf }`.
 */
export async function addReferencePhoto(
  bytes: Buffer,
  tags: { gender: ReferenceGender | null; kind: ReferenceKind | null; summary?: string | null; note?: string | null; attributes?: ReferenceAttributes | null; fingerprint?: string | null },
): Promise<ReferencePhoto | { duplicateOf: ReferencePhoto }> {
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
    createdAt: new Date().toISOString(), usedBy: null, fingerprint: tags.fingerprint ?? null,
  }
  const duplicateOf = await updateLibrary((items) => {
    const same = photo.fingerprint ? findSameReference(items, { fingerprint: photo.fingerprint, width: photo.width, height: photo.height }) : null
    return same ? { items, result: same } : { items: [photo, ...items], result: null }
  })
  if (duplicateOf) {
    await deletePostImage(objectKey).catch(() => {})
    return { duplicateOf }
  }
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
  /** Among the rest, take one of these first (e.g. a photo that suits the persona, direction.ts). */
  prefer?: (item: ReferencePhoto) => boolean
}): Promise<ReferencePhoto | null> {
  // Photos whose use never went out are free again before picking.
  if (!args.id) await releaseAbandonedReferences()
  return updateLibrary((items) => {
    const fits = (item: ReferencePhoto) => !item.usedBy
      && !(args.skip && !args.id && args.skip(item))
      && (args.id
        ? item.id === args.id
        : (!args.kinds || args.kinds.includes(referenceKindOf(item)))
          && (!args.gender || !item.gender || !referenceKindHasGender(item.kind) || item.gender === args.gender))
    const candidates = items.filter(fits)
    // Prefer a photo tagged with the gender asked for over an untagged one.
    const preferred = args.prefer ? candidates.filter(args.prefer) : []
    const pool = preferred.length ? preferred : candidates
    const pick = (args.gender ? pool.filter((item) => item.gender === args.gender).at(-1) : null) ?? pool.at(-1) ?? null
    if (!pick) return { items, result: null }
    const usedBy: ReferenceUse = { userId: args.userId, kind: args.kind, at: new Date().toISOString() }
    const claimed = { ...pick, usedBy }
    return { items: items.map((item) => (item.id === pick.id ? claimed : item)), result: claimed }
  })
}

/** A post photo staff edited: the library photo it was drawn from now points at the edited file. */
export async function moveReferenceImageKey(from: string, to: string): Promise<void> {
  if (from === to) return
  const items = await listReferencePhotos()
  if (!items.some((item) => item.usedBy?.imageKey === from)) return
  await updateLibrary((current) => ({
    items: current.map((item) => (item.usedBy?.imageKey === from ? { ...item, usedBy: { ...item.usedBy, imageKey: to } } : item)),
    result: null,
  }))
}

/** Records the post photo drawn from a claimed library photo. */
export async function markReferenceImage(id: string, imageKey: string): Promise<void> {
  await updateLibrary((items) => ({
    items: items.map((item) => (item.id === id && item.usedBy ? { ...item, usedBy: { ...item.usedBy, imageKey } } : item)),
    result: null,
  }))
}

/**
 * Frees library photos whose use never went out (staff, 2026-11-25): a post
 * deleted before or after it was published, or whose photo was redrawn (no post holds
 * the drawn photo any more), an account deleted, and an account whose
 * profile photo was redrawn the usual way (its spec no longer the library's).
 * A post photo only counts once recorded (markReferenceImage) and ten minutes
 * old, so a drawing still being stored is never freed. Never throws.
 */
export async function releaseAbandonedReferences(now: Date = new Date()): Promise<number> {
  try {
    const items = await listReferencePhotos()
    const settled = (at: string) => now.getTime() - Date.parse(at) > 10 * 60_000
    const postUses = items.filter((item) => item.usedBy?.kind === 'post' && item.usedBy.imageKey && settled(item.usedBy.at))
    // A post use never recorded with its photo after an hour: the drawing died with its process.
    const lostDrawings = items.filter((item) => item.usedBy?.kind === 'post' && !item.usedBy.imageKey && now.getTime() - Date.parse(item.usedBy.at) > 60 * 60_000)
    const avatarUses = items.filter((item) => item.usedBy?.kind === 'avatar' && item.usedBy.userId !== 'pending' && settled(item.usedBy.at))
    if (!postUses.length && !avatarUses.length && !lostDrawings.length) return 0
    const [rows, users] = await Promise.all([
      postUses.length
        ? prisma.operatorPostReserve.findMany({ where: { imageObjectKey: { in: postUses.map((item) => item.usedBy!.imageKey!) } }, select: { imageObjectKey: true, state: true, postId: true } })
        : [],
      avatarUses.length
        ? prisma.user.findMany({ where: { id: { in: avatarUses.map((item) => item.usedBy!.userId) }, isDeleted: false }, select: { id: true, operatorAccount: { select: { avatarSpec: true, pendingAvatarSpec: true } } } })
        : [],
    ])
    // A published post staff deleted later gives its photo back too.
    const postIds = rows.flatMap((row) => (row.state === 'published' && row.postId ? [row.postId] : []))
    const deletedPosts = new Set(postIds.length
      ? (await prisma.post.findMany({ where: { id: { in: postIds }, isDeleted: true }, select: { id: true } })).map((post) => post.id)
      : [])
    const liveKeys = new Set(rows.filter((row) => row.state !== 'cancelled' && !(row.postId && deletedPosts.has(row.postId))).map((row) => row.imageObjectKey))
    const fromLibrary = (spec: unknown) => {
      const attributes = spec && typeof spec === 'object' ? (spec as { attributes?: { source?: unknown } }).attributes : undefined
      return attributes?.source === 'reference_library'
    }
    // A live account's new profile photo waiting for review counts too.
    const liveUsers = new Set(users.filter((user) => fromLibrary(user.operatorAccount?.avatarSpec) || fromLibrary(user.operatorAccount?.pendingAvatarSpec)).map((user) => user.id))
    const abandoned = new Set([
      ...lostDrawings.map((item) => item.id),
      ...postUses.filter((item) => !liveKeys.has(item.usedBy!.imageKey!)).map((item) => item.id),
      ...avatarUses.filter((item) => !liveUsers.has(item.usedBy!.userId)).map((item) => item.id),
    ])
    if (!abandoned.size) return 0
    await updateLibrary((current) => ({
      items: current.map((item) => (abandoned.has(item.id) ? { ...item, usedBy: null } : item)),
      result: null,
    }))
    return abandoned.size
  } catch (error) {
    console.warn('[reference-library] release_abandoned_failed', { error: error instanceof Error ? error.name : 'unknown' })
    return 0
  }
}

/** Puts back the library photo a post photo was drawn from, when staff delete that post. */
export async function releaseReferenceForImage(imageKey: string | null | undefined): Promise<void> {
  if (!imageKey) return
  const items = await listReferencePhotos()
  if (!items.some((item) => item.usedBy?.kind === 'post' && item.usedBy.imageKey === imageKey)) return
  await updateLibrary((current) => ({
    items: current.map((item) => (item.usedBy?.kind === 'post' && item.usedBy.imageKey === imageKey ? { ...item, usedBy: null } : item)),
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

const NO_INTERFACE_LINE = 'If the attached photo is a screenshot of an app or a video (top bar, buttons, usernames, likes, captions, timers), draw only the photo itself, edge to edge, with none of that interface. No writing, stickers or emoji added on top.'

/**
 * The prompt lines that turn a library photo into this account's photo
 * (staff, 2026-11-25): the photo stays almost exactly as it is, and only the
 * face changes, plus the skin and build of whatever body shows, so the person
 * becomes the account's persona. Clothes, hair, pose, hands, objects, place,
 * framing, light, colors, blur and grain all stay. A thing photo stays the
 * same shot with only small incidental differences. The library only gives a
 * photo to a persona of about the same age and look (direction.ts), so the
 * pose and style still suit them.
 * `poster` = the attachment is two photos side by side, the reference LEFT and
 * the poster RIGHT, whose face the new photo takes.
 */
export function referenceRecreateLines(input: {
  kind: ReferenceKind
  look: string | null
  poster?: boolean
  /** Kept for callers; the photo is no longer changed to fit the post. */
  fit?: string | null
  note?: string | null
  /** The shot's analyzed direction (direction.ts), all of it kept. */
  direction?: readonly string[]
  /** Who the account is (direction.ts): whose face and body the person gets. */
  persona?: string | null
  /** A post photo redrawn from farther away (direction.ts, widenPostShot): the framing and distance change. */
  widen?: boolean
}): string[] {
  const note = input.note?.trim()
  const persona = input.persona?.trim()
  const source = input.poster ? 'the LEFT photo' : 'the attached photo'
  const extra = [
    ...(input.direction ?? []),
    ...(note ? [`Staff note about the reference photo, to follow: ${note}`] : []),
  ]
  const keep = input.widen
    ? `Keep everything else as in ${source}: the hairstyle and hair color, the clothes and accessories, the pose, gesture and hands, the place, the camera angle, the light, the colors, and any blur, grain or other flaw.`
    : `Keep everything else exactly as in ${source}, as if it were the same photo: the hairstyle and hair color, the clothes and accessories, the pose, gesture and hands, every object, the place and background, the framing and crop, the camera angle and distance, the light, the colors, and any blur, grain or other flaw.`
  const wider = input.widen ? [WIDEN_LINE] : []
  const finish = [
    'The result must look like an ordinary, unedited phone photo with no sign of editing. Everyone in it is an adult.',
    NO_INTERFACE_LINE,
  ]
  if (input.kind === 'thing') {
    return [
      `Recreate ${source} as the same photo taken again a moment later: the same subject, arrangement, framing, camera angle, light, colors and mood.`,
      'Only small incidental details differ (a slightly different angle of a cup, crumbs, a reflection, a background object moved), so it is not a pixel copy. Change nothing else.',
      ...extra,
      'No new people. If hands or people far away show, keep them as they are, with no face that can be made out.',
      ...finish,
    ]
  }
  if (input.kind === 'group') {
    const posterLines = input.poster
      ? [
          'The attached image is two photos side by side. LEFT: the photo to edit. RIGHT: the poster, the person this account belongs to.',
          'Give the most central or nearest person in the LEFT photo the poster\'s face from the RIGHT photo: the same eye shape, nose, mouth, jawline, skin tone and apparent ethnicity. Take nothing else from the RIGHT photo. Output one single photo, never two side by side.',
        ]
      : [`The most central or nearest person becomes this account's person: ${input.look ?? 'an ordinary adult'}.`]
    return [
      `Edit ${source}: change only the faces of the people in it.`,
      ...posterLines,
      ...(persona ? [persona] : []),
      `Every other face becomes a new, ordinary everyday face of the same apparent age and look, so nobody in ${source} could be recognized. Faces that do not show stay hidden.`,
      keep,
      ...extra,
      ...finish,
    ]
  }
  const who = input.poster
    ? [
        'The attached image is two photos side by side. LEFT: the photo to edit. RIGHT: the poster, the person this account belongs to.',
        'Give the person in the LEFT photo the poster\'s face from the RIGHT photo: the same eye shape, nose, mouth, jawline, skin tone and apparent ethnicity. Take nothing else from the RIGHT photo (no hair, clothes, background or light). Output one single photo, never two side by side.',
      ]
    : [`The person becomes this account's person: ${input.look ?? 'an ordinary adult'}.`]
  return [
    input.kind === 'person'
      ? `Edit ${source}: the face does not show in it and must stay hidden exactly as it is (turned away, from behind, covered, cropped out or in shadow). Never show a face. Change only the skin tone and build of the body parts that show, to fit this account's person.`
      : `Edit ${source}: change only the person's face, and the skin tone and build of the body parts that show (neck, hands, arms, legs), to fit this account's person. The face must not resemble the person in ${source}, so nobody could recognize them.`,
    ...who,
    ...(persona ? [persona] : []),
    keep,
    ...wider,
    ...extra,
    ...finish,
  ]
}

/** How a widened post photo is framed (see referenceRecreateLines `widen`). */
export const WIDEN_LINE = 'Framing: the camera is pulled back, unlike the reference. A friend took it standing a few steps away at about eye level: the person is seen from about the knees up and fills only part of the frame, with plenty of the place around them in view (the floor, the walls or the street, things nearby). Continue the same place, outfit and light naturally beyond the edges of the reference. Never a close-up.'
