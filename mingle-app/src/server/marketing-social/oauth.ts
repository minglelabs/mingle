import { readPlatformCredentials, type PlatformCredentials } from './config'
import { formBody, SocialApiError, socialJson } from './http'
import type { SocialPlatform } from './types'

/**
 * OAuth for the four platforms (authorization code flow, server side):
 * - Instagram: "Instagram API with Instagram Login" (no Facebook Page), long-lived 60-day token, refreshable.
 * - Threads: same model as Instagram, 60-day token.
 * - YouTube: Google OAuth, offline access (refresh token).
 * - TikTok: Login Kit v2, 24 h access token + 365-day refresh token.
 */
export const GRAPH_INSTAGRAM = 'https://graph.instagram.com/v23.0'
export const GRAPH_THREADS = 'https://graph.threads.net/v1.0'
export const TIKTOK_API = 'https://open.tiktokapis.com/v2'
export const YOUTUBE_API = 'https://www.googleapis.com/youtube/v3'

export const OAUTH_SCOPES: Record<SocialPlatform, string[]> = {
  instagram: ['instagram_business_basic', 'instagram_business_content_publish', 'instagram_business_manage_insights'],
  threads: ['threads_basic', 'threads_content_publish', 'threads_manage_insights'],
  youtube: ['https://www.googleapis.com/auth/youtube.upload', 'https://www.googleapis.com/auth/youtube.readonly'],
  tiktok: ['user.info.basic', 'user.info.profile', 'video.publish', 'video.list'],
}

export type TokenSet = {
  accessToken: string
  refreshToken: string | null
  accessExpiresAt: Date | null
  refreshExpiresAt: Date | null
  scopes: string | null
}

export type ConnectedAccount = TokenSet & {
  externalAccountId: string
  username: string | null
  displayName: string | null
}

function requireCredentials(platform: SocialPlatform): PlatformCredentials {
  const credentials = readPlatformCredentials(platform)
  if (!credentials) throw new SocialApiError('not_configured', 0, false)
  return credentials
}

function expiresIn(seconds: unknown, now: Date): Date | null {
  const value = typeof seconds === 'number' ? seconds : Number(seconds)
  return Number.isFinite(value) && value > 0 ? new Date(now.getTime() + value * 1000) : null
}

function str(value: unknown): string | null {
  if (typeof value === 'string' && value) return value
  if (typeof value === 'number') return String(value)
  return null
}

export function buildAuthorizeUrl(platform: SocialPlatform, redirectUri: string, state: string): string {
  const { clientId } = requireCredentials(platform)
  const scope = OAUTH_SCOPES[platform]
  switch (platform) {
    case 'instagram': {
      const url = new URL('https://www.instagram.com/oauth/authorize')
      url.search = new URLSearchParams({ client_id: clientId, redirect_uri: redirectUri, response_type: 'code', scope: scope.join(','), state }).toString()
      return url.toString()
    }
    case 'threads': {
      const url = new URL('https://threads.net/oauth/authorize')
      url.search = new URLSearchParams({ client_id: clientId, redirect_uri: redirectUri, response_type: 'code', scope: scope.join(','), state }).toString()
      return url.toString()
    }
    case 'youtube': {
      const url = new URL('https://accounts.google.com/o/oauth2/v2/auth')
      url.search = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: scope.join(' '),
        access_type: 'offline',
        // Always ask again so Google returns a refresh token on every reconnect.
        prompt: 'consent',
        include_granted_scopes: 'true',
        state,
      }).toString()
      return url.toString()
    }
    case 'tiktok': {
      const url = new URL('https://www.tiktok.com/v2/auth/authorize/')
      url.search = new URLSearchParams({ client_key: clientId, redirect_uri: redirectUri, response_type: 'code', scope: scope.join(','), state }).toString()
      return url.toString()
    }
  }
}

async function exchangeInstagram(code: string, redirectUri: string, now: Date): Promise<ConnectedAccount> {
  const { clientId, clientSecret } = requireCredentials('instagram')
  const short = await socialJson<{ access_token?: string; permissions?: string[] | string }>('https://api.instagram.com/oauth/access_token', {
    method: 'POST',
    body: formBody({ client_id: clientId, client_secret: clientSecret, grant_type: 'authorization_code', redirect_uri: redirectUri, code }),
  })
  if (!short.access_token) throw new SocialApiError('no access token', 0, false)
  const long = await socialJson<{ access_token?: string; expires_in?: number }>(
    `https://graph.instagram.com/access_token?${new URLSearchParams({ grant_type: 'ig_exchange_token', client_secret: clientSecret, access_token: short.access_token })}`,
  )
  const accessToken = long.access_token ?? short.access_token
  const me = await socialJson<{ user_id?: string | number; id?: string; username?: string; name?: string }>(
    `${GRAPH_INSTAGRAM}/me?${new URLSearchParams({ fields: 'user_id,username,name', access_token: accessToken })}`,
  )
  const externalAccountId = str(me.user_id) ?? str(me.id)
  if (!externalAccountId) throw new SocialApiError('no instagram account id', 0, false)
  return {
    accessToken,
    refreshToken: null,
    accessExpiresAt: expiresIn(long.expires_in, now),
    refreshExpiresAt: null,
    scopes: Array.isArray(short.permissions) ? short.permissions.join(',') : str(short.permissions),
    externalAccountId,
    username: str(me.username),
    displayName: str(me.name),
  }
}

async function exchangeThreads(code: string, redirectUri: string, now: Date): Promise<ConnectedAccount> {
  const { clientId, clientSecret } = requireCredentials('threads')
  const short = await socialJson<{ access_token?: string; user_id?: string | number }>('https://graph.threads.net/oauth/access_token', {
    method: 'POST',
    body: formBody({ client_id: clientId, client_secret: clientSecret, grant_type: 'authorization_code', redirect_uri: redirectUri, code }),
  })
  if (!short.access_token) throw new SocialApiError('no access token', 0, false)
  const long = await socialJson<{ access_token?: string; expires_in?: number }>(
    `https://graph.threads.net/access_token?${new URLSearchParams({ grant_type: 'th_exchange_token', client_secret: clientSecret, access_token: short.access_token })}`,
  )
  const accessToken = long.access_token ?? short.access_token
  const me = await socialJson<{ id?: string; username?: string; name?: string }>(
    `${GRAPH_THREADS}/me?${new URLSearchParams({ fields: 'id,username,name', access_token: accessToken })}`,
  )
  const externalAccountId = str(me.id) ?? str(short.user_id)
  if (!externalAccountId) throw new SocialApiError('no threads user id', 0, false)
  return {
    accessToken,
    refreshToken: null,
    accessExpiresAt: expiresIn(long.expires_in, now),
    refreshExpiresAt: null,
    scopes: OAUTH_SCOPES.threads.join(','),
    externalAccountId,
    username: str(me.username),
    displayName: str(me.name),
  }
}

type GoogleToken = { access_token?: string; refresh_token?: string; expires_in?: number; scope?: string }

async function exchangeYouTube(code: string, redirectUri: string, now: Date): Promise<ConnectedAccount> {
  const { clientId, clientSecret } = requireCredentials('youtube')
  const token = await socialJson<GoogleToken>('https://oauth2.googleapis.com/token', {
    method: 'POST',
    body: formBody({ client_id: clientId, client_secret: clientSecret, grant_type: 'authorization_code', redirect_uri: redirectUri, code }),
  })
  if (!token.access_token) throw new SocialApiError('no access token', 0, false)
  const channels = await socialJson<{ items?: { id?: string; snippet?: { title?: string; customUrl?: string } }[] }>(
    `${YOUTUBE_API}/channels?part=snippet&mine=true`,
    { headers: { Authorization: `Bearer ${token.access_token}` } },
  )
  const channel = channels.items?.[0]
  if (!channel?.id) throw new SocialApiError('이 구글 계정에 유튜브 채널이 없습니다', 0, false)
  return {
    accessToken: token.access_token,
    refreshToken: token.refresh_token ?? null,
    accessExpiresAt: expiresIn(token.expires_in, now),
    refreshExpiresAt: null,
    scopes: token.scope ?? null,
    externalAccountId: channel.id,
    username: str(channel.snippet?.customUrl),
    displayName: str(channel.snippet?.title),
  }
}

type TikTokToken = {
  access_token?: string
  refresh_token?: string
  expires_in?: number
  refresh_expires_in?: number
  open_id?: string
  scope?: string
}

async function exchangeTikTok(code: string, redirectUri: string, now: Date): Promise<ConnectedAccount> {
  const { clientId, clientSecret } = requireCredentials('tiktok')
  const token = await socialJson<TikTokToken>(`${TIKTOK_API}/oauth/token/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: formBody({ client_key: clientId, client_secret: clientSecret, grant_type: 'authorization_code', redirect_uri: redirectUri, code }),
  })
  if (!token.access_token || !token.open_id) throw new SocialApiError('no access token', 0, false)
  let username: string | null = null
  let displayName: string | null = null
  try {
    const info = await socialJson<{ data?: { user?: { username?: string; display_name?: string } } }>(
      `${TIKTOK_API}/user/info/?fields=open_id,username,display_name`,
      { headers: { Authorization: `Bearer ${token.access_token}` } },
    )
    username = str(info.data?.user?.username)
    displayName = str(info.data?.user?.display_name)
  } catch {
    // Profile fields are cosmetic; the connection works without them.
  }
  return {
    accessToken: token.access_token,
    refreshToken: token.refresh_token ?? null,
    accessExpiresAt: expiresIn(token.expires_in, now),
    refreshExpiresAt: expiresIn(token.refresh_expires_in, now),
    scopes: token.scope ?? null,
    externalAccountId: token.open_id,
    username,
    displayName,
  }
}

export function exchangeAuthorizationCode(platform: SocialPlatform, code: string, redirectUri: string, now = new Date()): Promise<ConnectedAccount> {
  switch (platform) {
    case 'instagram':
      return exchangeInstagram(code, redirectUri, now)
    case 'threads':
      return exchangeThreads(code, redirectUri, now)
    case 'youtube':
      return exchangeYouTube(code, redirectUri, now)
    case 'tiktok':
      return exchangeTikTok(code, redirectUri, now)
  }
}

/** A fresh token set from the stored one. Keeps the old refresh token when the platform does not rotate it. */
export async function refreshTokens(
  platform: SocialPlatform,
  current: { accessToken: string; refreshToken: string | null },
  now = new Date(),
): Promise<TokenSet> {
  switch (platform) {
    case 'instagram': {
      const body = await socialJson<{ access_token?: string; expires_in?: number }>(
        `https://graph.instagram.com/refresh_access_token?${new URLSearchParams({ grant_type: 'ig_refresh_token', access_token: current.accessToken })}`,
      )
      if (!body.access_token) throw new SocialApiError('refresh returned no token', 0, false)
      return { accessToken: body.access_token, refreshToken: null, accessExpiresAt: expiresIn(body.expires_in, now), refreshExpiresAt: null, scopes: null }
    }
    case 'threads': {
      const body = await socialJson<{ access_token?: string; expires_in?: number }>(
        `https://graph.threads.net/refresh_access_token?${new URLSearchParams({ grant_type: 'th_refresh_token', access_token: current.accessToken })}`,
      )
      if (!body.access_token) throw new SocialApiError('refresh returned no token', 0, false)
      return { accessToken: body.access_token, refreshToken: null, accessExpiresAt: expiresIn(body.expires_in, now), refreshExpiresAt: null, scopes: null }
    }
    case 'youtube': {
      if (!current.refreshToken) throw new SocialApiError('no refresh token — 다시 연결하세요', 0, false)
      const { clientId, clientSecret } = requireCredentials('youtube')
      const body = await socialJson<GoogleToken>('https://oauth2.googleapis.com/token', {
        method: 'POST',
        body: formBody({ client_id: clientId, client_secret: clientSecret, grant_type: 'refresh_token', refresh_token: current.refreshToken }),
      })
      if (!body.access_token) throw new SocialApiError('refresh returned no token', 0, false)
      return {
        accessToken: body.access_token,
        refreshToken: body.refresh_token ?? current.refreshToken,
        accessExpiresAt: expiresIn(body.expires_in, now),
        refreshExpiresAt: null,
        scopes: body.scope ?? null,
      }
    }
    case 'tiktok': {
      if (!current.refreshToken) throw new SocialApiError('no refresh token — 다시 연결하세요', 0, false)
      const { clientId, clientSecret } = requireCredentials('tiktok')
      const body = await socialJson<TikTokToken>(`${TIKTOK_API}/oauth/token/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: formBody({ client_key: clientId, client_secret: clientSecret, grant_type: 'refresh_token', refresh_token: current.refreshToken }),
      })
      if (!body.access_token) throw new SocialApiError('refresh returned no token', 0, false)
      return {
        accessToken: body.access_token,
        refreshToken: body.refresh_token ?? current.refreshToken,
        accessExpiresAt: expiresIn(body.expires_in, now),
        refreshExpiresAt: expiresIn(body.refresh_expires_in, now),
        scopes: body.scope ?? null,
      }
    }
  }
}

/** Best-effort token revocation on disconnect (YouTube / TikTok support it; Meta tokens just expire). */
export async function revokeTokens(platform: SocialPlatform, accessToken: string): Promise<void> {
  try {
    if (platform === 'youtube') {
      await socialJson(`https://oauth2.googleapis.com/revoke?${new URLSearchParams({ token: accessToken })}`, { method: 'POST' })
    } else if (platform === 'tiktok') {
      const { clientId, clientSecret } = requireCredentials('tiktok')
      await socialJson(`${TIKTOK_API}/oauth/revoke/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: formBody({ client_key: clientId, client_secret: clientSecret, token: accessToken }),
      })
    }
  } catch {
    // The local row is removed either way.
  }
}

/**
 * When to refresh: Meta long-lived tokens a week before they lapse (they can
 * only be refreshed while still valid), short Google/TikTok tokens 5 min early.
 */
export function needsRefresh(platform: SocialPlatform, accessExpiresAt: Date | null, now = new Date()): boolean {
  if (!accessExpiresAt) return false
  const margin = platform === 'instagram' || platform === 'threads' ? 7 * 24 * 3600_000 : 5 * 60_000
  return accessExpiresAt.getTime() - now.getTime() <= margin
}
