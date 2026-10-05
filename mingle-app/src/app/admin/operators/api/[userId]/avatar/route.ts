import { NextResponse } from 'next/server'
import { requireAdminApi } from '@/server/admin/guard'
import { OperatorAccountRequiredError, requireOperatorAccount } from '@/server/operators/operator-guard'
import { avatarRequestTooLarge, setOperatorAvatar } from '@/server/operators/operator-avatar'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function json(payload: object, status = 200): NextResponse {
  return NextResponse.json(payload, { status, headers: { 'Cache-Control': 'no-store' } })
}

/**
 * POST /admin/operators/api/[userId]/avatar — multipart `file` (jpeg / png /
 * webp, <= 10 MB), one request per photo. Only for operator accounts; the
 * photo is re-encoded (operator-avatar.ts) and replaces the previous one.
 */
export async function POST(request: Request, context: { params: Promise<{ userId: string }> }) {
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

  if (avatarRequestTooLarge(request.headers)) return json({ error: 'image_too_large' }, 413)
  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return json({ error: 'invalid_form_data' }, 400)
  }

  const result = await setOperatorAvatar(auth.ctx, operatorId, form.get('file'))
  if (!result.ok) return json({ error: result.error }, result.status)
  return json({ image: result.image })
}
