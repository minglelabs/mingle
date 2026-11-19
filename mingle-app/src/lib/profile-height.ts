/** Height on a profile, in whole centimetres. Typed by the user; nothing checks it. */
export const MIN_HEIGHT_CM = 120
export const MAX_HEIGHT_CM = 230

export function normalizeHeightCm(value: unknown): number | null {
  const number = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : Number.NaN
  if (!Number.isFinite(number)) return null
  const rounded = Math.round(number)
  return rounded >= MIN_HEIGHT_CM && rounded <= MAX_HEIGHT_CM ? rounded : null
}
