import { type NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { getAuthOptions } from '@/lib/auth-options'
import { readContactAvoid, setContactAvoidEnabled, setContactHiddenFrom } from '@/server/contact-avoid'

export const runtime = 'nodejs'

const NO_STORE = { headers: { 'Cache-Control': 'private, no-store' } }

async function viewer(): Promise<string> {
  const session = await getServerSession(getAuthOptions()) as { user?: { id?: unknown } } | null
  return typeof session?.user?.id === 'string' ? session.user.id.trim() : ''
}

/** GET: whether this account hides from its contacts, and how many numbers are kept for it. */
export async function GET() {
  const userId = await viewer()
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  return NextResponse.json(await readContactAvoid(userId), NO_STORE)
}

/**
 * POST { enabled } turns hiding on or off for the account; POST { userId, hidden }
 * hides from one matched friend or lets them through (owner, 2026-11-26; see
 * @/server/contact-avoid).
 */
export async function POST(request: NextRequest) {
  const userId = await viewer()
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const body = await request.json().catch(() => null) as { enabled?: unknown; userId?: unknown; hidden?: unknown } | null
  if (typeof body?.enabled === 'boolean') {
    return NextResponse.json(await setContactAvoidEnabled(userId, body.enabled), NO_STORE)
  }
  if (typeof body?.userId === 'string' && typeof body.hidden === 'boolean') {
    const outcome = await setContactHiddenFrom(userId, body.userId.trim(), body.hidden)
    if (!outcome.ok) return NextResponse.json({ error: outcome.error }, { status: 404 })
    return NextResponse.json({ hidden: outcome.hidden }, NO_STORE)
  }
  return NextResponse.json({ error: 'invalid_request' }, { status: 400 })
}
