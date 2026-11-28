import { SchemaType, type ResponseSchema } from '@google/generative-ai'
import { canonicalizeSttLanguageCode, STT_LANGUAGE_NAME_MAP } from '@/lib/stt-languages'
import { generateJson } from '@/server/llm/generate-json'

/**
 * The self-introduction written during onboarding, shown translated before
 * the account exists (owner, 2026-11-25): Claude Haiku, one call for up to
 * BIO_PREVIEW_MAX_LANGUAGES languages. Only a preview: the saved bio is
 * translated again by the profile pipeline (@/server/profile-bio).
 */
export const BIO_PREVIEW_MODEL = 'claude-haiku-5-5'
export const BIO_PREVIEW_MAX_LANGUAGES = 6
export const BIO_PREVIEW_MAX_TEXT = 160

export type BioPreviewRequest = { text: string; languages: string[] }

/** The text and languages it may translate into, or null when the request is not usable. */
export function parseBioPreviewRequest(body: unknown): BioPreviewRequest | null {
  if (!body || typeof body !== 'object') return null
  const record = body as Record<string, unknown>
  const text = typeof record.text === 'string' ? record.text.trim() : ''
  if (!text || Array.from(text).length > BIO_PREVIEW_MAX_TEXT) return null
  if (!Array.isArray(record.languages)) return null
  const languages = [...new Set(record.languages
    .map((entry) => (typeof entry === 'string' ? canonicalizeSttLanguageCode(entry) : ''))
    .filter((entry): entry is NonNullable<typeof entry> & string => Boolean(entry)))]
  if (languages.length === 0 || languages.length > BIO_PREVIEW_MAX_LANGUAGES) return null
  return { text, languages }
}

const RESPONSE_SCHEMA: ResponseSchema = {
  type: SchemaType.OBJECT,
  properties: {
    translations: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          language: { type: SchemaType.STRING },
          text: { type: SchemaType.STRING },
        },
        required: ['language', 'text'],
      },
    },
  },
  required: ['translations'],
}

export function validateBioPreview(value: unknown, languages: readonly string[]): Record<string, string> {
  const rows = (value as { translations?: unknown })?.translations
  if (!Array.isArray(rows)) throw new Error('invalid_bio_preview')
  const wanted = new Set(languages)
  const out: Record<string, string> = {}
  for (const row of rows) {
    const language = typeof row?.language === 'string' ? canonicalizeSttLanguageCode(row.language) : ''
    const text = typeof row?.text === 'string' ? row.text.trim() : ''
    if (language && wanted.has(language) && text && text.length <= 1000) out[language] = text
  }
  if (Object.keys(out).length === 0) throw new Error('invalid_bio_preview')
  return out
}

export async function translateBioPreview(request: BioPreviewRequest, signal?: AbortSignal): Promise<Record<string, string>> {
  const targets = request.languages.map((code) => ({ code, name: STT_LANGUAGE_NAME_MAP[code as keyof typeof STT_LANGUAGE_NAME_MAP] ?? code }))
  return generateJson({
    instructions: [
      'Translate the supplied dating-app self-introduction into each listed language.',
      'Keep the meaning, the casual tone, emoji, names and line breaks. Sound natural, like a native speaker wrote it.',
      'When the text is already in a listed language, return it for that language with only obvious typos fixed.',
      'Return one entry per listed language, using its code exactly as given.',
    ].join(' '),
    input: { selfIntroduction: request.text, languages: targets },
    responseSchema: RESPONSE_SCHEMA,
    validate: (value) => validateBioPreview(value, request.languages),
    model: BIO_PREVIEW_MODEL,
    provider: 'direct',
    maxOutputTokens: 2048,
    timeoutMs: 20_000,
    signal,
  })
}

/** At most this many previews per address in the window: the route is open before sign-in. */
const LIMIT = 20
const WINDOW_MS = 10 * 60_000
const hits = new Map<string, number[]>()

export function takeBioPreviewSlot(key: string, now = Date.now()): boolean {
  const recent = (hits.get(key) ?? []).filter((at) => now - at < WINDOW_MS)
  if (recent.length >= LIMIT) {
    hits.set(key, recent)
    return false
  }
  recent.push(now)
  hits.set(key, recent)
  if (hits.size > 5000) hits.clear()
  return true
}
