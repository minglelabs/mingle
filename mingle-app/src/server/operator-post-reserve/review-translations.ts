import type { Prisma } from '@prisma/client'
import { canonicalizeTranslationLanguageCode } from '@/lib/translation-languages'

/**
 * Translations staff read while reviewing a latent post, stored on the row as
 * `{ [language]: { text, sourceText } }`. Publishing reuses the ones made from
 * the text being published as the post's default translations, so the same
 * post is not translated twice; a rewritten text leaves them stale and unused.
 */
type Stored = Record<string, { text: string; sourceText: string }>

function stored(value: unknown): Stored {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const result: Stored = {}
  for (const [language, entry] of Object.entries(value)) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue
    const { text, sourceText } = entry as Record<string, unknown>
    if (typeof text === 'string' && text.trim() && typeof sourceText === 'string') result[language] = { text, sourceText }
  }
  return result
}

/** The stored translations made from `sourceText`. */
export function reviewTranslationsFor(value: unknown, sourceText: string): Array<{ language: string; text: string }> {
  return Object.entries(stored(value))
    .filter(([, entry]) => entry.sourceText === sourceText)
    .map(([language, entry]) => ({ language, text: entry.text }))
}

/** The stored value with `language` set to a translation of `sourceText`. */
export function withReviewTranslation(
  value: unknown,
  language: string,
  text: string,
  sourceText: string,
): Prisma.InputJsonObject {
  const key = canonicalizeTranslationLanguageCode(language) || language
  return { ...stored(value), [key]: { text, sourceText } }
}
