import { afterEach, describe, expect, it, vi } from 'vitest'
import { oauthRedirectUri } from './config'
import { buildAuthorizeUrl, needsRefresh } from './oauth'
import { checkOAuthState, newOAuthState } from './oauth-state'

describe('oauth', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('builds each consent URL with the registered redirect and state', () => {
    vi.stubEnv('INSTAGRAM_APP_ID', 'ig-id')
    vi.stubEnv('INSTAGRAM_APP_SECRET', 'ig-secret')
    vi.stubEnv('YOUTUBE_OAUTH_CLIENT_ID', 'g-id')
    vi.stubEnv('YOUTUBE_OAUTH_CLIENT_SECRET', 'g-secret')
    vi.stubEnv('TIKTOK_CLIENT_KEY', 'tt-key')
    vi.stubEnv('TIKTOK_CLIENT_SECRET', 'tt-secret')
    vi.stubEnv('MARKETING_SOCIAL_PUBLIC_ORIGIN', 'https://app.example.com/some/path')

    const redirect = oauthRedirectUri('instagram')
    expect(redirect).toBe('https://app.example.com/admin/social/api/oauth/instagram/callback')

    const ig = new URL(buildAuthorizeUrl('instagram', redirect, 'st'))
    expect(ig.origin).toBe('https://www.instagram.com')
    expect(ig.searchParams.get('scope')).toContain('instagram_business_content_publish')
    expect(ig.searchParams.get('state')).toBe('st')
    expect(ig.toString()).not.toContain('ig-secret')

    const yt = new URL(buildAuthorizeUrl('youtube', oauthRedirectUri('youtube'), 'st'))
    expect(yt.searchParams.get('access_type')).toBe('offline')
    expect(yt.searchParams.get('prompt')).toBe('consent')

    const tt = new URL(buildAuthorizeUrl('tiktok', oauthRedirectUri('tiktok'), 'st'))
    expect(tt.searchParams.get('client_key')).toBe('tt-key')
    expect(tt.searchParams.get('scope')).toContain('video.publish')
  })

  it('refuses to build a URL without app credentials', () => {
    vi.stubEnv('THREADS_APP_ID', '')
    expect(() => buildAuthorizeUrl('threads', 'https://x/cb', 's')).toThrow('not_configured')
  })

  it('refreshes Meta tokens a week early and short tokens 5 minutes early', () => {
    const now = new Date('2026-11-18T00:00:00Z')
    const inDays = (d: number) => new Date(now.getTime() + d * 86400_000)
    expect(needsRefresh('instagram', inDays(10), now)).toBe(false)
    expect(needsRefresh('threads', inDays(6), now)).toBe(true)
    expect(needsRefresh('youtube', new Date(now.getTime() + 10 * 60_000), now)).toBe(false)
    expect(needsRefresh('tiktok', new Date(now.getTime() + 60_000), now)).toBe(true)
    expect(needsRefresh('youtube', null, now)).toBe(false)
  })

  it('checks the OAuth state against its cookie, per platform', () => {
    const { state, cookieValue } = newOAuthState('tiktok')
    expect(checkOAuthState('tiktok', cookieValue, state)).toBe(true)
    expect(checkOAuthState('youtube', cookieValue, state)).toBe(false)
    expect(checkOAuthState('tiktok', cookieValue, 'forged')).toBe(false)
    expect(checkOAuthState('tiktok', undefined, state)).toBe(false)
  })
})
