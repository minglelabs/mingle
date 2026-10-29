import { NextResponse } from 'next/server'

/** Admin API responses are private and never cached. */
export function adminJson(payload: object, status = 200): NextResponse {
  return NextResponse.json(payload, { status, headers: { 'Cache-Control': 'private, no-store' } })
}

/** The parsed JSON object body, or null when the body is not a JSON object. */
export async function readJsonObject(request: Request): Promise<Record<string, unknown> | null> {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return null
  }
  return body && typeof body === 'object' && !Array.isArray(body) ? (body as Record<string, unknown>) : null
}
