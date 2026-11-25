import { NextResponse } from 'next/server'
import { requireAdminApi } from '@/server/admin/guard'
import { restoreAccountFromReview, sendAccountBackToReview } from '@/server/operators/account-takedown'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** POST `{ action: 'takedown' | 'restore' }`: 내리고 검토로 / 다시 올리기 for an operator account. */
export async function POST(request: Request, context: { params: Promise<{ userId: string }> }) {
  const auth = await requireAdminApi()
  if (!auth.ok) return auth.response
  const { userId } = await context.params
  const body = await request.json().catch(() => null) as { action?: unknown } | null
  const action = body?.action
  if (action !== 'takedown' && action !== 'restore') return NextResponse.json({ error: 'invalid_action' }, { status: 400 })
  const result = action === 'takedown' ? await sendAccountBackToReview(auth.ctx, userId.trim()) : await restoreAccountFromReview(auth.ctx, userId.trim())
  return NextResponse.json(result.ok ? result : { error: result.error }, { status: result.ok ? 200 : 404, headers: { 'Cache-Control': 'no-store' } })
}
