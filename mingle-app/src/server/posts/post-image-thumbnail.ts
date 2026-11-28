import sharp from 'sharp'
import { POST_IMAGE_THUMBNAIL_EDGE } from '@/lib/post-image-thumbnail'

// Small copies of post photos for grid tiles. Made on first request and kept
// in memory: an object key never changes its bytes (a new photo gets a new
// key), so a kept copy is never stale. About 20-40 KB each.

const MAX_KEPT = 600
const kept = new Map<string, Uint8Array>()
const inFlight = new Map<string, Promise<Uint8Array>>()

async function shrink(bytes: Uint8Array): Promise<Uint8Array> {
  const out = await sharp(bytes, { limitInputPixels: 80_000_000 })
    .rotate()
    .resize({ width: POST_IMAGE_THUMBNAIL_EDGE, height: POST_IMAGE_THUMBNAIL_EDGE, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 72, mozjpeg: true })
    .toBuffer()
  return new Uint8Array(out)
}

/** The small copy for `key`; `load` reads the stored photo when no copy is kept. */
export async function getPostImageThumbnail(key: string, load: () => Promise<Uint8Array>): Promise<Uint8Array> {
  const hit = kept.get(key)
  if (hit) {
    // Most recently used goes last; the first entry is the one dropped.
    kept.delete(key)
    kept.set(key, hit)
    return hit
  }
  const running = inFlight.get(key)
  if (running) return running
  const made = load().then(shrink).then((thumbnail) => {
    kept.set(key, thumbnail)
    if (kept.size > MAX_KEPT) {
      const oldest = kept.keys().next().value
      if (oldest !== undefined) kept.delete(oldest)
    }
    return thumbnail
  }).finally(() => { inFlight.delete(key) })
  inFlight.set(key, made)
  return made
}

/** Tests only. */
export function clearPostImageThumbnails(): void {
  kept.clear()
  inFlight.clear()
}
