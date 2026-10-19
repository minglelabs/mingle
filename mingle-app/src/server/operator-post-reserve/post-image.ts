import sharp from 'sharp'
import { prisma } from '@/lib/prisma'
import { loadAvatarPersona, requestAvatarImage, type AvatarReference } from '@/server/operator-avatars/generate'
import { phonePhotoRealism } from '@/server/operator-avatars/photo-realism'
import { describeAccountLook, seededRandom, type AvatarSpec } from '@/server/operator-avatars/taxonomy'
import { newPostImageKey } from '@/server/posts/post-image-keys'
import { getPostImage, putPostImage } from '@/server/posts/post-image-storage'
import { decodePostPhoto, type PostPhotoKind } from './post-photo'

/** The poster as photos of them show them: their look, and whether a photo of them goes along. */
export type PostPhotoPerson = { look: string; hasReference: boolean }

const PERSON_LINES: Record<Exclude<PostPhotoKind, 'scene'>, string> = {
  self: 'The poster\'s face is clearly visible.',
  self_faceless: 'The poster\'s face is not visible: out of frame, covered by the phone or a hand, or turned away. Only their outfit, hair, hands or body show.',
  self_back: 'The poster is seen from behind; their face is not visible.',
  friends: 'The friends are other adults who look clearly different from the poster and from each other, each with an ordinary everyday face of their own; nobody looks like a celebrity or a model.',
}

/**
 * The photo of a latent post, drawn when the post is published. The post
 * generator writes what the photo shows and which kind it is; this adds what
 * makes it look like a phone snapshot and, when the poster is in it, who they
 * are, so every photo of an account shows the same person.
 */
export function buildPostImagePrompt(
  stored: string,
  place: string | null = null,
  random: () => number = Math.random,
  person: PostPhotoPerson | null = null,
): string {
  const { kind, description } = decodePostPhoto(stored)
  if (isScreenshot(description)) return buildScreenshotPrompt(description, place)
  const placeLine = place ? [`Taken in ${place}: the street, shops, packaging and objects look like that place, and any writing that happens to be visible is in the local language and script, small and incidental.`] : []
  const frame = `${random() < 0.75 ? 'Vertical 3:4' : 'Horizontal 4:3'} image, like a phone photo. No captions, watermarks, logos, brand names, borders or frames.`
  if (kind === 'scene' || !person) {
    return [
      'A casual photo someone took on their phone and posted on social media.',
      `It shows: ${description}`,
      ...placeLine,
      'It must look like a real, unedited snapshot from an ordinary person\'s phone gallery.',
      phonePhotoRealism(random, { people: false }),
      `No face and no recognizable person in the image; a hand or a person seen from far behind is fine. Not a photo of a phone, tablet or computer screen. ${frame}`,
    ].join('\n')
  }
  const faces = kind === 'self' || kind === 'friends'
  return [
    'A casual photo of the person who posts it, from their phone gallery, posted on their social media.',
    `It shows: ${description}`,
    // With a photo of them, the photo alone says who they are: a written look on top of it
    // pulls the model back to the photo, and it redraws the same picture in a new place.
    ...(person.hasReference
      ? [
          'The poster is the person in the attached photo. Use it only to know who they are (face, hair, build); the attached picture itself must not show up in the new one.',
          'The face itself stays exactly the same as in the attached photo: the same eye shape and eyelids, nose, mouth, jawline, skin tone and apparent ethnicity, so anyone would say it is the same person. Only what a person changes between days may differ: how the hair is styled (parted, pushed back, tied, under a cap), glasses on or off, makeup, and the camera and light.',
          'This is a completely different photo taken on another day: a different place, outfit, camera distance, camera angle, head angle, expression, gesture and light. Nothing of the attached photo\'s framing, background, clothes, pose, hand position or expression may carry over; if it would look like the same shot moved somewhere else, it is wrong.',
        ]
      : [`The poster: ${person.look}.`]),
    PERSON_LINES[kind],
    ...placeLine,
    'It must look like a real, unedited snapshot, not a photoshoot: an ordinary moment, the outfit the person would really wear there.',
    phonePhotoRealism(random, { people: true, faces }),
    `Everyone in the image is an adult; no school uniforms. Not a photo of a phone, tablet or computer screen. ${frame}`,
  ].join('\n')
}

/** What is on someone's screen is shared as a screenshot; nobody photographs their own phone. */
function isScreenshot(description: string): boolean {
  return /\bscreen ?(shot|capture)\b|\b(smart)?phone screen\b/i.test(description)
}

function buildScreenshotPrompt(description: string, place: string | null): string {
  return [
    'A screenshot saved on a phone and posted on social media.',
    `It shows: ${description}`,
    'Only what the screen displays, edge to edge, with the phone\'s status bar at the top: not a photo of a phone, no hand, no device frame, no background around it.',
    ...(place ? [`The phone belongs to someone living in ${place}: the status bar and app look like what people there use.`] : []),
    'A plain everyday app screen with its usual look; every word spelled correctly and in the language the description implies.',
    'Vertical 9:19.5 image, like a phone screenshot. No watermarks, real app names or logos, borders or frames.',
  ].join('\n')
}

export type ReservePostImage = { objectKey: string; width: number; height: number }

/** The place line of a post photo: the author's city and country. */
export async function reservePostPlace(operatorUserId: string): Promise<string | null> {
  const author = await prisma.user.findUnique({ where: { id: operatorUserId }, select: { locationCity: true, locationCountry: true } })
  return [author?.locationCity, author?.locationCountry].filter(Boolean).join(', ') || null
}

/** Profile photo kinds that show the face, so the photo can stand for the person. */
const FACE_SPEC_CATEGORIES = new Set(['face', 'partial'])

function specSubject(spec: unknown): string | null {
  const value = spec as Partial<AvatarSpec> | null
  if (!value || typeof value.prompt !== 'string' || !FACE_SPEC_CATEGORIES.has(String(value.category))) return null
  return /^Subject: (.+?)\.?$/m.exec(value.prompt)?.[1] ?? null
}

async function fetchReference(url: string): Promise<AvatarReference | null> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(20_000) })
    if (!response.ok) return null
    return { bytes: Buffer.from(await response.arrayBuffer()), mimeType: response.headers.get('content-type') ?? 'image/jpeg' }
  } catch {
    return null
  }
}

/**
 * Who the account's person is in its post photos, and a photo of them to
 * keep the face. The profile photo is that photo when it shows the face;
 * otherwise the account's latest posted photo of itself is, so the first
 * selfie an account posts fixes the face for the ones after it.
 */
export async function reservePostPerson(operatorUserId: string): Promise<{ person: PostPhotoPerson; reference: AvatarReference | null } | null> {
  const [persona, user] = await Promise.all([
    loadAvatarPersona(operatorUserId),
    prisma.user.findUnique({ where: { id: operatorUserId }, select: { image: true, operatorAccount: { select: { avatarSpec: true } } } }),
  ])
  if (!persona) return null
  const subject = specSubject(user?.operatorAccount?.avatarSpec)
  let reference: AvatarReference | null = null
  if (subject && user?.image) reference = await fetchReference(user.image)
  if (!reference) {
    const selfie = await prisma.operatorPostReserve.findFirst({
      where: { operatorUserId, state: 'published', imagePrompt: { startsWith: '[self]' }, postId: { not: null } },
      orderBy: { updatedAt: 'desc' },
      select: { postId: true },
    })
    const post = selfie?.postId ? await prisma.post.findUnique({ where: { id: selfie.postId }, select: { imageObjectKey: true } }) : null
    if (post?.imageObjectKey) reference = { bytes: Buffer.from(await getPostImage(post.imageObjectKey)), mimeType: 'image/jpeg' }
  }
  const look = subject ?? describeAccountLook(persona, seededRandom(`${operatorUserId}:look`))
  return { person: { look, hasReference: Boolean(reference) }, reference }
}

/** Re-encodes a drawn photo and stores it as a post image of the operator. Throws when storing fails. */
export async function storeReservePostImage(operatorUserId: string, bytes: Buffer): Promise<ReservePostImage> {
  const image = await sharp(bytes, { limitInputPixels: 80_000_000 })
    .resize({ width: 1280, height: 1280, fit: 'inside', withoutEnlargement: true })
    .flatten({ background: '#ffffff' })
    .jpeg({ quality: 85 })
    .toBuffer({ resolveWithObject: true })
  const objectKey = newPostImageKey(operatorUserId)
  await putPostImage(objectKey, image.data)
  return { objectKey, width: image.info.width, height: image.info.height }
}

/** Draws and stores the photo. Null when it cannot be drawn or stored; never throws. */
export async function drawReservePostImage(operatorUserId: string, description: string): Promise<ReservePostImage | null> {
  try {
    const place = await reservePostPlace(operatorUserId)
    const withPerson = decodePostPhoto(description).kind === 'scene' ? null : await reservePostPerson(operatorUserId)
    const drawn = await requestAvatarImage(buildPostImagePrompt(description, place, Math.random, withPerson?.person ?? null), { reference: withPerson?.reference ?? undefined })
    if (!drawn.ok) {
      console.warn('[operator-post-reserve] image_failed', { operatorUserId, error: drawn.error, detail: drawn.detail })
      return null
    }
    return await storeReservePostImage(operatorUserId, drawn.bytes)
  } catch (error) {
    console.warn('[operator-post-reserve] image_failed', { operatorUserId, error: error instanceof Error ? error.name : 'unknown' })
    return null
  }
}
