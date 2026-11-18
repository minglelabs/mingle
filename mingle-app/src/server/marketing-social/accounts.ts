import { prisma } from '@/lib/prisma'
import { readPlatformCredentials } from './config'
import { decryptToken, encryptToken } from './crypto'
import { SocialApiError } from './http'
import { needsRefresh, refreshTokens, revokeTokens, type ConnectedAccount } from './oauth'
import { SOCIAL_PLATFORMS, type SocialAccountView, type SocialPlatform } from './types'

export type ActiveAccount = {
  platform: SocialPlatform
  externalAccountId: string
  username: string | null
  accessToken: string
}

export async function listSocialAccounts(): Promise<SocialAccountView[]> {
  const rows = await prisma.marketingSocialAccount.findMany()
  return SOCIAL_PLATFORMS.map((platform) => {
    const row = rows.find((r) => r.platform === platform)
    return {
      platform,
      configured: readPlatformCredentials(platform) !== null,
      connected: Boolean(row),
      username: row?.username ?? null,
      displayName: row?.displayName ?? null,
      connectedAt: row?.connectedAt.toISOString() ?? null,
      accessTokenExpiresAt: row?.accessTokenExpiresAt?.toISOString() ?? null,
      refreshTokenExpiresAt: row?.refreshTokenExpiresAt?.toISOString() ?? null,
      lastError: row?.lastError ?? null,
    }
  })
}

export async function connectedPlatforms(): Promise<SocialPlatform[]> {
  const rows = await prisma.marketingSocialAccount.findMany({ select: { platform: true } })
  return SOCIAL_PLATFORMS.filter((p) => rows.some((r) => r.platform === p))
}

export async function saveConnectedAccount(platform: SocialPlatform, account: ConnectedAccount): Promise<void> {
  const data = {
    externalAccountId: account.externalAccountId,
    username: account.username,
    displayName: account.displayName,
    accessTokenEnc: encryptToken(account.accessToken),
    refreshTokenEnc: account.refreshToken ? encryptToken(account.refreshToken) : null,
    accessTokenExpiresAt: account.accessExpiresAt,
    refreshTokenExpiresAt: account.refreshExpiresAt,
    scopes: account.scopes,
    lastError: null,
    connectedAt: new Date(),
  }
  await prisma.marketingSocialAccount.upsert({ where: { platform }, create: { platform, ...data }, update: data })
}

export async function disconnectSocialAccount(platform: SocialPlatform): Promise<boolean> {
  const row = await prisma.marketingSocialAccount.findUnique({ where: { platform } })
  if (!row) return false
  try {
    await revokeTokens(platform, decryptToken(row.accessTokenEnc))
  } catch {
    // Undecryptable or revoked already: drop the row anyway.
  }
  await prisma.marketingSocialAccount.delete({ where: { platform } })
  return true
}

export const UNREADABLE_TOKEN_ERROR = '저장된 토큰을 읽을 수 없습니다 (암호화 키가 바뀌었을 수 있음) — 다시 연결하세요'

type AccountRow = NonNullable<Awaited<ReturnType<typeof prisma.marketingSocialAccount.findUnique>>>

/** Decrypt a stored token; an unreadable one marks the account "다시 연결" instead of failing silently. */
async function readStoredToken(platform: SocialPlatform, sealed: string): Promise<string> {
  try {
    return decryptToken(sealed)
  } catch {
    await prisma.marketingSocialAccount.update({ where: { platform }, data: { lastError: UNREADABLE_TOKEN_ERROR } }).catch(() => {})
    throw new SocialApiError(UNREADABLE_TOKEN_ERROR, 0, false)
  }
}

export type RefreshOutcome = { outcome: 'refreshed' | 'not_needed' } | { outcome: 'failed'; error: unknown }

/**
 * Refresh one platform's token, serialized across requests and replicas by a
 * transaction-scoped advisory lock (safe behind the transaction pooler). The
 * row is re-read under the lock, so a caller that waited sees the token the
 * first one stored and does not spend TikTok's rotating refresh token twice.
 */
async function refreshUnderLock(platform: SocialPlatform, now: Date): Promise<RefreshOutcome> {
  return prisma.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT true AS locked FROM pg_advisory_xact_lock(hashtextextended(${`marketing-social-token:${platform}`}, 0))`
      const row = await tx.marketingSocialAccount.findUnique({ where: { platform } })
      if (!row || !needsRefresh(platform, row.accessTokenExpiresAt, now)) return { outcome: 'not_needed' as const }
      let accessToken: string
      let refreshToken: string | null
      try {
        accessToken = decryptToken(row.accessTokenEnc)
        refreshToken = row.refreshTokenEnc ? decryptToken(row.refreshTokenEnc) : null
      } catch {
        await tx.marketingSocialAccount.update({ where: { platform }, data: { lastError: UNREADABLE_TOKEN_ERROR } })
        return { outcome: 'failed' as const, error: new SocialApiError(UNREADABLE_TOKEN_ERROR, 0, false) }
      }
      try {
        const next = await refreshTokens(platform, { accessToken, refreshToken }, now)
        await tx.marketingSocialAccount.update({
          where: { platform },
          data: {
            accessTokenEnc: encryptToken(next.accessToken),
            refreshTokenEnc: next.refreshToken ? encryptToken(next.refreshToken) : row.refreshTokenEnc,
            accessTokenExpiresAt: next.accessExpiresAt,
            refreshTokenExpiresAt: next.refreshExpiresAt ?? row.refreshTokenExpiresAt,
            ...(next.scopes ? { scopes: next.scopes } : {}),
            lastError: null,
          },
        })
        return { outcome: 'refreshed' as const }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'refresh failed'
        await tx.marketingSocialAccount.update({ where: { platform }, data: { lastError: `토큰 갱신 실패: ${message}` } })
        return { outcome: 'failed' as const, error }
      }
    },
    { maxWait: 30_000, timeout: 90_000 },
  )
}

const INFLIGHT_KEY = Symbol.for('mingle.marketingSocialTokenRefresh.v1')

function inflight(): Map<SocialPlatform, Promise<RefreshOutcome>> {
  const holder = globalThis as typeof globalThis & { [INFLIGHT_KEY]?: Map<SocialPlatform, Promise<RefreshOutcome>> }
  holder[INFLIGHT_KEY] ??= new Map()
  return holder[INFLIGHT_KEY]
}

/** One refresh per platform per process at a time; concurrent callers share it. */
export function refreshAccountToken(platform: SocialPlatform, now = new Date()): Promise<RefreshOutcome> {
  const running = inflight().get(platform)
  if (running) return running
  const promise = refreshUnderLock(platform, now).finally(() => inflight().delete(platform))
  inflight().set(platform, promise)
  return promise
}

function isExpired(row: AccountRow, now: Date): boolean {
  return !row.accessTokenExpiresAt || row.accessTokenExpiresAt.getTime() <= now.getTime()
}

/**
 * The account with a usable access token, refreshed first when it is close to
 * expiry. Throws SocialApiError when the platform is not linked or its token
 * cannot be used.
 */
export async function getActiveAccount(platform: SocialPlatform, now = new Date()): Promise<ActiveAccount> {
  let row = await prisma.marketingSocialAccount.findUnique({ where: { platform } })
  if (!row) throw new SocialApiError('계정이 연결되어 있지 않습니다', 0, false)
  if (needsRefresh(platform, row.accessTokenExpiresAt, now)) {
    const result = await refreshAccountToken(platform, now)
    row = await prisma.marketingSocialAccount.findUnique({ where: { platform } })
    if (!row) throw new SocialApiError('계정이 연결되어 있지 않습니다', 0, false)
    // A Meta token that is still valid keeps working until it actually lapses.
    if (result.outcome === 'failed' && isExpired(row, now)) throw result.error
  }
  const accessToken = await readStoredToken(platform, row.accessTokenEnc)
  return { platform, externalAccountId: row.externalAccountId, username: row.username, accessToken }
}

/** Keep Meta's 60-day tokens alive (run from the worker tick). Returns how many were actually refreshed. */
export async function refreshExpiringAccounts(now = new Date()): Promise<number> {
  const rows = await prisma.marketingSocialAccount.findMany({ select: { platform: true, accessTokenExpiresAt: true, lastError: true, updatedAt: true } })
  let refreshed = 0
  for (const row of rows) {
    const platform = row.platform as SocialPlatform
    // Short-lived Google/TikTok tokens are refreshed on use; only Meta's 60-day tokens need keeping alive.
    if (platform !== 'instagram' && platform !== 'threads') continue
    if (!needsRefresh(platform, row.accessTokenExpiresAt, now)) continue
    // After a failed refresh, try again hourly, not every tick.
    if (row.lastError && now.getTime() - row.updatedAt.getTime() < 3600_000) continue
    const result = await refreshAccountToken(platform, now)
    if (result.outcome === 'refreshed') refreshed += 1
  }
  return refreshed
}
