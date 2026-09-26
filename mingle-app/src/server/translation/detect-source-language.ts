/**
 * Server-side source-language detection for posts and comments.
 *
 * Reuses the existing translation engine's redetection path
 * (translateTexts with redetectSourceLanguage=true) — the lightest existing
 * route to a language verdict — rather than adding a new dependency.
 *
 * The server detection is authoritative. The language a client sends is only
 * a fallback hint, used when detection cannot produce a verdict, because the
 * language a user *writes* in often differs from their display language.
 *
 * Undetectable input (empty, whitespace-only, or emoji/punctuation/digits
 * only) resolves to null without ever calling the provider.
 */

import { translateTexts, type TranslateTextsInput } from './translate-texts'
import { canonicalizeTranslationLanguageCode } from '@/lib/translation-languages'
import { DEFAULT_POST_TRANSLATION_LANGUAGES } from './post-translation-service'

export type DetectSourceLanguageArgs = {
  /** The user's written text. */
  text: string
  /**
   * Optional client-supplied language. Used ONLY as a fallback when server
   * detection yields nothing — never trusted over a real detection verdict.
   */
  clientHint?: string | null
  modelSelection?: TranslateTextsInput['modelSelection']
}

/**
 * True when `text` carries no letters in any script — only whitespace,
 * emoji, punctuation, symbols, or digits. Such input has no source language.
 */
export function isUndetectableText(text: string): boolean {
  if (!text || !text.trim()) return true
  // \p{L} = any Unicode letter (Latin, Han, Hangul, Kana, Cyrillic, …).
  // Marks (\p{M}) accompany letters in some scripts (e.g. Indic), so a run of
  // marks alone is not a letter and stays undetectable.
  return !/\p{L}/u.test(text)
}

/**
 * Detect the source language of a post/comment body.
 *
 * @returns a canonical translation language code, or null when the text is
 *          undetectable or detection produced no usable verdict.
 */
export async function detectSourceLanguage(args: DetectSourceLanguageArgs): Promise<string | null> {
  const { text } = args

  // Cheap, provider-free short-circuit for text with no letters at all.
  if (isUndetectableText(text)) return null

  const canonicalHint = args.clientHint ? canonicalizeTranslationLanguageCode(args.clientHint) : ''

  try {
    // redetectSourceLanguage=true makes the engine return detectedSourceLanguage.
    // The default languages are passed as reference-only hints; the engine is
    // explicitly told hints do not constrain the verdict.
    const result = await translateTexts({
      text,
      // Provide the hint (or a neutral placeholder) as the declared source; the
      // redetection prompt overrides it whenever the text says otherwise.
      sourceLanguage: canonicalHint || 'auto',
      targetLanguages: [...DEFAULT_POST_TRANSLATION_LANGUAGES],
      redetectSourceLanguage: true,
      isFinal: true,
      modelSelection: args.modelSelection,
    })

    const detected = result.detectedSourceLanguage
      ? canonicalizeTranslationLanguageCode(result.detectedSourceLanguage)
      : ''

    if (detected) return detected

    // Detection produced nothing usable — fall back to the client hint only if
    // it canonicalizes to a real language.
    return canonicalHint || null
  } catch {
    // Provider failure must not block publishing. Fall back to the client hint
    // when it is a real language, else null (post stays untranslated; the user
    // can request a translation later, which re-detects).
    return canonicalHint || null
  }
}
