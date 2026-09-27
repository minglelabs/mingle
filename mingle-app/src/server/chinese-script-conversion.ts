import { Converter } from 'opencc-js'

import {
  CHINESE_VARIANT_CODES,
  canonicalizeLanguageKey,
  classifyChineseLanguage,
  getSiblingChineseVariant,
  hasSimplifiedOnlyCharacters,
  hasTraditionalOnlyCharacters,
  listChineseVariants,
  resolveChineseVariant,
  type ChineseVariantCode,
} from '@/lib/chinese-variant'

// Server-only: the OpenCC phrase dictionaries are ~1 MB, so conversion never
// runs in the client bundle. The client resolves variants with
// @/lib/chinese-variant and receives converted text from the server.

type ConvertText = (text: string) => string

let converters: {
  toTraditional: ConvertText
  toSimplified: ConvertText
  localizeForTaiwan: ConvertText
  localizeForMainland: ConvertText
} | null = null

function getConverters() {
  if (!converters) {
    converters = {
      // Script only: same words, other characters (头发 -> 頭髮).
      toTraditional: Converter({ from: 'cn', to: 'tw' }),
      toSimplified: Converter({ from: 'tw', to: 'cn' }),
      // Script plus regional vocabulary (软件 -> 軟體, 計程車 -> 出租车).
      localizeForTaiwan: Converter({ from: 'cn', to: 'twp' }),
      localizeForMainland: Converter({ from: 'twp', to: 'cn' }),
    }
  }
  return converters
}

/** Rewrites `text` in the script of `variant`, keeping the words. */
export function convertChineseScript(text: string, variant: ChineseVariantCode): string {
  if (!text) return text
  const { toTraditional, toSimplified } = getConverters()
  return variant === 'zh-TW' ? toTraditional(text) : toSimplified(text)
}

/** Like convertChineseScript, but leaves text that has no wrong-script characters untouched. */
export function ensureChineseScript(text: string, variant: ChineseVariantCode): string {
  if (!text) return text
  const hasWrongScript = variant === 'zh-TW'
    ? hasSimplifiedOnlyCharacters(text)
    : hasTraditionalOnlyCharacters(text)
  return hasWrongScript ? convertChineseScript(text, variant) : text
}

/**
 * Renders Chinese text for readers of `target`: script and regional
 * vocabulary. zh-CN <-> zh-TW is a conversion, not a translation, so this
 * replaces asking a model for the other variant.
 */
export function localizeChineseText(text: string, target: ChineseVariantCode): string {
  if (!text) return text
  const { toTraditional, localizeForTaiwan, localizeForMainland } = getConverters()
  // Taiwan-vocabulary rules are keyed on Traditional text, so Simplified
  // input (speech recognition writes Simplified for everyone) is converted
  // to Traditional first.
  return target === 'zh-TW' ? localizeForTaiwan(text) : localizeForMainland(toTraditional(text))
}

export type NormalizeChineseContentInput = {
  /** Declared source language. A generic `zh` is resolved to a variant. */
  sourceLanguage: string
  /** The source text exactly as recognized or typed. Never rewritten. */
  sourceText: string
  translations: Record<string, string>
  targetLanguages?: readonly string[]
  /** Languages of the room/request; decide generic Chinese when the text cannot. */
  candidates?: readonly string[]
  /** An upstream source-variant decision that wins (e.g. the client-sent source language). */
  sourceHint?: string | null
  /** A variant a model guessed; tie-breaker only. */
  sourceFallback?: string | null
  /** The source was typed, so its script is evidence of the writer's variant. */
  sourceScriptIsEvidence?: boolean
}

export type NormalizeChineseContentResult = {
  /** Canonical source language; Chinese is always zh-CN or zh-TW. */
  sourceLanguage: string
  /**
   * The source text in the script of its Chinese variant, or null when that
   * is the text itself. Display-only: the recognized text stays the identity
   * of the utterance.
   */
  sourceDisplayText: string | null
  /** Canonical keys; Chinese values in their variant's script; missing Chinese variants filled by conversion. */
  translations: Record<string, string>
  /** Canonical, de-duplicated targets (requested order first, then translation keys). */
  targetLanguages: string[]
}

/**
 * Makes a message's languages and Chinese text consistent:
 * - every Chinese code is zh-CN or zh-TW (never a bare `zh`);
 * - every zh-CN value is Simplified and every zh-TW value Traditional;
 * - when the source is Chinese, the other variant is the conversion of the
 *   source, and when both variants are wanted and one is missing (or is an
 *   untranslated copy of the source) it is converted from the other.
 */
export function normalizeChineseContent(input: NormalizeChineseContentInput): NormalizeChineseContentResult {
  const requestedTargets = input.targetLanguages || []
  const candidates = [...(input.candidates || []), ...requestedTargets, ...Object.keys(input.translations || {})]
  const sourceText = (input.sourceText || '').trim()

  const sourceVariant = classifyChineseLanguage(input.sourceLanguage)
    ? resolveChineseVariant({
      hint: input.sourceHint,
      language: input.sourceLanguage,
      text: sourceText,
      candidates,
      preferScript: input.sourceScriptIsEvidence,
      fallback: input.sourceFallback,
    })
    : null
  const sourceLanguage = sourceVariant ?? canonicalizeLanguageKey(input.sourceLanguage)
  const sourceInScript = sourceVariant ? ensureChineseScript(sourceText, sourceVariant) : sourceText

  const translations: Record<string, string> = {}
  const genericChineseTexts: string[] = []
  for (const [rawLanguage, rawText] of Object.entries(input.translations || {})) {
    const text = typeof rawText === 'string' ? rawText.trim() : ''
    if (!text) continue
    const chinese = classifyChineseLanguage(rawLanguage)
    if (chinese === 'zh') {
      genericChineseTexts.push(text)
      continue
    }
    const language = chinese || canonicalizeLanguageKey(rawLanguage)
    if (language) translations[language] = text
  }

  // A value under a bare `zh` key belongs to the variant its script names,
  // else to a wanted variant that has no text yet. Explicit keys win.
  for (const text of genericChineseTexts) {
    const openVariants = listChineseVariants([...requestedTargets, ...(input.candidates || [])])
      .filter((variant) => !translations[variant])
    const variant = resolveChineseVariant({
      language: 'zh',
      text,
      preferScript: true,
      candidates: openVariants.length > 0 ? openVariants : candidates,
    })
    if (!translations[variant]) translations[variant] = text
  }

  for (const variant of CHINESE_VARIANT_CODES) {
    if (translations[variant]) translations[variant] = ensureChineseScript(translations[variant], variant)
  }

  const targetLanguages: string[] = []
  const pushTarget = (rawLanguage: string) => {
    const language = canonicalizeLanguageKey(rawLanguage, { candidates })
    if (language && !targetLanguages.includes(language)) targetLanguages.push(language)
  }
  for (const language of requestedTargets) pushTarget(language)

  const wantsVariant = (variant: ChineseVariantCode) => (
    targetLanguages.includes(variant) || translations[variant] !== undefined
  )

  if (sourceVariant) {
    const sibling = getSiblingChineseVariant(sourceVariant)
    if (wantsVariant(sibling)) {
      // For mixed-language speech the same-variant translation is the fully
      // Chinese rendering, so convert that rather than the raw source.
      const base = translations[sourceVariant] || sourceInScript
      translations[sibling] = localizeChineseText(base, sibling)
    }
  } else {
    const isUsable = (variant: ChineseVariantCode) => (
      Boolean(translations[variant]) && translations[variant] !== sourceText
    )
    for (const variant of CHINESE_VARIANT_CODES) {
      const sibling = getSiblingChineseVariant(variant)
      if (wantsVariant(variant) && !isUsable(variant) && isUsable(sibling)) {
        translations[variant] = localizeChineseText(translations[sibling], variant)
      }
    }
  }

  for (const language of Object.keys(translations)) pushTarget(language)

  return {
    sourceLanguage,
    sourceDisplayText: sourceInScript !== sourceText ? sourceInScript : null,
    translations,
    targetLanguages,
  }
}
