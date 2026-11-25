import sharp from 'sharp'

/**
 * A 64-bit picture fingerprint (difference hash): the photo shrunk to 9x8
 * grey pixels, one bit per neighbour pair (left brighter than right). The
 * same photo re-saved, resized, recompressed or lightly edited gives the
 * same or a nearly same fingerprint, so a photo staff already uploaded is
 * caught even when its file differs (the upload shrinks big photos first).
 */
export async function referenceFingerprint(bytes: Buffer): Promise<string> {
  const { data } = await sharp(bytes, { limitInputPixels: 80_000_000 })
    .rotate()
    .greyscale()
    .resize(9, 8, { fit: 'fill' })
    .raw()
    .toBuffer({ resolveWithObject: true })
  let bits = 0n
  for (let row = 0; row < 8; row += 1) {
    for (let column = 0; column < 8; column += 1) {
      bits = (bits << 1n) | (data[row * 9 + column] > data[row * 9 + column + 1] ? 1n : 0n)
    }
  }
  return bits.toString(16).padStart(16, '0')
}

/** How many of the 64 bits differ. */
export function fingerprintDistance(a: string, b: string): number {
  let diff = BigInt(`0x${a}`) ^ BigInt(`0x${b}`)
  let count = 0
  while (diff) {
    count += Number(diff & 1n)
    diff >>= 1n
  }
  return count
}

/** At most this many bits apart counts as the same photo. */
const SAME_PHOTO_BITS = 5

type Fingerprinted = { fingerprint: string | null; width: number | null; height: number | null }

/**
 * Whether two photos are the same picture: nearly the same fingerprint and
 * about the same shape (a photo and a crop of something else that happens to
 * shrink alike are told apart by their shape).
 */
export function isSamePhoto(a: Fingerprinted, b: Fingerprinted): boolean {
  if (!a.fingerprint || !b.fingerprint) return false
  if (fingerprintDistance(a.fingerprint, b.fingerprint) > SAME_PHOTO_BITS) return false
  if (a.width && a.height && b.width && b.height) {
    const ratio = (a.width / a.height) / (b.width / b.height)
    if (ratio < 0.9 || ratio > 1.11) return false
  }
  return true
}
