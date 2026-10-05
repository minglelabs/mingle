import sharp from 'sharp'
import { prisma } from '@/lib/prisma'
import { requestAvatarImage } from '@/server/operator-avatars/generate'
import { newPostImageKey } from '@/server/posts/post-image-keys'
import { putPostImage } from '@/server/posts/post-image-storage'

/**
 * The photo of a latent post, drawn when the post is published. The post
 * generator only writes what the photo shows; this adds what makes it look
 * like a phone snapshot and forbids people, so an account's posts never show
 * a face that would have to match its profile picture.
 */
export function buildPostImagePrompt(description: string, place: string | null = null): string {
  return [
    'A casual photo someone took on their phone and posted on social media.',
    `It shows: ${description}`,
    ...(place ? [`Taken in ${place}: the street, shops, packaging and objects look like that place, and any writing that happens to be visible is in the local language and script, small and incidental.`] : []),
    'It must look like a real, unedited snapshot from an ordinary person\'s phone gallery: slightly off-center or tilted, ordinary uneven light, a bit of everyday clutter, not a studio, stock or advertising photo.',
    'No face and no recognizable person in the image; a hand or a person seen from far behind is fine. Square 1:1 image. No captions, watermarks, logos, brand names, borders or frames.',
  ].join('\n')
}

export type ReservePostImage = { objectKey: string; width: number; height: number }

/** Draws and stores the photo. Null when it cannot be drawn or stored; never throws. */
export async function drawReservePostImage(operatorUserId: string, description: string): Promise<ReservePostImage | null> {
  try {
    const author = await prisma.user.findUnique({ where: { id: operatorUserId }, select: { locationCity: true, locationCountry: true } })
    const place = [author?.locationCity, author?.locationCountry].filter(Boolean).join(', ') || null
    const drawn = await requestAvatarImage(buildPostImagePrompt(description, place))
    if (!drawn.ok) {
      console.warn('[operator-post-reserve] image_failed', { operatorUserId, error: drawn.error, detail: drawn.detail })
      return null
    }
    const image = await sharp(drawn.bytes, { limitInputPixels: 80_000_000 })
      .resize({ width: 1280, height: 1280, fit: 'inside', withoutEnlargement: true })
      .flatten({ background: '#ffffff' })
      .jpeg({ quality: 85 })
      .toBuffer({ resolveWithObject: true })
    const objectKey = newPostImageKey(operatorUserId)
    await putPostImage(objectKey, image.data)
    return { objectKey, width: image.info.width, height: image.info.height }
  } catch (error) {
    console.warn('[operator-post-reserve] image_failed', { operatorUserId, error: error instanceof Error ? error.name : 'unknown' })
    return null
  }
}
