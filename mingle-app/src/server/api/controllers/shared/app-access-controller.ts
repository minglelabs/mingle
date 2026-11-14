import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { getAuthOptions } from '@/lib/auth-options'
import { enterInviteCode, readAppAccess } from '@/server/app-access'
import { ReferralError, type ReferralRedeemError } from '@/server/referral'

const NO_STORE_HEADERS = { 'Cache-Control': 'private, no-store' }

const CODE_ERROR_STATUS: Record<ReferralRedeemError, number> = {
  invalid_code: 400,
  not_found: 404,
  own_code: 400,
  already_redeemed: 409,
  not_allowed: 403,
}

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: NO_STORE_HEADERS })
}

async function readSessionUserId(): Promise<string> {
  const session = await getServerSession(getAuthOptions()) as { user?: { id?: unknown } } | null
  return typeof session?.user?.id === 'string' ? session.user.id.trim() : ''
}

function readLocale(raw: unknown): string | null {
  return typeof raw === 'string' && raw.trim() ? raw.trim().slice(0, 16) : null
}

/** GET /account/access?locale=ko — whether this account may use the app or needs an invite first. */
export async function getAppAccess(request?: NextRequest) {
  const userId = await readSessionUserId()
  if (!userId) return json({ error: 'unauthorized' }, 401)
  return json(await readAppAccess(userId, readLocale(request?.nextUrl.searchParams.get('locale'))))
}

/** POST /account/access { code } — enters an invite code at the gate. */
export async function postAppAccessCode(request: NextRequest) {
  const userId = await readSessionUserId()
  if (!userId) return json({ error: 'unauthorized' }, 401)
  const body = await request.json().catch(() => ({})) as { code?: unknown; locale?: unknown }
  try {
    return json(await enterInviteCode(userId, body.code, readLocale(body.locale)))
  } catch (error) {
    if (error instanceof ReferralError) return json({ error: error.code }, CODE_ERROR_STATUS[error.code])
    throw error
  }
}
