export const DEFAULT_BUBBLE_DISPLAY_MODE = 'expanded' as const

export type LivePhoneDemoBubbleDisplayMode = 'expanded' | 'collapsed'

export function normalizeLivePhoneDemoBubbleDisplayMode(
  value: unknown,
): LivePhoneDemoBubbleDisplayMode | null {
  if (typeof value !== 'string') return null
  const normalized = value.trim().toLowerCase()
  return normalized === 'expanded' || normalized === 'collapsed'
    ? normalized
    : null
}
