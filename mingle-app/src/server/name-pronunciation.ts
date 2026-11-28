import { SchemaType, type ResponseSchema } from '@google/generative-ai'
import { generateJson } from '@/server/llm/generate-json'

/**
 * How a name sounds, written in plain English letters (owner, 2026-11-25): a
 * name is not translated, but someone who cannot read 민지 or さくら should
 * still be able to say it. Not IPA: ordinary spelling an English speaker
 * would read close to the real sound ("Min-ji Kim", "Sa-ku-ra").
 * Claude Haiku, cached per name in memory.
 */
export const NAME_PRONUNCIATION_MODEL = 'claude-haiku-5-5'
const MAX_NAME_LENGTH = 40
const CACHE_LIMIT = 5000
const cache = new Map<string, string>()

/** A name worth spelling out: it has letters outside the Latin alphabet. */
export function needsPronunciation(name: string | null | undefined): boolean {
  const value = (name ?? '').trim()
  return value.length > 0 && /[^\u0000-\u024F\u1E00-\u1EFF\s\p{P}\p{S}\p{N}]/u.test(value)
}

const RESPONSE_SCHEMA: ResponseSchema = {
  type: SchemaType.OBJECT,
  properties: { pronunciation: { type: SchemaType.STRING } },
  required: ['pronunciation'],
}

export function validatePronunciation(value: unknown): string {
  const text = typeof (value as { pronunciation?: unknown })?.pronunciation === 'string'
    ? (value as { pronunciation: string }).pronunciation.trim()
    : ''
  // English letters, spaces, hyphens and apostrophes only, and short.
  if (!text || text.length > 80 || !/^[A-Za-z][A-Za-z\s'\-]*$/.test(text)) throw new Error('invalid_pronunciation')
  return text
}

export async function pronounceName(name: string, languageHints: readonly string[] = [], signal?: AbortSignal): Promise<string | null> {
  const value = name.trim().slice(0, MAX_NAME_LENGTH)
  if (!needsPronunciation(value)) return null
  const cached = cache.get(value)
  if (cached) return cached
  const pronunciation = await generateJson({
    instructions: [
      'Write how this person name sounds, using only plain English letters, so an English speaker reading it aloud gets as close as possible to the real pronunciation.',
      'Do not translate the meaning and do not use IPA or accent marks. Separate syllables with hyphens where that helps (e.g. "Min-ji").',
      'Keep the order of the name as written. The likely languages of the name are given as hints.',
    ].join(' '),
    input: { name: value, likelyLanguages: languageHints.slice(0, 3) },
    responseSchema: RESPONSE_SCHEMA,
    validate: validatePronunciation,
    model: NAME_PRONUNCIATION_MODEL,
    provider: 'direct',
    maxOutputTokens: 200,
    timeoutMs: 15_000,
    signal,
  })
  if (cache.size >= CACHE_LIMIT) cache.clear()
  cache.set(value, pronunciation)
  return pronunciation
}
