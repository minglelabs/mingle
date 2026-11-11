import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { getAuthOptions } from '@/lib/auth-options'
import { ContactMatchFailure, matchContactHashes, type ContactMatchError } from '@/server/contact-match'
import {
  PhoneVerificationFailure,
  confirmPhoneVerification,
  isPhoneVerificationAvailable,
  readVerifiedPhone,
  removeVerifiedPhone,
  startPhoneVerification,
  type PhoneVerificationError,
} from '@/server/phone-verification'

const NO_STORE_HEADERS = { 'Cache-Control': 'private, no-store' }

const PHONE_ERROR_STATUS: Record<PhoneVerificationError, number> = {
  invalid_phone: 400,
  invalid_code: 400,
  wrong_code: 400,
  too_many_requests: 429,
  unavailable: 503,
}

const MATCH_ERROR_STATUS: Record<ContactMatchError, number> = {
  phone_not_verified: 403,
  too_many_hashes: 413,
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

/** GET /phone — the account's verified number (or null), and whether numbers can be verified here. */
export async function readPhone() {
  const userId = await readSessionUserId()
  if (!userId) return json({ error: 'unauthorized' }, 401)
  return json({ phoneE164: await readVerifiedPhone(userId), available: isPhoneVerificationAvailable() })
}

/** DELETE /phone — stop being findable by phone number. */
export async function deletePhone() {
  const userId = await readSessionUserId()
  if (!userId) return json({ error: 'unauthorized' }, 401)
  await removeVerifiedPhone(userId)
  return json({ ok: true })
}

/** POST /phone/verification { phone, locale? } — texts a 6-digit code to an E.164 number. */
export async function startPhone(request: NextRequest) {
  const userId = await readSessionUserId()
  if (!userId) return json({ error: 'unauthorized' }, 401)
  const body = await readJsonBody(request)
  try {
    await startPhoneVerification(userId, body.phone, { locale: typeof body.locale === 'string' ? body.locale.slice(0, 16) : undefined })
    return json({ ok: true })
  } catch (error) {
    if (error instanceof PhoneVerificationFailure) return json({ error: error.code }, PHONE_ERROR_STATUS[error.code])
    throw error
  }
}

/** POST /phone/verification/confirm { phone, code } — checks the code and saves the number. */
export async function confirmPhone(request: NextRequest) {
  const userId = await readSessionUserId()
  if (!userId) return json({ error: 'unauthorized' }, 401)
  const body = await readJsonBody(request)
  try {
    return json({ ok: true, ...(await confirmPhoneVerification(userId, body.phone, body.code)) })
  } catch (error) {
    if (error instanceof PhoneVerificationFailure) return json({ error: error.code }, PHONE_ERROR_STATUS[error.code])
    throw error
  }
}

/** POST /contacts/match { hashes } — which hashed contact numbers are HashChat accounts. */
export async function matchContacts(request: NextRequest) {
  const userId = await readSessionUserId()
  if (!userId) return json({ error: 'unauthorized' }, 401)
  const body = await readJsonBody(request)
  try {
    return json({ matches: await matchContactHashes(userId, body.hashes) })
  } catch (error) {
    if (error instanceof ContactMatchFailure) return json({ error: error.code }, MATCH_ERROR_STATUS[error.code])
    throw error
  }
}
