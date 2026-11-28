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
  /** Example national number, as people type it ("" when none is known). */
  example: string
}

/** The countries the verification screen offers: the most used first, then every other one. */
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
  // Every other country, A to Z, so anyone anywhere can verify once an
  // international SMS provider is set up (no example number for these).
  { iso: 'AF', callingCode: '93', example: '' },
  { iso: 'AL', callingCode: '355', example: '' },
  { iso: 'DZ', callingCode: '213', example: '' },
  { iso: 'AS', callingCode: '1', example: '' },
  { iso: 'AD', callingCode: '376', example: '' },
  { iso: 'AO', callingCode: '244', example: '' },
  { iso: 'AI', callingCode: '1', example: '' },
  { iso: 'AG', callingCode: '1', example: '' },
  { iso: 'AR', callingCode: '54', example: '' },
  { iso: 'AM', callingCode: '374', example: '' },
  { iso: 'AW', callingCode: '297', example: '' },
  { iso: 'AT', callingCode: '43', example: '' },
  { iso: 'AZ', callingCode: '994', example: '' },
  { iso: 'BS', callingCode: '1', example: '' },
  { iso: 'BH', callingCode: '973', example: '' },
  { iso: 'BD', callingCode: '880', example: '' },
  { iso: 'BB', callingCode: '1', example: '' },
  { iso: 'BY', callingCode: '375', example: '' },
  { iso: 'BE', callingCode: '32', example: '' },
  { iso: 'BZ', callingCode: '501', example: '' },
  { iso: 'BJ', callingCode: '229', example: '' },
  { iso: 'BM', callingCode: '1', example: '' },
  { iso: 'BT', callingCode: '975', example: '' },
  { iso: 'BO', callingCode: '591', example: '' },
  { iso: 'BA', callingCode: '387', example: '' },
  { iso: 'BW', callingCode: '267', example: '' },
  { iso: 'BN', callingCode: '673', example: '' },
  { iso: 'BG', callingCode: '359', example: '' },
  { iso: 'BF', callingCode: '226', example: '' },
  { iso: 'BI', callingCode: '257', example: '' },
  { iso: 'KH', callingCode: '855', example: '' },
  { iso: 'CM', callingCode: '237', example: '' },
  { iso: 'CV', callingCode: '238', example: '' },
  { iso: 'KY', callingCode: '1', example: '' },
  { iso: 'CF', callingCode: '236', example: '' },
  { iso: 'TD', callingCode: '235', example: '' },
  { iso: 'CL', callingCode: '56', example: '' },
  { iso: 'CO', callingCode: '57', example: '' },
  { iso: 'KM', callingCode: '269', example: '' },
  { iso: 'CG', callingCode: '242', example: '' },
  { iso: 'CD', callingCode: '243', example: '' },
  { iso: 'CK', callingCode: '682', example: '' },
  { iso: 'CR', callingCode: '506', example: '' },
  { iso: 'CI', callingCode: '225', example: '' },
  { iso: 'HR', callingCode: '385', example: '' },
  { iso: 'CU', callingCode: '53', example: '' },
  { iso: 'CW', callingCode: '599', example: '' },
  { iso: 'CY', callingCode: '357', example: '' },
  { iso: 'CZ', callingCode: '420', example: '' },
  { iso: 'DK', callingCode: '45', example: '' },
  { iso: 'DJ', callingCode: '253', example: '' },
  { iso: 'DM', callingCode: '1', example: '' },
  { iso: 'DO', callingCode: '1', example: '' },
  { iso: 'EC', callingCode: '593', example: '' },
  { iso: 'EG', callingCode: '20', example: '' },
  { iso: 'SV', callingCode: '503', example: '' },
  { iso: 'GQ', callingCode: '240', example: '' },
  { iso: 'ER', callingCode: '291', example: '' },
  { iso: 'EE', callingCode: '372', example: '' },
  { iso: 'SZ', callingCode: '268', example: '' },
  { iso: 'ET', callingCode: '251', example: '' },
  { iso: 'FO', callingCode: '298', example: '' },
  { iso: 'FJ', callingCode: '679', example: '' },
  { iso: 'FI', callingCode: '358', example: '' },
  { iso: 'GF', callingCode: '594', example: '' },
  { iso: 'PF', callingCode: '689', example: '' },
  { iso: 'GA', callingCode: '241', example: '' },
  { iso: 'GM', callingCode: '220', example: '' },
  { iso: 'GE', callingCode: '995', example: '' },
  { iso: 'GH', callingCode: '233', example: '' },
  { iso: 'GI', callingCode: '350', example: '' },
  { iso: 'GR', callingCode: '30', example: '' },
  { iso: 'GL', callingCode: '299', example: '' },
  { iso: 'GD', callingCode: '1', example: '' },
  { iso: 'GP', callingCode: '590', example: '' },
  { iso: 'GU', callingCode: '1', example: '' },
  { iso: 'GT', callingCode: '502', example: '' },
  { iso: 'GN', callingCode: '224', example: '' },
  { iso: 'GW', callingCode: '245', example: '' },
  { iso: 'GY', callingCode: '592', example: '' },
  { iso: 'HT', callingCode: '509', example: '' },
  { iso: 'HN', callingCode: '504', example: '' },
  { iso: 'HU', callingCode: '36', example: '' },
  { iso: 'IS', callingCode: '354', example: '' },
  { iso: 'IR', callingCode: '98', example: '' },
  { iso: 'IQ', callingCode: '964', example: '' },
  { iso: 'IE', callingCode: '353', example: '' },
  { iso: 'IL', callingCode: '972', example: '' },
  { iso: 'JM', callingCode: '1', example: '' },
  { iso: 'JO', callingCode: '962', example: '' },
  { iso: 'KZ', callingCode: '7', example: '' },
  { iso: 'KE', callingCode: '254', example: '' },
  { iso: 'KI', callingCode: '686', example: '' },
  { iso: 'KW', callingCode: '965', example: '' },
  { iso: 'KG', callingCode: '996', example: '' },
  { iso: 'LA', callingCode: '856', example: '' },
  { iso: 'LV', callingCode: '371', example: '' },
  { iso: 'LB', callingCode: '961', example: '' },
  { iso: 'LS', callingCode: '266', example: '' },
  { iso: 'LR', callingCode: '231', example: '' },
  { iso: 'LY', callingCode: '218', example: '' },
  { iso: 'LI', callingCode: '423', example: '' },
  { iso: 'LT', callingCode: '370', example: '' },
  { iso: 'LU', callingCode: '352', example: '' },
  { iso: 'MO', callingCode: '853', example: '' },
  { iso: 'MG', callingCode: '261', example: '' },
  { iso: 'MW', callingCode: '265', example: '' },
  { iso: 'MY', callingCode: '60', example: '' },
  { iso: 'MV', callingCode: '960', example: '' },
  { iso: 'ML', callingCode: '223', example: '' },
  { iso: 'MT', callingCode: '356', example: '' },
  { iso: 'MH', callingCode: '692', example: '' },
  { iso: 'MQ', callingCode: '596', example: '' },
  { iso: 'MR', callingCode: '222', example: '' },
  { iso: 'MU', callingCode: '230', example: '' },
  { iso: 'MX', callingCode: '52', example: '' },
  { iso: 'FM', callingCode: '691', example: '' },
  { iso: 'MD', callingCode: '373', example: '' },
  { iso: 'MC', callingCode: '377', example: '' },
  { iso: 'MN', callingCode: '976', example: '' },
  { iso: 'ME', callingCode: '382', example: '' },
  { iso: 'MS', callingCode: '1', example: '' },
  { iso: 'MA', callingCode: '212', example: '' },
  { iso: 'MZ', callingCode: '258', example: '' },
  { iso: 'MM', callingCode: '95', example: '' },
  { iso: 'NA', callingCode: '264', example: '' },
  { iso: 'NR', callingCode: '674', example: '' },
  { iso: 'NP', callingCode: '977', example: '' },
  { iso: 'NL', callingCode: '31', example: '' },
  { iso: 'NC', callingCode: '687', example: '' },
  { iso: 'NZ', callingCode: '64', example: '' },
  { iso: 'NI', callingCode: '505', example: '' },
  { iso: 'NE', callingCode: '227', example: '' },
  { iso: 'NG', callingCode: '234', example: '' },
  { iso: 'MK', callingCode: '389', example: '' },
  { iso: 'MP', callingCode: '1', example: '' },
  { iso: 'NO', callingCode: '47', example: '' },
  { iso: 'OM', callingCode: '968', example: '' },
  { iso: 'PK', callingCode: '92', example: '' },
  { iso: 'PW', callingCode: '680', example: '' },
  { iso: 'PS', callingCode: '970', example: '' },
  { iso: 'PA', callingCode: '507', example: '' },
  { iso: 'PG', callingCode: '675', example: '' },
  { iso: 'PY', callingCode: '595', example: '' },
  { iso: 'PE', callingCode: '51', example: '' },
  { iso: 'PL', callingCode: '48', example: '' },
  { iso: 'PR', callingCode: '1', example: '' },
  { iso: 'QA', callingCode: '974', example: '' },
  { iso: 'RE', callingCode: '262', example: '' },
  { iso: 'RO', callingCode: '40', example: '' },
  { iso: 'RW', callingCode: '250', example: '' },
  { iso: 'KN', callingCode: '1', example: '' },
  { iso: 'LC', callingCode: '1', example: '' },
  { iso: 'VC', callingCode: '1', example: '' },
  { iso: 'WS', callingCode: '685', example: '' },
  { iso: 'SM', callingCode: '378', example: '' },
  { iso: 'ST', callingCode: '239', example: '' },
  { iso: 'SN', callingCode: '221', example: '' },
  { iso: 'RS', callingCode: '381', example: '' },
  { iso: 'SC', callingCode: '248', example: '' },
  { iso: 'SL', callingCode: '232', example: '' },
  { iso: 'SX', callingCode: '1', example: '' },
  { iso: 'SK', callingCode: '421', example: '' },
  { iso: 'SI', callingCode: '386', example: '' },
  { iso: 'SB', callingCode: '677', example: '' },
  { iso: 'SO', callingCode: '252', example: '' },
  { iso: 'ZA', callingCode: '27', example: '' },
  { iso: 'SS', callingCode: '211', example: '' },
  { iso: 'LK', callingCode: '94', example: '' },
  { iso: 'SD', callingCode: '249', example: '' },
  { iso: 'SR', callingCode: '597', example: '' },
  { iso: 'SE', callingCode: '46', example: '' },
  { iso: 'CH', callingCode: '41', example: '' },
  { iso: 'SY', callingCode: '963', example: '' },
  { iso: 'TJ', callingCode: '992', example: '' },
  { iso: 'TZ', callingCode: '255', example: '' },
  { iso: 'TL', callingCode: '670', example: '' },
  { iso: 'TG', callingCode: '228', example: '' },
  { iso: 'TO', callingCode: '676', example: '' },
  { iso: 'TT', callingCode: '1', example: '' },
  { iso: 'TN', callingCode: '216', example: '' },
  { iso: 'TR', callingCode: '90', example: '' },
  { iso: 'TM', callingCode: '993', example: '' },
  { iso: 'TC', callingCode: '1', example: '' },
  { iso: 'TV', callingCode: '688', example: '' },
  { iso: 'UG', callingCode: '256', example: '' },
  { iso: 'UA', callingCode: '380', example: '' },
  { iso: 'UY', callingCode: '598', example: '' },
  { iso: 'UZ', callingCode: '998', example: '' },
  { iso: 'VU', callingCode: '678', example: '' },
  { iso: 'VE', callingCode: '58', example: '' },
  { iso: 'VG', callingCode: '1', example: '' },
  { iso: 'VI', callingCode: '1', example: '' },
  { iso: 'YE', callingCode: '967', example: '' },
  { iso: 'ZM', callingCode: '260', example: '' },
  { iso: 'ZW', callingCode: '263', example: '' },
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
