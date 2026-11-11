// Invite (referral) codes: 5 characters of lower-case letters and digits.
// Shared by the server and the contact-sync screen.

export const REFERRAL_CODE_LENGTH = 5
export const REFERRAL_REWARD_COINS = 1_000

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
export function fillReferralInviteMessage(template: string, input: { name: string; code: string; link: string }): string {
  return template
    .replaceAll('{name}', input.name)
    .replaceAll('{code}', input.code)
    .replaceAll('{coins}', REFERRAL_REWARD_COINS.toLocaleString('en-US'))
    .replaceAll('{link}', input.link)
    .trim()
}
