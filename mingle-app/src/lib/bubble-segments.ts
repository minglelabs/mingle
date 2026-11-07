// Segment-by-segment bubble translation (fill in the blank).
//
// The STT server keeps one bubble open across several Soniox <end> markers and
// reports the text up to each <end> as a committed segment. Each segment is
// translated once, with the whole bubble as context, and the translation of a
// segment never changes afterwards, so text the reader already read stays put.

const MAX_SEGMENTS = 64
const MAX_SEGMENT_CHARS = 2_000

/** Languages written without spaces between words. */
const UNSPACED_LANGUAGE_PREFIXES = ['ja', 'zh', 'th', 'lo', 'my', 'km']

function languageBase(language: string): string {
  return (language || '').trim().toLowerCase().replace('_', '-').split('-')[0] || ''
}

export function joinSegmentTexts(parts: readonly string[], language: string): string {
  const cleaned = parts.map((part) => (part || '').trim()).filter(Boolean)
  const separator = UNSPACED_LANGUAGE_PREFIXES.includes(languageBase(language)) ? '' : ' '
  return cleaned.join(separator)
}

export type BubbleSegmentsPayload = {
  /** Every committed source segment of the bubble, in order. */
  sources: string[]
  /** Per target language, the fixed translations of the leading segments. */
  translations: Record<string, string[]>
}

export function parseBubbleSegments(raw: unknown): BubbleSegmentsPayload | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const record = raw as Record<string, unknown>
  if (!Array.isArray(record.sources)) return null
  const sources = record.sources
    .slice(0, MAX_SEGMENTS)
    .map((value) => (typeof value === 'string' ? value.trim().slice(0, MAX_SEGMENT_CHARS) : ''))
  if (sources.length === 0 || sources.some((value) => !value)) return null

  const translations: Record<string, string[]> = {}
  const rawTranslations = record.translations
  if (rawTranslations && typeof rawTranslations === 'object' && !Array.isArray(rawTranslations)) {
    for (const [language, values] of Object.entries(rawTranslations as Record<string, unknown>)) {
      if (!Array.isArray(values)) continue
      translations[language] = values
        .slice(0, sources.length)
        .map((value) => (typeof value === 'string' ? value.trim().slice(0, MAX_SEGMENT_CHARS) : ''))
    }
  }
  return { sources, translations }
}

export type BubbleSegmentPlan = {
  sources: string[]
  /** Leading segments whose translation is fixed in every target language. */
  fixedCount: number
  fixedTranslations: Record<string, string[]>
  /** Source text of the blank (the segments after fixedCount). */
  blankSourceText: string
}

export function planBubbleSegmentFill(
  payload: BubbleSegmentsPayload,
  targetLanguages: readonly string[],
  sourceLanguage: string,
): BubbleSegmentPlan {
  const fixedCount = targetLanguages.length === 0
    ? 0
    : Math.min(
      payload.sources.length,
      ...targetLanguages.map((language) => payload.translations[language]?.length ?? 0),
    )
  const fixedTranslations: Record<string, string[]> = {}
  for (const language of targetLanguages) {
    fixedTranslations[language] = (payload.translations[language] || []).slice(0, fixedCount)
  }
  return {
    sources: payload.sources,
    fixedCount,
    fixedTranslations,
    blankSourceText: joinSegmentTexts(payload.sources.slice(fixedCount), sourceLanguage),
  }
}

export function isBubbleSegmentPlanComplete(plan: BubbleSegmentPlan): boolean {
  return plan.fixedCount >= plan.sources.length
}

/** Full bubble translation per language: fixed segments followed by the blank. */
export function joinBubbleSegmentTranslations(
  plan: BubbleSegmentPlan,
  blanks: Record<string, string>,
  targetLanguages: readonly string[],
): Record<string, string> {
  const joined: Record<string, string> = {}
  const complete = isBubbleSegmentPlanComplete(plan)
  for (const language of targetLanguages) {
    const blank = (blanks[language] || '').trim()
    if (!complete && !blank) continue
    const text = joinSegmentTexts([...(plan.fixedTranslations[language] || []), blank], language)
    if (text) joined[language] = text
  }
  return joined
}

/**
 * Append a blank's translation to a language's fixed segment list. A blank can
 * cover several segments; the extra slots stay empty so the list stays aligned
 * with the source segments.
 */
export function appendSegmentTranslation(
  existing: readonly string[],
  fixedCount: number,
  coveredUntil: number,
  blank: string,
): string[] {
  const next = existing.slice(0, fixedCount)
  while (next.length < fixedCount) next.push('')
  next.push(blank.trim())
  while (next.length < coveredUntil) next.push('')
  return next
}
