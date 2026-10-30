/**
 * The 2nd to 10th photo of a latent post, stored as a JSON list on the
 * reserve row (the first stays in `imageObjectKey`), released with it as the
 * post's extra photos.
 */
export type ReserveExtraImage = { objectKey: string; width: number | null; height: number | null }

export const MAX_RESERVE_EXTRA_IMAGES = 9

function dimension(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : null
}

export function reserveExtraImages(value: unknown): ReserveExtraImage[] {
  if (!Array.isArray(value)) return []
  const result: ReserveExtraImage[] = []
  for (const item of value) {
    if (typeof item !== 'object' || item === null) continue
    const record = item as Record<string, unknown>
    if (typeof record.objectKey !== 'string' || !record.objectKey.startsWith('post-images/')) continue
    if (result.some((image) => image.objectKey === record.objectKey)) continue
    result.push({ objectKey: record.objectKey, width: dimension(record.width), height: dimension(record.height) })
    if (result.length >= MAX_RESERVE_EXTRA_IMAGES) break
  }
  return result
}
