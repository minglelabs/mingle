import { beforeEach, describe, expect, it, vi } from 'vitest'

const rows = vi.hoisted(() => new Map<string, Record<string, unknown>>())
const prismaMock = vi.hoisted(() => {
  const table = {
    findUnique: vi.fn(async ({ where }: { where: { platform: string } }) => (rows.has(where.platform) ? { ...rows.get(where.platform) } : null)),
    findMany: vi.fn(async () => [...rows.values()].map((r) => ({ ...r }))),
    update: vi.fn(async ({ where, data }: { where: { platform: string }; data: Record<string, unknown> }) => {
      rows.set(where.platform, { ...rows.get(where.platform), ...data, updatedAt: new Date() })
      return rows.get(where.platform)
    }),
  }
  let chain: Promise<unknown> = Promise.resolve()
  const tx = { marketingSocialAccount: table, $queryRaw: vi.fn(async () => [{ locked: true }]) }
  return {
    marketingSocialAccount: table,
    tx,
    // Serialize transactions like the advisory lock does.
    $transaction: vi.fn((fn: (t: typeof tx) => Promise<unknown>) => {
      const run = chain.then(() => fn(tx))
      chain = run.catch(() => {})
      return run
    }),
  }
})
vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))

const oauthMock = vi.hoisted(() => ({ refreshTokens: vi.fn(), revokeTokens: vi.fn() }))
vi.mock('./oauth', async (importOriginal) => ({ ...(await importOriginal<typeof import('./oauth')>()), ...oauthMock }))

import { getActiveAccount, refreshExpiringAccounts, UNREADABLE_TOKEN_ERROR } from './accounts'
import { encryptToken } from './crypto'

const NOW = new Date('2026-11-18T03:00:00Z')

function seed(platform: string, overrides: Record<string, unknown> = {}) {
  rows.set(platform, {
    id: platform,
    platform,
    externalAccountId: `${platform}-acct`,
    username: 'hashchat',
    accessTokenEnc: encryptToken('old-access'),
    refreshTokenEnc: encryptToken('refresh-1'),
    accessTokenExpiresAt: new Date(NOW.getTime() + 60_000),
    refreshTokenExpiresAt: null,
    lastError: null,
    updatedAt: new Date(NOW.getTime() - 86400_000),
    ...overrides,
  })
}

describe('marketing social accounts', () => {
  beforeEach(() => {
    vi.stubEnv('AUTH_SECRET', 'test-secret')
    rows.clear()
    vi.clearAllMocks()
  })

  it('refreshes once when many callers need the token at the same time (TikTok refresh tokens rotate)', async () => {
    seed('tiktok')
    oauthMock.refreshTokens.mockImplementation(async (_p: string, current: { refreshToken: string }) => {
      await new Promise((r) => setTimeout(r, 5))
      return { accessToken: `new-access-from-${current.refreshToken}`, refreshToken: 'refresh-2', accessExpiresAt: new Date(NOW.getTime() + 86400_000), refreshExpiresAt: null, scopes: null }
    })
    const accounts = await Promise.all([getActiveAccount('tiktok', NOW), getActiveAccount('tiktok', NOW), getActiveAccount('tiktok', NOW)])
    expect(oauthMock.refreshTokens).toHaveBeenCalledTimes(1)
    expect(accounts.map((a) => a.accessToken)).toEqual(Array(3).fill('new-access-from-refresh-1'))
    expect(prismaMock.tx.$queryRaw).toHaveBeenCalled()
  })

  it('a caller that waited on the lock re-reads the row and does not refresh again', async () => {
    seed('youtube')
    oauthMock.refreshTokens.mockResolvedValue({ accessToken: 'fresh', refreshToken: null, accessExpiresAt: new Date(NOW.getTime() + 3600_000), refreshExpiresAt: null, scopes: null })
    await getActiveAccount('youtube', NOW)
    // Simulate another replica arriving with the stale view: under the lock it sees the fresh row.
    await prismaMock.$transaction(async () => {})
    expect((await getActiveAccount('youtube', NOW)).accessToken).toBe('fresh')
    expect(oauthMock.refreshTokens).toHaveBeenCalledTimes(1)
  })

  it('counts only Meta tokens that were actually refreshed', async () => {
    seed('instagram', { accessTokenExpiresAt: new Date(NOW.getTime() + 2 * 86400_000) })
    seed('threads', { accessTokenExpiresAt: new Date(NOW.getTime() + 2 * 86400_000) })
    oauthMock.refreshTokens.mockImplementation(async (platform: string) => {
      if (platform === 'threads') throw new Error('Session has expired')
      return { accessToken: 'ig-new', refreshToken: null, accessExpiresAt: new Date(NOW.getTime() + 60 * 86400_000), refreshExpiresAt: null, scopes: null }
    })
    expect(await refreshExpiringAccounts(NOW)).toBe(1)
    expect(rows.get('threads')!.lastError).toBe('토큰 갱신 실패: Session has expired')
  })

  it('keeps using a still-valid Meta token when its refresh fails', async () => {
    seed('instagram', { accessTokenExpiresAt: new Date(NOW.getTime() + 2 * 86400_000) })
    oauthMock.refreshTokens.mockRejectedValue(new Error('temporary'))
    expect((await getActiveAccount('instagram', NOW)).accessToken).toBe('old-access')
  })

  it('marks the account for reconnecting when its token can no longer be decrypted', async () => {
    seed('instagram', { accessTokenExpiresAt: new Date(NOW.getTime() + 30 * 86400_000) })
    vi.stubEnv('AUTH_SECRET', 'rotated-secret')
    await expect(getActiveAccount('instagram', NOW)).rejects.toMatchObject({ message: UNREADABLE_TOKEN_ERROR, transient: false })
    expect(rows.get('instagram')!.lastError).toBe(UNREADABLE_TOKEN_ERROR)
  })
})
