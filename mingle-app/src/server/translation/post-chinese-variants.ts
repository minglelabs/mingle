/**
 * Chinese variant rules for post and comment translations.
 *
 * These are the rules conversation translations already follow
 * (`normalizeChineseContent` in @/server/chinese-script-conversion), applied
 * to the one-language-at-a-time translations of posts and comments:
 *
 * - a Chinese source language is always zh-CN or zh-TW, never a bare `zh`;
 * - every zh-CN translation is Simplified and every zh-TW one Traditional;
 * - the other variant of a Chinese source is a conversion of the source text,
 *   never a model translation;
 * - for a non-Chinese source, a Chinese translation the model failed or left
 *   untranslated is converted from the other variant when that one is ready.
 *
 * Every text decision below goes through normalizeChineseContent, so posts
 * and conversations cannot drift apart.
 */

import {
  canonicalizeLanguageKey,
  classifyChineseLanguage,
  getSiblingChineseVariant,
  resolveChineseVariant,
  toChineseVariant,
  type ChineseVariantCode,
} from '@/lib/chinese-variant'
import { normalizeChineseContent } from '@/server/chinese-script-conversion'

/**
 * The source language to translate from. A Chinese code comes back as zh-CN
 * or zh-TW: an explicit variant is kept, a bare `zh` (legacy rows, callers)
 * is decided by the typed script of `sourceText`, else zh-CN. Every other
 * value is returned unchanged.
 */
export function resolvePostSourceLanguage(sourceLanguage: string, sourceText?: string | null): string {
  if (!classifyChineseLanguage(sourceLanguage)) return sourceLanguage
  return resolveChineseVariant({ language: sourceLanguage, text: sourceText, preferScript: true })
}

/**
 * A translation-language key with Chinese keys as zh-CN / zh-TW (a bare `zh`
 * resolves like main's canonicalizeLanguageKey). Other keys are unchanged.
 */
export function canonicalizeChineseLanguageKey(language: string): string {
  return classifyChineseLanguage(language) ? canonicalizeLanguageKey(language) : language
}

/**
 * The target variant when it is the other Chinese variant of a Chinese
 * source. That translation is a conversion of the source: no model call.
 */
export function chineseSiblingOfSource(sourceLanguage: string, language: string): ChineseVariantCode | null {
  const source = toChineseVariant(sourceLanguage)
  const target = toChineseVariant(language)
  return source && target === getSiblingChineseVariant(source) ? target : null
}

/**
 * True when a Chinese result for a non-Chinese source is not usable: it is
 * empty, or an untranslated copy of the source (trimmed equality). Such a
 * result is replaced by the other variant's ready translation, converted.
 */
export function needsChineseSiblingFallback(
  sourceLanguage: string,
  sourceText: string,
  text: string | null | undefined,
): boolean {
  if (toChineseVariant(sourceLanguage)) return false
  const trimmed = (text || '').trim()
  return !trimmed || trimmed === (sourceText || '').trim()
}

export type ChineseTargetTextInput = {
  /** Source language, already resolved (see resolvePostSourceLanguage). */
  sourceLanguage: string
  sourceText: string
  /** The Chinese target. */
  language: ChineseVariantCode
  /** The model's translations for this call; null when no call was made or it failed. */
  modelTranslations?: Record<string, string> | null
  /** The other variant's ready translation of the SAME body version, if any. */
  siblingText?: string | null
}

/**
 * The text to store for a Chinese target, or null when there is none:
 * - the other variant of a Chinese source: the source text converted;
 * - otherwise the model's text (a bare `zh` key counts) in the target's
 *   script, replaced by the converted sibling text when the source is not
 *   Chinese and the model text is missing or an untranslated copy.
 */
export function resolveChineseTargetText(input: ChineseTargetTextInput): string | null {
  const translations: Record<string, string> = { ...(input.modelTranslations ?? {}) }
  if (input.siblingText) translations[getSiblingChineseVariant(input.language)] = input.siblingText
  const normalized = normalizeChineseContent({
    sourceLanguage: input.sourceLanguage,
    sourceText: input.sourceText,
    translations,
    targetLanguages: [input.language],
  })
  return normalized.translations[input.language] || null
}

export type SettledChineseRow = { language: string; status: 'ready' | 'failed'; text: string | null }

/**
 * The non-Chinese-source rule for a batch of one body version: a zh-CN or
 * zh-TW row that failed, or holds an untranslated copy of the source, is
 * converted from the other variant's ready row of the same batch. Rows of a
 * Chinese source are returned as they are: its other variant already is a
 * conversion of the source.
 */
export function fillChineseSiblingRows<T extends SettledChineseRow>(
  rows: T[],
  sourceLanguage: string,
  sourceText: string,
): T[] {
  if (toChineseVariant(sourceLanguage)) return rows
  const readyText = new Map<string, string>()
  for (const row of rows) {
    if (row.status === 'ready' && row.text) readyText.set(row.language, row.text)
  }
  return rows.map((row) => {
    const variant = toChineseVariant(row.language)
    if (!variant || variant !== row.language) return row
    const current = readyText.get(variant) ?? null
    if (!needsChineseSiblingFallback(sourceLanguage, sourceText, current)) return row
    const siblingText = readyText.get(getSiblingChineseVariant(variant))
    if (!siblingText) return row
    const text = resolveChineseTargetText({
      sourceLanguage,
      sourceText,
      language: variant,
      modelTranslations: current ? { [variant]: current } : null,
      siblingText,
    })
    return text && text !== current ? { ...row, status: 'ready' as const, text } : row
  })
}
