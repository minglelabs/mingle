// Language labels the speech recognizer put on one finished utterance.
//
// The recognizer labels every token with a language. The STT server keeps all
// labels of a turn and sends them with the final transcript; the client passes
// them to translate/finalize as `sttLanguages`. When the labels name exactly
// one language, it is the language the client reported, and the text is in one
// script, the utterance is most likely not mixed: the model is then not asked
// to write the utterance again in its own language (that row is hidden as a
// copy of the original anyway). The model still checks the language and the
// mixed flags, and when it disagrees the request runs again with every
// language, so a wrong label costs one extra call, never a wrong bubble.
// Pure: used by client and server.

const MAX_STT_LANGUAGE_LABELS = 8

function languageBase(language: string): string {
  return (language || '').trim().toLowerCase().replace('_', '-').split('-')[0] || ''
}

/** Labels as base codes, without `unknown`, deduplicated and sorted. */
export function parseSttLanguageLabels(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  const labels = new Set<string>()
  for (const item of raw) {
    if (typeof item !== 'string') continue
    const base = languageBase(item)
    if (!base || base === 'unknown' || !/^[a-z]{2,3}$/.test(base)) continue
    labels.add(base)
    if (labels.size >= MAX_STT_LANGUAGE_LABELS) break
  }
  return [...labels].sort()
}

const SCRIPT_TESTS: ReadonlyArray<readonly [string, RegExp]> = [
  ['latin', /\p{Script=Latin}/u],
  ['hangul', /\p{Script=Hangul}/u],
  ['kana', /[\p{Script=Hiragana}\p{Script=Katakana}]/u],
  ['han', /\p{Script=Han}/u],
  ['cyrillic', /\p{Script=Cyrillic}/u],
  ['arabic', /\p{Script=Arabic}/u],
  ['devanagari', /\p{Script=Devanagari}/u],
  ['thai', /\p{Script=Thai}/u],
  ['hebrew', /\p{Script=Hebrew}/u],
  ['greek', /\p{Script=Greek}/u],
]

/** Scripts of the letters in `text` (marks, digits and spaces say nothing). */
export function listTextScripts(text: string): string[] {
  const scripts = new Set<string>()
  for (const char of text || '') {
    if (!/\p{L}/u.test(char)) continue
    const match = SCRIPT_TESTS.find(([, test]) => test.test(char))
    scripts.add(match ? match[0] : 'other')
  }
  return [...scripts].sort()
}

/** One script, or Japanese written in kana with kanji. */
export function usesSingleScript(text: string, language: string): boolean {
  const scripts = listTextScripts(text)
  if (scripts.length === 1) return scripts[0] !== 'other'
  return languageBase(language) === 'ja'
    && scripts.length === 2 && scripts.includes('han') && scripts.includes('kana')
}

/**
 * The languages to ask the model for when the labels say the utterance is in
 * one language: every selected language except the utterance's own. Null when
 * the labels do not allow it, so the caller asks for every language.
 */
export function resolveSingleLabelTargetLanguages(input: {
  sttLanguages: readonly string[]
  sourceLanguage: string
  targetLanguages: readonly string[]
  text: string
}): string[] | null {
  const sourceBase = languageBase(input.sourceLanguage)
  // Chinese variants are filled by script conversion from the model's own row.
  if (!sourceBase || sourceBase === 'unknown' || sourceBase === 'zh') return null
  if (input.sttLanguages.length !== 1 || input.sttLanguages[0] !== sourceBase) return null
  if (!usesSingleScript(input.text, sourceBase)) return null
  const lean = input.targetLanguages.filter((language) => languageBase(language) !== sourceBase)
  if (lean.length === 0 || lean.length === input.targetLanguages.length) return null
  return lean
}

/** True when the model's own reading contradicts the single label. */
export function singleLabelResultDisagrees(
  result: { sourceLanguage?: string, sourceLanguagesMixed?: boolean, sourceTextHasForeignScript?: boolean },
  sourceLanguage: string,
): boolean {
  if (result.sourceLanguagesMixed === true || result.sourceTextHasForeignScript === true) return true
  const detectedBase = languageBase(result.sourceLanguage || '')
  return Boolean(detectedBase) && detectedBase !== languageBase(sourceLanguage)
}

/**
 * A bubble translated piece by piece is never asked for its own-language row.
 * True when it likely mixes languages, so that row is worth one more request:
 * the labels name another language too, or the text uses another script.
 * Without labels (typed text, a local stop) only the script can tell.
 */
export function isLikelyMixedUtterance(input: {
  sttLanguages: readonly string[]
  sourceLanguage: string
  text: string
}): boolean {
  const sourceBase = languageBase(input.sourceLanguage)
  if (!sourceBase || sourceBase === 'unknown') return false
  if (input.sttLanguages.some((label) => label !== sourceBase)) return true
  return !usesSingleScript(input.text, sourceBase) && listTextScripts(input.text).length > 0
}

/** The selected language that is the utterance's own (same base), or null. */
export function findOwnSelectedLanguage(selectedLanguages: readonly string[], sourceLanguage: string): string | null {
  const sourceBase = languageBase(sourceLanguage)
  if (!sourceBase) return null
  return selectedLanguages.find((language) => languageBase(language) === sourceBase) ?? null
}
