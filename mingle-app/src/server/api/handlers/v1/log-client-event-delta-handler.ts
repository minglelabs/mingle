import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { ensureTrackingContext, sanitizeNonNegativeInt } from '@/lib/app-analytics'
import { sanitizeText, sanitizeTranslations } from '@/app/api/log/client-event/sanitize'
import { extractTimelineFromEventMetadata } from '@/server/api/handlers/v1/live-event-contract'
import { LIVE_SYNC_DELTA_READ_ENABLED } from '@/server/api/handlers/v1/live-sync-flags'
import { sliceDeltaEventsForCursor } from '@/server/api/handlers/v1/log-client-event-delta-slice'

export const runtime = 'nodejs'

const DEFAULT_DELTA_LIMIT = 50
const MAX_DELTA_LIMIT = 200
const LOOKUP_WINDOW_FLOOR = 240
const LOOKUP_WINDOW_MULTIPLIER = 12
const MAX_DELTA_SCAN_ROWS = 5000

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

type DeltaLogRow = {
  id: string
  eventType: string
  messageId: string | null
  metadata: unknown
  createdAt: Date
}

async function queryDeltaRowsByTimelineSeq(args: {
  sessionKey: string
  afterSeq: number
  scanLimit: number
}): Promise<DeltaLogRow[]> {
  const safeLimit = Math.max(1, args.scanLimit)

  return prisma.$queryRaw<DeltaLogRow[]>(Prisma.sql`
    SELECT
      id,
      event_type AS "eventType",
      message_id AS "messageId",
      metadata,
      created_at AS "createdAt"
    FROM app_event_logs
    WHERE session_key = ${args.sessionKey}
      AND metadata IS NOT NULL
      AND jsonb_typeof(metadata) = 'object'
      AND jsonb_typeof(metadata -> 'timeline') = 'object'
      AND (metadata -> 'timeline' ->> 'seq') ~ '^[0-9]+$'
      AND ((metadata -> 'timeline' ->> 'seq')::bigint > ${args.afterSeq})
    ORDER BY
      ((metadata -> 'timeline' ->> 'seq')::bigint) ASC,
      created_at ASC,
      id ASC
    LIMIT ${safeLimit}
  `)
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
  const scanLimit = Math.min(MAX_DELTA_SCAN_ROWS, Math.max(limit * LOOKUP_WINDOW_MULTIPLIER, LOOKUP_WINDOW_FLOOR))

  try {
    const rows = await queryDeltaRowsByTimelineSeq({
      sessionKey,
      afterSeq,
      scanLimit,
    })

    const parsedEvents = rows
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

    const { events: slicedEvents, hasMore } = sliceDeltaEventsForCursor({
      events: parsedEvents,
      limit,
      didHitFetchLimit: rows.length === scanLimit,
    })

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
