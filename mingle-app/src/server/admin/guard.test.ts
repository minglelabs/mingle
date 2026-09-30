import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({
  cookieGet: vi.fn(),
  findUnique: vi.fn(),
  updateMany: vi.fn(),
  requestHeaders: { current: new Headers() },
  redirect: vi.fn((url: string): never => {
    throw new Error(`NEXT_REDIRECT:${url}`)
  }),
}))

vi.mock('next/headers', () => ({
  cookies: async () => ({ get: m.cookieGet }),
  headers: async () => m.requestHeaders.current,
}))
vi.mock('next/navigation', () => ({ redirect: m.redirect }))
vi.mock('@/lib/prisma', () => ({
  prisma: { adminSession: { findUnique: m.findUnique, updateMany: m.updateMany } },
}))

import { getAdminContext, pickTrustedForwardedHop, requireAdmin, requireAdminApi } from './guard'
import { hashAdminSessionToken } from './session'

const TOKEN = 'tok_'.padEnd(43, 'x')
const LIVE_SESSION = {
  id: 'admin_sess_1',
  createdAt: new Date(Date.now() - 60_000),
  lastSeenAt: new Date(),
  expiresAt: new Date(Date.now() + 86_400_000),
  revokedAt: null,
}

function withCookie(value: string | undefined) {
  m.cookieGet.mockReturnValue(value === undefined ? undefined : { value })
}

function signedIn(valid: boolean) {
  withCookie(valid ? TOKEN : undefined)
  m.findUnique.mockResolvedValue(valid ? LIVE_SESSION : null)
}

describe('admin guard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    m.requestHeaders.current = new Headers({
      'x-forwarded-for': '203.0.113.7, 10.0.0.2',
      'x-real-ip': '10.0.0.9',
      'user-agent': 'Mozilla/5.0 (iPhone)',
    })
    m.updateMany.mockResolvedValue({ count: 1 })
    signedIn(true)
  })

  describe('getAdminContext', () => {
    it('returns null without an admin session cookie, and never queries the DB', async () => {
      signedIn(false)
      await expect(getAdminContext()).resolves.toBeNull()
      expect(m.cookieGet).toHaveBeenCalledWith('mingle_admin_session')
      expect(m.findUnique).not.toHaveBeenCalled()
    })

    it('refuses a legacy deterministic v1 token without a DB lookup (one re-login after deploy)', async () => {
      withCookie(`v1.${'a'.repeat(43)}`)
      await expect(getAdminContext()).resolves.toBeNull()
      expect(m.findUnique).not.toHaveBeenCalled()
    })

    it('carries the DB session id and takes the first forwarded hop as the ip', async () => {
      await expect(getAdminContext()).resolves.toEqual({
        sessionId: 'admin_sess_1',
        ip: '203.0.113.7',
        userAgent: 'Mozilla/5.0 (iPhone)',
      })
      expect(m.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { tokenHash: hashAdminSessionToken(TOKEN) } }))
    })

    it('returns null for an unknown, revoked or expired session', async () => {
      m.findUnique.mockResolvedValueOnce(null)
      await expect(getAdminContext()).resolves.toBeNull()
      m.findUnique.mockResolvedValueOnce({ ...LIVE_SESSION, revokedAt: new Date() })
      await expect(getAdminContext()).resolves.toBeNull()
      m.findUnique.mockResolvedValueOnce({ ...LIVE_SESSION, expiresAt: new Date(Date.now() - 1) })
      await expect(getAdminContext()).resolves.toBeNull()
    })

    it('falls back to x-real-ip, and to null when neither header is present', async () => {
      m.requestHeaders.current = new Headers({ 'x-real-ip': '198.51.100.4' })
      await expect(getAdminContext()).resolves.toEqual({ sessionId: 'admin_sess_1', ip: '198.51.100.4', userAgent: null })
      m.requestHeaders.current = new Headers()
      await expect(getAdminContext()).resolves.toEqual({ sessionId: 'admin_sess_1', ip: null, userAgent: null })
    })

    it('ignores client-forged hops: the IP is the hop just before the launcher-appended edge address', async () => {
      // client forged "1.1.1.1"; the edge appended the real client; the launcher appended the edge
      m.requestHeaders.current = new Headers({ 'x-forwarded-for': '1.1.1.1, 203.0.113.7, 10.0.0.2' })
      await expect(getAdminContext()).resolves.toMatchObject({ ip: '203.0.113.7' })
    })
  })

  describe('pickTrustedForwardedHop', () => {
    it('takes the second-to-last hop, the only hop, or null', () => {
      expect(pickTrustedForwardedHop('9.9.9.9, 8.8.8.8, 203.0.113.7, 10.0.0.2')).toBe('203.0.113.7')
      expect(pickTrustedForwardedHop(' 127.0.0.1 ')).toBe('127.0.0.1')
      expect(pickTrustedForwardedHop(' , ')).toBeNull()
      expect(pickTrustedForwardedHop(null)).toBeNull()
    })
  })

  describe('requireAdmin', () => {
    it('returns the context without redirecting when signed in', async () => {
      await expect(requireAdmin('/admin/inbox')).resolves.toMatchObject({ sessionId: 'admin_sess_1', ip: '203.0.113.7' })
      expect(m.redirect).not.toHaveBeenCalled()
    })

    it('redirects to the login page without next when no return path is given', async () => {
      signedIn(false)
      await expect(requireAdmin()).rejects.toThrow('NEXT_REDIRECT:/admin')
      expect(m.redirect).toHaveBeenCalledWith('/admin')
    })

    it('redirects a revoked session to the login page', async () => {
      m.findUnique.mockResolvedValue({ ...LIVE_SESSION, revokedAt: new Date() })
      await expect(requireAdmin('/admin/reports')).rejects.toThrow()
      expect(m.redirect).toHaveBeenCalledWith(`/admin?next=${encodeURIComponent('/admin/reports')}`)
    })

    it('carries an accepted admin return path as an encoded next parameter', async () => {
      signedIn(false)
      await expect(requireAdmin('/admin/inbox/conv_1?tab=unread')).rejects.toThrow()
      expect(m.redirect).toHaveBeenCalledWith(`/admin?next=${encodeURIComponent('/admin/inbox/conv_1?tab=unread')}`)
    })

    it.each([
      'https://evil.example/admin',
      '//evil.example/admin',
      '/administrator',
      '/admin/../api/users',
      '/feed',
      '',
    ])('drops a return path the sanitizer refuses: %s', async returnTo => {
      signedIn(false)
      await expect(requireAdmin(returnTo)).rejects.toThrow()
      expect(m.redirect).toHaveBeenCalledWith('/admin')
    })
  })

  describe('requireAdminApi', () => {
    it('returns the context when signed in', async () => {
      await expect(requireAdminApi()).resolves.toEqual({
        ok: true,
        ctx: { sessionId: 'admin_sess_1', ip: '203.0.113.7', userAgent: 'Mozilla/5.0 (iPhone)' },
      })
    })

    it('returns an uncacheable 401 JSON response otherwise', async () => {
      signedIn(false)
      const auth = await requireAdminApi()
      expect(auth.ok).toBe(false)
      if (auth.ok) return
      expect(auth.response.status).toBe(401)
      expect(auth.response.headers.get('Cache-Control')).toBe('no-store')
      await expect(auth.response.json()).resolves.toEqual({ error: 'Unauthorized' })
      expect(m.redirect).not.toHaveBeenCalled()
    })
  })
})
