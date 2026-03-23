function parseBooleanFlag(rawValue: string | undefined, defaultValue: boolean): boolean {
  if (rawValue == null) return defaultValue
  const normalized = rawValue.trim().toLowerCase()
  if (!normalized) return defaultValue
  if (['1', 'true', 'on', 'yes'].includes(normalized)) return true
  if (['0', 'false', 'off', 'no'].includes(normalized)) return false
  return defaultValue
}

export const LIVE_SYNC_SHADOW_WRITE_ENABLED = parseBooleanFlag(
  process.env.MINGLE_LIVE_SYNC_SHADOW_WRITE_ENABLED ?? process.env.MINGLE_STT_SHADOW_WRITE_ENABLED,
  true,
)

export const LIVE_SYNC_DELTA_READ_ENABLED = parseBooleanFlag(
  process.env.MINGLE_LIVE_SYNC_DELTA_READ_ENABLED ?? process.env.MINGLE_STT_DELTA_READ_ENABLED,
  true,
)
