import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({ create: vi.fn(), findUnique: vi.fn(), updateMany: vi.fn() }))
vi.mock('@/lib/prisma', () => ({
  prisma: { adminSession: { create: m.create, findUnique: m.findUnique, updateMany: m.updateMany } },
}))

import {
  ADMIN_SESSION_LAST_SEEN_INTERVAL_MS,
  ADMIN_SESSION_TTL_SECONDS,
  adminSessionCookie,
  createAdminSession,
  expiredAdminSessionCookie,
  hashAdminSessionToken,
  revokeAdminSession,
  verifyAdminSessionCookie,
} from './session'

const NOW = new Date('2026-09-30T10:00:00.000Z')
const DAY_MS = 24 * 60 * 60 * 1000
const TOKEN = 'A'.repeat(43)

function storedSession(overrides: Partial<{ lastSeenAt: Date; expiresAt: Date; revokedAt: Date | null }> = {}) {
  return {
    id: 'sess_1',
    createdAt: new Date(NOW.getTime() - DAY_MS),
    lastSeenAt: new Date(NOW.getTime() - 60_000),
    expiresAt: new Date(NOW.getTime() + 10 * DAY_MS),
    revokedAt: null,
    ...overrides,
  }
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
  m.updateMany.mockResolvedValue({ count: 1 })
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
})

describe('createAdminSession', () => {
  beforeEach(() => {
    m.create.mockImplementation(async ({ data }) => ({
      id: 'sess_new',
      createdAt: data.createdAt,
      lastSeenAt: data.lastSeenAt,
      expiresAt: data.expiresAt,
      revokedAt: null,
    }))
  })

  it('stores only the sha256 of a random 32-byte token and expires 30 days after login', async () => {
    const { token, session } = await createAdminSession({ ip: '203.0.113.7', userAgent: 'Mozilla/5.0 (iPhone)' })

    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(Buffer.from(token, 'base64url')).toHaveLength(32)
    const { data } = m.create.mock.calls[0][0]
    expect(data.tokenHash).toMatch(/^[0-9a-f]{64}$/)
    expect(data.tokenHash).toBe(hashAdminSessionToken(token))
    expect(JSON.stringify(m.create.mock.calls)).not.toContain(token)
    expect(data).toMatchObject({ ip: '203.0.113.7', userAgent: 'Mozilla/5.0 (iPhone)', createdAt: NOW, lastSeenAt: NOW })
    expect(data.expiresAt.getTime() - NOW.getTime()).toBe(30 * DAY_MS)
    expect(session).toMatchObject({ id: 'sess_new', revokedAt: null })
  })

  it('issues a different token for every login', async () => {
    const first = await createAdminSession({ ip: null, userAgent: null })
    const second = await createAdminSession({ ip: null, userAgent: null })
    expect(first.token).not.toBe(second.token)
  })
})

describe('verifyAdminSessionCookie', () => {
  it.each([undefined, null, 42, '', 'short', `${'A'.repeat(42)}.`, `v1.${'A'.repeat(43)}`, 'A'.repeat(44)])(
    'refuses a missing or malformed value without a DB lookup: %s',
    async (value) => {
      await expect(verifyAdminSessionCookie(value)).resolves.toBeNull()
      expect(m.findUnique).not.toHaveBeenCalled()
    },
  )

  it('looks the session up by the sha256 of the cookie value', async () => {
    m.findUnique.mockResolvedValue(storedSession())
    await expect(verifyAdminSessionCookie(TOKEN)).resolves.toMatchObject({ id: 'sess_1' })
    expect(m.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { tokenHash: hashAdminSessionToken(TOKEN) } }))
  })

  it('returns null for an unknown token', async () => {
    m.findUnique.mockResolvedValue(null)
    await expect(verifyAdminSessionCookie(TOKEN)).resolves.toBeNull()
  })

  it('returns null for a revoked session', async () => {
    m.findUnique.mockResolvedValue(storedSession({ revokedAt: new Date(NOW.getTime() - 1000) }))
    await expect(verifyAdminSessionCookie(TOKEN)).resolves.toBeNull()
    expect(m.updateMany).not.toHaveBeenCalled()
  })

  it('returns null once the session has expired', async () => {
    m.findUnique.mockResolvedValue(storedSession({ expiresAt: NOW }))
    await expect(verifyAdminSessionCookie(TOKEN)).resolves.toBeNull()
    m.findUnique.mockResolvedValue(storedSession({ expiresAt: new Date(NOW.getTime() - 1) }))
    await expect(verifyAdminSessionCookie(TOKEN)).resolves.toBeNull()
    expect(m.updateMany).not.toHaveBeenCalled()
  })

  it('does not write lastSeenAt when it is less than five minutes old', async () => {
    const lastSeenAt = new Date(NOW.getTime() - ADMIN_SESSION_LAST_SEEN_INTERVAL_MS + 1)
    m.findUnique.mockResolvedValue(storedSession({ lastSeenAt }))
    await expect(verifyAdminSessionCookie(TOKEN)).resolves.toMatchObject({ id: 'sess_1', lastSeenAt })
    expect(m.updateMany).not.toHaveBeenCalled()
  })

  it('bumps lastSeenAt once it is five minutes old, only on a live session', async () => {
    m.findUnique.mockResolvedValue(storedSession({ lastSeenAt: new Date(NOW.getTime() - ADMIN_SESSION_LAST_SEEN_INTERVAL_MS) }))
    await expect(verifyAdminSessionCookie(TOKEN)).resolves.toMatchObject({ id: 'sess_1', lastSeenAt: NOW })
    expect(m.updateMany).toHaveBeenCalledOnce()
    expect(m.updateMany).toHaveBeenCalledWith({ where: { id: 'sess_1', revokedAt: null }, data: { lastSeenAt: NOW } })
  })

  it('still accepts the session when the lastSeenAt write fails', async () => {
    const stale = new Date(NOW.getTime() - 2 * ADMIN_SESSION_LAST_SEEN_INTERVAL_MS)
    m.findUnique.mockResolvedValue(storedSession({ lastSeenAt: stale }))
    m.updateMany.mockRejectedValue(new Error('db down'))
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      await expect(verifyAdminSessionCookie(TOKEN)).resolves.toMatchObject({ id: 'sess_1', lastSeenAt: stale })
      expect(error).toHaveBeenCalledWith('[admin-session] last_seen_update_failed', { error: 'Error' })
    } finally {
      error.mockRestore()
    }
  })
})

describe('revokeAdminSession', () => {
  it('stamps revokedAt on the session unless it is already revoked', async () => {
    await revokeAdminSession('sess_1')
    expect(m.updateMany).toHaveBeenCalledWith({ where: { id: 'sess_1', revokedAt: null }, data: { revokedAt: NOW } })
  })
})

describe('admin session cookie', () => {
  it('is the one definition: httpOnly, lax, path /admin, 30 days, secure only in production', () => {
    vi.stubEnv('NODE_ENV', 'development')
    expect(adminSessionCookie('tok')).toEqual({
      name: 'mingle_admin_session',
      value: 'tok',
      httpOnly: true,
      sameSite: 'lax',
      secure: false,
      path: '/admin',
      maxAge: ADMIN_SESSION_TTL_SECONDS,
    })
    expect(ADMIN_SESSION_TTL_SECONDS).toBe(30 * 24 * 60 * 60)
    vi.stubEnv('NODE_ENV', 'production')
    expect(adminSessionCookie('tok').secure).toBe(true)
  })

  it('expires the same cookie on logout', () => {
    expect(expiredAdminSessionCookie()).toMatchObject({ name: 'mingle_admin_session', value: '', path: '/admin', maxAge: 0, httpOnly: true })
  })
})
