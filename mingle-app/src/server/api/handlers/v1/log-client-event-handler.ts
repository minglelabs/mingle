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

// This is a defensive ceiling for a client-reported single-turn duration, not a
// usage or billing limit. A normal turn should be much shorter, but the generous
// ceiling avoids rejecting a genuinely long uninterrupted utterance while still
// blocking stale/background timers measured in hours or days.
const MAX_REPORTED_TURN_DURATION_MS = 30 * 60 * 1000

type DurationValidation = {
  sttDurationMs: number | null | undefined
  totalDurationMs: number | null | undefined
  anomaly: {
    fields: string[]
    reasons: string[]
  } | null
}

function validateReportedTurnDurations(body: Record<string, unknown>): DurationValidation {
  const hasSttDuration = Object.prototype.hasOwnProperty.call(body, 'sttDurationMs')
  const hasTotalDuration = Object.prototype.hasOwnProperty.call(body, 'totalDurationMs')
  const anomalyFields: string[] = []
  const anomalyReasons: string[] = []

  const addAnomaly = (field: string, reason: string) => {
    if (!anomalyFields.includes(field)) anomalyFields.push(field)
    if (!anomalyReasons.includes(reason)) anomalyReasons.push(reason)
  }

  const sanitizeDuration = (field: string, present: boolean): number | null | undefined => {
    if (!present) return undefined
    const parsed = sanitizeNonNegativeInt(body[field])
    if (parsed === null) {
      addAnomaly(field, 'not_a_non_negative_integer')
      return null
    }
    if (parsed > MAX_REPORTED_TURN_DURATION_MS) {
      addAnomaly(field, 'exceeds_max_reported_turn_duration')
      return null
    }
    return parsed
  }

  const sttDurationMs = sanitizeDuration('sttDurationMs', hasSttDuration)
  let totalDurationMs = sanitizeDuration('totalDurationMs', hasTotalDuration)

  if (sttDurationMs === null && totalDurationMs !== undefined && totalDurationMs !== null) {
    totalDurationMs = null
    addAnomaly('totalDurationMs', 'paired_with_invalid_stt_duration')
  } else if (
    typeof sttDurationMs === 'number'
    && typeof totalDurationMs === 'number'
    && totalDurationMs < sttDurationMs
  ) {
    totalDurationMs = null
    addAnomaly('totalDurationMs', 'less_than_stt_duration')
  }

  return {
    sttDurationMs,
    totalDurationMs,
    anomaly: anomalyFields.length > 0
      ? { fields: anomalyFields, reasons: anomalyReasons }
      : null,
  }
}

function addDurationAnomalyMetadata(
  metadata: Prisma.JsonObject,
  anomaly: DurationValidation['anomaly'],
) {
  if (!anomaly) return
  metadata.durationAnomaly = true
  metadata.durationAnomalyFields = anomaly.fields
  metadata.durationAnomalyReasons = anomaly.reasons
  metadata.durationAnomalyMaxMs = MAX_REPORTED_TURN_DURATION_MS
}

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
  const durationValidation = validateReportedTurnDurations(body)
  const { sttDurationMs, totalDurationMs } = durationValidation
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
      addDurationAnomalyMetadata(messageMetadata, durationValidation.anomaly)

      if (
        process.env.NODE_ENV !== 'production'
        && !(typeof clientMetadata?.speaker === 'string' && clientMetadata.speaker.trim())
      ) {
        console.warn('[log-client-event] persisting stt_turn_finalized without speaker info', {
          clientMessageId,
          sessionKey: tracking.sessionKey,
        })
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
            sttDurationMs,
            totalDurationMs,
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
            sttDurationMs,
            totalDurationMs,
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
    if (typeof sttDurationMs === 'number') eventMetadata.sttDurationMs = sttDurationMs
    if (typeof totalDurationMs === 'number') eventMetadata.totalDurationMs = totalDurationMs
    addDurationAnomalyMetadata(eventMetadata, durationValidation.anomaly)
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
