import { resolveLegalDocumentLocale, resolveSupportedLocaleTag, type LegalDocumentLocale } from './config'

/** The line a room draws on entry between the messages already read and the first unread one. */
const copy: Record<LegalDocumentLocale, string> = {
  ko: '여기까지 읽었습니다',
  en: 'You read up to here',
  ja: 'ここまで読みました',
  'zh-CN': '已读到这里',
  'zh-TW': '已讀到這裡',
  fr: 'Vous avez lu jusqu’ici',
  de: 'Bis hierhin gelesen',
  es: 'Leído hasta aquí',
  pt: 'Você leu até aqui',
  it: 'Hai letto fin qui',
  ru: 'Прочитано до этого места',
  ar: 'قرأت حتى هنا',
  hi: 'यहाँ तक पढ़ लिया',
  th: 'อ่านถึงตรงนี้แล้ว',
  vi: 'Bạn đã đọc đến đây',
}

export function unreadDividerLabel(locale: string): string {
  return copy[resolveLegalDocumentLocale(resolveSupportedLocaleTag(locale) || 'en')]
}
