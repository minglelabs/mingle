import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({
  cookieGet: vi.fn(),
  verify: vi.fn(),
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
vi.mock('@/lib/admin-auth', () => ({
  ADMIN_SESSION_COOKIE_NAME: 'admin_session',
  verifyAdminSessionToken: m.verify,
}))

import { getAdminContext, requireAdmin, requireAdminApi } from './guard'

function signedIn(valid: boolean) {
  m.cookieGet.mockReturnValue(valid ? { value: 'token' } : undefined)
  m.verify.mockReturnValue(valid)
}

describe('admin guard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    m.requestHeaders.current = new Headers({
      'x-forwarded-for': '203.0.113.7, 10.0.0.2',
      'x-real-ip': '10.0.0.9',
      'user-agent': 'Mozilla/5.0 (iPhone)',
    })
    signedIn(true)
  })

  describe('getAdminContext', () => {
    it('returns null without a valid admin session cookie', async () => {
      signedIn(false)
      await expect(getAdminContext()).resolves.toBeNull()
      expect(m.cookieGet).toHaveBeenCalledWith('admin_session')
      expect(m.verify).toHaveBeenCalledWith(undefined)
    })

    it('has no session id yet and takes the first forwarded hop as the ip', async () => {
      await expect(getAdminContext()).resolves.toEqual({
        sessionId: null,
        ip: '203.0.113.7',
        userAgent: 'Mozilla/5.0 (iPhone)',
      })
      expect(m.verify).toHaveBeenCalledWith('token')
    })

    it('falls back to x-real-ip, and to null when neither header is present', async () => {
      m.requestHeaders.current = new Headers({ 'x-real-ip': '198.51.100.4' })
      await expect(getAdminContext()).resolves.toEqual({ sessionId: null, ip: '198.51.100.4', userAgent: null })
      m.requestHeaders.current = new Headers()
      await expect(getAdminContext()).resolves.toEqual({ sessionId: null, ip: null, userAgent: null })
    })
  })

  describe('requireAdmin', () => {
    it('returns the context without redirecting when signed in', async () => {
      await expect(requireAdmin('/admin/inbox')).resolves.toMatchObject({ sessionId: null, ip: '203.0.113.7' })
      expect(m.redirect).not.toHaveBeenCalled()
    })

    it('redirects to the login page without next when no return path is given', async () => {
      signedIn(false)
      await expect(requireAdmin()).rejects.toThrow('NEXT_REDIRECT:/admin')
      expect(m.redirect).toHaveBeenCalledWith('/admin')
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
        ctx: { sessionId: null, ip: '203.0.113.7', userAgent: 'Mozilla/5.0 (iPhone)' },
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
