import { NextResponse } from 'next/server'

/** Admin inbox responses carry real users' messages: never cache them anywhere. */
export const INBOX_NO_STORE_HEADERS = { 'Cache-Control': 'private, no-store' } as const

export function inboxJson(payload: unknown, status = 200): NextResponse {
  return NextResponse.json(payload, { status, headers: INBOX_NO_STORE_HEADERS })
}

export function inboxError(error: string, status: number, extra: Record<string, unknown> = {}): NextResponse {
  return inboxJson({ error, ...extra }, status)
}

/** The request's JSON object body, or null when it is missing or not an object. */
export async function readInboxJsonBody(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const body: unknown = await request.json()
    return body && typeof body === 'object' && !Array.isArray(body) ? body as Record<string, unknown> : null
  } catch {
    return null
  }
}

/** A trimmed string field, or null. */
export function readInboxString(value: unknown, maxLength = 128): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed && trimmed.length <= maxLength ? trimmed : null
}

/** HTTP status for a room-access failure. Unknown rooms and rooms outside the inbox look the same. */
export function inboxAccessErrorStatus(error: string): number {
  if (error === 'operator_ambiguous') return 400
  if (error === 'operator_required' || error === 'operator_not_in_room') return 403
  return 404
}
