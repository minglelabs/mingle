import sharp from 'sharp'
import { prisma } from '@/lib/prisma'
import type { AdminContext } from '@/server/admin/guard'
import { writeAdminAudit } from '@/server/admin/audit'
import { requestAvatarImage, type AvatarReference } from '@/server/operator-avatars/generate'
import { decodePostPhoto } from '@/server/operator-post-reserve/post-photo'
import { buildPostImagePrompt, reservePostPerson, reservePostPlace, storeReservePostImage, type PostPhotoPerson } from '@/server/operator-post-reserve/post-image'
import { isOwnedPostImageKey } from '@/server/posts/post-image-keys'
import { getPostImage } from '@/server/posts/post-image-storage'
import { OPERATOR_POST_PHOTO_MAX_BYTES } from './edit'

const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const
const MAX_NOTE_LENGTH = 500
const PANEL_HEIGHT = 1024
const PANEL_GAP = 24

/** Whose face the redrawn reference photo shows. */
export type RedrawFace = 'poster' | 'new'
/** What happens to writing that shows on the reference photo (subtitles, stickers, captions). */
export type RedrawText = 'translate' | 'remove' | 'keep'

export type RedrawOptions = { face: RedrawFace; text: RedrawText; note: string }

export type RedrawCandidate = { objectKey: string; width: number; height: number }
export type RedrawResult = ({ ok: true } & RedrawCandidate) | { ok: false; error: string; status: number }

export function parseRedrawFace(value: unknown): RedrawFace {
  return value === 'new' ? 'new' : 'poster'
}

export function parseRedrawText(value: unknown): RedrawText {
  return value === 'remove' || value === 'keep' ? value : 'translate'
}

function languageName(code: string | null): string | null {
  if (!code) return null
  try {
    return new Intl.DisplayNames(['en'], { type: 'language' }).of(code) ?? null
  } catch {
    return null
  }
}

const TEXT_LINES: Record<RedrawText, (language: string | null) => string> = {
  translate: (language) => language
    ? `Writing that is part of the photo itself (subtitles, captions or stickers burned into it) stays where it is, in the same style and size, but is rewritten in natural ${language} with the same meaning. Every word spelled correctly.`
    : 'Writing that is part of the photo itself (subtitles, captions or stickers burned into it) is left out.',
  remove: () => 'Writing that is part of the photo itself (subtitles, captions, stickers) is left out: the photo shows no added text at all.',
  keep: () => 'Writing that is part of the photo itself (subtitles, captions or stickers burned into it) stays as it is.',
}

/**
 * The prompt that redraws a reference photo staff uploaded: the same shot
 * (pose, framing, outfit, hair, place, light), with the face swapped for the
 * account's person or a new ordinary face, never the face of whoever is in
 * the reference. `paired` means the attached image is the reference on the
 * left and a photo of the poster on the right.
 */
export function buildReferenceRedrawPrompt(input: {
  options: RedrawOptions
  person: PostPhotoPerson | null
  paired: boolean
  language: string | null
  vertical: boolean
}): string {
  const { options, person, paired, language, vertical } = input
  const source = paired ? 'the LEFT photo of the attached image' : 'the attached photo'
  const faceLines = options.face === 'poster' && paired
    ? [
        'The attached image is two photos side by side. LEFT: the reference shot to recreate. RIGHT: the poster, the person this account belongs to.',
        'The person in the new photo is the poster from the RIGHT photo: the same eye shape and eyelids, nose, mouth, jawline, skin tone and apparent ethnicity, so anyone would say it is the same person. Take nothing else from the RIGHT photo (no background, clothes, pose or light).',
      ]
    : options.face === 'poster' && person
      ? [`The person in the new photo is the poster: ${person.look}.`]
      : ['The person in the new photo has a new, ordinary everyday face of their own; nobody looks like a celebrity or a model.']
  return [
    `Recreate ${source} as a new phone photo.`,
    ...faceLines,
    'Keep from the reference: the composition and camera angle, the pose and gesture, the hairstyle and hair color, the outfit and accessories, the place and background, and the light.',
    'The face must NOT be the face of the person in the reference photo: it must not resemble them, so nobody could recognize them in the new photo.',
    'If the reference is a screenshot of an app or a video (top bar, back or share buttons, usernames, follow buttons, likes, captions under the photo, timers, progress bars), draw only the photo itself, edge to edge, with none of that interface.',
    TEXT_LINES[options.text](language),
    ...(options.note ? [`Staff note: ${options.note}`] : []),
    'It must look like a real, unedited snapshot from an ordinary person\'s phone, not a photoshoot. Everyone in the image is an adult.',
    `${vertical ? 'Vertical 3:4' : 'Horizontal 4:3'} image, one single photo (never two side by side). No watermarks, logos, brand names, borders or frames.`,
  ].join('\n')
}

/** The reference and the poster's photo side by side in one image: the image route takes one attachment. */
async function pairImages(left: Buffer, right: Buffer): Promise<Buffer> {
  const [a, b] = await Promise.all([left, right].map((bytes) => sharp(bytes, { limitInputPixels: 80_000_000 })
    .rotate()
    .resize({ height: PANEL_HEIGHT })
    .jpeg({ quality: 90 })
    .toBuffer({ resolveWithObject: true })))
  return sharp({ create: { width: a.info.width + PANEL_GAP + b.info.width, height: PANEL_HEIGHT, channels: 3, background: '#ffffff' } })
    .composite([{ input: a.data, left: 0, top: 0 }, { input: b.data, left: a.info.width + PANEL_GAP, top: 0 }])
    .jpeg({ quality: 90 })
    .toBuffer()
}

async function readReference(file: FormDataEntryValue | null): Promise<Buffer | null | 'invalid'> {
  if (file === null || file === '') return null
  if (!(file instanceof File) || file.size === 0) return null
  if (!(PHOTO_TYPES as readonly string[]).includes(file.type) || file.size > OPERATOR_POST_PHOTO_MAX_BYTES) return 'invalid'
  return Buffer.from(await file.arrayBuffer())
}

/**
 * Draws a new photo for an operator's post and stores it as a candidate; the
 * post keeps its photo until staff apply the candidate. With a reference
 * photo, that shot is redrawn with the account's face; without one, the
 * post's own photo brief is drawn again (or the current photo, when the post
 * has no brief).
 */
export async function redrawOperatorPostPhoto(
  ctx: AdminContext,
  postId: string,
  input: { reference: FormDataEntryValue | null; face: RedrawFace; text: RedrawText; note: unknown },
): Promise<RedrawResult> {
  const post = await prisma.post.findUnique({
    where: { id: postId },
    select: { id: true, authorId: true, imageObjectKey: true, sourceLanguage: true, author: { select: { isOperator: true, primaryLanguages: true } } },
  })
  if (!post?.author.isOperator) return { ok: false, error: 'not_found', status: 404 }
  const note = typeof input.note === 'string' ? input.note.trim().slice(0, MAX_NOTE_LENGTH) : ''
  const reference = await readReference(input.reference)
  if (reference === 'invalid') return { ok: false, error: 'invalid_image', status: 400 }

  let prompt: string
  let attachment: AvatarReference | undefined
  try {
    if (reference) {
      const meta = await sharp(reference, { limitInputPixels: 80_000_000 }).rotate().metadata()
      const vertical = (meta.height ?? 1) >= (meta.width ?? 1)
      const withPerson = input.face === 'poster' ? await reservePostPerson(post.authorId) : null
      const paired = Boolean(withPerson?.reference)
      const options: RedrawOptions = { face: input.face, text: input.text, note }
      const language = languageName(post.sourceLanguage ?? post.author.primaryLanguages[0] ?? null)
      prompt = buildReferenceRedrawPrompt({ options, person: withPerson?.person ?? null, paired, language, vertical })
      attachment = { bytes: paired ? await pairImages(reference, withPerson!.reference!.bytes) : reference, mimeType: 'image/jpeg' }
    } else {
      const origin = await prisma.operatorPostReserve.findFirst({ where: { postId: post.id, state: 'published' }, orderBy: { updatedAt: 'desc' }, select: { imagePrompt: true } })
      if (origin?.imagePrompt) {
        const place = await reservePostPlace(post.authorId)
        const withPerson = decodePostPhoto(origin.imagePrompt).kind === 'scene' ? null : await reservePostPerson(post.authorId)
        prompt = [buildPostImagePrompt(origin.imagePrompt, place, Math.random, withPerson?.person ?? null), ...(note ? [`Staff note: ${note}`] : [])].join('\n')
        attachment = withPerson?.reference ?? undefined
      } else if (post.imageObjectKey) {
        prompt = [
          'Draw a new version of the attached phone photo: the same subject, place and mood, as if taken again a moment later, with a slightly different angle and pose. The same person if one is shown.',
          ...(note ? [`Staff note: ${note}`] : []),
          'It must look like a real, unedited snapshot from an ordinary person\'s phone. No captions, watermarks, logos, borders or frames.',
        ].join('\n')
        attachment = { bytes: Buffer.from(await getPostImage(post.imageObjectKey)), mimeType: 'image/jpeg' }
      } else {
        return { ok: false, error: 'no_brief', status: 400 }
      }
    }
  } catch {
    return { ok: false, error: 'invalid_image', status: 400 }
  }

  const drawn = await requestAvatarImage(prompt, { reference: attachment })
  await writeAdminAudit(ctx, {
    action: 'operator_post.redraw_photo',
    operatorUserId: post.authorId,
    targetType: 'post',
    targetId: post.id,
    metadata: { reference: Boolean(reference), face: input.face, text: input.text, ok: drawn.ok, ...(drawn.ok ? {} : { error: drawn.error, detail: drawn.detail ?? null }) },
  })
  if (!drawn.ok) return { ok: false, error: drawn.error === 'image_refused' ? 'image_refused' : 'draw_failed', status: 502 }
  try {
    const stored = await storeReservePostImage(post.authorId, drawn.bytes)
    return { ok: true, ...stored }
  } catch {
    return { ok: false, error: 'draw_failed', status: 502 }
  }
}

/** Whether `key` is a candidate photo drawn for this operator post (its author's post-image key). */
export async function candidateOwner(postId: string, key: unknown): Promise<string | null> {
  const post = await prisma.post.findUnique({ where: { id: postId }, select: { authorId: true, author: { select: { isOperator: true } } } })
  return post?.author.isOperator && isOwnedPostImageKey(key, post.authorId) ? key : null
}

/** Puts a drawn candidate on the post as its main photo. */
export async function applyOperatorPostPhoto(ctx: AdminContext, postId: string, body: Record<string, unknown>): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  const key = await candidateOwner(postId, body.objectKey)
  if (!key) return { ok: false, error: 'not_found', status: 404 }
  let meta: sharp.Metadata
  try {
    meta = await sharp(Buffer.from(await getPostImage(key))).metadata()
  } catch {
    return { ok: false, error: 'not_found', status: 404 }
  }
  const post = await prisma.post.update({ where: { id: postId }, data: { imageObjectKey: key, imageWidth: meta.width ?? null, imageHeight: meta.height ?? null }, select: { authorId: true } })
  await writeAdminAudit(ctx, { action: 'operator_post.edit_photo', operatorUserId: post.authorId, targetType: 'post', targetId: postId, metadata: { redrawn: true } })
  return { ok: true }
}
