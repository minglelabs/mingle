import { NextResponse } from 'next/server'
import { requireAdminApi } from '@/server/admin/guard'
import { LlmError } from '@/server/llm/generate-json'
import { generatePersonaDrafts, parsePersonaDraftRequest } from '@/server/operators/persona-draft'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function json(payload: object, status = 200): NextResponse {
  return NextResponse.json(payload, { status, headers: { 'Cache-Control': 'no-store' } })
}

/**
 * POST /admin/operators/api/drafts — persona drafts for the creation wizard
 * (nothing is written). Body: `{ count, countries, ageMin, ageMax, genderMix?,
 * notes?, avoidNames?, avoidHandles? }` -> `{ drafts, missing }`.
 */
export async function POST(request: Request) {
  const auth = await requireAdminApi()
  if (!auth.ok) return auth.response

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return json({ error: 'invalid_json' }, 400)
  }
  const parsed = parsePersonaDraftRequest(body)
  if (!parsed.ok) return json({ error: parsed.error }, 400)

  try {
    const result = await generatePersonaDrafts(parsed.value)
    return json(result)
  } catch (error) {
    if (error instanceof LlmError && error.code === 'llm_unavailable') return json({ error: 'llm_unavailable' }, 503)
    console.error('[admin/operators/drafts] generation_failed', { code: error instanceof LlmError ? error.code : 'unknown' })
    return json({ error: 'draft_generation_failed' }, 502)
  }
}
