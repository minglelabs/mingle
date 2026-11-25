import type { Prisma } from '@prisma/client'
import { listChannelMemberUserIdsBySessionKey } from '@/lib/app-conversations'
import { readMessageRecalledAtMs } from '@/lib/message-recall'
import { prisma } from '@/lib/prisma'
import { canonicalizeTranslationLanguageCode } from '@/lib/translation-languages'
import { normalizeSelectableTranslationModel, resolveDefaultSelectableTranslationModel } from '@/lib/translation-models'
import { readVoiceCaptionTag } from '@/lib/voice-caption'
import { normalizeChineseContent } from '@/server/chinese-script-conversion'
import { notifyConversationMessage } from '@/server/conversation-realtime'
import { isPhotoMessageMetadata } from '@/server/operator-inbox/staff-translate'
import { translateTexts } from '@/server/translation/translate-texts'

/**
 * A chat message that was stored without some of its translations gets them
 * from the server (staff, 2026-11-23: a typed message whose translation
 * request the sender's app cut off after 1.2 s was stored as `unknown`, with
 * no translation at all, and stayed that way for everyone).
 *
 * Runs a little after the message is stored, so the sender's own app gets the
 * first chance (its translation arrives as a `translationUpdate`). Only adds
 * what is still missing — never overwrites a translation the app stored —
 * and is not billed: the sender already paid for, or was refused, the
 * original request. When the source language was never detected, the same
 * call detects it and the message is relabeled.
 */
export const BACKFILL_DELAY_MS = 8_000

const UNKNOWN = 'unknown'

function isLive(row: { isDeleted: boolean | null }): boolean {
  return row.isDeleted !== true
}

function canonical(language: string | null | undefined): string {
  const value = (language ?? '').trim()
  if (!value || value === UNKNOWN) return ''
  return canonicalizeTranslationLanguageCode(value) || ''
}

/** Languages still to translate into: requested, not the source, not stored yet. */
export function missingTranslationLanguages(args: { targetLanguages: string[]; sourceLanguage: string; stored: string[] }): string[] {
  const source = canonical(args.sourceLanguage)
  const stored = new Set(args.stored.map(canonical).filter(Boolean))
  const wanted = [...new Set(args.targetLanguages.map(canonical).filter(Boolean))]
  return wanted.filter((language) => language !== source && !stored.has(language))
}

/** Whether a just-stored message needs the server's help at all (cheap, no database). */
export function needsTranslationBackfill(args: { targetLanguages: string[]; sourceLanguage: string; translations: Record<string, string> }): boolean {
  if (!canonical(args.sourceLanguage)) return true
  return missingTranslationLanguages({ ...args, stored: Object.keys(args.translations) }).length > 0
}

export type BackfillResult = { added: string[]; relabeled: string | null } | null

export async function backfillMessageTranslations(args: { messageId: string; sessionKey: string; targetLanguages: string[] }): Promise<BackfillResult> {
  const message = await prisma.appMessage.findUnique({
    where: { id: args.messageId },
    select: {
      id: true, userId: true, clientMessageId: true, isDeleted: true, sourceLanguage: true, metadata: true,
      contents: { select: { contentType: true, language: true, text: true, isDeleted: true } },
    },
  })
  if (!message || message.isDeleted || readMessageRecalledAtMs(message.metadata) !== null) return null
  if (isPhotoMessageMetadata(message.metadata) || readVoiceCaptionTag(message.metadata as Prisma.JsonObject | null)) return null

  const sources = message.contents.filter((row) => row.contentType === 'SOURCE' && isLive(row) && row.text.trim())
  const source = sources.find((row) => canonical(row.language)) ?? sources[0]
  const sourceText = source?.text.trim() ?? ''
  if (!sourceText) return null
  const knownSource = canonical(message.sourceLanguage) || canonical(source?.language)
  const stored = message.contents.filter((row) => row.contentType === 'TRANSLATION_FINAL' && isLive(row) && row.text.trim()).map((row) => row.language)
  const missing = missingTranslationLanguages({ targetLanguages: args.targetLanguages, sourceLanguage: knownSource, stored })
  if (knownSource && missing.length === 0) return null

  const sender = message.userId
    ? await prisma.user.findUnique({ where: { id: message.userId }, select: { translationModel: true } })
    : null
  const modelSelection = normalizeSelectableTranslationModel(sender?.translationModel) ?? resolveDefaultSelectableTranslationModel()
  // Without a known source, ask for every requested language; the detected source is dropped below.
  const requested = missing.length > 0 ? missing : missingTranslationLanguages({ targetLanguages: args.targetLanguages, sourceLanguage: '', stored })
  if (requested.length === 0) return null

  let result: Awaited<ReturnType<typeof translateTexts>>
  try {
    result = await translateTexts({
      text: sourceText,
      sourceLanguage: knownSource || 'auto',
      targetLanguages: requested,
      redetectSourceLanguage: !knownSource,
      modelSelection,
      isFinal: true,
    })
  } catch (error) {
    // Never log the message text.
    console.warn('[translation-backfill] translation_failed', { error: error instanceof Error ? error.name : 'unknown' })
    return null
  }
  const detected = knownSource || canonical(result.detectedSourceLanguage)
  const normalized = normalizeChineseContent({
    sourceLanguage: detected || UNKNOWN,
    sourceText,
    translations: result.translations,
    targetLanguages: requested,
    candidates: requested,
  })
  const finalSource = canonical(normalized.sourceLanguage) || detected
  const translations = Object.entries(normalized.translations)
    .map(([language, text]) => [canonical(language), text.trim()] as const)
    .filter(([language, text]) => language && text && language !== finalSource && requested.includes(language))
  const relabel = !knownSource && finalSource ? finalSource : null
  if (translations.length === 0 && !relabel) return null

  const added = await prisma.$transaction(async (tx) => {
    // Same lock as the finalize upsert, the retranslate and the recall.
    if (message.clientMessageId) {
      const lockKey = JSON.stringify([args.sessionKey, message.clientMessageId])
      await tx.$queryRaw`SELECT true AS locked FROM pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`
    }
    const current = await tx.appMessage.findUnique({ where: { id: message.id }, select: { isDeleted: true, metadata: true } })
    if (!current || current.isDeleted || readMessageRecalledAtMs(current.metadata) !== null) return null
    // Only what is still missing: a translation the app stored meanwhile wins.
    const created = await tx.appMessageContent.createMany({
      data: translations.map(([language, text]) => ({
        messageId: message.id,
        contentType: 'TRANSLATION_FINAL' as const,
        language,
        isDeleted: false,
        text,
        provider: result.provider ?? null,
        model: result.model ?? null,
        metadata: { serverBackfilledAtMs: Date.now() },
      })),
      skipDuplicates: true,
    })
    const metadata = (current.metadata && typeof current.metadata === 'object' && !Array.isArray(current.metadata) ? current.metadata : {}) as Prisma.JsonObject
    const previous = Array.isArray(metadata.translationLanguages) ? metadata.translationLanguages.filter((value): value is string => typeof value === 'string') : []
    const nextMetadata: Prisma.JsonObject = {
      ...metadata,
      translationLanguages: [...new Set([...previous, ...translations.map(([language]) => language)])],
      ...(relabel ? { sourceLanguage: relabel } : {}),
    }
    if (relabel) {
      await tx.appMessageContent.createMany({
        data: [{ messageId: message.id, contentType: 'SOURCE' as const, language: relabel, isDeleted: false, text: sourceText }],
        skipDuplicates: true,
      })
    }
    await tx.appMessage.update({
      where: { id: message.id },
      data: { metadata: nextMetadata, ...(relabel ? { sourceLanguage: relabel } : {}) },
    })
    return created.count > 0 || relabel ? translations.map(([language]) => language) : null
  })
  if (!added) return null

  // Open rooms pick the translations up on their next hydration.
  const members = await listChannelMemberUserIdsBySessionKey(args.sessionKey).catch(() => [])
  await notifyConversationMessage(args.sessionKey, members, undefined, { timeoutMs: 3000 })
  return { added, relabeled: relabel }
}
