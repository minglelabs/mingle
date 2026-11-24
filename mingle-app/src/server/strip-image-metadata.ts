import sharp from 'sharp'

export type StripImageMetadataOptions = {
  /**
   * Output image format:
   * - 'preserve' (default): keeps the original format for PNG, WebP, JPEG; other formats fall back to JPEG.
   * - 'jpeg': force re-encode as JPEG (flattening alpha onto white background).
   * - 'png': force re-encode as PNG (lossless, preserving alpha).
   * @default 'preserve'
   */
  format?: 'preserve' | 'jpeg' | 'png'
  /**
   * Maximum width / height dimension (fit: 'inside', withoutEnlargement: true).
   * When omitted (undefined), no resizing is performed, preserving original pixel resolution.
   */
  maxDimension?: number
  /**
   * Compression quality for lossy formats (JPEG/WebP).
   * @default 95
   */
  quality?: number
}

/**
 * Strip all non-pixel metadata from an image buffer.
 *
 * ChatGPT-generated images and user-uploaded photos embed C2PA (Content Credentials)
 * inside JUMBF chunks (JPEG APP11 / PNG caBX) and EXIF (including GPS data) / IPTC / XMP
 * records. Re-encoding the pixel data through sharp/libvips discards every ancillary
 * chunk and metadata segment, including:
 *
 *   - C2PA / JUMBF (Content Credentials / AI metadata)
 *   - IPTC-IIM and IPTC Core (Digital Source Type, etc.)
 *   - XMP (dc:description, Iptc4xmpExt:DigitalSourceType, …)
 *   - EXIF (orientation, camera info, GPS coordinates, …)
 *   - ICC colour profiles (re-encoded in sRGB)
 *
 * Throws an error if the input buffer cannot be parsed or decoded by sharp.
 *
 * @param input  Raw image bytes (any supported format).
 * @param opts   Configuration options.
 * @returns      Clean image buffer with zero non-pixel metadata.
 */
export async function stripImageMetadata(
  input: Buffer | Uint8Array,
  opts: StripImageMetadataOptions = {},
): Promise<Buffer> {
  const {
    format = 'preserve',
    maxDimension,
    quality = 95,
  } = opts

  const pipeline = sharp(input, { limitInputPixels: 80_000_000, animated: false })
  pipeline.rotate() // apply EXIF orientation then drop it

  if (typeof maxDimension === 'number' && maxDimension > 0) {
    pipeline.resize({
      width: maxDimension,
      height: maxDimension,
      fit: 'inside',
      withoutEnlargement: true,
    })
  }

  if (format === 'png') {
    pipeline.png({ compressionLevel: 6 })
  } else if (format === 'jpeg') {
    pipeline.flatten({ background: '#ffffff' }).jpeg({ quality })
  } else {
    // 'preserve': inspect original format
    const info = await pipeline.metadata()
    if (info.format === 'png') {
      pipeline.png({ compressionLevel: 6 })
    } else if (info.format === 'webp') {
      pipeline.webp({ quality })
    } else if (info.format === 'jpeg') {
      pipeline.jpeg({ quality })
    } else {
      pipeline.flatten({ background: '#ffffff' }).jpeg({ quality })
    }
  }

  return await pipeline.toBuffer()
}
