import { NextResponse, type NextRequest } from 'next/server'
import { requireAdminApi } from '@/server/admin/guard'
import {
  getAutoReplySettings,
  parseAutoReplyDelayMinutes,
  updateAutoReplySettings,
} from '@/server/operator-auto-reply/settings'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function json(payload: object, status = 200): NextResponse {
  return NextResponse.json(payload, { status, headers: { 'Cache-Control': 'no-store' } })
}

/** GET → `{ settings }`: whether the AI answers for staff, and after how many minutes. */
export async function GET() {
  const auth = await requireAdminApi()
  if (!auth.ok) return auth.response
  return json({ settings: await getAutoReplySettings() })
}

/** PUT `{ enabled, delayMinutes }` → `{ settings }`. 400 invalid_enabled / invalid_delay (whole minutes, 1-1440). */
export async function PUT(request: NextRequest) {
  const auth = await requireAdminApi()
  if (!auth.ok) return auth.response
  // JSON only: a cross-site form cannot send this content type without a preflight.
  if (!(request.headers.get('content-type') ?? '').toLowerCase().includes('application/json')) {
    return json({ error: 'unsupported_media_type' }, 415)
  }
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return json({ error: 'invalid_json' }, 400)
  }
  const record = body && typeof body === 'object' && !Array.isArray(body) ? body as Record<string, unknown> : {}
  if (typeof record.enabled !== 'boolean') return json({ error: 'invalid_enabled' }, 400)
  const delayMinutes = parseAutoReplyDelayMinutes(record.delayMinutes)
  if (delayMinutes === null) return json({ error: 'invalid_delay' }, 400)

  return json({ settings: await updateAutoReplySettings(auth.ctx, { enabled: record.enabled, delayMinutes }) })
}
