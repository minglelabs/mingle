import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { canonicalizeTranslationLanguageCode } from '@/lib/translation-languages'
import { translateTexts } from '@/server/translation/translate-texts'

/**
 * Admin-only reading aid for the operator inbox (contract §5): staff read the
 * users' messages in Korean without Korean ever becoming part of the room.
 *
 * - Results live only in this process, in an LRU keyed by message id +
 *   language. Nothing is written to AppMessageContent, and no member's
 *   selected languages change, so members never see a `ko` translation or a
 *   `ko` attribution appear because staff read their room.
 * - Only reads the database (the message text); every write path is absent
 *   on purpose.
 */
export const STAFF_TRANSLATION_LANGUAGE = 'ko'
export const STAFF_TRANSLATION_CACHE_MAX_ENTRIES = 2000
/** Largest batch one request may translate. */
export const STAFF_TRANSLATION_MAX_MESSAGES = 50
const STAFF_TRANSLATION_CONCURRENCY = 4
const MESSAGE_ID_PATTERN = /^[\w-]{1,128}$/

export type StaffTranslationRequest = {
  messageId: string
  text: string
  /** The message's source language (any tag; unknown is fine). */
  sourceLanguage: string
}

/** messageId -> translated text, or null when there is none (photo, failure, empty). */
export type StaffTranslations = Record<string, string | null>

type CacheEntry = { sourceText: string; text: string }

const cache = new Map<string, CacheEntry>()
const inFlight = new Map<string, Promise<string | null>>()

function cacheKey(messageId: string, language: string): string {
  return `${messageId}\u0000${language}`
}

function readCache(key: string, sourceText: string): string | null {
  const entry = cache.get(key)
  // A changed source (a retried write) must not return the old translation.
  if (!entry || entry.sourceText !== sourceText) return null
  // Map keeps insertion order: re-inserting marks the entry most recent.
  cache.delete(key)
  cache.set(key, entry)
  return entry.text
}

function writeCache(key: string, entry: CacheEntry): void {
  cache.delete(key)
  cache.set(key, entry)
  while (cache.size > STAFF_TRANSLATION_CACHE_MAX_ENTRIES) {
    const oldest = cache.keys().next().value
    if (oldest === undefined) break
    cache.delete(oldest)
  }
}

/** Test hook: forget every cached translation. */
export function clearStaffTranslationCache(): void {
  cache.clear()
  inFlight.clear()
}

export function staffTranslationCacheSize(): number {
  return cache.size
}

function canonicalLanguage(raw: string | null | undefined): string {
  return canonicalizeTranslationLanguageCode(raw || '') || ''
}

function pickTranslation(translations: Record<string, string>, language: string): string | null {
  const direct = translations[language]?.trim()
  if (direct) return direct
  for (const [key, value] of Object.entries(translations)) {
    if (canonicalLanguage(key) === language && value?.trim()) return value.trim()
  }
  return null
}

async function translateOne(request: StaffTranslationRequest, language: string): Promise<string | null> {
  const text = request.text.trim()
  if (!text) return null
  const sourceLanguage = canonicalLanguage(request.sourceLanguage)
  // Already in the staff language: show it as is, no model call.
  if (sourceLanguage === language) return text

  const key = cacheKey(request.messageId, language)
  const cached = readCache(key, text)
  if (cached !== null) return cached
  const pending = inFlight.get(key)
  if (pending) return pending

  const promise = (async () => {
    try {
      const result = await translateTexts({
        text,
        sourceLanguage: sourceLanguage || 'auto',
        targetLanguages: [language],
        isFinal: true,
      })
      const translated = pickTranslation(result.translations, language)
      if (!translated) return null
      writeCache(key, { sourceText: text, text: translated })
      return translated
    } catch (error) {
      // Not cached, so the next request retries. Never log the message text.
      console.warn('[operator-inbox] staff_translate_failed', {
        error: error instanceof Error ? error.name : 'unknown',
      })
      return null
    } finally {
      inFlight.delete(key)
    }
  })()
  inFlight.set(key, promise)
  return promise
}

/**
 * Translates each message's text into `language` (Korean by default) for
 * staff only. Deduplicates by message id, runs a few requests at a time, and
 * never throws: a failed item is null.
 */
export async function translateForStaff(
  requests: StaffTranslationRequest[],
  language: string = STAFF_TRANSLATION_LANGUAGE,
): Promise<StaffTranslations> {
  const target = canonicalLanguage(language) || STAFF_TRANSLATION_LANGUAGE
  const unique = new Map<string, StaffTranslationRequest>()
  for (const request of requests) {
    if (!request || typeof request.messageId !== 'string' || !MESSAGE_ID_PATTERN.test(request.messageId)) continue
    if (typeof request.text !== 'string') continue
    if (!unique.has(request.messageId)) unique.set(request.messageId, request)
  }

  const queue = [...unique.values()]
  const result: StaffTranslations = {}
  const worker = async () => {
    for (let next = queue.shift(); next; next = queue.shift()) {
      result[next.messageId] = await translateOne(next, target)
    }
  }
  await Promise.all(Array.from({ length: Math.min(STAFF_TRANSLATION_CONCURRENCY, queue.length) }, worker))
  return result
}

/** True when a message's metadata marks it as a chat photo (its text is only "📷 Photo"). */
export function isPhotoMessageMetadata(metadata: Prisma.JsonValue | null | undefined): boolean {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return false
  const image = (metadata as Record<string, unknown>).image
  return Boolean(image) && typeof image === 'object' && !Array.isArray(image)
}

/**
 * Staff translations for messages of ONE room (`sessionKey`): ids from other
 * rooms, deleted messages and photos come back null. A stored translation in
 * the language is reused as is, with no model call. Read-only.
 */
export async function translateRoomMessagesForStaff(args: {
  sessionKey: string
  messageIds: string[]
  language?: string
}): Promise<StaffTranslations> {
  const language = canonicalLanguage(args.language) || STAFF_TRANSLATION_LANGUAGE
  const ids = [...new Set(args.messageIds.filter((id) => typeof id === 'string' && MESSAGE_ID_PATTERN.test(id)))]
    .slice(0, STAFF_TRANSLATION_MAX_MESSAGES)
  const result: StaffTranslations = Object.fromEntries(ids.map((id) => [id, null]))
  if (ids.length === 0 || !args.sessionKey) return result

  const rows = await prisma.appMessage.findMany({
    where: {
      id: { in: ids },
      sessionKey: args.sessionKey,
      OR: [{ isDeleted: false }, { isDeleted: null }],
    },
    select: {
      id: true,
      sourceLanguage: true,
      metadata: true,
      contents: {
        where: { OR: [{ isDeleted: false }, { isDeleted: null }] },
        select: { contentType: true, language: true, text: true },
      },
    },
  })

  const requests: StaffTranslationRequest[] = []
  for (const row of rows) {
    if (isPhotoMessageMetadata(row.metadata)) continue
    const stored = row.contents.find((content) => (
      content.contentType === 'TRANSLATION_FINAL' && canonicalLanguage(content.language) === language && content.text.trim()
    ))
    if (stored) {
      result[row.id] = stored.text.trim()
      continue
    }
    const sources = row.contents.filter((content) => content.contentType === 'SOURCE')
    const source = sources.find((content) => content.language === row.sourceLanguage) ?? sources[0]
    if (!source?.text.trim()) continue
    requests.push({ messageId: row.id, text: source.text, sourceLanguage: row.sourceLanguage })
  }

  Object.assign(result, await translateForStaff(requests, language))
  return result
}
