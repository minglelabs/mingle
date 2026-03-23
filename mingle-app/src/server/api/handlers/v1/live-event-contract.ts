import type { Prisma } from '@prisma/client'
import { sanitizeNonNegativeInt } from '@/lib/app-analytics'
import { sanitizeText } from '@/app/api/log/client-event/sanitize'

const DEFAULT_SCHEMA_VERSION = '2'

function parseClientCreatedAtIso(rawValue: unknown): string | null {
  if (typeof rawValue === 'number' && Number.isFinite(rawValue)) {
    if (rawValue <= 0) return null
    try {
      return new Date(Math.floor(rawValue)).toISOString()
    } catch {
      return null
    }
  }

  if (typeof rawValue === 'string') {
    const trimmed = rawValue.trim()
    if (!trimmed) return null
    const numeric = Number(trimmed)
    if (Number.isFinite(numeric) && numeric > 0) {
      try {
        return new Date(Math.floor(numeric)).toISOString()
      } catch {
        return null
      }
    }

    const parsed = Date.parse(trimmed)
    if (!Number.isFinite(parsed)) return null
    try {
      return new Date(parsed).toISOString()
    } catch {
      return null
    }
  }

  return null
}

function parseEnvelopeSource(body: Record<string, unknown>): Record<string, unknown> {
  const envelope = body.envelope
  if (envelope && typeof envelope === 'object' && !Array.isArray(envelope)) {
    return envelope as Record<string, unknown>
  }
  return body
}

export type LiveEventEnvelopeV2 = {
  eventId: string | null
  seq: number | null
  sessionId: string | null
  schemaVersion: string
  clientCreatedAtIso: string | null
}

export function parseLiveEventEnvelopeV2(body: Record<string, unknown>): LiveEventEnvelopeV2 {
  const source = parseEnvelopeSource(body)
  const eventId = sanitizeText(source.eventId, 128)
  const seq = sanitizeNonNegativeInt(source.seq)
  const sessionId = sanitizeText(source.sessionId, 128) || sanitizeText(source.sessionKey, 128)
  const schemaVersion = sanitizeText(source.schemaVersion, 32) ?? DEFAULT_SCHEMA_VERSION
  const clientCreatedAtIso = parseClientCreatedAtIso(source.clientCreatedAt)

  return {
    eventId,
    seq,
    sessionId,
    schemaVersion,
    clientCreatedAtIso,
  }
}

export function hasLiveEventEnvelopeV2(envelope: LiveEventEnvelopeV2): boolean {
  return Boolean(envelope.eventId) && envelope.seq !== null
}

export function buildTimelineMetadata(args: {
  envelope: LiveEventEnvelopeV2
  fallbackSessionId?: string | null
  eventType: string
  clientMessageId?: string | null
}): Prisma.JsonObject | null {
  if (!hasLiveEventEnvelopeV2(args.envelope)) return null

  const timeline: Prisma.JsonObject = {
    eventId: args.envelope.eventId!,
    seq: args.envelope.seq!,
    schemaVersion: args.envelope.schemaVersion || DEFAULT_SCHEMA_VERSION,
    eventType: args.eventType,
  }

  const sessionId = args.envelope.sessionId || args.fallbackSessionId || null
  if (sessionId) timeline.sessionId = sessionId
  if (args.envelope.clientCreatedAtIso) timeline.clientCreatedAt = args.envelope.clientCreatedAtIso
  if (args.clientMessageId) timeline.clientMessageId = args.clientMessageId

  return timeline
}

export type LiveTimelineRecord = {
  eventId: string
  seq: number
  sessionId: string | null
  schemaVersion: string
  clientCreatedAtIso: string | null
  eventType: string | null
  clientMessageId: string | null
}

export function extractTimelineFromEventMetadata(metadata: unknown): LiveTimelineRecord | null {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null

  const timelineRaw = (metadata as Record<string, unknown>).timeline
  if (!timelineRaw || typeof timelineRaw !== 'object' || Array.isArray(timelineRaw)) return null

  const timeline = timelineRaw as Record<string, unknown>
  const eventId = sanitizeText(timeline.eventId, 128)
  const seq = sanitizeNonNegativeInt(timeline.seq)
  if (!eventId || seq === null) return null

  return {
    eventId,
    seq,
    sessionId: sanitizeText(timeline.sessionId, 128),
    schemaVersion: sanitizeText(timeline.schemaVersion, 32) ?? DEFAULT_SCHEMA_VERSION,
    clientCreatedAtIso: parseClientCreatedAtIso(timeline.clientCreatedAt),
    eventType: sanitizeText(timeline.eventType, 64),
    clientMessageId: sanitizeText(timeline.clientMessageId, 128),
  }
}
