import { NextResponse } from 'next/server'
import { requireAdminApi } from '@/server/admin/guard'
import { publishNextReservePost } from '@/server/operator-post-reserve/worker'
import { OperatorAccountRequiredError, requireOperatorAccount } from '@/server/operators/operator-guard'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function json(payload: object, status = 200): NextResponse {
  return NextResponse.json(payload, { status, headers: { 'Cache-Control': 'no-store' } })
}

/**
 * POST /admin/operators/api/[userId]/reserve/publish — publishes the
 * operator's oldest waiting latent post right now. → `{ postId }`;
 * 409 `reserve_empty`, 502 `publish_failed`.
 */
export async function POST(_request: Request, context: { params: Promise<{ userId: string }> }) {
  const auth = await requireAdminApi()
  if (!auth.ok) return auth.response

  const { userId: rawUserId } = await context.params
  let operatorId: string
  try {
    operatorId = (await requireOperatorAccount(rawUserId.trim())).id
  } catch (error) {
    if (error instanceof OperatorAccountRequiredError) return json({ error: 'operator_not_found' }, 404)
    throw error
  }

  const result = await publishNextReservePost(operatorId)
  if (!result.ok) return json({ error: result.error }, result.error === 'reserve_empty' ? 409 : 502)
  return json({ postId: result.postId })
}
