/**
 * Phone numbers for verification and contact matching, as E.164
 * ("+821012345678"). Contacts hold numbers in every local style ("010-1234-
 * 5678", "+82 10 1234 5678", "0082…"), so both sides reduce a number to E.164
 * the same way before it is hashed (sha256 hex) and compared. This is a small
 * rule set, not a full numbering plan: a national number drops its trunk "0"
 * and gets the country calling code of the user's own verified number.
 */

export type PhoneCountry = {
  /** ISO 3166-1 alpha-2, for display only. */
  iso: string
  /** Country calling code without "+". */
  callingCode: string
  /** Example national number, as people type it. */
  example: string
}

/** The countries the verification screen offers, roughly by how many users each has. */
export const PHONE_COUNTRIES: readonly PhoneCountry[] = [
  { iso: 'KR', callingCode: '82', example: '010 1234 5678' },
  { iso: 'JP', callingCode: '81', example: '090 1234 5678' },
  { iso: 'US', callingCode: '1', example: '201 555 0123' },
  { iso: 'CN', callingCode: '86', example: '131 2345 6789' },
  { iso: 'TW', callingCode: '886', example: '0912 345 678' },
  { iso: 'HK', callingCode: '852', example: '5123 4567' },
  { iso: 'VN', callingCode: '84', example: '091 234 56 78' },
  { iso: 'TH', callingCode: '66', example: '081 234 5678' },
  { iso: 'IN', callingCode: '91', example: '081234 56789' },
  { iso: 'GB', callingCode: '44', example: '07400 123456' },
  { iso: 'FR', callingCode: '33', example: '06 12 34 56 78' },
  { iso: 'DE', callingCode: '49', example: '01512 3456789' },
  { iso: 'ES', callingCode: '34', example: '612 34 56 78' },
  { iso: 'IT', callingCode: '39', example: '312 345 6789' },
  { iso: 'PT', callingCode: '351', example: '912 345 678' },
  { iso: 'BR', callingCode: '55', example: '11 96123 4567' },
  { iso: 'RU', callingCode: '7', example: '8 912 345 67 89' },
  { iso: 'SA', callingCode: '966', example: '051 234 5678' },
  { iso: 'AE', callingCode: '971', example: '050 123 4567' },
  { iso: 'CA', callingCode: '1', example: '506 234 5678' },
  { iso: 'AU', callingCode: '61', example: '0412 345 678' },
  { iso: 'SG', callingCode: '65', example: '8123 4567' },
  { iso: 'PH', callingCode: '63', example: '0905 123 4567' },
  { iso: 'ID', callingCode: '62', example: '0812 345 678' },
]

const UI_LOCALE_COUNTRY: Record<string, string> = {
  ko: 'KR', ja: 'JP', en: 'US', 'zh-cn': 'CN', 'zh-tw': 'TW', fr: 'FR', de: 'DE', es: 'ES',
  pt: 'BR', it: 'IT', ru: 'RU', ar: 'SA', hi: 'IN', th: 'TH', vi: 'VN',
}

/** The country preselected on the verification screen, from the app language. */
export function resolveDefaultPhoneCountry(uiLocale: string): PhoneCountry {
  const iso = UI_LOCALE_COUNTRY[uiLocale.trim().toLowerCase()] ?? UI_LOCALE_COUNTRY[uiLocale.trim().toLowerCase().split('-')[0]] ?? 'US'
  return PHONE_COUNTRIES.find((country) => country.iso === iso) ?? PHONE_COUNTRIES[0]
}

const E164 = /^\+[1-9]\d{7,14}$/

export function isE164(value: string): boolean {
  return E164.test(value)
}

/**
 * E.164 for a number as typed or stored in a contact, or null when it cannot
 * be one. `callingCode` is the country assumed for a number with no country
 * code (the user's own); without it only international forms are accepted.
 */
export function normalizePhoneNumber(raw: string, callingCode?: string | null): string | null {
  const trimmed = (raw ?? '').trim()
  if (!trimmed) return null
  const digits = trimmed.replace(/\D/g, '')
  if (!digits) return null
  let e164: string
  if (trimmed.startsWith('+')) {
    e164 = `+${digits}`
  } else if (digits.startsWith('00')) {
    e164 = `+${digits.slice(2)}`
  } else {
    const cc = (callingCode ?? '').replace(/\D/g, '')
    if (!cc) return null
    if (digits.startsWith(cc) && digits.length > cc.length + 7 && !digits.startsWith('0')) {
      // "821012345678": already has the country code, just no "+".
      e164 = `+${digits}`
    } else if (cc === '7' && digits.startsWith('8') && digits.length === 11) {
      // Russia's trunk prefix is 8.
      e164 = `+7${digits.slice(1)}`
    } else {
      e164 = `+${cc}${digits.replace(/^0+/, '')}`
    }
  }
  return isE164(e164) ? e164 : null
}

/** The calling code an E.164 number starts with, among the offered countries. */
export function callingCodeOfE164(e164: string): string | null {
  if (!isE164(e164)) return null
  const codes = [...new Set(PHONE_COUNTRIES.map((country) => country.callingCode))].sort((a, b) => b.length - a.length)
  return codes.find((code) => e164.startsWith(`+${code}`)) ?? null
}

/** "+82 10-••••-5678"-style text that shows which number without showing all of it. */
export function maskE164(e164: string): string {
  if (!isE164(e164)) return ''
  const code = callingCodeOfE164(e164)
  const national = code ? e164.slice(code.length + 1) : e164.slice(1)
  const tail = national.slice(-4)
  return `${code ? `+${code} ` : '+'}${'•'.repeat(Math.max(0, national.length - 4))}${tail}`
}

/** sha256 hex of an E.164 number, the same in the browser and on the server. */
export async function hashPhoneNumber(e164: string): Promise<string> {
  const bytes = new TextEncoder().encode(e164)
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

export const PHONE_HASH_PATTERN = /^[0-9a-f]{64}$/
