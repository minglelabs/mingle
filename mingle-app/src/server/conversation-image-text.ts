/**
 * Background jobs and read model for the photo text translation overlay.
 *
 * State lives in the DB (ProfileBio claim/deadline pattern) because after()
 * work is lost on a redeploy: every attempt is claimed with a conditional
 * update that sets a fresh attemptId and a deadline, a stale claim (deadline
 * passed) can be reclaimed, and results are written only while the attemptId
 * still matches. OCR and each translation language get at most 3 attempts.
 * A failed attempt becomes retryable after a short cooldown, so one provider
 * outage does not use up all attempts within a few polls.
 */

import { randomUUID } from 'node:crypto'
import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { listConversationTranslationLanguagesBySessionKey } from '@/lib/app-conversations'
import { getSiblingChineseVariant, toChineseVariant } from '@/lib/chinese-variant'
import {
  CONVERSATION_IMAGE_TEXT_POLL_MS,
  CONVERSATION_IMAGE_TEXT_JOB_DEADLINE_MS,
  blockNeedsTranslation,
  languageHasTextToTranslate,
  normalizeImageTextLanguageList,
  parseConversationImageTextResponse,
  type ConversationImageTextBlock,
  type ConversationImageTextResponse,
  type ConversationImageTextStatus,
  type ConversationImageTextTranslation,
} from '@/lib/conversation-image-text'
import { localizeChineseText } from '@/server/chinese-script-conversion'
import { getConversationImage } from '@/server/conversation-image-storage'
import {
  ConversationImageTextProviderError,
  conversationImageTextProviderForModel,
  extractConversationImageText,
  finalizeConversationImageTextBlocks,
  translateConversationImageTextBlocks,
  type ConversationImageTextUsage,
} from '@/server/conversation-image-text-provider'

export const CONVERSATION_IMAGE_TEXT_MAX_OCR_ATTEMPTS = 3
export const CONVERSATION_IMAGE_TEXT_MAX_TRANSLATION_ATTEMPTS = 3
export { CONVERSATION_IMAGE_TEXT_JOB_DEADLINE_MS }
/** A failed attempt may be retried after this long. */
export const CONVERSATION_IMAGE_TEXT_RETRY_DELAY_MS = 5_000
/** Provider work in flight per process (OCR and translations together). */
export const CONVERSATION_IMAGE_TEXT_CONCURRENCY = 4
// Provider calls stop before the claim goes stale, so a slow attempt is not raced by a reclaim.
const PROVIDER_BUDGET_MS = CONVERSATION_IMAGE_TEXT_JOB_DEADLINE_MS - 5_000

type ImageTextDbStatus = 'queued' | 'running' | 'ready' | 'empty' | 'failed'
type TranslationDbStatus = 'running' | 'ready' | 'failed'

const DISABLED_FLAG_VALUES = new Set(['false', '0', 'off', 'no'])

/**
 * Kill switch: CONVERSATION_IMAGE_TEXT_ENABLED=false stops every job and makes
 * the GET answer `disabled`. Without GEMINI_API_KEY (translation, and the OCR
 * fallback) the feature is disabled too: every attempt would fail and use up
 * the photo's attempts.
 */
export function isConversationImageTextEnabled(): boolean {
  const flag = (process.env.CONVERSATION_IMAGE_TEXT_ENABLED || '').trim().toLowerCase()
  if (DISABLED_FLAG_VALUES.has(flag)) return false
  return Boolean((process.env.GEMINI_API_KEY || '').trim())
}

function createLimiter(limit: number) {
  let active = 0
  const queue: Array<() => void> = []
  const pump = () => {
    while (active < limit && queue.length > 0) {
      const start = queue.shift()
      if (!start) break
      active += 1
      start()
    }
  }
  return function runLimited<T>(task: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      queue.push(() => {
        Promise.resolve()
          .then(task)
          .then(resolve, reject)
          .finally(() => {
            active -= 1
            pump()
          })
      })
      pump()
    })
  }
}

const runLimited = createLimiter(CONVERSATION_IMAGE_TEXT_CONCURRENCY)
// Jobs already queued or running in this process. The DB claim is the real
// guard; this only stops repeated polls from queueing duplicate no-op tasks.
const inFlight = new Set<string>()

function imageJobKey(messageId: string) {
  return `image:${messageId}`
}

function translationJobKey(messageId: string, language: string) {
  return `translation:${messageId}:${language}`
}

function describeError(error: unknown): string {
  if (error instanceof ConversationImageTextProviderError) return error.status ? `${error.code}_${error.status}` : error.code
  const raw = error instanceof Error ? (error.name && error.name !== 'Error' ? error.name : error.message) : 'unknown'
  return raw.replace(/[^\w.-]+/g, '_').slice(0, 64) || 'unknown'
}

function billedOutputTokens(usage: ConversationImageTextUsage): number {
  return usage.outputTokens + usage.thoughtTokens
}

/** Stored blocks, re-validated with the client's own parser so a response always parses. */
function readStoredBlocks(value: Prisma.JsonValue | null | undefined): ConversationImageTextBlock[] {
  const parsed = parseConversationImageTextResponse({ status: 'ready', blocks: Array.isArray(value) ? value : [], translations: [] })
  return parsed?.blocks ?? []
}

function readStoredTexts(value: Prisma.JsonValue | null | undefined): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const texts: Record<string, string> = {}
  for (const [id, text] of Object.entries(value)) {
    if (typeof text === 'string' && text.trim()) texts[id] = text
  }
  return texts
}

/** The language with the most characters among the blocks, for analytics. */
export function dominantSourceLanguage(blocks: readonly ConversationImageTextBlock[]): string | null {
  const totals = new Map<string, number>()
  for (const block of blocks) {
    if (!block.sourceLanguage) continue
    totals.set(block.sourceLanguage, (totals.get(block.sourceLanguage) ?? 0) + Array.from(block.text).length)
  }
  let best: string | null = null
  let bestCount = 0
  for (const [language, count] of totals) {
    if (count > bestCount) {
      best = language
      bestCount = count
    }
  }
  return best
}

// ---------------------------------------------------------------------------
// OCR job
// ---------------------------------------------------------------------------

export type ConversationImageTextJobInput = {
  messageId: string
  sessionKey: string
  /** metadata.image.sha256 of the message. */
  imageSha256: string
  /** metadata.image.objectKey, used when `jpeg` is not in memory (old photos, retries). */
  objectKey: string
  /** The stored JPEG when the caller still has it (the upload request). */
  jpeg?: Uint8Array | null
}

async function ensureImageTextRow(messageId: string, imageSha256: string) {
  await prisma.appMessageImageText.createMany({
    data: [{ messageId, imageSha256, status: 'queued' satisfies ImageTextDbStatus, deadlineAt: new Date() }],
    skipDuplicates: true,
  })
}

/** Claims the OCR attempt: a queued job, or a failed/stale one under the attempt limit. */
async function claimImageText(messageId: string): Promise<string | null> {
  const now = new Date()
  const attemptId = randomUUID()
  const claimed = await prisma.appMessageImageText.updateMany({
    where: {
      messageId,
      attemptCount: { lt: CONVERSATION_IMAGE_TEXT_MAX_OCR_ATTEMPTS },
      OR: [
        { status: 'queued' },
        { status: { in: ['running', 'failed'] }, deadlineAt: { lt: now } },
      ],
    },
    data: {
      status: 'running' satisfies ImageTextDbStatus,
      attemptId,
      attemptCount: { increment: 1 },
      deadlineAt: new Date(now.getTime() + CONVERSATION_IMAGE_TEXT_JOB_DEADLINE_MS),
      errorCode: null,
    },
  })
  return claimed.count ? attemptId : null
}

/** Runs one claimed OCR attempt. Returns the stored blocks when this attempt's result was written. */
async function performImageTextAttempt(job: ConversationImageTextJobInput, attemptId: string): Promise<ConversationImageTextBlock[] | null> {
  const where = { messageId: job.messageId, attemptId, status: 'running' satisfies ImageTextDbStatus }
  try {
    const jpeg = job.jpeg ?? await getConversationImage(job.objectKey)
    const result = await extractConversationImageText(jpeg, { signal: AbortSignal.timeout(PROVIDER_BUDGET_MS) })
    const blocks = finalizeConversationImageTextBlocks(result.blocks)
    const status: ImageTextDbStatus = blocks.length ? 'ready' : 'empty'
    const written = await prisma.appMessageImageText.updateMany({
      where,
      data: {
        status,
        blocks: blocks as unknown as Prisma.InputJsonValue,
        sourceLanguage: dominantSourceLanguage(blocks),
        provider: conversationImageTextProviderForModel(result.model),
        model: result.model,
        promptTokens: result.usage.inputTokens,
        completionTokens: billedOutputTokens(result.usage),
        errorCode: null,
      },
    })
    return written.count ? blocks : null
  } catch (error) {
    const code = describeError(error)
    console.warn('[conversation-image-text] ocr attempt failed', { code })
    await prisma.appMessageImageText.updateMany({
      where,
      data: { status: 'failed' satisfies ImageTextDbStatus, errorCode: code, deadlineAt: new Date(Date.now() + CONVERSATION_IMAGE_TEXT_RETRY_DELAY_MS) },
    }).catch(() => {})
    return null
  }
}

/**
 * OCR for one photo message, then eager translations into the room's
 * languages at that moment. Idempotent across callers and processes (DB
 * claim). Never throws: a missing table or a provider failure only logs.
 */
export async function runConversationImageTextJob(job: ConversationImageTextJobInput): Promise<void> {
  if (!isConversationImageTextEnabled()) return
  const key = imageJobKey(job.messageId)
  if (inFlight.has(key)) return
  inFlight.add(key)
  let blocks: ConversationImageTextBlock[] | null = null
  try {
    blocks = await runLimited(async () => {
      await ensureImageTextRow(job.messageId, job.imageSha256)
      const attemptId = await claimImageText(job.messageId)
      return attemptId ? performImageTextAttempt(job, attemptId) : null
    })
  } catch (error) {
    console.error('[conversation-image-text] ocr job failed', describeError(error))
  } finally {
    inFlight.delete(key)
  }
  const ready = blocks
  if (!ready?.length) return
  try {
    const room = await listConversationTranslationLanguagesBySessionKey(job.sessionKey)
    const languages = normalizeImageTextLanguageList(room.languages).filter(language => languageHasTextToTranslate(ready, language))
    if (languages.length) await runConversationImageTextTranslations({ messageId: job.messageId, languages })
  } catch (error) {
    console.error('[conversation-image-text] eager translation failed', describeError(error))
  }
}

// ---------------------------------------------------------------------------
// Translations
// ---------------------------------------------------------------------------

/** Claims one language: a new row, or a failed/stale one under the attempt limit. */
async function claimTranslation(messageId: string, language: string): Promise<string | null> {
  const now = new Date()
  const attemptId = randomUUID()
  const deadlineAt = new Date(now.getTime() + CONVERSATION_IMAGE_TEXT_JOB_DEADLINE_MS)
  const created = await prisma.appMessageImageTextTranslation.createMany({
    data: [{ messageId, language, status: 'running' satisfies TranslationDbStatus, attemptId, attemptCount: 1, deadlineAt }],
    skipDuplicates: true,
  })
  if (created.count) return attemptId
  const claimed = await prisma.appMessageImageTextTranslation.updateMany({
    where: {
      messageId,
      language,
      attemptCount: { lt: CONVERSATION_IMAGE_TEXT_MAX_TRANSLATION_ATTEMPTS },
      status: { in: ['running', 'failed'] },
      deadlineAt: { lt: now },
    },
    data: { status: 'running' satisfies TranslationDbStatus, attemptId, attemptCount: { increment: 1 }, deadlineAt, errorCode: null },
  })
  return claimed.count ? attemptId : null
}

type TranslationOutcome = {
  texts: Record<string, string>
  derivedFrom: string | null
  provider: string
  model: string | null
  usage: ConversationImageTextUsage | null
}

/**
 * zh-CN and zh-TW are one script conversion apart, never a translation: a
 * block written in the other variant is converted, and the rest is converted
 * from the other variant's finished translation when there is one.
 */
async function translateBlocksInto(messageId: string, language: string, blocks: ConversationImageTextBlock[], signal: AbortSignal): Promise<TranslationOutcome> {
  const variant = toChineseVariant(language)
  if (!variant) {
    const result = await translateConversationImageTextBlocks(blocks, language, { signal })
    return { texts: result.texts, derivedFrom: null, provider: 'gemini', model: result.model, usage: result.usage }
  }
  const sibling = getSiblingChineseVariant(variant)
  const texts: Record<string, string> = {}
  const rest: ConversationImageTextBlock[] = []
  for (const block of blocks) {
    if (block.sourceLanguage === sibling) texts[block.id] = localizeChineseText(block.text, variant)
    else rest.push(block)
  }
  if (!rest.length) return { texts, derivedFrom: null, provider: 'opencc', model: null, usage: null }
  const siblingRow = await prisma.appMessageImageTextTranslation.findUnique({
    where: { messageId_language: { messageId, language: sibling } },
    select: { status: true, texts: true, derivedFrom: true },
  })
  if (siblingRow?.status === 'ready' && !siblingRow.derivedFrom) {
    const siblingTexts = readStoredTexts(siblingRow.texts)
    for (const block of rest) {
      const source = siblingTexts[block.id]
      if (source) texts[block.id] = localizeChineseText(source, variant)
    }
    return { texts, derivedFrom: sibling, provider: 'opencc', model: null, usage: null }
  }
  const result = await translateConversationImageTextBlocks(rest, language, { signal })
  return { texts: { ...texts, ...result.texts }, derivedFrom: null, provider: 'gemini', model: result.model, usage: result.usage }
}

async function performTranslationAttempt(messageId: string, language: string, blocks: ConversationImageTextBlock[], attemptId: string) {
  const where = { messageId, language, attemptId, status: 'running' satisfies TranslationDbStatus }
  try {
    const outcome = await translateBlocksInto(messageId, language, blocks, AbortSignal.timeout(PROVIDER_BUDGET_MS))
    await prisma.appMessageImageTextTranslation.updateMany({
      where,
      data: {
        status: 'ready' satisfies TranslationDbStatus,
        texts: outcome.texts,
        derivedFrom: outcome.derivedFrom,
        provider: outcome.provider,
        model: outcome.model,
        promptTokens: outcome.usage?.inputTokens ?? null,
        completionTokens: outcome.usage ? billedOutputTokens(outcome.usage) : null,
        errorCode: null,
      },
    })
  } catch (error) {
    const code = describeError(error)
    console.warn('[conversation-image-text] translation attempt failed', { code, language })
    await prisma.appMessageImageTextTranslation.updateMany({
      where,
      data: { status: 'failed' satisfies TranslationDbStatus, errorCode: code, deadlineAt: new Date(Date.now() + CONVERSATION_IMAGE_TEXT_RETRY_DELAY_MS) },
    }).catch(() => {})
  }
}

async function runTranslationTask(messageId: string, language: string) {
  const image = await prisma.appMessageImageText.findUnique({ where: { messageId }, select: { status: true, blocks: true } })
  if (image?.status !== 'ready') return
  // Only blocks not already in the target language are sent (same-language skip).
  const blocks = readStoredBlocks(image.blocks).filter(block => blockNeedsTranslation(block, language))
  if (!blocks.length) return
  const attemptId = await claimTranslation(messageId, language)
  if (attemptId) await performTranslationAttempt(messageId, language, blocks, attemptId)
}

/** Both Chinese variants share one lane, so the second waits for the first and is converted from it. */
function buildTranslationLanes(languages: readonly string[]): string[][] {
  const lanes: string[][] = []
  let chineseLane: string[] | null = null
  for (const language of languages) {
    if (!toChineseVariant(language)) {
      lanes.push([language])
    } else if (chineseLane) {
      chineseLane.push(language)
    } else {
      chineseLane = [language]
      lanes.push(chineseLane)
    }
  }
  return lanes
}

/**
 * Translates a ready photo's text into each language that has text to
 * translate and no finished (or running) translation yet. Never throws.
 */
export async function runConversationImageTextTranslations(input: { messageId: string; languages: readonly string[] }): Promise<void> {
  if (!isConversationImageTextEnabled()) return
  const languages = normalizeImageTextLanguageList(input.languages)
    .filter(language => !inFlight.has(translationJobKey(input.messageId, language)))
  for (const language of languages) inFlight.add(translationJobKey(input.messageId, language))
  await Promise.all(buildTranslationLanes(languages).map(async lane => {
    for (const language of lane) {
      try {
        await runLimited(() => runTranslationTask(input.messageId, language))
      } catch (error) {
        console.error('[conversation-image-text] translation job failed', describeError(error))
      } finally {
        inFlight.delete(translationJobKey(input.messageId, language))
      }
    }
  }))
}

// ---------------------------------------------------------------------------
// Read model
// ---------------------------------------------------------------------------

type AttemptRow = { status: string; attemptCount: number; deadlineAt: Date }

export type StoredConversationImageText = AttemptRow & {
  blocks: Prisma.JsonValue | null
  translations: Array<AttemptRow & { language: string; texts: Prisma.JsonValue | null }>
}

export type ConversationImageTextReadResult = {
  response: ConversationImageTextResponse
  /** Schedule runConversationImageTextJob: no job yet, an unclaimed one, or a retryable attempt. */
  runImageJob: boolean
  /** Languages to hand to runConversationImageTextTranslations. */
  translateLanguages: string[]
}

/** 'wait' = in progress or cooling down, 'retry' = claimable now, 'failed' = attempts used up. */
function attemptState(row: AttemptRow, maxAttempts: number, now: Date): 'wait' | 'retry' | 'failed' {
  if (row.status === 'queued') return 'retry'
  if (row.status !== 'running' && row.status !== 'failed') return 'failed'
  const expired = row.deadlineAt.getTime() < now.getTime()
  if (row.status === 'running' && !expired) return 'wait'
  if (row.attemptCount >= maxAttempts) return 'failed'
  return expired ? 'retry' : 'wait'
}

function statusResponse(status: ConversationImageTextStatus): ConversationImageTextResponse {
  return status === 'pending'
    ? { status, blocks: [], translations: [], retryAfterMs: CONVERSATION_IMAGE_TEXT_POLL_MS }
    : { status, blocks: [], translations: [] }
}

/** Pure mapping from DB rows to the contract response plus the side effects the GET should schedule. */
export function mapConversationImageTextState(
  row: StoredConversationImageText | null,
  languages: readonly string[],
  now: Date = new Date(),
): ConversationImageTextReadResult {
  if (!row) return { response: statusResponse('pending'), runImageJob: true, translateLanguages: [] }
  if (row.status === 'empty') return { response: statusResponse('empty'), runImageJob: false, translateLanguages: [] }
  if (row.status !== 'ready') {
    const state = attemptState(row, CONVERSATION_IMAGE_TEXT_MAX_OCR_ATTEMPTS, now)
    return state === 'failed'
      ? { response: statusResponse('failed'), runImageJob: false, translateLanguages: [] }
      : { response: statusResponse('pending'), runImageJob: state === 'retry', translateLanguages: [] }
  }
  const blocks = readStoredBlocks(row.blocks)
  if (!blocks.length) return { response: statusResponse('empty'), runImageJob: false, translateLanguages: [] }

  const translations: ConversationImageTextTranslation[] = []
  const translateLanguages: string[] = []
  for (const language of languages) {
    if (!languageHasTextToTranslate(blocks, language)) continue
    const stored = row.translations.find(entry => entry.language === language)
    if (stored?.status === 'ready') {
      const storedTexts = readStoredTexts(stored.texts)
      const texts: Record<string, string> = {}
      for (const block of blocks) {
        if (blockNeedsTranslation(block, language) && storedTexts[block.id]) texts[block.id] = storedTexts[block.id]
      }
      translations.push({ language, status: 'ready', texts })
      continue
    }
    const state = stored ? attemptState(stored, CONVERSATION_IMAGE_TEXT_MAX_TRANSLATION_ATTEMPTS, now) : 'retry'
    if (state === 'retry') translateLanguages.push(language)
    translations.push({ language, status: state === 'failed' ? 'failed' : 'pending', texts: {} })
  }
  const pending = translations.some(entry => entry.status === 'pending')
  return {
    response: { status: 'ready', blocks, translations, ...(pending ? { retryAfterMs: CONVERSATION_IMAGE_TEXT_POLL_MS } : {}) },
    runImageJob: false,
    translateLanguages,
  }
}

/** Reads the job and the requested languages' translations; `languages` must already be normalized. */
export async function readConversationImageTextState(messageId: string, languages: readonly string[]): Promise<ConversationImageTextReadResult> {
  const row = await prisma.appMessageImageText.findUnique({
    where: { messageId },
    select: {
      status: true,
      attemptCount: true,
      deadlineAt: true,
      blocks: true,
      translations: {
        where: { language: { in: [...languages] } },
        select: { language: true, status: true, attemptCount: true, deadlineAt: true, texts: true },
      },
    },
  })
  return mapConversationImageTextState(row, languages)
}
