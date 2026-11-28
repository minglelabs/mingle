import { SchemaType, type ResponseSchema } from '@google/generative-ai'
import { canonicalizeSttLanguageCode } from '@/lib/stt-languages'
import { prisma } from '@/lib/prisma'
import { generateJson } from '@/server/llm/generate-json'

/**
 * Names in the reader's language (owner, 2026-11-25): a name is not
 * translated, it is written the way it sounds in the reader's script —
 * 李伟 reads 리웨이 to a Korean, Li Wei to an English reader, キム・ミンジ is
 * 김민지 for a Japanese one. Only for the four languages every profile is
 * translated into; a name already in the reader's script stays as it is.
 * Made by Claude Haiku in the background and kept per user and language.
 */
export const NAME_TRANSLITERATION_MODEL = 'claude-haiku-5-5'
export const NAME_LANGUAGES = ['en', 'ko', 'ja', 'zh-CN'] as const
export type NameLanguage = (typeof NAME_LANGUAGES)[number]
const MAX_BATCH = 20

export function nameLanguageOf(language: string | null | undefined): NameLanguage | null {
  const code = canonicalizeSttLanguageCode(language ?? '')
  if (code === 'zh-TW') return 'zh-CN'
  return (NAME_LANGUAGES as readonly string[]).includes(code) ? code as NameLanguage : null
}

const LETTERS = /[\p{L}]/gu
const IN_SCRIPT: Record<NameLanguage, RegExp> = {
  en: /^[\p{Script=Latin}]$/u,
  ko: /^[\p{Script=Hangul}]$/u,
  ja: /^[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}ー]$/u,
  'zh-CN': /^[\p{Script=Han}]$/u,
}

/** Whether the name has letters a reader of this language would not read (so it is worth writing again). */
export function needsTransliteration(name: string | null | undefined, language: NameLanguage): boolean {
  const letters = (name ?? '').match(LETTERS) ?? []
  if (letters.length === 0) return false
  return letters.some((letter) => !IN_SCRIPT[language].test(letter))
}

/** The stored names for these users in this language (only those still matching the current name). */
export async function readNameTransliterations(users: readonly { id: string; name: string | null }[], language: NameLanguage): Promise<Map<string, string>> {
  const wanted = users.filter((user) => user.name && needsTransliteration(user.name, language))
  if (wanted.length === 0) return new Map()
  const rows = await prisma.userNameTransliteration.findMany({
    where: { language, userId: { in: wanted.map((user) => user.id) } },
    select: { userId: true, sourceName: true, text: true },
  })
  const nameById = new Map(wanted.map((user) => [user.id, user.name?.trim() ?? '']))
  const out = new Map<string, string>()
  for (const row of rows) if (nameById.get(row.userId) === row.sourceName) out.set(row.userId, row.text)
  return out
}

const RESPONSE_SCHEMA: ResponseSchema = {
  type: SchemaType.OBJECT,
  properties: {
    names: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: { id: { type: SchemaType.STRING }, text: { type: SchemaType.STRING } },
        required: ['id', 'text'],
      },
    },
  },
  required: ['names'],
}

const LANGUAGE_NAMES: Record<NameLanguage, string> = { en: 'English', ko: 'Korean', ja: 'Japanese', 'zh-CN': 'Simplified Chinese' }

export function validateTransliterations(value: unknown, ids: ReadonlySet<string>, language: NameLanguage): Map<string, string> {
  const rows = (value as { names?: unknown })?.names
  if (!Array.isArray(rows)) throw new Error('invalid_name_transliteration')
  const out = new Map<string, string>()
  for (const row of rows) {
    const id = typeof row?.id === 'string' ? row.id : ''
    const text = typeof row?.text === 'string' ? row.text.trim() : ''
    if (!ids.has(id) || !text || text.length > 60 || needsTransliteration(text, language)) continue
    out.set(id, text)
  }
  return out
}

const inFlight = new Set<string>()

/** Writes the missing names for these users (background; failures are retried on a later read). */
export async function fillNameTransliterations(users: readonly { id: string; name: string | null }[], language: NameLanguage): Promise<number> {
  const existing = await readNameTransliterations(users, language)
  const missing = users
    .filter((user) => user.name?.trim() && needsTransliteration(user.name, language) && !existing.has(user.id))
    .filter((user) => !inFlight.has(`${language}:${user.id}`))
    .slice(0, MAX_BATCH)
  if (missing.length === 0) return 0
  for (const user of missing) inFlight.add(`${language}:${user.id}`)
  try {
    const ids = new Set(missing.map((user) => user.id))
    const written = await generateJson({
      instructions: [
        `Write each person name the way a native ${LANGUAGE_NAMES[language]} speaker would write it, in that language's usual script.`,
        'Transliterate the sound only: never translate the meaning, never add titles or explanations.',
        'Keep the name order as given. Use the conventions people really use (e.g. 李伟 → 리웨이 in Korean, Li Wei in English; 김민지 → キム・ミンジ in Japanese).',
        'Return one entry per id given.',
      ].join(' '),
      input: { language: LANGUAGE_NAMES[language], names: missing.map((user) => ({ id: user.id, name: user.name?.trim() })) },
      responseSchema: RESPONSE_SCHEMA,
      validate: (value) => validateTransliterations(value, ids, language),
      model: NAME_TRANSLITERATION_MODEL,
      provider: 'direct',
      maxOutputTokens: 1500,
      timeoutMs: 25_000,
    })
    const nameById = new Map(missing.map((user) => [user.id, user.name?.trim() ?? '']))
    await Promise.all([...written].map(([userId, text]) => prisma.userNameTransliteration.upsert({
      where: { userId_language: { userId, language } },
      create: { userId, language, sourceName: nameById.get(userId) ?? '', text },
      update: { sourceName: nameById.get(userId) ?? '', text },
    })))
    return written.size
  } finally {
    for (const user of missing) inFlight.delete(`${language}:${user.id}`)
  }
}
