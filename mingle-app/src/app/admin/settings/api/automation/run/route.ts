import { NextResponse, type NextRequest } from 'next/server'
import { requireAdminApi } from '@/server/admin/guard'
import { createNextSeedAccount, generateNextMissingAvatar, getAutomationCounts } from '@/server/operator-automation/worker'
import { refillReserveNow } from '@/server/operator-post-reserve/worker'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
// One image or one chunk of posts per request; both are single model calls.
export const maxDuration = 120

function json(payload: object, status = 200): NextResponse {
  return NextResponse.json(payload, { status, headers: { 'Cache-Control': 'no-store' } })
}

/**
 * POST `{ task }` runs ONE unit of a generation rule right now, whether or
 * not its automatic rule is on:
 * - `avatar`: a photo for the oldest account without one;
 * - `account`: one new account from the most under-represented country;
 * - `posts`: one chunk of latent posts for up to three accounts below the target.
 * The page repeats the call for "N개 만들기". Always answers 200 with what
 * happened plus fresh `counts`.
 */
export async function POST(request: NextRequest) {
  const auth = await requireAdminApi()
  if (!auth.ok) return auth.response
  if (!(request.headers.get('content-type') ?? '').toLowerCase().includes('application/json')) {
    return json({ error: 'unsupported_media_type' }, 415)
  }
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return json({ error: 'invalid_json' }, 400)
  }
  const task = body && typeof body === 'object' ? (body as { task?: unknown }).task : null

  if (task === 'avatar') {
    const step = await generateNextMissingAvatar(auth.ctx)
    const counts = await getAutomationCounts()
    if (!step.done) return json({ task, done: false, reason: step.reason, counts })
    return json(step.result.ok
      ? { task, done: true, ok: true, userId: step.userId, image: step.result.image, label: step.result.spec.labelKo, counts }
      : { task, done: true, ok: false, userId: step.userId, error: step.result.error, counts })
  }
  if (task === 'account') {
    const step = await createNextSeedAccount(auth.ctx)
    const counts = await getAutomationCounts()
    return json(step.done
      ? { task, done: true, country: step.country, handle: step.account.handle, userId: step.account.userId, counts }
      : { task, done: false, reason: step.reason, counts })
  }
  if (task === 'posts') {
    const result = await refillReserveNow()
    return json({ task, done: result.generated > 0, ...result, counts: await getAutomationCounts() })
  }
  return json({ error: 'invalid_task' }, 400)
}
