import convert from 'heic-convert'

/**
 * iPhone photos come as HEIC, which the server's image library (sharp's
 * prebuilt libvips) cannot read: those are turned into JPEG first, in plain
 * JS. Anything else is passed through.
 */
export function isHeic(bytes: Buffer, type?: string | null, name?: string | null): boolean {
  if (type && /image\/hei[cf]/i.test(type)) return true
  if (name && /\.(heic|heif)$/i.test(name)) return true
  // ISO-BMFF "ftyp" box with a HEIC brand.
  if (bytes.length >= 12 && bytes.toString('ascii', 4, 8) === 'ftyp') {
    return /^(heic|heix|hevc|hevx|heim|heis|mif1|msf1)$/.test(bytes.toString('ascii', 8, 12))
  }
  return false
}

export async function readableImageBytes(bytes: Buffer, type?: string | null, name?: string | null): Promise<Buffer> {
  if (!isHeic(bytes, type, name)) return bytes
  const jpeg = await convert({ buffer: bytes as unknown as ArrayBufferLike, format: 'JPEG', quality: 0.92 })
  return Buffer.from(jpeg as ArrayBuffer)
}
