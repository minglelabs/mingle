import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { getAuthOptions } from '@/lib/auth-options'
import { DetachRefused, detachSignInMethod, listSignInMethods } from '@/server/identity/methods'

const NO_STORE_HEADERS = { 'Cache-Control': 'private, no-store' }

const DETACH_ERROR_STATUS: Record<DetachRefused['code'], number> = {
  not_found: 404,
  not_detachable: 403,
  last_method: 409,
}

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: NO_STORE_HEADERS })
}

async function readSessionUserId(): Promise<string> {
  const session = await getServerSession(getAuthOptions()) as { user?: { id?: unknown } } | null
  return typeof session?.user?.id === 'string' ? session.user.id.trim() : ''
}

/** GET /account/sign-in-methods — the ways into this account, and which of them the owner may take off. */
export async function getSignInMethods() {
  const userId = await readSessionUserId()
  if (!userId) return json({ error: 'unauthorized' }, 401)
  return json({ methods: await listSignInMethods(userId) })
}

/** DELETE /account/sign-in-methods { kind: 'account' | 'phone', id } — takes off a sign-in method or extra number that was attached later. */
export async function deleteSignInMethod(request: NextRequest) {
  const userId = await readSessionUserId()
  if (!userId) return json({ error: 'unauthorized' }, 401)
  const body = await request.json().catch(() => ({})) as { kind?: unknown; id?: unknown }
  const kind = body.kind === 'phone' ? 'phone' : body.kind === 'account' ? 'account' : null
  const id = typeof body.id === 'string' ? body.id.trim() : ''
  if (!kind || !id) return json({ error: 'invalid_request' }, 400)
  try {
    await detachSignInMethod(userId, { kind, id })
  } catch (error) {
    if (error instanceof DetachRefused) return json({ error: error.code }, DETACH_ERROR_STATUS[error.code])
    throw error
  }
  return json({ ok: true, methods: await listSignInMethods(userId) })
}
