import { SIMPLIFIED_ONLY_CHARACTERS, TRADITIONAL_ONLY_CHARACTERS } from '@/lib/chinese-script-data'
import { canonicalizeTranslationLanguageCode } from '@/lib/translation-languages'

// Single source of truth for Chinese variants.
//
// The app only ever stores and renders two Chinese languages: zh-CN
// (Simplified, mainland) and zh-TW (Traditional, Taiwan). Speech recognition
// and translation models often only say "Chinese" (`zh`), so every place that
// receives a language code resolves the generic code to one of the two
// variants with resolveChineseVariant() before storing or rendering it.

export const CHINESE_VARIANT_CODES = ['zh-CN', 'zh-TW'] as const
export type ChineseVariantCode = (typeof CHINESE_VARIANT_CODES)[number]
export type ChineseScript = 'simplified' | 'traditional' | 'ambiguous'

const SIMPLIFIED_ONLY = new Set(SIMPLIFIED_ONLY_CHARACTERS)
const TRADITIONAL_ONLY = new Set(TRADITIONAL_ONLY_CHARACTERS)

// Language names some models answer with instead of a code.
const GENERIC_CHINESE_NAMES = new Set(['chinese', 'mandarin', 'cmn', 'zho', 'chi', 'putonghua', 'guoyu'])
const SIMPLIFIED_CHINESE_NAMES = new Set([
  'chinese simplified', 'simplified chinese', 'chinese (simplified)', 'mandarin chinese simplified',
])
const TRADITIONAL_CHINESE_NAMES = new Set([
  'chinese traditional', 'traditional chinese', 'chinese (traditional)', 'taiwanese mandarin',
])

/**
 * Classifies a language code or name as generic Chinese (`zh`), an explicit
 * variant, or not Chinese (`''`). Aliases such as zh-Hant or zh_hk resolve to
 * their variant.
 */
export function classifyChineseLanguage(rawLanguage: string | null | undefined): 'zh' | ChineseVariantCode | '' {
  const raw = (rawLanguage || '').trim()
  if (!raw) return ''
  const lowered = raw.toLowerCase().replace(/_/g, '-')
  if (SIMPLIFIED_CHINESE_NAMES.has(lowered)) return 'zh-CN'
  if (TRADITIONAL_CHINESE_NAMES.has(lowered)) return 'zh-TW'
  if (GENERIC_CHINESE_NAMES.has(lowered)) return 'zh'
  const canonical = canonicalizeTranslationLanguageCode(raw)
  if (canonical === 'zh' || canonical === 'zh-CN' || canonical === 'zh-TW') return canonical
  return ''
}

export function isChineseLanguage(rawLanguage: string | null | undefined): boolean {
  return classifyChineseLanguage(rawLanguage) !== ''
}

/** Returns the variant only when the code names one explicitly. */
export function toChineseVariant(rawLanguage: string | null | undefined): ChineseVariantCode | null {
  const classified = classifyChineseLanguage(rawLanguage)
  return classified === 'zh-CN' || classified === 'zh-TW' ? classified : null
}

export function getSiblingChineseVariant(variant: ChineseVariantCode): ChineseVariantCode {
  return variant === 'zh-CN' ? 'zh-TW' : 'zh-CN'
}

/** Explicit Chinese variants in `languages`, in order, without duplicates. */
export function listChineseVariants(languages: readonly (string | null | undefined)[] | null | undefined): ChineseVariantCode[] {
  const output: ChineseVariantCode[] = []
  for (const language of languages || []) {
    const variant = toChineseVariant(language)
    if (variant && !output.includes(variant)) output.push(variant)
  }
  return output
}

/**
 * Tells Simplified from Traditional text by counting characters that only
 * exist in one script. Text made only of shared characters (你好, 我是) is
 * `ambiguous`, as is text with a real mix of both.
 */
export function detectChineseScript(text: string | null | undefined): ChineseScript {
  let simplified = 0
  let traditional = 0
  for (const character of text || '') {
    if (SIMPLIFIED_ONLY.has(character)) simplified += 1
    else if (TRADITIONAL_ONLY.has(character)) traditional += 1
  }
  if (simplified === 0 && traditional === 0) return 'ambiguous'
  if (simplified >= traditional * 3 && simplified > 0) return 'simplified'
  if (traditional >= simplified * 3 && traditional > 0) return 'traditional'
  return 'ambiguous'
}

export function hasSimplifiedOnlyCharacters(text: string | null | undefined): boolean {
  for (const character of text || '') {
    if (SIMPLIFIED_ONLY.has(character)) return true
  }
  return false
}

export function hasTraditionalOnlyCharacters(text: string | null | undefined): boolean {
  for (const character of text || '') {
    if (TRADITIONAL_ONLY.has(character)) return true
  }
  return false
}

function scriptToVariant(script: ChineseScript): ChineseVariantCode | null {
  if (script === 'simplified') return 'zh-CN'
  if (script === 'traditional') return 'zh-TW'
  return null
}

export type ResolveChineseVariantInput = {
  /** An upstream decision that wins when it names a variant (e.g. the client-sent source language). */
  hint?: string | null
  /** The declared language; an explicit variant is kept, a generic `zh` is resolved. */
  language?: string | null
  /** The text written in that language. */
  text?: string | null
  /** Languages of the room or request; a single Chinese variant among them decides. */
  candidates?: readonly (string | null | undefined)[] | null
  /**
   * The script of `text` is real evidence (typed text), so it outranks the
   * room. Leave false for speech recognition output: its script says nothing
   * about the speaker, since the recognizer writes Simplified for everyone.
   */
  preferScript?: boolean
  /** Weak tie-breaker (e.g. the variant a translation model guessed). */
  fallback?: string | null
}

/**
 * Resolves any Chinese language to zh-CN or zh-TW.
 *
 * Order: explicit hint > explicit language > (typed text only) script >
 * the room's single Chinese variant > script > fallback > the room's first
 * Chinese variant > zh-CN.
 */
export function resolveChineseVariant(input: ResolveChineseVariantInput): ChineseVariantCode {
  const hinted = toChineseVariant(input.hint)
  if (hinted) return hinted

  const declared = toChineseVariant(input.language)
  if (declared) return declared

  const scriptVariant = scriptToVariant(detectChineseScript(input.text))
  if (input.preferScript && scriptVariant) return scriptVariant

  const candidateVariants = listChineseVariants(input.candidates)
  if (candidateVariants.length === 1) return candidateVariants[0]

  if (scriptVariant) return scriptVariant

  const fallback = toChineseVariant(input.fallback)
  if (fallback) return fallback

  return candidateVariants[0] ?? 'zh-CN'
}

/**
 * Canonical catalog code for any language key. Chinese keys always come back
 * as zh-CN or zh-TW (resolved with `context` when generic); other keys come
 * back as their catalog code, or trimmed as-is when not in the catalog.
 */
export function canonicalizeLanguageKey(
  rawLanguage: string,
  context: Omit<ResolveChineseVariantInput, 'language'> = {},
): string {
  const raw = (rawLanguage || '').trim()
  if (!raw) return ''
  const chinese = classifyChineseLanguage(raw)
  if (chinese === 'zh-CN' || chinese === 'zh-TW') return chinese
  if (chinese === 'zh') return resolveChineseVariant({ ...context, language: 'zh' })
  return canonicalizeTranslationLanguageCode(raw) || raw.replace(/_/g, '-')
}
