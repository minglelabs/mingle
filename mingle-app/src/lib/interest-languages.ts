import { canonicalizeSttLanguageCode, type SttLanguageCode } from '@/lib/stt-languages'

/**
 * 관심 언어: the languages of the people a user mostly wants to talk with,
 * each with the user's own level of it, shown as 1-5 dots on the profile.
 * Stored as two parallel columns (codes, levels) so a feed or search can
 * match on the codes alone.
 */

export const MAX_INTEREST_LANGUAGES = 3
export const LANGUAGE_LEVEL_COUNT = 5

export type InterestLanguage = { code: SttLanguageCode; level: number }

export function clampLanguageLevel(value: unknown): number {
  const level = typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : 1
  return Math.min(LANGUAGE_LEVEL_COUNT, Math.max(1, level))
}

/** Deduped, at most three, never one of `exclude` (the user's own languages). */
export function sanitizeInterestLanguages(value: unknown, exclude: readonly string[] = []): InterestLanguage[] {
  if (!Array.isArray(value)) return []
  const excluded = new Set(exclude.map((code) => canonicalizeSttLanguageCode(code)).filter(Boolean))
  const result: InterestLanguage[] = []
  for (const item of value) {
    if (typeof item !== 'object' || item === null) continue
    const record = item as { code?: unknown; level?: unknown }
    const code = typeof record.code === 'string' ? canonicalizeSttLanguageCode(record.code) : ''
    if (!code || excluded.has(code) || result.some((entry) => entry.code === code)) continue
    result.push({ code, level: clampLanguageLevel(record.level) })
    if (result.length >= MAX_INTEREST_LANGUAGES) break
  }
  return result
}

export function zipInterestLanguages(codes: readonly string[] | null | undefined, levels: readonly number[] | null | undefined): InterestLanguage[] {
  return sanitizeInterestLanguages((codes ?? []).map((code, index) => ({ code, level: levels?.[index] })))
}

export function unzipInterestLanguages(languages: readonly InterestLanguage[]): {
  interestLanguages: string[]
  interestLanguageLevels: number[]
} {
  return {
    interestLanguages: languages.map((entry) => entry.code),
    interestLanguageLevels: languages.map((entry) => entry.level),
  }
}
