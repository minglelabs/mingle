// Tail fill-in-the-blank bubble translation, in three layers.
//
// - fixed: complete sentences already translated. The listener has read them,
//   so they never change.
// - draft: the start of the unfinished part, cut by the model where it can
//   already be translated naturally (a clause, a phrase, whatever fits). It is
//   shown, and the next request may keep or rewrite it.
// - blank: the rest, not translated yet.
//
// Each interim request sends the last fixed piece as context, the draft, and
// the source after the fixed part. The model returns the complete sentences at
// its start (they become fixed) and a new draft. The final request translates
// everything after the fixed part, reusing the draft where it fits.

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
  /** The last fixed piece (the end of `translatedSource`) and its translations: the prompt's only context. */
  contextSource?: string
  contextTranslations?: Record<string, string>
  /** Draft: the start of the source after the fixed part, translated but not fixed. */
  draftSource?: string
  draftTranslations?: Record<string, string>
}

function parseStringRecord(raw: unknown): Record<string, string> {
  const output: Record<string, string> = {}
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return output
  for (const [language, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value === 'string' && value.trim()) output[language] = value.trim().slice(0, MAX_TAIL_CHARS)
  }
  return output
}

export function parseBubbleTail(raw: unknown): BubbleTailPayload | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const record = raw as Record<string, unknown>
  if (typeof record.translatedSource !== 'string') return null
  const contextSource = typeof record.contextSource === 'string' ? record.contextSource.trim().slice(0, MAX_TAIL_CHARS) : ''
  const draftSource = typeof record.draftSource === 'string' ? record.draftSource.trim().slice(0, MAX_TAIL_CHARS) : ''
  return {
    translatedSource: record.translatedSource.trim().slice(0, MAX_TAIL_CHARS),
    translations: parseStringRecord(record.translations),
    ...(contextSource ? { contextSource, contextTranslations: parseStringRecord(record.contextTranslations) } : {}),
    ...(draftSource ? { draftSource, draftTranslations: parseStringRecord(record.draftTranslations) } : {}),
  }
}

export type BubbleTailPlan = {
  fixedSource: string
  fixedTranslations: Record<string, string>
  /** What the prompt shows of the fixed part: its last piece, or all of it. */
  contextSource: string
  contextTranslations: Record<string, string>
  /** The current draft ('' when none, or when it no longer matches the source). */
  draftSource: string
  draftTranslations: Record<string, string>
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
  const contextTranslations = payload.contextTranslations || {}
  const useContext = Boolean(payload.contextSource)
    && fixedSource.endsWith(payload.contextSource as string)
    && targetLanguages.every((language) => Boolean(contextTranslations[language]))
  return {
    fixedSource,
    fixedTranslations,
    contextSource: useContext ? payload.contextSource as string : fixedSource,
    contextTranslations: useContext
      ? Object.fromEntries(targetLanguages.map((language) => [language, contextTranslations[language] as string]))
      : fixedTranslations,
    ...resolveDraft(payload, remainingSource, targetLanguages),
    remainingSource,
    fullText,
    remainingStart,
  }
}

function resolveDraft(
  payload: BubbleTailPayload,
  remainingSource: string,
  targetLanguages: readonly string[],
): { draftSource: string, draftTranslations: Record<string, string> } {
  const draftSource = payload.draftSource || ''
  const draftTranslations = payload.draftTranslations || {}
  const valid = Boolean(draftSource)
    && matchTranslatedTailLength(remainingSource, draftSource) > 0
    && targetLanguages.every((language) => Boolean(draftTranslations[language]))
  if (!valid) return { draftSource: '', draftTranslations: {} }
  return {
    draftSource,
    draftTranslations: Object.fromEntries(targetLanguages.map((language) => [language, draftTranslations[language] as string])),
  }
}

/** Whether the bubble has anything translated yet (fixed or draft). */
export function hasBubbleTailContent(payload: BubbleTailPayload): boolean {
  return Boolean(payload.translatedSource || payload.draftSource)
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

/** What the model answered for the source after the fixed part. */
export type BubbleTailAnswer = {
  /** Translations of the complete sentences at the start (they become fixed). */
  fills: Record<string, string>
  /** Their source, copied by the model. Ignored on a final answer, which covers everything. */
  translatedSource: string
  /** The new draft right after them. */
  draft?: { source: string, translations: Record<string, string> } | null
}

export type BubbleTailResolution = {
  /** What the listener sees: fixed, then the new fixed sentences, then the draft. */
  translations: Record<string, string>
  /** The bubble's new state for the next request (interim answers only). */
  tailFill: BubbleTailPayload | null
}

/** The fixed part plus the draft: what the listener currently sees. */
export function joinShownTailTranslations(plan: BubbleTailPlan, targetLanguages: readonly string[]): Record<string, string> {
  return joinTailTranslations(plan, plan.draftTranslations, targetLanguages)
}

export function resolveBubbleTailAnswer(
  plan: BubbleTailPlan,
  answer: BubbleTailAnswer,
  targetLanguages: readonly string[],
  isFinal: boolean,
): BubbleTailResolution {
  const hasAllFills = targetLanguages.every((language) => Boolean((answer.fills[language] || '').trim()))
  if (isFinal) {
    return {
      translations: hasAllFills
        ? joinTailTranslations(plan, answer.fills, targetLanguages)
        : joinShownTailTranslations(plan, targetLanguages),
      tailFill: null,
    }
  }

  const covered = hasAllFills ? matchTranslatedTailLength(plan.remainingSource, answer.translatedSource) : 0
  const newlyFixed = covered > 0
  const fixedSource = newlyFixed ? extendFixedSource(plan, covered) : plan.fixedSource
  const fixedTranslations = newlyFixed ? joinTailTranslations(plan, answer.fills, targetLanguages) : { ...plan.fixedTranslations }
  const contextSource = newlyFixed ? plan.remainingSource.slice(0, covered).trim() : plan.contextSource
  const contextTranslations = newlyFixed
    ? Object.fromEntries(targetLanguages.map((language) => [language, (answer.fills[language] || '').trim()]))
    : plan.contextTranslations

  // The draft must start right after the new fixed part and cover every language.
  const afterFixed = newlyFixed ? plan.remainingSource.slice(covered).trim() : plan.remainingSource
  const draftSource = (answer.draft?.source || '').trim()
  const draftTranslations = answer.draft?.translations || {}
  const draftValid = Boolean(draftSource)
    && matchTranslatedTailLength(afterFixed, draftSource) > 0
    && targetLanguages.every((language) => Boolean((draftTranslations[language] || '').trim()))
  // A bad answer never takes away a draft the listener is reading, unless new text became fixed.
  const keepOldDraft = !draftValid && !newlyFixed
  const nextDraftSource = draftValid ? draftSource : keepOldDraft ? plan.draftSource : ''
  const nextDraftTranslations: Record<string, string> = draftValid
    ? Object.fromEntries(targetLanguages.map((language) => [language, (draftTranslations[language] || '').trim()]))
    : keepOldDraft ? plan.draftTranslations : {}

  const translations: Record<string, string> = {}
  for (const language of targetLanguages) {
    const text = joinTailTexts([fixedTranslations[language] || '', nextDraftTranslations[language] || ''], language)
    if (text) translations[language] = text
  }
  return {
    translations,
    tailFill: {
      translatedSource: fixedSource,
      translations: fixedTranslations,
      ...(contextSource ? { contextSource, contextTranslations } : {}),
      ...(nextDraftSource ? { draftSource: nextDraftSource, draftTranslations: nextDraftTranslations } : {}),
    },
  }
}
