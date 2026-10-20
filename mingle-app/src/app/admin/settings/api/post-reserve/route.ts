import { NextResponse, type NextRequest } from 'next/server'
import { requireAdminApi } from '@/server/admin/guard'
import {
  getPostReserveSettings,
  parsePostReserveDailyPercent,
  parsePostReserveTarget,
  updatePostReserveSettings,
} from '@/server/operator-post-reserve/settings'
import { getPostReserveStats } from '@/server/operator-post-reserve/worker'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function json(payload: object, status = 200): NextResponse {
  return NextResponse.json(payload, { status, headers: { 'Cache-Control': 'no-store' } })
}

/** GET → `{ settings, stats }`: the reserve setting and how full the reserve is. */
export async function GET() {
  const auth = await requireAdminApi()
  if (!auth.ok) return auth.response
  const settings = await getPostReserveSettings()
  return json({ settings, stats: await getPostReserveStats(settings.targetPerOperator) })
}

/**
 * PUT `{ enabled, targetPerOperator, dailyPercent }` → `{ settings, stats }`.
 * 400 invalid_enabled / invalid_target (10-500) / invalid_percent (0.1-10).
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
  const record = body && typeof body === 'object' && !Array.isArray(body) ? body as Record<string, unknown> : {}
  if (typeof record.enabled !== 'boolean') return json({ error: 'invalid_enabled' }, 400)
  const targetPerOperator = parsePostReserveTarget(record.targetPerOperator)
  if (targetPerOperator === null) return json({ error: 'invalid_target' }, 400)
  const dailyPercent = parsePostReserveDailyPercent(record.dailyPercent)
  if (dailyPercent === null) return json({ error: 'invalid_percent' }, 400)

  const settings = await updatePostReserveSettings(auth.ctx, { enabled: record.enabled, targetPerOperator, dailyPercent })
  return json({ settings, stats: await getPostReserveStats(settings.targetPerOperator) })
}
