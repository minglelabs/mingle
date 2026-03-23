export type DeltaEvent = {
  seq: number
  eventId: string
  sessionId: string
  schemaVersion: string
  eventType: string
  clientMessageId: string | null
  sourceLanguage: string | null
  sourceText: string | null
  translations: Record<string, string>
  sttDurationMs: number | null
  totalDurationMs: number | null
  provider: string | null
  model: string | null
  clientCreatedAt: string | null
  serverCreatedAt: string
  logId: string
  messageId: string | null
}

export function sliceDeltaEventsForCursor(args: {
  events: DeltaEvent[]
  limit: number
  didHitFetchLimit: boolean
}): { events: DeltaEvent[], hasMore: boolean } {
  const sliced: DeltaEvent[] = []
  let hasMore = false

  for (const event of args.events) {
    if (sliced.length < args.limit) {
      sliced.push(event)
      continue
    }

    const boundarySeq = sliced[sliced.length - 1]?.seq
    if (boundarySeq !== undefined && event.seq === boundarySeq) {
      // Return all rows sharing the boundary seq to avoid dropping duplicates when cursor is seq-only.
      sliced.push(event)
      continue
    }

    hasMore = true
    break
  }

  if (!hasMore && args.didHitFetchLimit) {
    hasMore = true
  }

  return { events: sliced, hasMore }
}
