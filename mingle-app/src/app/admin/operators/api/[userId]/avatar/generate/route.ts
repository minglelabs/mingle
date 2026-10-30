import { NextResponse } from 'next/server'
import { requireAdminApi } from '@/server/admin/guard'
import { generateOperatorAvatar, type AvatarGenerationErrorCode } from '@/server/operator-avatars/generate'
import { OperatorAccountRequiredError, requireOperatorAccount } from '@/server/operators/operator-guard'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

const ERROR_STATUS: Record<AvatarGenerationErrorCode, number> = {
  not_operator: 404,
  image_unavailable: 503,
  image_timeout: 504,
  image_request_failed: 502,
  image_refused: 422,
  image_storage_failed: 502,
}

function json(payload: object, status = 200): NextResponse {
  return NextResponse.json(payload, { status, headers: { 'Cache-Control': 'no-store' } })
}

/**
 * POST /admin/operators/api/[userId]/avatar/generate — replaces the operator's
 * photo with a newly generated one. Every call picks a new kind of photo, so
 * staff press it again when the result looks wrong. → `{ image, label }`.
 */
export async function POST(_request: Request, context: { params: Promise<{ userId: string }> }) {
  const auth = await requireAdminApi()
  if (!auth.ok) return auth.response

  const { userId: rawUserId } = await context.params
  // Never act as anyone but an operator account (contract §0).
  let operatorId: string
  try {
    operatorId = (await requireOperatorAccount(rawUserId.trim())).id
  } catch (error) {
    if (error instanceof OperatorAccountRequiredError) return json({ error: 'operator_not_found' }, 404)
    throw error
  }

  const result = await generateOperatorAvatar(auth.ctx, operatorId)
  if (!result.ok) return json({ error: result.error }, ERROR_STATUS[result.error])
  return json({ image: result.image, label: result.spec.labelKo })
}
