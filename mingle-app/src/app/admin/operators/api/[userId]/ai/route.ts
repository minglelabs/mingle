import { NextResponse } from 'next/server'
import { requireAdminApi } from '@/server/admin/guard'
import { draftOperatorProfile, parseProfileAiScope } from '@/server/operators/profile-ai'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

const ERROR_STATUS = { operator_not_found: 404, no_persona: 409, draft_failed: 502 } as const

function json(payload: object, status = 200): NextResponse {
  return NextResponse.json(payload, { status, headers: { 'Cache-Control': 'no-store' } })
}

/**
 * POST /admin/operators/api/[userId]/ai `{ scope: 'bio' | 'profile' | 'all' }`
 * — an AI-written new bio, new profile fields (everything but bio and photo),
 * or both, for the editor form. Saves nothing. → `{ draft }`.
 */
export async function POST(request: Request, context: { params: Promise<{ userId: string }> }) {
  const auth = await requireAdminApi()
  if (!auth.ok) return auth.response

  let body: { scope?: unknown } | null
  try {
    body = await request.json()
  } catch {
    return json({ error: 'invalid_json' }, 400)
  }
  const scope = parseProfileAiScope(body?.scope)
  if (!scope) return json({ error: 'invalid_scope' }, 400)

  const { userId } = await context.params
  const result = await draftOperatorProfile(userId.trim(), scope)
  if (!result.ok) return json({ error: result.error }, ERROR_STATUS[result.error])
  return json({ draft: result.draft })
}
