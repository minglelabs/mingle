/**
 * Stored pixel size of a post / draft image.
 *
 * The upload routes (POST /posts/images, POST /posts/{id}/image) return the
 * width/height sharp produced; the create / edit / draft routes accept that
 * pair back so the feed card can keep the aspect ratio before the image
 * decodes. The values are layout hints only, never trusted for anything else,
 * and are bounded by the upload pipeline's resize edge.
 */

/** Longest edge the upload pipeline ever stores (sharp `resize` bound). */
export const POST_IMAGE_MAX_EDGE = 2048

export type ImageDimensions = { imageWidth: number; imageHeight: number }

function isEdge(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= POST_IMAGE_MAX_EDGE
}

/**
 * Read `imageWidth` / `imageHeight` from a request body. Both must be integers
 * in [1, POST_IMAGE_MAX_EDGE]; anything else (missing, partial, out of range)
 * yields null so the row stores "unknown" rather than a bad ratio.
 */
export function parseImageDimensions(input: Record<string, unknown>): ImageDimensions | null {
  const { imageWidth, imageHeight } = input
  if (!isEdge(imageWidth) || !isEdge(imageHeight)) return null
  return { imageWidth, imageHeight }
}

/** The dimension columns to write alongside an image key (null clears them). */
export function imageDimensionColumns(dimensions: ImageDimensions | null): {
  imageWidth: number | null
  imageHeight: number | null
} {
  return {
    imageWidth: dimensions?.imageWidth ?? null,
    imageHeight: dimensions?.imageHeight ?? null,
  }
}
