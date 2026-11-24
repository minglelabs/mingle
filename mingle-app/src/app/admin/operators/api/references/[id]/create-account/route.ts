import { NextResponse } from 'next/server'
import { requireAdminApi } from '@/server/admin/guard'
import { canDrawImagesHere } from '@/server/operator-avatars/generate'
import { createNextSeedAccount } from '@/server/operator-automation/worker'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
// The profile photo is drawn through the pool before this answers.
export const maxDuration = 900

type Ctx = { params: Promise<{ id: string }> }

function json(payload: object, status = 200): NextResponse {
  return NextResponse.json(payload, { status, headers: { 'Cache-Control': 'no-store' } })
}

/**
 * POST: a new operator account (waiting in review, in the country the seed
 * plan needs most, the photo's gender) whose profile photo is this photo
 * redrawn with a new face.
 */
export async function POST(_request: Request, context: Ctx) {
  const auth = await requireAdminApi()
  if (!auth.ok) return auth.response
  if (!canDrawImagesHere()) return json({ error: 'cannot_draw_here' }, 409)
  const { id } = await context.params
  const result = await createNextSeedAccount(auth.ctx, { inReview: true, referenceId: id })
  if (!result.done) return json({ error: result.reason }, result.reason === 'reference_unavailable' ? 409 : 502)
  return json({ ok: true, userId: result.account.userId, referenceUsed: result.referenceUsed === true })
}
