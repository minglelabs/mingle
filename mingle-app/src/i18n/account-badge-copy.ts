import { resolveLegalDocumentLocale, resolveSupportedLocaleTag, type LegalDocumentLocale } from './config'

/**
 * Label of the badge shown next to an operator / official account's name
 * (`<OfficialBadge>`), so content posted by the Mingle team is clearly marked
 * (spec item 84). 15 primary UI languages, same pattern as `report-copy.ts`.
 */
export type AccountBadgeCopy = {
  official: string
  /** Screen-reader description read after the name. */
  officialDescription: string
}

const copy: Record<LegalDocumentLocale, AccountBadgeCopy> = {
  ko: { official: '공식', officialDescription: 'Mingle 운영 계정' },
  en: { official: 'Official', officialDescription: 'Mingle team account' },
  ja: { official: '公式', officialDescription: 'Mingle運営アカウント' },
  'zh-CN': { official: '官方', officialDescription: 'Mingle 官方账号' },
  'zh-TW': { official: '官方', officialDescription: 'Mingle 官方帳號' },
  fr: { official: 'Officiel', officialDescription: 'Compte de l’équipe Mingle' },
  de: { official: 'Offiziell', officialDescription: 'Konto des Mingle-Teams' },
  es: { official: 'Oficial', officialDescription: 'Cuenta del equipo de Mingle' },
  pt: { official: 'Oficial', officialDescription: 'Conta da equipe Mingle' },
  it: { official: 'Ufficiale', officialDescription: 'Account del team Mingle' },
  ru: { official: 'Официально', officialDescription: 'Аккаунт команды Mingle' },
  ar: { official: 'رسمي', officialDescription: 'حساب فريق Mingle' },
  hi: { official: 'आधिकारिक', officialDescription: 'Mingle टीम खाता' },
  th: { official: 'ทางการ', officialDescription: 'บัญชีทีม Mingle' },
  vi: { official: 'Chính thức', officialDescription: 'Tài khoản đội ngũ Mingle' },
}

export function accountBadgeCopy(locale: string): AccountBadgeCopy {
  return copy[resolveLegalDocumentLocale(resolveSupportedLocaleTag(locale) || 'en')]
}
