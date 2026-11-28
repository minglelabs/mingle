import { NextResponse } from 'next/server'
import { requireAdminApi } from '@/server/admin/guard'
import { canDrawImagesHere } from '@/server/operator-avatars/generate'
import { createNextSeedAccount } from '@/server/operator-automation/worker'
import { parseImageEngine, seedreamConfigured } from '@/server/seedream/client'

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
 * redrawn with a new face. Body `{ engine: 'seedream' }` draws it with
 * Seedream 5.5 (staff's switch) instead of the ChatGPT pool.
 */
export async function POST(request: Request, context: Ctx) {
  const auth = await requireAdminApi()
  if (!auth.ok) return auth.response
  const body = await request.json().catch(() => null) as { engine?: unknown } | null
  const engine = parseImageEngine(body?.engine)
  if (engine === 'seedream' && !seedreamConfigured()) return json({ error: 'seedream_unconfigured' }, 503)
  if (engine === 'pool' && !canDrawImagesHere()) return json({ error: 'cannot_draw_here' }, 409)
  const { id } = await context.params
  const result = await createNextSeedAccount(auth.ctx, { inReview: true, referenceId: id, engine })
  if (!result.done) return json({ error: result.reason }, result.reason === 'reference_unavailable' || result.reason === 'reference_no_face' ? 409 : 502)
  return json({ ok: true, userId: result.account.userId, referenceUsed: result.referenceUsed === true })
}
