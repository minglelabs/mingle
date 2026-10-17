import { after, NextResponse } from 'next/server'
import { requireAdminApi } from '@/server/admin/guard'
import { whenOperatorBioQueueIdle } from '@/server/operators/bio-queue'
import { OperatorHandleTakenError, updateOperatorAccount } from '@/server/operators/create-operator'
import { getOperatorAccountDetail } from '@/server/operators/operator-admin-query'
import { OperatorAccountRequiredError } from '@/server/operators/operator-guard'
import { parseOperatorPatch } from '@/server/operators/persona-rules'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ userId: string }> }

function json(payload: object, status = 200): NextResponse {
  return NextResponse.json(payload, { status, headers: { 'Cache-Control': 'no-store' } })
}

/** GET /admin/operators/api/[userId] — one operator account (404 for any other user). */
export async function GET(_request: Request, context: RouteContext) {
  const auth = await requireAdminApi()
  if (!auth.ok) return auth.response

  const { userId } = await context.params
  const account = await getOperatorAccountDetail(userId.trim())
  if (!account) return json({ error: 'operator_not_found' }, 404)
  return json({ account })
}

/**
 * PATCH /admin/operators/api/[userId] — edit name, handle, bio, primary
 * language, birth year, country + city, staff notes. Only operator accounts.
 */
export async function PATCH(request: Request, context: RouteContext) {
  const auth = await requireAdminApi()
  if (!auth.ok) return auth.response

  const { userId: rawUserId } = await context.params
  const userId = rawUserId.trim()

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return json({ error: 'invalid_json' }, 400)
  }
  const parsed = parseOperatorPatch(body)
  if (!parsed.ok) return json({ error: 'invalid_patch', errors: parsed.errors }, 400)

  try {
    const { changed } = await updateOperatorAccount(auth.ctx, userId, parsed.patch)
    // The new bio version is translated in the background (bio-queue.ts).
    if (changed.includes('bio')) after(() => whenOperatorBioQueueIdle())
  } catch (error) {
    if (error instanceof OperatorAccountRequiredError) return json({ error: 'operator_not_found' }, 404)
    if (error instanceof OperatorHandleTakenError) {
      return json({ error: 'handle_taken', errors: [{ field: 'handle', error: 'handle_taken' }] }, 409)
    }
    console.error('[admin/operators/update] update_failed', { error: error instanceof Error ? error.name : 'unknown' })
    return json({ error: 'update_failed' }, 500)
  }

  const account = await getOperatorAccountDetail(userId)
  if (!account) return json({ error: 'operator_not_found' }, 404)
  return json({ account })
}
