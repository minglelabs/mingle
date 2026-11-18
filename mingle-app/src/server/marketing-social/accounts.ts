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

/**
 * The account with a usable access token, refreshed first when it is close to
 * expiry. Throws SocialApiError('not_connected') when the platform is not linked.
 */
export async function getActiveAccount(platform: SocialPlatform, now = new Date()): Promise<ActiveAccount> {
  const row = await prisma.marketingSocialAccount.findUnique({ where: { platform } })
  if (!row) throw new SocialApiError('계정이 연결되어 있지 않습니다', 0, false)
  let accessToken = decryptToken(row.accessTokenEnc)
  if (needsRefresh(platform, row.accessTokenExpiresAt, now)) {
    const refreshToken = row.refreshTokenEnc ? decryptToken(row.refreshTokenEnc) : null
    try {
      const next = await refreshTokens(platform, { accessToken, refreshToken }, now)
      accessToken = next.accessToken
      await prisma.marketingSocialAccount.update({
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
    } catch (error) {
      const message = error instanceof Error ? error.message : 'refresh failed'
      await prisma.marketingSocialAccount.update({ where: { platform }, data: { lastError: `토큰 갱신 실패: ${message}` } })
      // A Meta token that is still valid keeps working until it actually lapses.
      if (!row.accessTokenExpiresAt || row.accessTokenExpiresAt.getTime() <= now.getTime()) throw error
    }
  }
  return { platform, externalAccountId: row.externalAccountId, username: row.username, accessToken }
}

/** Keep every linked account's token alive (run from the worker tick). */
export async function refreshExpiringAccounts(now = new Date()): Promise<number> {
  const rows = await prisma.marketingSocialAccount.findMany({ select: { platform: true, accessTokenExpiresAt: true, lastError: true, updatedAt: true } })
  let refreshed = 0
  for (const row of rows) {
    const platform = row.platform as SocialPlatform
    if (!needsRefresh(platform, row.accessTokenExpiresAt, now)) continue
    // After a failed refresh, try again hourly, not every tick.
    if (row.lastError && now.getTime() - row.updatedAt.getTime() < 3600_000) continue
    // Short-lived Google/TikTok tokens are refreshed on use; only Meta's 60-day tokens need keeping alive.
    if (platform !== 'instagram' && platform !== 'threads') continue
    try {
      await getActiveAccount(platform, now)
      refreshed += 1
    } catch {
      // lastError is recorded on the row.
    }
  }
  return refreshed
}
