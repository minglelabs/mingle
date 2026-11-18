// Rotate / mirror a picked photo before it is sent. The edit is baked into a
// new file (canvas re-encode) so the server, the bubble and the viewer all see
// the photo exactly as previewed.

export type ImageTransform = { quarterTurns: number; flipped: boolean }

export const IDENTITY_IMAGE_TRANSFORM: ImageTransform = { quarterTurns: 0, flipped: false }

// quarterTurns counts clockwise quarter turns, kept in 0..3.
export function rotateLeft(transform: ImageTransform): ImageTransform {
  return { ...transform, quarterTurns: (transform.quarterTurns + 3) % 4 }
}

// Mirrors the photo as it is shown now (left ↔ right on screen).
export function flipHorizontal(transform: ImageTransform): ImageTransform {
  return { ...transform, flipped: !transform.flipped }
}

export function isIdentityTransform(transform: ImageTransform): boolean {
  return transform.quarterTurns % 4 === 0 && !transform.flipped
}

// The server stores every photo as a JPEG of at most 2048px on the long edge
// (white behind transparency), so the edit is baked the same way. Drawing at
// full size would also break on large phone photos: iOS WebKit caps a canvas at
// ~16.7M pixels (a 48MP photo is 48M) and toBlob then fails.
export const TRANSFORM_MAX_EDGE_PX = 2048

export function transformedSize(width: number, height: number, transform: ImageTransform) {
  const scale = Math.min(1, TRANSFORM_MAX_EDGE_PX / Math.max(width, height))
  const w = Math.max(1, Math.round(width * scale))
  const h = Math.max(1, Math.round(height * scale))
  return transform.quarterTurns % 2 === 1 ? { width: h, height: w, scale } : { width: w, height: h, scale }
}

function renamedFor(name: string) {
  return `${name.replace(/\.[^./]+$/, '') || 'photo'}.jpg`
}

function loadImage(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('image_load_failed'))
    image.src = url
  })
}

// Returns the original file when nothing changed. Draws the decoded image
// (browsers apply EXIF orientation when decoding), so the result is upright as
// previewed and carries no stale orientation tag.
export async function applyImageTransform(file: File, url: string, transform: ImageTransform): Promise<File> {
  if (isIdentityTransform(transform)) return file
  const image = await loadImage(url)
  const sourceWidth = image.naturalWidth
  const sourceHeight = image.naturalHeight
  if (!sourceWidth || !sourceHeight) throw new Error('image_load_failed')
  const size = transformedSize(sourceWidth, sourceHeight, transform)
  const canvas = document.createElement('canvas')
  canvas.width = size.width
  canvas.height = size.height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('canvas_unavailable')
  context.fillStyle = '#fff'
  context.fillRect(0, 0, size.width, size.height)
  context.translate(size.width / 2, size.height / 2)
  // Flip is applied on screen axes, after the rotation.
  if (transform.flipped) context.scale(-1, 1)
  context.rotate((transform.quarterTurns % 4) * Math.PI / 2)
  const drawWidth = sourceWidth * size.scale
  const drawHeight = sourceHeight * size.scale
  context.drawImage(image, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight)
  const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.92))
  if (!blob || !blob.size) throw new Error('image_encode_failed')
  return new File([blob], renamedFor(file.name), { type: 'image/jpeg', lastModified: Date.now() })
}
