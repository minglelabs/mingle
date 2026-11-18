import { cookies } from 'next/headers'
import { NextResponse, type NextRequest } from 'next/server'
import { writeAdminAudit } from '@/server/admin/audit'
import { requireAdminApi } from '@/server/admin/guard'
import { saveConnectedAccount } from '@/server/marketing-social/accounts'
import { oauthRedirectUri } from '@/server/marketing-social/config'
import { exchangeAuthorizationCode } from '@/server/marketing-social/oauth'
import { checkOAuthState, OAUTH_STATE_COOKIE } from '@/server/marketing-social/oauth-state'
import { isSocialPlatform } from '@/server/marketing-social/types'

export const runtime = 'nodejs'

/** GET `?code&state` — the platform sends staff back here; store the tokens and return to the accounts page. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ platform: string }> }) {
  const auth = await requireAdminApi()
  if (!auth.ok) return auth.response
  const { platform } = await params
  if (!isSocialPlatform(platform)) return NextResponse.json({ error: 'unknown_platform' }, { status: 404 })

  const redirectUri = oauthRedirectUri(platform)
  const back = (query: Record<string, string>) => {
    const response = NextResponse.redirect(new URL(`/admin/social/accounts?${new URLSearchParams({ platform, ...query })}`, redirectUri))
    response.cookies.set(OAUTH_STATE_COOKIE, '', { path: '/admin/social', maxAge: 0 })
    response.headers.set('Cache-Control', 'no-store')
    return response
  }

  const search = request.nextUrl.searchParams
  const denied = search.get('error_description') ?? search.get('error')
  if (denied) return back({ error: denied.slice(0, 200) })
  const cookieStore = await cookies()
  if (!checkOAuthState(platform, cookieStore.get(OAUTH_STATE_COOKIE)?.value, search.get('state'))) return back({ error: 'state_mismatch' })
  const code = search.get('code')
  if (!code) return back({ error: 'no_code' })

  try {
    const account = await exchangeAuthorizationCode(platform, code, redirectUri)
    await saveConnectedAccount(platform, account)
    await writeAdminAudit(auth.ctx, { action: 'social.connect', targetType: 'social_platform', targetId: platform, metadata: { username: account.username } })
    return back({ connected: '1' })
  } catch (error) {
    return back({ error: error instanceof Error ? error.message.slice(0, 200) : 'exchange_failed' })
  }
}
