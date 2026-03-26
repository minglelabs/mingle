import { canonicalizeSttLanguageCode } from '@/lib/stt-languages'

export const LS_KEY_LANGUAGES = 'mingle_demo_languages'
export const LS_KEY_TEXT_SIZE_LEVEL = 'mingle_demo_text_size_level'
export const LS_KEY_SONIOX_SILENCE_MS = 'mingle_demo_soniox_silence_ms'
export const DEFAULT_TEXT_SIZE_LEVEL = 2
export const DEFAULT_SONIOX_SILENCE_MS = 500
export const MIN_SONIOX_SILENCE_MS = 500
export const MAX_SONIOX_SILENCE_MS = 3000

export interface LivePhoneDemoPersistedPreferences {
  selectedLanguages: string[]
  textSizeLevel: number
  sonioxManualFinalizeSilenceMs: number
}

export function readPersistedIntegerPreference(
  rawValue: string | null,
  fallback: number,
  min: number,
  max: number,
): number {
  if (rawValue === null) return fallback

  const trimmed = rawValue.trim()
  if (trimmed === '') return fallback

  const parsed = Number(trimmed)
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback

  return Math.max(min, Math.min(max, Math.floor(parsed)))
}

function sanitizeSelectedLanguages(rawValue: unknown, fallbackLanguages: string[]): string[] {
  if (!Array.isArray(rawValue)) return [...fallbackLanguages]

  const deduped: string[] = []
  for (const item of rawValue) {
    if (typeof item !== 'string') continue
    const normalized = canonicalizeSttLanguageCode(item)
    if (!normalized || deduped.includes(normalized)) continue
    deduped.push(normalized)
    if (deduped.length >= 5) break
  }

  return deduped.length > 0 ? deduped : [...fallbackLanguages]
}

export function readPersistedLivePhoneDemoPreferences(fallbackLanguages: string[]): LivePhoneDemoPersistedPreferences {
  const next: LivePhoneDemoPersistedPreferences = {
    selectedLanguages: [...fallbackLanguages],
    textSizeLevel: DEFAULT_TEXT_SIZE_LEVEL,
    sonioxManualFinalizeSilenceMs: DEFAULT_SONIOX_SILENCE_MS,
  }

  const storage = typeof globalThis.localStorage === 'undefined' ? null : globalThis.localStorage
  if (!storage) return next

  try {
    const storedLanguages = storage.getItem(LS_KEY_LANGUAGES)
    if (storedLanguages) {
      next.selectedLanguages = sanitizeSelectedLanguages(JSON.parse(storedLanguages), fallbackLanguages)
    }
  } catch {
    next.selectedLanguages = [...fallbackLanguages]
  }

  try {
    next.textSizeLevel = readPersistedIntegerPreference(
      storage.getItem(LS_KEY_TEXT_SIZE_LEVEL),
      DEFAULT_TEXT_SIZE_LEVEL,
      1,
      5,
    )
  } catch { /* ignore */ }

  try {
    next.sonioxManualFinalizeSilenceMs = readPersistedIntegerPreference(
      storage.getItem(LS_KEY_SONIOX_SILENCE_MS),
      DEFAULT_SONIOX_SILENCE_MS,
      MIN_SONIOX_SILENCE_MS,
      MAX_SONIOX_SILENCE_MS,
    )
  } catch { /* ignore */ }

  return next
}
