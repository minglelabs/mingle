// Invite (referral) codes: 5 characters of lower-case letters and digits.
// Shared by the server and the contact-sync screen.

export const REFERRAL_CODE_LENGTH = 5
// Shown until the server's configured amount is known (COIN_INVITE_JOIN_COINS).
export const REFERRAL_REWARD_COINS = 1_000
export const INVITE_LINK_PATH_PREFIX = '/i/'
export const INVITE_APP_SCHEME_HOST = 'invite'
/** Key of the invite code inside the Play Store install referrer string. */
export const INVITE_INSTALL_REFERRER_KEY = 'invite'

export type InviteSource = 'link' | 'install_referrer' | 'code'

export function normalizeInviteSource(raw: unknown): InviteSource {
  return raw === 'link' || raw === 'install_referrer' ? raw : 'code'
}

/** https://host/i/{code}: the invite ticket link. */
export function buildInviteLinkUrl(baseUrl: string, code: string): string | null {
  const normalized = normalizeReferralCode(code)
  if (!normalized) return null
  try {
    return new URL(`${INVITE_LINK_PATH_PREFIX}${normalized}`, baseUrl).toString()
  } catch {
    return null
  }
}

/** mingle://invite/{code}: opens the installed app on the same invite. */
export function buildInviteAppUrl(code: string): string | null {
  const normalized = normalizeReferralCode(code)
  return normalized ? `mingle://${INVITE_APP_SCHEME_HOST}/${normalized}` : null
}

/** The Play Store URL that carries the invite code through the install. */
export function buildPlayStoreInviteUrl(playStoreUrl: string, code: string): string {
  const normalized = normalizeReferralCode(code)
  if (!normalized) return playStoreUrl
  try {
    const url = new URL(playStoreUrl)
    url.searchParams.set('referrer', `${INVITE_INSTALL_REFERRER_KEY}=${normalized}`)
    return url.toString()
  } catch {
    return playStoreUrl
  }
}

// New codes skip the look-alikes (0/o, 1/l/i) so a code read off a text
// message is typed right the first time. Any [a-z0-9] code is still accepted.
const REFERRAL_CODE_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789'
const REFERRAL_CODE_PATTERN = /^[a-z0-9]{5}$/

/** Trims, lower-cases and validates what a person typed. null = not a code. */
export function normalizeReferralCode(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const code = raw.trim().toLowerCase()
  return REFERRAL_CODE_PATTERN.test(code) ? code : null
}

export function generateReferralCode(random: () => number = Math.random): string {
  let code = ''
  for (let index = 0; index < REFERRAL_CODE_LENGTH; index += 1) {
    code += REFERRAL_CODE_ALPHABET[Math.floor(random() * REFERRAL_CODE_ALPHABET.length) % REFERRAL_CODE_ALPHABET.length]
  }
  return code
}

/** The text message written for a contact: who invites, the code, the link. */
export function fillReferralInviteMessage(
  template: string,
  input: { name: string; code: string; link: string; coins?: number },
): string {
  return template
    .replaceAll('{name}', input.name)
    .replaceAll('{code}', input.code)
    .replaceAll('{coins}', (input.coins ?? REFERRAL_REWARD_COINS).toLocaleString('en-US'))
    .replaceAll('{link}', input.link)
    .trim()
}
