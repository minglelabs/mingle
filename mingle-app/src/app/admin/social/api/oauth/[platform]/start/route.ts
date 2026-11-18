import { NextResponse } from 'next/server'
import { requireAdminApi } from '@/server/admin/guard'
import { oauthRedirectUri, readPlatformCredentials } from '@/server/marketing-social/config'
import { buildAuthorizeUrl } from '@/server/marketing-social/oauth'
import { newOAuthState, OAUTH_STATE_COOKIE, OAUTH_STATE_MAX_AGE_S } from '@/server/marketing-social/oauth-state'
import { isSocialPlatform } from '@/server/marketing-social/types'

export const runtime = 'nodejs'

/** GET — send staff to the platform's consent screen. */
export async function GET(_request: Request, { params }: { params: Promise<{ platform: string }> }) {
  const auth = await requireAdminApi()
  if (!auth.ok) return auth.response
  const { platform } = await params
  if (!isSocialPlatform(platform)) return NextResponse.json({ error: 'unknown_platform' }, { status: 404 })
  if (!readPlatformCredentials(platform)) {
    return NextResponse.redirect(new URL(`/admin/social/accounts?error=not_configured&platform=${platform}`, oauthRedirectUri(platform)))
  }
  const { state, cookieValue } = newOAuthState(platform)
  const response = NextResponse.redirect(buildAuthorizeUrl(platform, oauthRedirectUri(platform), state))
  response.cookies.set(OAUTH_STATE_COOKIE, cookieValue, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    // lax: the platform's redirect back is a top-level GET navigation.
    sameSite: 'lax',
    path: '/admin/social',
    maxAge: OAUTH_STATE_MAX_AGE_S,
  })
  response.headers.set('Cache-Control', 'no-store')
  return response
}
