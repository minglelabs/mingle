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

export function transformedSize(width: number, height: number, transform: ImageTransform) {
  return transform.quarterTurns % 2 === 1 ? { width: height, height: width } : { width, height }
}

// JPEG/WebP keep their type; PNG stays PNG so transparency survives.
export function transformedImageType(type: string): 'image/jpeg' | 'image/png' | 'image/webp' {
  return type === 'image/png' || type === 'image/webp' ? type : 'image/jpeg'
}

function renamedFor(name: string, type: string) {
  const ext = type === 'image/png' ? 'png' : type === 'image/webp' ? 'webp' : 'jpg'
  const base = name.replace(/\.[^./]+$/, '') || 'photo'
  return `${base}.${ext}`
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
  const type = transformedImageType(file.type)
  if (type === 'image/jpeg') {
    context.fillStyle = '#fff'
    context.fillRect(0, 0, size.width, size.height)
  }
  context.translate(size.width / 2, size.height / 2)
  // Flip is applied on screen axes, after the rotation.
  if (transform.flipped) context.scale(-1, 1)
  context.rotate((transform.quarterTurns % 4) * Math.PI / 2)
  context.drawImage(image, -sourceWidth / 2, -sourceHeight / 2)
  const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, type, 0.92))
  if (!blob) throw new Error('image_encode_failed')
  return new File([blob], renamedFor(file.name, type), { type, lastModified: Date.now() })
}
