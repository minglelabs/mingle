import { createHash, randomBytes } from 'crypto'
import { ADMIN_SESSION_COOKIE_NAME } from '@/lib/admin-auth'
import { prisma } from '@/lib/prisma'

/**
 * Per-login admin sessions (contract §1 `app_admin_sessions`).
 *
 * Login creates a row and hands the browser a random token in the admin
 * cookie. Only the token's SHA-256 is stored, so a leaked table cannot be
 * replayed as a cookie. A session ends when it expires (30 days after login)
 * or is revoked (logout). Credentials are still the env pair checked by
 * `verifyAdminLogin`; the session row is the actor recorded in the audit log.
 */
export const ADMIN_SESSION_TTL_SECONDS = 60 * 60 * 24 * 30
const ADMIN_SESSION_TTL_MS = ADMIN_SESSION_TTL_SECONDS * 1000
/** `lastSeenAt` is written at most this often per session, not on every request. */
export const ADMIN_SESSION_LAST_SEEN_INTERVAL_MS = 5 * 60 * 1000
const ADMIN_COOKIE_PATH = '/admin'
const TOKEN_BYTES = 32
/** base64url of 32 bytes, unpadded. Anything else (e.g. a legacy `v1.` token) never reaches the DB. */
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/

const SESSION_SELECT = {
  id: true,
  createdAt: true,
  lastSeenAt: true,
  expiresAt: true,
  revokedAt: true,
} as const

export type AdminSessionRecord = {
  id: string
  createdAt: Date
  lastSeenAt: Date
  expiresAt: Date
  revokedAt: Date | null
}

export function hashAdminSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

/** Starts a session for a successful login. The returned token goes into the cookie only. */
export async function createAdminSession(input: {
  ip: string | null
  userAgent: string | null
}): Promise<{ token: string; session: AdminSessionRecord }> {
  const token = randomBytes(TOKEN_BYTES).toString('base64url')
  const now = new Date()
  const session = await prisma.adminSession.create({
    data: {
      tokenHash: hashAdminSessionToken(token),
      ip: input.ip,
      userAgent: input.userAgent,
      createdAt: now,
      lastSeenAt: now,
      expiresAt: new Date(now.getTime() + ADMIN_SESSION_TTL_MS),
    },
    select: SESSION_SELECT,
  })
  return { token, session }
}

/**
 * The live session behind an admin cookie value, or null when the value is
 * missing, malformed, unknown, revoked or expired. Refreshes `lastSeenAt`
 * when the stored one is older than five minutes; a failed refresh never
 * fails the request.
 */
export async function verifyAdminSessionCookie(token: unknown): Promise<AdminSessionRecord | null> {
  if (typeof token !== 'string' || !TOKEN_PATTERN.test(token)) return null

  const session = await prisma.adminSession.findUnique({
    where: { tokenHash: hashAdminSessionToken(token) },
    select: SESSION_SELECT,
  })
  if (!session || session.revokedAt) return null

  const now = new Date()
  if (session.expiresAt.getTime() <= now.getTime()) return null
  if (now.getTime() - session.lastSeenAt.getTime() < ADMIN_SESSION_LAST_SEEN_INTERVAL_MS) return session

  try {
    await prisma.adminSession.updateMany({
      where: { id: session.id, revokedAt: null },
      data: { lastSeenAt: now },
    })
    return { ...session, lastSeenAt: now }
  } catch (error) {
    console.error('[admin-session] last_seen_update_failed', {
      error: error instanceof Error ? error.name : 'unknown',
    })
    return session
  }
}

/** Ends a session server-side, so its cookie stops working everywhere. Revoking twice is a no-op. */
export async function revokeAdminSession(id: string): Promise<void> {
  await prisma.adminSession.updateMany({
    where: { id, revokedAt: null },
    data: { revokedAt: new Date() },
  })
}

/**
 * The one admin cookie definition. `path=/admin` keeps the cookie off every
 * user-facing route and API, which is why admin endpoints live under /admin.
 */
export function adminSessionCookie(token: string) {
  return {
    name: ADMIN_SESSION_COOKIE_NAME,
    value: token,
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: ADMIN_COOKIE_PATH,
    maxAge: ADMIN_SESSION_TTL_SECONDS,
  }
}

/** Same cookie, emptied and expired: what logout sends. */
export function expiredAdminSessionCookie() {
  return { ...adminSessionCookie(''), maxAge: 0 }
}
