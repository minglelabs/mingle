// Tail fill-in-the-blank bubble translation.
//
// While a bubble is still open, the leading part of its source that already
// has a translation is fixed: the listener has read it, so it never changes.
// Each interim request asks the model to translate only the complete sentences
// of the rest (the tail) and to say which part of the tail it translated; an
// unfinished sentence stays untranslated until it is finished. The final
// request translates the whole remaining tail.

const MAX_TAIL_CHARS = 8_000

/** Languages written without spaces between words. */
const UNSPACED_LANGUAGE_PREFIXES = ['ja', 'zh', 'th', 'lo', 'my', 'km']

function languageBase(language: string): string {
  return (language || '').trim().toLowerCase().replace('_', '-').split('-')[0] || ''
}

export function joinTailTexts(parts: readonly string[], language: string): string {
  const cleaned = parts.map((part) => (part || '').trim()).filter(Boolean)
  const separator = UNSPACED_LANGUAGE_PREFIXES.includes(languageBase(language)) ? '' : ' '
  return cleaned.join(separator)
}

export type BubbleTailPayload = {
  /** Leading part of the bubble's source that has fixed translations ('' when none yet). */
  translatedSource: string
  /** Per target language, the fixed translation of `translatedSource`. */
  translations: Record<string, string>
}

export function parseBubbleTail(raw: unknown): BubbleTailPayload | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const record = raw as Record<string, unknown>
  if (typeof record.translatedSource !== 'string') return null
  const translations: Record<string, string> = {}
  const rawTranslations = record.translations
  if (rawTranslations && typeof rawTranslations === 'object' && !Array.isArray(rawTranslations)) {
    for (const [language, value] of Object.entries(rawTranslations as Record<string, unknown>)) {
      if (typeof value === 'string' && value.trim()) translations[language] = value.trim().slice(0, MAX_TAIL_CHARS)
    }
  }
  return { translatedSource: record.translatedSource.trim().slice(0, MAX_TAIL_CHARS), translations }
}

export type BubbleTailPlan = {
  fixedSource: string
  fixedTranslations: Record<string, string>
  /** Source after the fixed part: what this request translates (or part of it). */
  remainingSource: string
  /** The bubble's trimmed text the plan was made from. */
  fullText: string
  /** Index in `fullText` where `remainingSource` starts. */
  remainingStart: number
}

/**
 * Split the bubble's current text into the fixed part and the tail. Returns
 * null when the tail mode cannot keep its promise (a target language has no
 * fixed translation yet), so the caller translates the whole bubble instead.
 */
export function planBubbleTail(
  payload: BubbleTailPayload,
  text: string,
  targetLanguages: readonly string[],
): BubbleTailPlan | null {
  const fullText = text.trim()
  const fixedSource = payload.translatedSource
  const fixedTranslations: Record<string, string> = {}
  if (fixedSource) {
    for (const language of targetLanguages) {
      const fixed = payload.translations[language]
      if (!fixed) return null
      fixedTranslations[language] = fixed
    }
  }
  // Interim STT text can still be revised a little; the fixed part keeps its length.
  const cut = Math.min(fixedSource.length, fullText.length)
  const rest = fullText.slice(cut)
  const remainingStart = cut + (rest.length - rest.trimStart().length)
  const remainingSource = fullText.slice(remainingStart).trimEnd()
  return { fixedSource, fixedTranslations, remainingSource, fullText, remainingStart }
}

/** Fixed source after this request: the old fixed part plus `coveredLength` chars of the tail. */
export function extendFixedSource(plan: BubbleTailPlan, coveredLength: number): string {
  return plan.fullText.slice(0, plan.remainingStart + Math.max(0, coveredLength)).trim()
}

/**
 * Length of the leading part of `remaining` that the model says it translated.
 * Whitespace is ignored when matching; -1 when the model's text is not a prefix.
 */
export function matchTranslatedTailLength(remaining: string, translatedPart: string): number {
  const target = translatedPart.replace(/\s+/g, '')
  if (!target) return 0
  let matched = 0
  for (let index = 0; index < remaining.length; index += 1) {
    const char = remaining[index] as string
    if (/\s/.test(char)) continue
    if (char !== target[matched]) return -1
    matched += 1
    if (matched === target.length) return index + 1
  }
  return -1
}

/** Fixed translations followed by the tail's fill, per language. */
export function joinTailTranslations(
  plan: BubbleTailPlan,
  fills: Record<string, string>,
  targetLanguages: readonly string[],
): Record<string, string> {
  const joined: Record<string, string> = {}
  for (const language of targetLanguages) {
    const text = joinTailTexts([plan.fixedTranslations[language] || '', fills[language] || ''], language)
    if (text) joined[language] = text
  }
  return joined
}
