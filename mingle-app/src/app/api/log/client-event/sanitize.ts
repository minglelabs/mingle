import type { Prisma } from '@prisma/client/index'
import { canonicalizeTranslationLanguageCode } from '@/lib/translation-languages'
import {
  canonicalizeLanguageKey,
  classifyChineseLanguage,
  type ResolveChineseVariantInput,
} from '@/lib/chinese-variant'

const MAX_TARGET_LANGUAGES = 10
const TARGET_LANGUAGE_PATTERN = /^[a-zA-Z][a-zA-Z0-9-]{0,19}$/

export function sanitizeText(value: unknown, maxLength = 512): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed) return null
  return trimmed.slice(0, maxLength)
}

export type LanguageKeyContext = Omit<ResolveChineseVariantInput, 'language'>

/**
 * Canonical catalog code for a stored language (zh-CN and zh-TW stay distinct;
 * a generic Chinese code resolves to a variant with `context`). Codes outside
 * the catalog keep their lower-cased base code; missing or malformed input is
 * 'unknown'.
 */
export function normalizeLang(input: unknown, context: LanguageKeyContext = {}): string {
  if (typeof input !== 'string') return 'unknown'
  const raw = input.trim().replace(/_/g, '-')
  if (!raw || !TARGET_LANGUAGE_PATTERN.test(raw)) return 'unknown'
  const canonical = classifyChineseLanguage(raw) || canonicalizeTranslationLanguageCode(raw)
  if (canonical) return canonicalizeLanguageKey(canonical, context)
  return raw.toLowerCase().split('-')[0] || 'unknown'
}

/** Like normalizeLang, but keeps a generic Chinese code as `zh` for later resolution. */
function normalizeLangKeepingGenericChinese(input: unknown): string {
  if (typeof input === 'string' && classifyChineseLanguage(input) === 'zh') return 'zh'
  return normalizeLang(input)
}

export function sanitizeTranslations(
  raw: unknown,
  options: { keepGenericChinese?: boolean } = {},
): Record<string, string> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}

  const output: Record<string, string> = {}
  for (const [rawLanguage, rawText] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof rawText !== 'string') continue
    const language = options.keepGenericChinese
      ? normalizeLangKeepingGenericChinese(rawLanguage)
      : normalizeLang(rawLanguage)
    if (!language || language === 'unknown') continue

    const text = rawText.replace(/<\/?(?:end|fin)>/gi, '').trim().slice(0, 20000)
    if (!text) continue
    output[language] = text
  }
  return output
}

export function sanitizeTargetLanguages(raw: unknown, context: LanguageKeyContext = {}): string[] {
  if (!Array.isArray(raw)) return []

  // A generic `zh` next to an explicit variant is that variant (legacy rows
  // listed a collapsed `zh` translation key beside its zh-TW placeholder).
  const languageContext: LanguageKeyContext = {
    ...context,
    candidates: [...(context.candidates || []), ...raw.filter((item): item is string => typeof item === 'string')],
  }
  const output: string[] = []
  for (const rawLanguage of raw) {
    if (typeof rawLanguage !== 'string') continue
    const language = normalizeLang(rawLanguage, languageContext)
    if (language === 'unknown' || output.includes(language)) continue
    output.push(language)
    if (output.length >= MAX_TARGET_LANGUAGES) break
  }
  return output
}

export function sanitizeJsonObject(raw: unknown): Prisma.JsonObject | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  try {
    return JSON.parse(JSON.stringify(raw)) as Prisma.JsonObject
  } catch {
    return null
  }
}
