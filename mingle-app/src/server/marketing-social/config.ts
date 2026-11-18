import type { SocialPlatform } from './types'

type Env = Readonly<Record<string, string | undefined>>

export type PlatformCredentials = { clientId: string; clientSecret: string }

const CREDENTIAL_ENV: Record<SocialPlatform, [string, string]> = {
  instagram: ['INSTAGRAM_APP_ID', 'INSTAGRAM_APP_SECRET'],
  threads: ['THREADS_APP_ID', 'THREADS_APP_SECRET'],
  youtube: ['YOUTUBE_OAUTH_CLIENT_ID', 'YOUTUBE_OAUTH_CLIENT_SECRET'],
  tiktok: ['TIKTOK_CLIENT_KEY', 'TIKTOK_CLIENT_SECRET'],
}

/** The platform app's id + secret, or null while they are not set. */
export function readPlatformCredentials(platform: SocialPlatform, env: Env = process.env): PlatformCredentials | null {
  const [idName, secretName] = CREDENTIAL_ENV[platform]
  const clientId = env[idName]?.trim() ?? ''
  const clientSecret = env[secretName]?.trim() ?? ''
  return clientId && clientSecret ? { clientId, clientSecret } : null
}

export function credentialEnvNames(platform: SocialPlatform): [string, string] {
  return CREDENTIAL_ENV[platform]
}

/**
 * Public origin the OAuth redirect comes back to. Must match the redirect URI
 * registered in each platform's developer console exactly.
 */
export function readPublicOrigin(env: Env = process.env): string {
  const raw = env.MARKETING_SOCIAL_PUBLIC_ORIGIN?.trim() || env.NEXTAUTH_URL?.trim() || env.NEXT_PUBLIC_SITE_URL?.trim() || ''
  if (!raw) throw new Error('public_origin_missing')
  return new URL(raw).origin
}

export function oauthRedirectUri(platform: SocialPlatform, env: Env = process.env): string {
  return `${readPublicOrigin(env)}/admin/social/api/oauth/${platform}/callback`
}
