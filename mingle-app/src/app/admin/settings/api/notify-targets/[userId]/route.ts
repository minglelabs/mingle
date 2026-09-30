import { NextResponse } from 'next/server'
import { requireAdminApi } from '@/server/admin/guard'
import { removeAdminNotifyTarget } from '@/app/admin/settings/_lib/notify-targets'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function json(payload: object, status = 200): NextResponse {
  return NextResponse.json(payload, { status, headers: { 'Cache-Control': 'no-store' } })
}

/** DELETE → `{ removed, targets }` (`removed: false` when it was not a target). */
export async function DELETE(_request: Request, context: { params: Promise<{ userId: string }> }) {
  const auth = await requireAdminApi()
  if (!auth.ok) return auth.response
  const { userId } = await context.params
  try {
    const result = await removeAdminNotifyTarget(auth.ctx, userId)
    if (!result.ok) return json({ error: result.error }, 400)
    return json({ removed: result.removed, targets: result.targets })
  } catch (error) {
    console.error('[admin-notify-targets] remove_failed', error instanceof Error ? error.name : 'unknown')
    return json({ error: 'server_error' }, 500)
  }
}
