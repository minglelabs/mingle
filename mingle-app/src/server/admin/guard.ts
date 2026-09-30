import { cookies, headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { NextResponse } from 'next/server'
import { ADMIN_SESSION_COOKIE_NAME } from '@/lib/admin-auth'
import { sanitizeAdminReturnTo } from '@/lib/admin-return-to'
import { verifyAdminSessionCookie } from '@/server/admin/session'

/**
 * Admin auth seam (contract §2). The first line of every admin page / server
 * action is `const ctx = await requireAdmin()`; every admin route handler
 * starts with `const auth = await requireAdminApi(); if (!auth.ok) return
 * auth.response`. Layouts never do auth.
 *
 * The admin cookie carries a per-login session token, checked against
 * app_admin_sessions (`verifyAdminSessionCookie`): unknown, revoked and
 * expired sessions have no admin context.
 */
export type AdminContext = {
  /** app_admin_sessions.id of the current login (null only for a request with no session, e.g. a failed login). */
  sessionId: string | null
  ip: string | null
  userAgent: string | null
}

export type AdminApiAuth = { ok: true; ctx: AdminContext } | { ok: false; response: NextResponse }

const ADMIN_LOGIN_PATH = '/admin'
const MAX_IP_LENGTH = 128
const MAX_USER_AGENT_LENGTH = 512

function clip(value: string | null | undefined, maxLength: number): string | null {
  const trimmed = value?.trim()
  return trimmed ? trimmed.slice(0, maxLength) : null
}

/**
 * Client IP (first `x-forwarded-for` hop, else `x-real-ip`) and user agent of
 * the current request. Needs no admin session, so a failed login can be
 * audited too.
 */
export async function readAdminRequestMeta(): Promise<Pick<AdminContext, 'ip' | 'userAgent'>> {
  const requestHeaders = await headers()
  const firstForwardedHop = requestHeaders.get('x-forwarded-for')?.split(',')[0]
  return {
    ip: clip(firstForwardedHop, MAX_IP_LENGTH) ?? clip(requestHeaders.get('x-real-ip'), MAX_IP_LENGTH),
    userAgent: clip(requestHeaders.get('user-agent'), MAX_USER_AGENT_LENGTH),
  }
}

/** The admin context of the current request, or null when it has no valid admin session. */
export async function getAdminContext(): Promise<AdminContext | null> {
  const cookieStore = await cookies()
  const session = await verifyAdminSessionCookie(cookieStore.get(ADMIN_SESSION_COOKIE_NAME)?.value)
  if (!session) return null
  return { sessionId: session.id, ...(await readAdminRequestMeta()) }
}

/** `/admin`, plus `?next=` only when `sanitizeAdminReturnTo` accepts the return path. */
function adminLoginPath(returnTo: string | undefined): string {
  const next = sanitizeAdminReturnTo(returnTo, '')
  return next ? `${ADMIN_LOGIN_PATH}?next=${encodeURIComponent(next)}` : ADMIN_LOGIN_PATH
}

/**
 * For admin pages and server actions: the admin context, or a redirect to the
 * login page that returns to `returnTo` (an `/admin/**` path) after login.
 */
export async function requireAdmin(returnTo?: string): Promise<AdminContext> {
  const ctx = await getAdminContext()
  if (!ctx) redirect(adminLoginPath(returnTo))
  return ctx
}

/** For admin route handlers: the admin context, or a ready 401 JSON response. */
export async function requireAdminApi(): Promise<AdminApiAuth> {
  const ctx = await getAdminContext()
  if (ctx) return { ok: true, ctx }
  return {
    ok: false,
    response: NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: { 'Cache-Control': 'no-store' } }),
  }
}
