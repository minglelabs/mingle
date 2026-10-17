import { NextResponse, type NextRequest } from 'next/server'
import { requireAdminApi } from '@/server/admin/guard'
import { getAutomationSettings, parseAutomationSettings, updateAutomationSettings } from '@/server/operator-automation/settings'
import { getAutomationCounts } from '@/server/operator-automation/worker'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function json(payload: object, status = 200): NextResponse {
  return NextResponse.json(payload, { status, headers: { 'Cache-Control': 'no-store' } })
}

/** GET → `{ settings, counts }`: the automatic generation rules and how many accounts still lack a photo. */
export async function GET() {
  const auth = await requireAdminApi()
  if (!auth.ok) return auth.response
  const [settings, counts] = await Promise.all([getAutomationSettings(), getAutomationCounts()])
  return json({ settings, counts })
}

/**
 * PUT `{ avatars: { enabled, intervalMinutes }, accounts: { enabled, perDay, totalTarget } }`
 * → `{ settings, counts }`. 400 with the first invalid field.
 */
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
  const parsed = parseAutomationSettings(body)
  if (!parsed.ok) return json({ error: parsed.error }, 400)
  const settings = await updateAutomationSettings(auth.ctx, parsed.settings)
  return json({ settings, counts: await getAutomationCounts() })
}
