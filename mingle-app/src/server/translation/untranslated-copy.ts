/**
 * Detects a "translation" that is just the source text handed back.
 *
 * Models sometimes return the input unchanged (seen for zh-CN -> ko and
 * ko -> ja). Equal text alone is not enough to call it a failure: "OK", a
 * name, a number or an emoji is the same in every language. So a copy counts
 * as untranslated only when most of its letters are in a script the target
 * language is not written in (Han for Korean, Hangul for Japanese, ...).
 * Targets without a script table here are never flagged.
 */

const LATIN = /\p{Script=Latin}/u

const TARGET_SCRIPTS: Record<string, RegExp[]> = {
  ko: [/\p{Script=Hangul}/u, LATIN],
  ja: [/\p{Script=Hiragana}/u, /\p{Script=Katakana}/u, /\p{Script=Han}/u, LATIN],
  zh: [/\p{Script=Han}/u, LATIN],
  en: [LATIN],
  de: [LATIN],
  es: [LATIN],
  fr: [LATIN],
  it: [LATIN],
  pt: [LATIN],
  vi: [LATIN],
  id: [LATIN],
  ms: [LATIN],
  tl: [LATIN],
  tr: [LATIN],
  ru: [/\p{Script=Cyrillic}/u, LATIN],
  ar: [/\p{Script=Arabic}/u, LATIN],
  hi: [/\p{Script=Devanagari}/u, LATIN],
  th: [/\p{Script=Thai}/u, LATIN],
}

function targetScripts(language: string): RegExp[] | null {
  const base = language.trim().toLowerCase().split(/[-_]/)[0]
  return TARGET_SCRIPTS[base] ?? null
}

/**
 * True when `text` is the source text unchanged and more than half of its
 * letters are outside the target language's scripts.
 */
export function isUntranslatedCopy(sourceText: string | null | undefined, language: string, text: string | null | undefined): boolean {
  const trimmed = (text ?? '').trim()
  if (!trimmed || trimmed !== (sourceText ?? '').trim()) return false
  const scripts = targetScripts(language)
  if (!scripts) return false
  const letters = Array.from(trimmed).filter((ch) => /\p{L}/u.test(ch))
  if (letters.length === 0) return false
  const foreign = letters.filter((ch) => !scripts.some((script) => script.test(ch))).length
  return foreign * 2 > letters.length
}
