import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { getAuthOptions } from '@/lib/auth-options'
import {
  ReferralError,
  getReferralState,
  markContactSyncPrompted,
  redeemReferralCode,
  type ReferralRedeemError,
} from '@/server/referral'

const NO_STORE_HEADERS = { 'Cache-Control': 'private, no-store' }

const REDEEM_ERROR_STATUS: Record<ReferralRedeemError, number> = {
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

async function readJsonBody(request: NextRequest): Promise<Record<string, unknown>> {
  try {
    const body = await request.json() as unknown
    return body && typeof body === 'object' && !Array.isArray(body) ? body as Record<string, unknown> : {}
  } catch {
    return {}
  }
}

/** GET /referral — the user's invite code and whether they entered one. */
export async function readReferral() {
  const userId = await readSessionUserId()
  if (!userId) return json({ error: 'unauthorized' }, 401)
  try {
    return json(await getReferralState(userId))
  } catch (error) {
    if (error instanceof ReferralError) return json({ error: error.code }, 403)
    throw error
  }
}

/** PATCH /referral { contactSyncPrompted: true } — the contact-sync screen was shown after signup. */
export async function patchReferral(request: NextRequest) {
  const userId = await readSessionUserId()
  if (!userId) return json({ error: 'unauthorized' }, 401)
  const body = await readJsonBody(request)
  if (body.contactSyncPrompted === true) await markContactSyncPrompted(userId)
  return json({ ok: true })
}

/** POST /referral/redeem { code } — enters someone's invite code; both sides get coins. */
export async function redeemReferral(request: NextRequest) {
  const userId = await readSessionUserId()
  if (!userId) return json({ error: 'unauthorized' }, 401)
  const body = await readJsonBody(request)
  try {
    return json({ ok: true, ...(await redeemReferralCode(userId, body.code)) })
  } catch (error) {
    if (error instanceof ReferralError) return json({ error: error.code }, REDEEM_ERROR_STATUS[error.code])
    throw error
  }
}
