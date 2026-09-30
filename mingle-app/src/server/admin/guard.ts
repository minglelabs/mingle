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
 * The client IP as seen by the last trusted proxy. In production the chain is
 * client -> Railway edge -> our launcher (railway/start-single-service.mjs)
 * -> app, and the launcher APPENDS its socket peer (the edge) to
 * `x-forwarded-for`. Everything left of the edge's own entry can be typed by
 * the client, so the first hop is forgeable and must not key the login
 * throttle. We take the hop just before the launcher-appended one; with a
 * single hop (local devbox, no edge) that hop itself.
 */
export function pickTrustedForwardedHop(forwardedFor: string | null | undefined): string | null {
  const hops = (forwardedFor ?? '').split(',').map((hop) => hop.trim()).filter(Boolean)
  if (hops.length === 0) return null
  return hops.length >= 2 ? hops[hops.length - 2] : hops[0]
}

/**
 * Client IP (see `pickTrustedForwardedHop`, else `x-real-ip`) and user agent of
 * the current request. Needs no admin session, so a failed login can be
 * audited too.
 */
export async function readAdminRequestMeta(): Promise<Pick<AdminContext, 'ip' | 'userAgent'>> {
  const requestHeaders = await headers()
  const trustedHop = pickTrustedForwardedHop(requestHeaders.get('x-forwarded-for'))
  return {
    ip: clip(trustedHop, MAX_IP_LENGTH) ?? clip(requestHeaders.get('x-real-ip'), MAX_IP_LENGTH),
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
