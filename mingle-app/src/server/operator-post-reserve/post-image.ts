import sharp from 'sharp'
import { prisma } from '@/lib/prisma'
import { loadAvatarPersona, requestAvatarImage, SEEDREAM_IMAGE_MODEL, type AvatarReference } from '@/server/operator-avatars/generate'
import type { ImageEngine } from '@/server/seedream/client'
import { markSeedreamImage } from '@/server/seedream/drawn-images'
import { lensForShot, phonePhotoRealism } from '@/server/operator-avatars/photo-realism'
import { describeAccountFace, describeAccountLook, pickAnimeStyle, seededRandom, type AvatarSpec } from '@/server/operator-avatars/taxonomy'
import { newPostImageKey } from '@/server/posts/post-image-keys'
import { getPostImage, putPostImage } from '@/server/posts/post-image-storage'
import { decodePostPhoto, type PostPhotoKind } from './post-photo'
import { pairImages, stripImages } from './pair-images'
import { pickPersonVariety, pickPoseVariety } from './post-person-variety'
import { faceStickerLine } from './face-stickers'
import { contrastLines, describeReferenceForContrast } from './reference-contrast'
import { referenceDirectionLines, WIDE_POST_DISTANCE, widenPostShot, referenceNeedLabel, referencePersonaFit, referencePersonaLine, referenceSeasonClashes, referenceSeasonsToAvoid } from '@/server/reference-library/direction'
import { markReferenceImage, claimReferencePhoto, listReferencePhotos, loadReferenceBytes, referenceKindOf, referenceRecreateLines, releaseReferencePhoto, type ReferenceGender, type ReferenceKind, type ReferencePhoto } from '@/server/reference-library/library'

/** Most group photos hide the friends' faces under stickers; some friends are fine being seen. */
const FRIEND_STICKER_SHARE = 0.85

/** The poster as photos of them show them: their look, and whether a photo of them goes along. */
export type PostPhotoPerson = { look: string; hasReference: boolean; gender?: string | null }

const PERSON_LINES: Record<Exclude<PostPhotoKind, 'scene'>, string> = {
  self: 'The poster\'s face is visible; a hand, something they hold or their hair may cover a small part of it.',
  self_faceless: 'The poster\'s face is not visible: out of frame, covered by the phone or a hand, or turned away. Only their outfit, hair, hands or body show.',
  self_back: 'The poster is seen from behind; their face is not visible.',
  friends: 'The friends are other adults who look clearly different from the poster and from each other, each with an ordinary everyday face of their own; nobody looks like a celebrity or a model.',
}

/** With a photo of the poster attached: who they are, and that nothing else of that photo carries over. */
const REFERENCE_LINES: readonly string[] = [
  'The poster is the person in the attached photo. Use it only to know who they are (face, hair, build); the attached picture itself must not show up in the new one.',
  'The face itself stays exactly the same as in the attached photo: the same eye shape and eyelids, nose, mouth, jawline, skin tone and apparent ethnicity, so anyone would say it is the same person. Only what a person changes between days may differ: how the hair is styled (parted, pushed back, tied, under a cap), glasses on or off, makeup, and the camera and light.',
  'This is a completely different photo taken on another day: a different place, outfit, camera distance, camera angle, head angle, expression, gesture and light. Nothing of the attached photo\'s framing, background, clothes, pose, hand position or expression may carry over; if it would look like the same shot moved somewhere else, it is wrong.',
  'The attached photo\'s colors are not this photo\'s colors: its filter, haze, softness, brightness, contrast and white balance belong to that one picture. The new photo gets its own color and light from this description.',
  'The expression comes only from this description, never from the attached photo: a frown, knitted or raised brows, a squint or a tense mouth in the attached photo is a passing look, not part of the face. Unless the description says otherwise, the brows and forehead are relaxed and smooth, also while laughing.',
]

/** Poses of one booth shot; four different ones make the print. */
export const BOOTH_POSES = [
  'a peace sign by the cheek', 'a small finger heart', 'both palms cupping the cheeks', 'a wink with a small smile',
  'puffed-out cheeks', 'a big heart made with both arms above the head', 'chin resting on both fists', 'laughing, one hand over the mouth',
  'looking off to the side, unbothered', 'a pout with the eyes looking up', 'both hands framing the face', 'a playful shocked face, mouth open',
  'holding a booth prop up by the face (a cat-ear headband, oversized round glasses or a tiny hat)', 'a calm, straight look into the camera',
  'turned a little away, glancing back over the shoulder', 'leaning toward the camera, face close',
] as const

/**
 * A self photo-booth print (인생네컷): one person, four flash shots in one
 * print, ordinary booth poses. Fully dressed in every shot; nothing suggestive.
 */
function buildPhotoBoothPrompt(description: string, person: PostPhotoPerson, random: () => number): string {
  const pool = [...BOOTH_POSES]
  const poses = Array.from({ length: 4 }, () => pool.splice(Math.floor(random() * pool.length), 1)[0])
  const layout = random() < 0.6 ? 'a 2x2 grid of four photos' : 'one vertical strip of four photos'
  return [
    'A self photo-booth print of the kind young people in Korea, Japan and Taiwan take with friends or alone (인생네컷 style) and post on social media: a photo of the printed sheet, or the booth\'s own digital copy.',
    `Layout: ${layout} on one printed frame with even white or colored borders, a tiny made-up booth logo word and a date in a corner (no real brand), and at most a few small hand-drawn doodles or stickers (hearts, sparkles, a little animal) on the borders, never over the face.`,
    `It shows: ${description}`,
    ...(person.hasReference ? REFERENCE_LINES : [`The poster: ${person.look}.`]),
    'The same person in all four shots, in the same outfit and the same booth; only the pose and expression change from shot to shot.',
    `The four poses, in order: ${poses.map((pose, index) => `${index + 1}) ${pose}`).join('; ')}.`,
    'Framed from the chest or waist up in front of the booth\'s plain backdrop, the same distance in each shot.',
    'Booth light: one bright, soft frontal flash, very even, gently brightening the skin the way booths do; a flat backdrop with no shadows behind them; colors clean and a little bright.',
    'Fully and ordinarily dressed in every shot, the same outfit throughout; a cute, friendly, everyday mood, nothing revealing or suggestive.',
    'The face keeps its own proportions; not an averaged idol face. Hands have five fingers.',
    'Everyone in the image is an adult; no school uniforms. Vertical image. No captions or watermarks besides the small booth logo and date.',
  ].join('\n')
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
  style: PostImageStyle = 'photo',
): string {
  const decoded = decodePostPhoto(stored)
  const { kind, description } = decoded
  // A photo from a trip is drawn where it was taken, not in the author's city.
  place = decoded.place ?? place
  // A photo of the poster stays one even when it mentions a screen ("looking down into the phone screen").
  if (kind === 'scene' && isScreenshot(description)) return buildScreenshotPrompt(description, place)
  const placeLine = place ? [`Taken in ${place}: the street, shops, packaging and objects look like that place, and any writing that happens to be visible is in the local language and script, small and incidental.`] : []
  const frame = `${random() < 0.75 ? 'Vertical 3:4' : 'Horizontal 4:3'} image, like a phone photo. No captions, watermarks, logos, brand names, borders or frames.`
  if (style === 'anime') return buildAnimePostPrompt(kind, description, place, person, frame, random)
  if (decoded.photoBooth && person) return buildPhotoBoothPrompt(description, person, random)
  if (kind === 'scene' || !person) {
    return [
      'A casual photo someone took on their phone and posted on social media.',
      `It shows: ${description}`,
      ...placeLine,
      'It must look like a real, unedited snapshot from an ordinary person\'s phone gallery.',
      NO_ADDED_PROPS,
      phonePhotoRealism(random, { people: false, lens: 'main', pickTime: true, scene: `${description} ${place ?? ''}` }),
      `No face and no recognizable person in the image; a hand or a person seen from far behind is fine. Not a photo of a phone, tablet or computer screen. ${frame}`,
    ].join('\n')
  }
  const faces = kind === 'self' || kind === 'friends'
  // Group photos keep their own poses (cheers, side by side); the poster alone gets one picked.
  const pose = kind === 'friends' ? null : pickPoseVariety(random, { faces: kind === 'self', selfie: /selfie|front[- ]camera|mirror/i.test(description) })
  const realism = phonePhotoRealism(random, {
    people: true, faces, focusOnPerson: true, lens: lensForShot(description), pickTime: true, scene: `${description} ${place ?? ''}`,
    deepFocus: pose?.deepFocus, looseHair: pose?.looseHair, posed: pose?.posed,
  })
  // Picked after the realism block so its picks stay what they were for a given seed.
  const variety = pickPersonVariety(random, { faces: kind === 'self' || (kind === 'friends' && person.hasReference), female: person.gender === 'female', hasReference: person.hasReference })
  // Picked last so the picks above stay what they were for a given seed.
  const stickers = kind === 'friends' && random() < FRIEND_STICKER_SHARE ? faceStickerLine(random) : null
  return [
    'A casual photo of the person who posts it, from their phone gallery, posted on their social media.',
    `It shows: ${description}`,
    // With a photo of them, the photo alone says who they are: a written look on top of it
    // pulls the model back to the photo, and it redraws the same picture in a new place.
    ...(person.hasReference ? REFERENCE_LINES : [`The poster: ${person.look}.`]),
    PERSON_LINES[kind],
    ...variety,
    ...(pose ? [pose.line] : []),
    ...(stickers ? [stickers] : []),
    ...placeLine,
    'It must look like a real, unedited snapshot, not a photoshoot: an ordinary moment, the outfit the person would really wear there.',
    NO_ADDED_PROPS,
    realism,
    `Everyone in the image is an adult; no school uniforms. Not a photo of a phone, tablet or computer screen. ${frame}`,
  ].join('\n')
}

/** The model adds a coffee cup and a laptop to any table; staff saw far too many (2026-11-25). */
const NO_ADDED_PROPS = 'Do not add a laptop, a coffee cup or a latte to the picture unless the description above names one.'

export type PostImageStyle = 'photo' | 'anime'

/** An account with an anime-style profile picture posts a drawing now and then; staff found all-drawing feeds tiresome (2026-11-24). */
const ANIME_ACCOUNT_SHARE = 0.1
/** Everyone else now and then shares a drawing of a scene, never of themselves. */
const ANIME_SCENE_SHARE = 0.05

function isAnimeSpec(spec: unknown): boolean {
  return (spec as Partial<AvatarSpec> | null)?.subtype === 'anime_icon'
}

/** Whether one post's picture is a photo or an anime-style drawing. */
export function pickPostImageStyle(avatarSpec: unknown, kind: PostPhotoKind, random: () => number = Math.random): PostImageStyle {
  if (isAnimeSpec(avatarSpec)) return random() < ANIME_ACCOUNT_SHARE ? 'anime' : 'photo'
  return kind === 'scene' && random() < ANIME_SCENE_SHARE ? 'anime' : 'photo'
}

function buildAnimePostPrompt(kind: PostPhotoKind, description: string, place: string | null, person: PostPhotoPerson | null, frame: string, random: () => number): string {
  const withPoster = kind !== 'scene' && person
  // With the poster's own drawing attached, its style leads; otherwise each post gets its own style, so the account's pictures do not all look alike.
  const style = withPoster && person.hasReference ? null : pickAnimeStyle(random)
  return [
    'An anime-style illustration someone made of a moment from their day and posted on social media, like a still from a slice-of-life anime.',
    ...(style ? [`Art style: ${style}.`] : []),
    `It shows: ${description}`,
    ...(place ? [`The setting looks like ${place}; any writing in it is small, incidental and in the local script.`] : []),
    ...(withPoster
      ? person.hasReference
        ? ['The poster is the character in the attached drawing: the same face, hair and colors, drawn in the same style, in a new place, outfit, pose and expression. The attached picture itself must not show up in the new one.']
        : [`The poster, drawn as an anime character: ${person.look}.`]
      : ['No people as the subject; a hand or a small figure far away is fine.']),
    ...(withPoster ? [PERSON_LINES[kind as Exclude<PostPhotoKind, 'scene'>]] : []),
    'A flat digital drawing, not a photo and not a 3D render. An original design: no existing character from any anime, game, manga or brand, and not a real or famous person. Everyone drawn is an adult; no school uniforms.',
    frame.replace(', like a phone photo', ''),
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

/**
 * `photoDescription`: what the photo really shows when it was drawn from a
 * reference-library photo (that photo's description). The text was written
 * for another photo, so the caller rewrites it to fit (staff 2026-11-29: many
 * posts did not go with their photo).
 */
export type ReservePostImage = { objectKey: string; width: number; height: number; photoDescription?: string }

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

/**
 * The face reference with its photo's own look taken out (staff 2026-11-23:
 * every post copied the profile photo's milky, tinted filter). Gray-world white
 * balance plus a contrast stretch, so the image model sees the face, not the
 * filter. Gains stay mild so skin tone survives. Falls back to the original.
 */
export async function neutralizeReferenceLook(reference: AvatarReference): Promise<AvatarReference> {
  try {
    const image = sharp(reference.bytes, { limitInputPixels: 80_000_000 }).rotate().removeAlpha()
    const { channels } = await image.clone().stats()
    const means = channels.slice(0, 3).map((channel) => Math.max(1, channel.mean))
    const gray = (means[0] + means[1] + means[2]) / 3
    const gains = means.map((mean) => Math.min(1.2, Math.max(0.85, gray / mean)))
    const bytes = await image
      .linear(gains, [0, 0, 0])
      .normalise({ lower: 1, upper: 99 })
      .jpeg({ quality: 92 })
      .toBuffer()
    return { bytes, mimeType: 'image/jpeg' }
  } catch {
    return reference
  }
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
export async function reservePostPerson(operatorUserId: string, style: PostImageStyle = 'photo'): Promise<{ person: PostPhotoPerson; reference: AvatarReference | null } | null> {
  const [persona, user] = await Promise.all([
    loadAvatarPersona(operatorUserId),
    prisma.user.findUnique({ where: { id: operatorUserId }, select: { image: true, operatorAccount: { select: { avatarSpec: true } } } }),
  ])
  if (!persona) return null
  const spec = user?.operatorAccount?.avatarSpec as Partial<AvatarSpec> | null | undefined
  if (style === 'anime') {
    // The anime profile picture is the character, unless it shows a pet or a thing.
    const character = isAnimeSpec(spec) && (spec?.attributes?.animeSubject ?? 'person') === 'person'
    const reference = character && user?.image ? await fetchReference(user.image) : null
    return { person: { look: describeAccountLook(persona, seededRandom(`${operatorUserId}:look`)), hasReference: Boolean(reference), gender: persona.gender }, reference }
  }
  // An anime profile picture is no photo of the poster, and an earlier anime post would turn the
  // photo into a drawing (staff 2026-11-24): their photos get no attached picture at all.
  if (isAnimeSpec(spec)) return { person: { look: describeAccountLook(persona, seededRandom(`${operatorUserId}:look`)), hasReference: false, gender: persona.gender }, reference: null }
  const subject = specSubject(spec)
  let reference: AvatarReference | null = null
  if (subject && user?.image) reference = await fetchReference(user.image)
  if (!reference) {
    const selfie = await prisma.operatorPostReserve.findFirst({
      where: { operatorUserId, state: 'published', imagePrompt: { startsWith: '[self]' }, postId: { not: null } },
      // The first one, always the same: taking the latest fed each drawn photo into the next and the face drifted (staff 2026-11-24).
      orderBy: { updatedAt: 'asc' },
      select: { postId: true },
    })
    const post = selfie?.postId ? await prisma.post.findUnique({ where: { id: selfie.postId }, select: { imageObjectKey: true } }) : null
    if (post?.imageObjectKey) reference = { bytes: Buffer.from(await getPostImage(post.imageObjectKey)), mimeType: 'image/jpeg' }
  }
  if (reference) reference = await neutralizeReferenceLook(reference)
  const look = subject ?? describeAccountLook(persona, seededRandom(`${operatorUserId}:look`))
  return { person: { look, hasReference: Boolean(reference), gender: persona.gender }, reference }
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

/** The prompt and attached picture for one post brief of the account, photo or drawing. */
export async function reservePostImageRequest(operatorUserId: string, description: string, random: () => number = Math.random): Promise<{ prompt: string; reference: AvatarReference | null }> {
  const { kind } = decodePostPhoto(description)
  const [place, account] = await Promise.all([
    reservePostPlace(operatorUserId),
    prisma.operatorAccount.findUnique({ where: { userId: operatorUserId }, select: { avatarSpec: true } }),
  ])
  const style = pickPostImageStyle(account?.avatarSpec, kind, random)
  const withPerson = kind === 'scene' ? null : await reservePostPerson(operatorUserId, style)
  const prompt = buildPostImagePrompt(description, place, random, withPerson?.person ?? null, style)
  // A photo of the poster is attached: name what it shows so the new one changes each point.
  const contrast = withPerson?.reference && style === 'photo' ? await describeReferenceForContrast(withPerson.reference) : null
  return { prompt: contrast ? [prompt, ...contrastLines(contrast)].join('\n') : prompt, reference: withPerson?.reference ?? null }
}

/**
 * Adds a photo staff attached to their feedback. With a photo of the poster
 * already attached, both go in one image (staff's on the left, the poster on
 * the right), since the image route takes one attachment.
 */
export async function withStaffReference(
  request: { prompt: string; reference: AvatarReference | null },
  staffReference: AvatarReference,
): Promise<{ prompt: string; reference: AvatarReference }> {
  const use = 'Use it the way the staff feedback says (pose, framing, outfit, place, light or mood); the face of anyone in it must not appear in the new photo.'
  if (!request.reference) {
    return {
      prompt: [request.prompt, `The attached photo is a reference staff added to their feedback. ${use}`].join('\n'),
      reference: staffReference,
    }
  }
  return {
    prompt: [
      request.prompt,
      `About the attachment: it is two photos side by side. RIGHT: the photo of the poster, the "attached photo" above, for who they are. LEFT: a reference staff added to their feedback. ${use} Draw one single photo, never two side by side.`,
    ].join('\n'),
    reference: { bytes: await pairImages(staffReference.bytes, request.reference.bytes), mimeType: 'image/jpeg' },
  }
}

/** What a photo-only redo carries besides the brief: the post's text and the photo it replaces. */
export type RedrawContext = { postText?: string | null; previousPhoto?: AvatarReference | null }

const PANEL_NAMES = ['LEFT', 'MIDDLE', 'RIGHT']

/**
 * A photo-only redo: the post's text, and up to three pictures in one
 * attachment (the poster for the face, the photo being replaced, a staff
 * reference), each named by its place, left to right.
 */
export async function withRedrawContext(
  request: { prompt: string; reference: AvatarReference | null },
  context: RedrawContext & { staffReference?: AvatarReference | null },
): Promise<{ prompt: string; reference: AvatarReference | null }> {
  const panels: Array<{ bytes: Buffer; role: string }> = []
  if (request.reference) panels.push({ bytes: request.reference.bytes, role: 'the photo of the poster, the "attached photo" above: only for who they are (the face)' })
  if (context.previousPhoto) panels.push({ bytes: context.previousPhoto.bytes, role: 'the previous photo drawn for this post, which staff sent back. Draw a new photo for the same post: change what the staff feedback asks for, and where there is no feedback make it clearly different (another moment, angle and framing); never return it as it is' })
  if (context.staffReference) panels.push({ bytes: context.staffReference.bytes, role: 'a reference staff added to their feedback: use it the way the feedback says (pose, framing, outfit, place, light or mood); the face of anyone in it must not appear' })
  const lines = [request.prompt]
  if (context.postText?.trim()) lines.push(`The post this photo goes with says: ${JSON.stringify(context.postText.trim())}. The photo fits what it says.`)
  if (panels.length === 0) return { prompt: lines.join('\n'), reference: null }
  if (panels.length === 1) {
    lines.push(`About the attachment: it is ${panels[0].role}.`)
    return { prompt: lines.join('\n'), reference: { bytes: panels[0].bytes, mimeType: 'image/jpeg' } }
  }
  const names = panels.length === 2 ? ['LEFT', 'RIGHT'] : PANEL_NAMES
  lines.push(`About the attachment: it is ${panels.length} photos side by side, left to right. ${panels.map((panel, index) => `${names[index]}: ${panel.role}.`).join(' ')} Draw one single photo, never photos side by side.`)
  return { prompt: lines.join('\n'), reference: { bytes: await stripImages(panels.map((panel) => panel.bytes)), mimeType: 'image/jpeg' } }
}

/** Draws and stores the photo. Null when it cannot be drawn or stored; never throws. */
/**
 * A photo intro that shows the profile photo: the profile photo itself, when
 * it shows the face. Null otherwise (the post then gets a drawn photo).
 */
async function profilePhotoForPost(operatorUserId: string): Promise<ReservePostImage | null> {
  const user = await prisma.user.findUnique({ where: { id: operatorUserId }, select: { image: true, operatorAccount: { select: { avatarSpec: true } } } })
  const spec = user?.operatorAccount?.avatarSpec as Partial<AvatarSpec> | null | undefined
  if (!user?.image || spec?.category !== 'face') return null
  const photo = await fetchReference(user.image)
  return photo ? storeReservePostImage(operatorUserId, photo.bytes) : null
}

/** Which library photos a post photo of each kind can be drawn from. */
const LIBRARY_KINDS_BY_POST: Partial<Record<PostPhotoKind, readonly ReferenceKind[]>> = {
  self: ['face'],
  self_faceless: ['person'],
  self_back: ['person'],
  scene: ['thing'],
  friends: ['group'],
}

/**
 * A post photo drawn from an unused reference-library photo of the fitting
 * kind (staff, 2026-11-24: posts use the library as much as it allows): a
 * selfie keeps the poster's face (the library shot on the left, the poster on
 * the right), or gets a new face when the account has none yet, which then
 * fixes it for later posts; a faceless shot keeps the face hidden; a scene
 * becomes another photo of the same kind of thing. Null when the post does
 * not fit (anime account, friends photo, profile-photo intro) or the library
 * has nothing left, and the photo is drawn the usual way.
 */
/** The words a photo description uses for the language people of a country grow up with. */
const OWN_LANGUAGE_WORDS: Readonly<Record<string, RegExp>> = {
  KR: /\b(korean|hangul)\b/i,
  JP: /\b(japanese|hiragana|katakana|kana|kanji)\b/i,
  CN: /\b(chinese|hanzi|pinyin)\b/i,
  TW: /\b(chinese|hanzi|zhuyin)\b/i,
  TH: /\bthai\b/i,
  VN: /\bvietnamese\b/i,
  US: /\benglish\b/i, GB: /\benglish\b/i, AU: /\benglish\b/i, CA: /\benglish\b/i,
  BR: /\bportuguese\b/i, MX: /\bspanish\b/i, ES: /\bspanish\b/i,
  FR: /\bfrench\b/i, DE: /\bgerman\b/i, RU: /\brussian\b/i, ID: /\bindonesian\b/i,
}
const STUDY_MATERIAL = /\b(handwrit\w*|notebook|worksheet|flashcards?|textbook|workbook|practice sheet|study notes?|essay|vocabulary|grammar)\b/i

/**
 * A study photo (a notebook, a worksheet, handwritten practice) of the
 * language the persona grew up with: a Korean practising Korean makes no
 * sense (staff, 2026-11-29). Exported for tests.
 */
export function studiesOwnLanguage(summary: string | null | undefined, country: string | null | undefined): boolean {
  const words = country ? OWN_LANGUAGE_WORDS[country.toUpperCase()] : undefined
  return Boolean(summary && words && STUDY_MATERIAL.test(summary) && words.test(summary))
}

/** Which library photos may be used for this post brief of the account; null when none may. */
async function libraryPostFilter(operatorUserId: string, description: string, options: { staff?: boolean } = {}) {
  const brief = decodePostPhoto(description)
  const kinds = LIBRARY_KINDS_BY_POST[brief.kind]
  // Staff asking for a library redraw may use it on a profile-photo intro too.
  if (!kinds || (brief.profilePhoto && !options.staff)) return null
  const [persona, user] = await Promise.all([
    loadAvatarPersona(operatorUserId),
    prisma.user.findUnique({ where: { id: operatorUserId }, select: { operatorAccount: { select: { avatarSpec: true } } } }),
  ])
  if (!persona) return null
  const spec = user?.operatorAccount?.avatarSpec as Partial<AvatarSpec> | null | undefined
  if (isAnimeSpec(spec)) return null
  const gender: ReferenceGender | null = persona.gender === 'female' || persona.gender === 'male' ? persona.gender : null
  // Never a photo of the opposite season to now where the persona lives (the post goes up within days).
  const avoid = referenceSeasonsToAvoid(persona.country)
  return {
    brief, persona, spec,
    claim: {
      kinds, gender: kinds.includes('thing') ? null : gender,
      // Never a photo of another age or look than the persona (a 20-year-old's pose on a 50-year-old).
      skip: (item: ReferencePhoto) => referenceSeasonClashes(item.attributes, avoid) || referencePersonaFit(item.attributes, persona, referenceKindOf(item)) === 'mismatch' || studiesOwnLanguage(item.summary, persona.country),
      prefer: (item: ReferencePhoto) => referencePersonaFit(item.attributes, persona, referenceKindOf(item)) === 'match',
    },
  }
}

/**
 * Whether a 레퍼런스로 재제작 of this post would find a library photo (checked
 * before the drawing starts), and in Korean what kind of photo it needs, so
 * staff know what to upload when there is none.
 */
export async function libraryPhotoForPost(operatorUserId: string, description: string): Promise<{ available: boolean; need: string }> {
  const brief = decodePostPhoto(description)
  if (!LIBRARY_KINDS_BY_POST[brief.kind]) return { available: false, need: '이 글 사진 종류(화면 캡처 등)는 레퍼런스로 만들 수 없어요' }
  const filter = await libraryPostFilter(operatorUserId, description, { staff: true })
  if (!filter) return { available: false, need: '애니풍 계정은 레퍼런스 짤을 쓰지 않아요' }
  const { kinds, gender, skip } = filter.claim
  const available = (await listReferencePhotos()).some((item) => !item.usedBy
    && kinds.includes(referenceKindOf(item))
    && (!gender || !item.gender || item.gender === gender)
    && !skip(item))
  return { available, need: referenceNeedLabel(kinds, gender, filter.persona) }
}

async function libraryPostRequest(
  operatorUserId: string,
  description: string,
  base: { prompt: string; reference: AvatarReference | null },
  options: { staff?: boolean } = {},
): Promise<
  /** `not_applicable`: this post's photo is never drawn from the library (anime account, screenshot, profile-photo intro). */
  | { status: 'not_applicable' }
  /** `none`: no unused library photo fits it (kind, gender, age, look, season), or it could not be read. */
  | { status: 'none' }
  | { status: 'ok'; request: { prompt: string; reference: AvatarReference }; referenceId: string; summary: string | null }
> {
  const filter = await libraryPostFilter(operatorUserId, description, options)
  if (!filter) return { status: 'not_applicable' }
  const { brief, persona } = filter
  const photo = await claimReferencePhoto({ userId: operatorUserId, kind: 'post', ...filter.claim }).catch(() => null)
  if (!photo) return { status: 'none' }
  try {
    const kind = referenceKindOf(photo)
    const shot = await loadReferenceBytes(photo)
    const poster = (kind === 'face' || kind === 'group') && base.reference ? base.reference : null
    // Hair stays as in the reference: only the face and visible body become the persona's.
    const look = describeAccountFace(persona, seededRandom(`${operatorUserId}:look`))
    const place = brief.place ?? await reservePostPlace(operatorUserId)
    // Most post photos are seen from a few steps back, even from a close library photo.
    const widen = (kind === 'face' || kind === 'person') && widenPostShot(photo.attributes)
    const prompt = [
      ...referenceRecreateLines({
        kind, look, poster: Boolean(poster), fit: brief.description, note: photo.note, widen,
        direction: referenceDirectionLines(photo.attributes, widen ? { distance: WIDE_POST_DISTANCE } : {}), persona: referencePersonaLine(persona),
      }),
      ...(place ? [`It was taken around ${place}.`] : []),
      'Vertical 3:4 image, one single photo (never two side by side). No watermarks, logos, borders or frames.',
    ].join('\n')
    const reference = poster ? { bytes: await pairImages(shot.bytes, poster.bytes), mimeType: 'image/jpeg' } : shot
    return { status: 'ok', request: { prompt, reference }, referenceId: photo.id, summary: photo.summary?.trim() || null }
  } catch (error) {
    console.warn('[operator-post-reserve] library_request_failed', { operatorUserId, referenceId: photo.id, error: error instanceof Error ? error.name : 'unknown' })
    await releaseReferencePhoto(photo.id).catch(() => {})
    return { status: 'none' }
  }
}

/** On a post whose automatic photo waits for a fitting reference-library photo (none was left). */
export const PHOTO_NO_REFERENCE = 'photo_no_reference'

export async function drawReservePostImage(
  operatorUserId: string,
  description: string,
  staffReference?: AvatarReference,
  context?: RedrawContext,
  /** `fromLibrary`: staff asked for a redraw from a reference-library photo; fails when none fits. */
  /** `engine`: 'seedream' when staff picked Seedream 5.5 for this photo (review tool only). */
  /**
   * `onNoReference`: called when an automatic photo (not a staff redo) is left
   * undrawn because no library photo fits it (staff, 2026-11-25: every
   * automatic post photo is drawn from a reference photo, never without one).
   */
  options: { fromLibrary?: boolean; engine?: ImageEngine; onNoReference?: () => void } = {},
): Promise<ReservePostImage | null> {
  try {
    // A redo always draws a new photo.
    if (!options.fromLibrary && !staffReference && !context && decodePostPhoto(description).profilePhoto) {
      const profile = await profilePhotoForPost(operatorUserId)
      if (profile) return profile
    }
    const base = await reservePostImageRequest(operatorUserId, description)
    // A fresh drawing (not a staff redo) always comes from the reference library:
    // with no fitting photo it waits for staff to upload one instead of being drawn without.
    const automatic = !staffReference && !context
    const fromLibrary = options.fromLibrary
      ? await libraryPostRequest(operatorUserId, description, base, { staff: true })
      : automatic ? await libraryPostRequest(operatorUserId, description, base) : null
    if (options.fromLibrary && fromLibrary?.status !== 'ok') return null
    if (automatic && fromLibrary?.status === 'none') {
      console.warn('[operator-post-reserve] no_reference', { operatorUserId })
      options.onNoReference?.()
      return null
    }
    const library = fromLibrary?.status === 'ok' ? fromLibrary : null
    const request = library
      ? library.request
      : context
        ? await withRedrawContext(base, { ...context, staffReference })
        : staffReference ? await withStaffReference(base, staffReference) : base
    const drawn = await requestAvatarImage(request.prompt, { reference: request.reference ?? undefined, ...(options.engine === 'seedream' ? { model: SEEDREAM_IMAGE_MODEL } : {}) })
    if (!drawn.ok) {
      if (library) await releaseReferencePhoto(library.referenceId).catch(() => {})
      console.warn('[operator-post-reserve] image_failed', { operatorUserId, engine: options.engine ?? 'pool', error: drawn.error, detail: drawn.detail })
      return null
    }
    const stored = await storeReservePostImage(operatorUserId, drawn.bytes)
    // Staff see which engine drew each photo; only Seedream's are listed (the pool is the default).
    if (options.engine === 'seedream') await markSeedreamImage(stored.objectKey)
    // The review queue shows posts drawn from the library first.
    if (library) await markReferenceImage(library.referenceId, stored.objectKey).catch(() => {})
    return library?.summary ? { ...stored, photoDescription: library.summary } : stored
  } catch (error) {
    console.warn('[operator-post-reserve] image_failed', { operatorUserId, error: error instanceof Error ? error.name : 'unknown' })
    return null
  }
}
