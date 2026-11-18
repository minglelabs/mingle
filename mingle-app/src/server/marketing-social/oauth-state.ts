import { randomBytes, timingSafeEqual } from 'node:crypto'
import type { SocialPlatform } from './types'

/** CSRF state for the OAuth round trip, kept in a short-lived httpOnly cookie under /admin/social. */
export const OAUTH_STATE_COOKIE = 'mingle_social_oauth_state'
export const OAUTH_STATE_MAX_AGE_S = 600

export function newOAuthState(platform: SocialPlatform): { state: string; cookieValue: string } {
  const state = randomBytes(24).toString('base64url')
  return { state, cookieValue: `${platform}.${state}` }
}

export function checkOAuthState(platform: SocialPlatform, cookieValue: string | undefined, returned: string | null): boolean {
  if (!cookieValue || !returned) return false
  const expected = Buffer.from(`${platform}.${returned}`)
  const actual = Buffer.from(cookieValue)
  return expected.length === actual.length && timingSafeEqual(expected, actual)
}
