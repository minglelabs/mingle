// Tail fill-in-the-blank bubble translation.
//
// While a bubble is still open, the leading part of its source that already
// has a translation is fixed: the listener has read it, so it never changes.
// Each interim request asks the model to translate the start of the rest (the
// tail) up to a natural cut point (a sentence, a clause, whatever reads well)
// and to say which part of the tail it translated; the words after that wait
// for the next request. The final request translates the whole remaining tail.

const MAX_TAIL_CHARS = 8_000
const MAX_PREVIOUS_CHARS = 600

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
  /** How the previous bubble ended (its last piece), for context while this bubble has nothing fixed. */
  previousSource?: string
  previousSourceLanguage?: string
  previousTranslations?: Record<string, string>
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
  const previousSource = typeof record.previousSource === 'string' ? record.previousSource.trim().slice(0, MAX_PREVIOUS_CHARS) : ''
  const previousSourceLanguage = typeof record.previousSourceLanguage === 'string' ? record.previousSourceLanguage.trim().slice(0, 16) : ''
  return {
    translatedSource: record.translatedSource.trim().slice(0, MAX_TAIL_CHARS),
    translations: parseStringRecord(record.translations),
    ...(contextSource ? { contextSource, contextTranslations: parseStringRecord(record.contextTranslations) } : {}),
    ...(previousSource ? {
      previousSource,
      ...(previousSourceLanguage ? { previousSourceLanguage } : {}),
      previousTranslations: parseStringRecord(record.previousTranslations),
    } : {}),
  }
}

export type BubbleTailPlan = {
  fixedSource: string
  fixedTranslations: Record<string, string>
  /** What the prompt shows of the fixed part: its last piece, or all of it. */
  contextSource: string
  contextTranslations: Record<string, string>
  /** The previous bubble's last piece, used as context only while nothing in this bubble is fixed. */
  previousSource: string
  previousTranslations: Record<string, string>
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
    ...resolvePreviousPiece(payload, fixedSource, targetLanguages),
    contextSource: useContext ? payload.contextSource as string : fixedSource,
    contextTranslations: useContext
      ? Object.fromEntries(targetLanguages.map((language) => [language, contextTranslations[language] as string]))
      : fixedTranslations,
    remainingSource,
    fullText,
    remainingStart,
  }
}

function resolvePreviousPiece(
  payload: BubbleTailPayload,
  fixedSource: string,
  targetLanguages: readonly string[],
): { previousSource: string, previousTranslations: Record<string, string> } {
  const previousSource = payload.previousSource || ''
  if (fixedSource || !previousSource) return { previousSource: '', previousTranslations: {} }
  const source = payload.previousTranslations || {}
  const previousLanguage = (payload.previousSourceLanguage || '').toLowerCase()
  const previousTranslations: Record<string, string> = {}
  for (const language of targetLanguages) {
    // A target that was the previous bubble's own language reads its source as is.
    const text = source[language] || (previousLanguage && language.toLowerCase() === previousLanguage ? previousSource : '')
    if (text) previousTranslations[language] = text
  }
  return { previousSource, previousTranslations }
}

/** Fixed source after this request: the old fixed part plus `coveredLength` chars of the tail. */
export function extendFixedSource(plan: BubbleTailPlan, coveredLength: number): string {
  return plan.fullText.slice(0, plan.remainingStart + Math.max(0, coveredLength)).trim()
}

/**
 * Length of the leading part of `remaining` that the model translated, found
 * from `cutAfter`: the last few source words it translated. Whitespace is
 * ignored. 0 when `cutAfter` is empty; -1 when those words are not in
 * `remaining` or appear more than once (the cut would be a guess).
 */
export function matchTailCutAfter(remaining: string, cutAfter: string): number {
  const target = cutAfter.replace(/\s+/g, '')
  if (!target) return 0
  let compact = ''
  const ends: number[] = []
  for (let index = 0; index < remaining.length; index += 1) {
    const char = remaining[index] as string
    if (/\s/.test(char)) continue
    compact += char
    ends.push(index + 1)
  }
  const first = compact.indexOf(target)
  if (first < 0 || compact.indexOf(target, first + 1) >= 0) return -1
  return ends[first + target.length - 1] as number
}

// Marks that end a sentence or a clause, across scripts: Latin, CJK (full and
// half width), Arabic/Urdu, Devanagari, Myanmar, Khmer, Ethiopic, Armenian.
// Scripts written without marks (Thai, Lao) rely on the length fallback below.
const SENTENCE_MARKS = '.!?…。！？．｡؟۔।॥။។።։'
const CLAUSE_MARKS = ',;:、，；：､،؛၊፣'
const CUT_PUNCTUATION = new RegExp(`[${SENTENCE_MARKS}${CLAUSE_MARKS}」』”"')\\]]$`)

/**
 * An interim cut is safe only when words already follow it, or when it ends
 * with punctuation: the words just heard at the very end can still be changed
 * by what the speaker says next.
 */
export function isSafeInterimCut(remaining: string, coveredLength: number): boolean {
  if (coveredLength <= 0) return false
  if (remaining.slice(coveredLength).trim()) return true
  return CUT_PUNCTUATION.test(remaining.trimEnd())
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

// ===== Provisional rest =====
//
// An interim answer also translates the words after its cut, roughly, so the
// bubble shows all of the speech at once. That part is never fixed: the next
// request translates those words again (and cuts there once a sentence ends).

/** Key of an interim answer's provisional translation of the words after its cut. */
export const TAIL_REST_KEY_PREFIX = 'rest_'

export function tailRestKey(language: string): string {
  return `${TAIL_REST_KEY_PREFIX}${language}`
}

export function isTailRestKey(key: string): boolean {
  return key.toLowerCase().startsWith(TAIL_REST_KEY_PREFIX)
}

/** The provisional rest per target language, read from an answer's fields ('' entries dropped). */
export function pickTailRests(
  values: Record<string, unknown>,
  targetLanguages: readonly string[],
): Record<string, string> {
  const rests: Record<string, string> = {}
  for (const language of targetLanguages) {
    const value = values[tailRestKey(language)]
    if (typeof value === 'string' && value.trim()) rests[language] = value.trim()
  }
  return rests
}

/** What the bubble shows: fixed translations, then the fill, then the provisional rest. */
export function joinTailDisplay(
  base: Record<string, string>,
  rests: Record<string, string>,
  targetLanguages: readonly string[],
): Record<string, string> {
  const joined: Record<string, string> = {}
  for (const language of targetLanguages) {
    const text = joinTailTexts([base[language] || '', rests[language] || ''], language)
    if (text) joined[language] = text
  }
  return joined
}

// ===== When to ask for the next interim fill =====
//
// Every request also returns a provisional translation of the words after its
// cut (see `rest_<lang>`), so the listener reads new speech soon after it is
// heard: a request goes out every few new characters, in every script.

/** New characters (spaces included) that trigger the next interim request. */
export const INTERIM_FILL_STEP_CHARS = 10

/** True when the text since the last request is worth a new interim request. */
export function shouldRequestInterimFill(currentText: string, lastRequestedText: string): boolean {
  const current = (currentText || '').trim()
  const last = (lastRequestedText || '').trim()
  if (!current || current === last) return false
  return current.length - last.length >= INTERIM_FILL_STEP_CHARS
}

// ===== Streamed interim fills =====

const PARTIAL_MARKER = /<\/?(?:end|fin)>/gi

/**
 * What an interim tail answer still being streamed lets the bubble show: the
 * fixed translations, the fill so far and the provisional rest so far, per
 * language. Null until the answer has named where it cuts (it writes that
 * first) and that cut is in the blank, so the fill is known to start where
 * the fixed part ends.
 */
export function buildInterimTailPartialTranslations(
  plan: BubbleTailPlan,
  fields: { values: Record<string, string>, complete: Set<string> },
  targetLanguages: readonly string[],
  cutAfterKey: string,
): Record<string, string> | null {
  if (!fields.complete.has(cutAfterKey)) return null
  // A named cut that is not in the blank: neither the fill nor the rest can be placed.
  if (matchTailCutAfter(plan.remainingSource, fields.values[cutAfterKey] || '') < 0) return null
  const fills: Record<string, string> = {}
  for (const language of targetLanguages) {
    const fill = (fields.values[language] || '').replace(PARTIAL_MARKER, '').trim()
    if (fill) fills[language] = fill
  }
  const rests = pickTailRests(
    Object.fromEntries(Object.entries(fields.values).map(([key, value]) => [key, value.replace(PARTIAL_MARKER, '')])),
    targetLanguages,
  )
  if (Object.keys(fills).length === 0 && Object.keys(rests).length === 0) return null
  return joinTailDisplay(joinTailTranslations(plan, fills, targetLanguages), rests, targetLanguages)
}
