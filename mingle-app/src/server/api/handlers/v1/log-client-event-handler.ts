import type { Prisma } from '@prisma/client/index'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import {
  createTrackedEventLog,
  ensureTrackingContext,
  parseClientContext,
  sanitizeNonNegativeInt,
  upsertTrackedUser,
} from '@/lib/app-analytics'
import {
  CONVERSATION_HISTORY_CLEARED_EVENT_TYPE,
  parseConversationMessageCreatedAtMs,
} from '@/lib/conversation-history-clear'
import {
  normalizeLang,
  sanitizeJsonObject,
  sanitizeText,
  sanitizeTranslations,
} from '@/app/api/log/client-event/sanitize'
import { maybeGenerateConversationTitleForSession } from '@/server/conversation-auto-title'

export const runtime = 'nodejs'

const ALLOWED_EVENT_TYPES = new Set([
  'stt_session_started',
  'stt_session_stopped',
  'stt_turn_started',
  'stt_turn_finalized',
])

function stripEndpointMarkers(text: string): string {
  return text.replace(/<\/?(?:end|fin)>/giu, '')
}

async function shouldSkipFinalizedTurnPersistence(args: {
  clientMessageId: string
  sessionKey: string
}): Promise<boolean> {
  const { clientMessageId, sessionKey } = args
  if (!sessionKey) return false

  const latestConversationClearEvent = await prisma.appEventLog.findFirst({
    where: {
      sessionKey,
      eventType: CONVERSATION_HISTORY_CLEARED_EVENT_TYPE,
    },
    orderBy: { createdAt: 'desc' },
    select: {
      createdAt: true,
      metadata: true,
    },
  })
  if (!latestConversationClearEvent) return false

  const metadata = (
    latestConversationClearEvent.metadata
    && typeof latestConversationClearEvent.metadata === 'object'
    && !Array.isArray(latestConversationClearEvent.metadata)
  ) ? latestConversationClearEvent.metadata as Record<string, unknown> : null

  const clearCutoffMs = sanitizeNonNegativeInt(metadata?.clientClearedAtMs)
    ?? latestConversationClearEvent.createdAt.getTime()
  const messageCreatedAtMs = parseConversationMessageCreatedAtMs(clientMessageId)

  if (messageCreatedAtMs === null) {
    return false
  }

  return messageCreatedAtMs <= clearCutoffMs
}

export async function handleLogClientEventV1(request: NextRequest) {
  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    const response = NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
    ensureTrackingContext(request, response)
    return response
  }

  const eventType = sanitizeText(body.eventType, 64)
  const sessionKeyHint = sanitizeText(body.sessionKey, 128)
  const clientMessageId = sanitizeText(body.clientMessageId, 128)
  const sourceLanguage = normalizeLang(body.sourceLanguage)
  const sourceTextRaw = sanitizeText(body.sourceText, 20000)
  const sourceText = sourceTextRaw ? stripEndpointMarkers(sourceTextRaw).trim() : null
  const sttDurationMs = sanitizeNonNegativeInt(body.sttDurationMs)
  const totalDurationMs = sanitizeNonNegativeInt(body.totalDurationMs)
  const provider = sanitizeText(body.provider, 64)
  const infrastructureProvider = sanitizeText(body.infrastructureProvider, 64)
  const model = sanitizeText(body.model, 128)
  const translationPromptTokens = sanitizeNonNegativeInt(body.translationPromptTokens)
  const translationCompletionTokens = sanitizeNonNegativeInt(body.translationCompletionTokens)
  const translationTotalTokens = sanitizeNonNegativeInt(body.translationTotalTokens)
  const translations = sanitizeTranslations(body.translations)
  const clientMetadata = sanitizeJsonObject(body.metadata)
  const clientContext = parseClientContext(body.clientContext)
  const usageSecFromBody = sanitizeNonNegativeInt(body.usageSec)

  if (usageSecFromBody !== null) {
    clientContext.usageSec = usageSecFromBody
  }

  if (!eventType || !ALLOWED_EVENT_TYPES.has(eventType)) {
    const response = NextResponse.json({ error: 'eventType is invalid.' }, { status: 400 })
    ensureTrackingContext(request, response, { sessionKeyHint })
    return response
  }

  const response = NextResponse.json({ ok: true })
  const tracking = ensureTrackingContext(request, response, { sessionKeyHint })

  try {
    const userId = await upsertTrackedUser({ tracking, clientContext })
    let messageId: string | null = null

    if (eventType === 'stt_turn_finalized' && clientMessageId && sourceText) {
      const shouldIgnoreDueToConversationClear = await shouldSkipFinalizedTurnPersistence({
        clientMessageId,
        sessionKey: tracking.sessionKey,
      })

      const messageMetadata: Prisma.JsonObject = {
        clientMessageId,
        sourceLanguage,
        provider: provider ?? null,
        infrastructureProvider: infrastructureProvider ?? null,
        model: model ?? null,
        translationLanguages: Object.keys(translations),
      }
      if (clientMetadata) {
        messageMetadata.clientMetadata = clientMetadata
      }

      if (!shouldIgnoreDueToConversationClear) {
        const message = await prisma.appMessage.upsert({
          where: {
            sessionKey_clientMessageId: {
              sessionKey: tracking.sessionKey,
              clientMessageId,
            },
          },
          create: {
            user: {
              connect: { id: userId },
            },
            sessionKey: tracking.sessionKey,
            clientMessageId,
            isDeleted: false,
            sourceLanguage,
            translationProvider: infrastructureProvider ?? provider ?? undefined,
            translationModel: model ?? undefined,
            translationPromptTokens: translationPromptTokens ?? undefined,
            translationCompletionTokens: translationCompletionTokens ?? undefined,
            translationTotalTokens: translationTotalTokens ?? undefined,
            sttDurationMs: sttDurationMs ?? undefined,
            totalDurationMs: totalDurationMs ?? undefined,
            metadata: messageMetadata,
          },
          update: {
            user: {
              connect: { id: userId },
            },
            isDeleted: false,
            sourceLanguage,
            translationProvider: infrastructureProvider ?? provider ?? undefined,
            translationModel: model ?? undefined,
            translationPromptTokens: translationPromptTokens ?? undefined,
            translationCompletionTokens: translationCompletionTokens ?? undefined,
            translationTotalTokens: translationTotalTokens ?? undefined,
            sttDurationMs: sttDurationMs ?? undefined,
            totalDurationMs: totalDurationMs ?? undefined,
            metadata: messageMetadata,
          },
          select: {
            id: true,
          },
        })
        messageId = message.id

        await prisma.appMessageContent.upsert({
          where: {
            messageId_contentType_language: {
              messageId: message.id,
              contentType: 'SOURCE',
              language: sourceLanguage,
            },
          },
          create: {
            messageId: message.id,
            contentType: 'SOURCE',
            language: sourceLanguage,
            isDeleted: false,
            text: sourceText,
            provider: infrastructureProvider ?? provider ?? undefined,
            model: model ?? undefined,
          },
          update: {
            isDeleted: false,
            text: sourceText,
            provider: infrastructureProvider ?? provider ?? undefined,
            model: model ?? undefined,
          },
        })

        for (const [language, translatedText] of Object.entries(translations)) {
          await prisma.appMessageContent.upsert({
            where: {
              messageId_contentType_language: {
                messageId: message.id,
                contentType: 'TRANSLATION_FINAL',
                language,
              },
            },
            create: {
              messageId: message.id,
              contentType: 'TRANSLATION_FINAL',
              language,
              isDeleted: false,
              text: translatedText,
              provider: infrastructureProvider ?? provider ?? undefined,
              model: model ?? undefined,
            },
            update: {
              isDeleted: false,
              text: translatedText,
              provider: infrastructureProvider ?? provider ?? undefined,
              model: model ?? undefined,
            },
          })
        }

        try {
          await maybeGenerateConversationTitleForSession({
            sessionKey: tracking.sessionKey,
          })
        } catch (error) {
          console.error('Conversation auto title generation failed:', error)
        }
      }
    }

    const eventMetadata: Prisma.JsonObject = {}
    if (clientMessageId) eventMetadata.clientMessageId = clientMessageId
    if (sourceLanguage && sourceLanguage !== 'unknown') eventMetadata.sourceLanguage = sourceLanguage
    if (sourceText) eventMetadata.sourceTextLength = sourceText.length
    if (Object.keys(translations).length > 0) eventMetadata.translations = translations
    if (provider) eventMetadata.provider = provider
    if (infrastructureProvider) eventMetadata.infrastructureProvider = infrastructureProvider
    if (model) eventMetadata.model = model
    if (translationPromptTokens !== null) eventMetadata.translationPromptTokens = translationPromptTokens
    if (translationCompletionTokens !== null) eventMetadata.translationCompletionTokens = translationCompletionTokens
    if (translationTotalTokens !== null) eventMetadata.translationTotalTokens = translationTotalTokens
    if (sttDurationMs !== null) eventMetadata.sttDurationMs = sttDurationMs
    if (totalDurationMs !== null) eventMetadata.totalDurationMs = totalDurationMs
    if (clientMetadata) eventMetadata.clientMetadata = clientMetadata

    await createTrackedEventLog({
      userId,
      tracking,
      clientContext,
      sessionKey: tracking.sessionKey,
      messageId,
      eventType,
      metadata: Object.keys(eventMetadata).length > 0 ? eventMetadata : undefined,
    })

    return response
  } catch (error) {
    console.error('Client event logging failed:', error)
    const errorResponse = NextResponse.json({ error: 'client_event_log_failed' }, { status: 500 })
    ensureTrackingContext(request, errorResponse, { sessionKeyHint })
    return errorResponse
  }
}
