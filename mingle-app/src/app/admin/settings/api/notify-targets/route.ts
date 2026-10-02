import { NextResponse, type NextRequest } from 'next/server'
import { requireAdminApi } from '@/server/admin/guard'
import {
  addAdminNotifyTarget,
  listAdminNotifyTargets,
  type AddNotifyTargetError,
} from '@/app/admin/settings/_lib/notify-targets'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const ADD_ERROR_STATUS: Record<AddNotifyTargetError, number> = {
  invalid_handle: 400,
  not_found: 404,
  operator_account: 422,
  inactive_account: 422,
  guest_account: 422,
}

function json(payload: object, status = 200): NextResponse {
  return NextResponse.json(payload, { status, headers: { 'Cache-Control': 'no-store' } })
}

/** GET → `{ targets }`: the staff accounts that receive operator-inbox alerts. */
export async function GET() {
  const auth = await requireAdminApi()
  if (!auth.ok) return auth.response
  try {
    return json({ targets: await listAdminNotifyTargets() })
  } catch (error) {
    console.error('[admin-notify-targets] list_failed', error instanceof Error ? error.name : 'unknown')
    return json({ error: 'server_error' }, 500)
  }
}

/**
 * POST `{ handle }` → 201 `{ added: true, targets }` (200 `added: false` when it
 * already was a target). 400 invalid_handle, 404 not_found, 422
 * operator_account / inactive_account / guest_account.
 */
export async function POST(request: NextRequest) {
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
  const handle = body && typeof body === 'object' ? (body as { handle?: unknown }).handle : undefined
  try {
    const result = await addAdminNotifyTarget(auth.ctx, handle)
    if (!result.ok) return json({ error: result.error }, ADD_ERROR_STATUS[result.error])
    return json({ added: result.added, targets: result.targets }, result.added ? 201 : 200)
  } catch (error) {
    console.error('[admin-notify-targets] add_failed', error instanceof Error ? error.name : 'unknown')
    return json({ error: 'server_error' }, 500)
  }
}
