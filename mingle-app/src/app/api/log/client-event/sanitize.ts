import type { Prisma } from '@prisma/client/index'

const MAX_TARGET_LANGUAGES = 10
const TARGET_LANGUAGE_PATTERN = /^[a-zA-Z][a-zA-Z0-9-]{0,19}$/

export function sanitizeText(value: unknown, maxLength = 512): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed) return null
  return trimmed.slice(0, maxLength)
}

export function normalizeLang(input: unknown): string {
  if (typeof input !== 'string') return 'unknown'
  const normalized = input.trim().replace('_', '-').toLowerCase().split('-')[0]
  return normalized || 'unknown'
}

export function sanitizeTranslations(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}

  const output: Record<string, string> = {}
  for (const [rawLanguage, rawText] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof rawText !== 'string') continue
    const language = normalizeLang(rawLanguage)
    if (!language || language === 'unknown') continue

    const text = rawText.replace(/<\/?(?:end|fin)>/gi, '').trim().slice(0, 20000)
    if (!text) continue
    output[language] = text
  }
  return output
}

export function sanitizeTargetLanguages(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []

  const output: string[] = []
  for (const rawLanguage of raw) {
    if (typeof rawLanguage !== 'string') continue
    const language = rawLanguage.trim()
    if (!TARGET_LANGUAGE_PATTERN.test(language) || output.includes(language)) continue
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
