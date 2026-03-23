import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { ensureTrackingContext, sanitizeNonNegativeInt } from '@/lib/app-analytics'
import { sanitizeText, sanitizeTranslations } from '@/app/api/log/client-event/sanitize'
import { extractTimelineFromEventMetadata } from '@/server/api/handlers/v1/live-event-contract'
import { LIVE_SYNC_DELTA_READ_ENABLED } from '@/server/api/handlers/v1/live-sync-flags'

export const runtime = 'nodejs'

const DEFAULT_DELTA_LIMIT = 50
const MAX_DELTA_LIMIT = 200
const LOOKUP_WINDOW_FLOOR = 240
const LOOKUP_WINDOW_MULTIPLIER = 12

function parseDeltaLimit(rawValue: string | null): number {
  const parsed = sanitizeNonNegativeInt(rawValue)
  if (parsed === null || parsed <= 0) return DEFAULT_DELTA_LIMIT
  return Math.min(parsed, MAX_DELTA_LIMIT)
}

function parseAfterSeq(rawValue: string | null): number | null {
  if (rawValue == null || rawValue.trim() === '') return -1
  return sanitizeNonNegativeInt(rawValue)
}

function extractMetadataRecord(metadata: unknown): Record<string, unknown> {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return {}
  return metadata as Record<string, unknown>
}

export async function handleGetLogClientEventDeltaV1(request: NextRequest) {
  const query = request.nextUrl.searchParams
  const sessionKeyHint = sanitizeText(query.get('sessionKey'), 128)
  const afterSeq = parseAfterSeq(query.get('afterSeq'))

  if (afterSeq === null) {
    const response = NextResponse.json({ error: 'afterSeq must be a non-negative integer.' }, { status: 400 })
    ensureTrackingContext(request, response, { sessionKeyHint })
    return response
  }

  if (!LIVE_SYNC_DELTA_READ_ENABLED) {
    const response = NextResponse.json({ error: 'delta_read_disabled' }, { status: 503 })
    ensureTrackingContext(request, response, { sessionKeyHint })
    return response
  }

  const cookieCarrier = NextResponse.json({ ok: true })
  const tracking = ensureTrackingContext(request, cookieCarrier, { sessionKeyHint })
  const sessionKey = sessionKeyHint || tracking.sessionKey
  const limit = parseDeltaLimit(query.get('limit'))
  const lookupWindow = Math.min(1000, Math.max(limit * LOOKUP_WINDOW_MULTIPLIER, LOOKUP_WINDOW_FLOOR))

  try {
    const rows = await prisma.appEventLog.findMany({
      where: { sessionKey },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: lookupWindow,
      select: {
        id: true,
        eventType: true,
        messageId: true,
        metadata: true,
        createdAt: true,
      },
    })

    const events = rows
      .map((row) => {
        const timeline = extractTimelineFromEventMetadata(row.metadata)
        if (!timeline || timeline.seq <= afterSeq) return null

        const metadata = extractMetadataRecord(row.metadata)
        const translations = sanitizeTranslations(metadata.translations)

        return {
          seq: timeline.seq,
          eventId: timeline.eventId,
          sessionId: timeline.sessionId || sessionKey,
          schemaVersion: timeline.schemaVersion,
          eventType: timeline.eventType || row.eventType,
          clientMessageId: timeline.clientMessageId || sanitizeText(metadata.clientMessageId, 128),
          sourceLanguage: sanitizeText(metadata.sourceLanguage, 16),
          sourceText: sanitizeText(metadata.sourceText, 20000),
          translations,
          sttDurationMs: sanitizeNonNegativeInt(metadata.sttDurationMs),
          totalDurationMs: sanitizeNonNegativeInt(metadata.totalDurationMs),
          provider: sanitizeText(metadata.provider, 64),
          model: sanitizeText(metadata.model, 128),
          clientCreatedAt: timeline.clientCreatedAtIso,
          serverCreatedAt: row.createdAt.toISOString(),
          logId: row.id,
          messageId: row.messageId,
        }
      })
      .filter((event): event is NonNullable<typeof event> => Boolean(event))
      .sort((left, right) => (
        left.seq - right.seq
        || left.serverCreatedAt.localeCompare(right.serverCreatedAt)
        || left.logId.localeCompare(right.logId)
      ))

    const hasMore = events.length > limit || rows.length === lookupWindow
    const slicedEvents = events.slice(0, limit)
    const nextSeq = slicedEvents.length > 0
      ? slicedEvents[slicedEvents.length - 1].seq
      : afterSeq

    const response = NextResponse.json({
      ok: true,
      sessionKey,
      afterSeq,
      nextSeq,
      hasMore,
      events: slicedEvents,
    })

    for (const cookie of cookieCarrier.cookies.getAll()) {
      response.cookies.set(cookie)
    }

    return response
  } catch (error) {
    console.error('Client event delta read failed:', error)
    const response = NextResponse.json({ error: 'client_event_delta_read_failed' }, { status: 500 })
    ensureTrackingContext(request, response, { sessionKeyHint: sessionKey })
    return response
  }
}
