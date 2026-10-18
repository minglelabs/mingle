import sharp from 'sharp'
import { prisma } from '@/lib/prisma'
import { requestAvatarImage } from '@/server/operator-avatars/generate'
import { phonePhotoRealism } from '@/server/operator-avatars/photo-realism'
import { newPostImageKey } from '@/server/posts/post-image-keys'
import { putPostImage } from '@/server/posts/post-image-storage'

/**
 * The photo of a latent post, drawn when the post is published. The post
 * generator only writes what the photo shows; this adds what makes it look
 * like a phone snapshot and forbids people, so an account's posts never show
 * a face that would have to match its profile picture.
 */
export function buildPostImagePrompt(description: string, place: string | null = null, random: () => number = Math.random): string {
  if (isScreenshot(description)) return buildScreenshotPrompt(description, place)
  return [
    'A casual photo someone took on their phone and posted on social media.',
    `It shows: ${description}`,
    ...(place ? [`Taken in ${place}: the street, shops, packaging and objects look like that place, and any writing that happens to be visible is in the local language and script, small and incidental.`] : []),
    'It must look like a real, unedited snapshot from an ordinary person\'s phone gallery.',
    phonePhotoRealism(random, { people: false }),
    `No face and no recognizable person in the image; a hand or a person seen from far behind is fine. Not a photo of a phone, tablet or computer screen. ${random() < 0.75 ? 'Vertical 3:4' : 'Horizontal 4:3'} image, like a phone photo. No captions, watermarks, logos, brand names, borders or frames.`,
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
    const drawn = await requestAvatarImage(buildPostImagePrompt(description, place))
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
