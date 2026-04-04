import {
  DEFAULT_LOCALE,
  resolveLegalDocumentLocale,
  resolveSupportedLocaleTag,
  type LegalDocumentLocale,
} from '@/i18n'

export type LivePhoneDemoCopyActionCopy = {
  copyAllBubblesLabel: string
  copiedToastLabel: string
}

const COPY_ACTION_COPY_BY_LOCALE = {
  ko: {
    copyAllBubblesLabel: '전체 발화 복사',
    copiedToastLabel: '복사됨',
  },
  en: {
    copyAllBubblesLabel: 'Copy full message',
    copiedToastLabel: 'Copied',
  },
  ja: {
    copyAllBubblesLabel: '発話全体をコピー',
    copiedToastLabel: 'コピーしました',
  },
  'zh-CN': {
    copyAllBubblesLabel: '复制整条发言',
    copiedToastLabel: '已复制',
  },
  'zh-TW': {
    copyAllBubblesLabel: '複製整段發言',
    copiedToastLabel: '已複製',
  },
  fr: {
    copyAllBubblesLabel: 'Copier tout le message',
    copiedToastLabel: 'Copie effectuée',
  },
  de: {
    copyAllBubblesLabel: 'Gesamte Nachricht kopieren',
    copiedToastLabel: 'Kopiert',
  },
  es: {
    copyAllBubblesLabel: 'Copiar mensaje completo',
    copiedToastLabel: 'Copiado',
  },
  pt: {
    copyAllBubblesLabel: 'Copiar mensagem completa',
    copiedToastLabel: 'Copiado',
  },
  it: {
    copyAllBubblesLabel: 'Copia tutto il messaggio',
    copiedToastLabel: 'Copiato',
  },
  ru: {
    copyAllBubblesLabel: 'Скопировать всё сообщение',
    copiedToastLabel: 'Скопировано',
  },
  ar: {
    copyAllBubblesLabel: 'نسخ الرسالة كاملة',
    copiedToastLabel: 'تم النسخ',
  },
  hi: {
    copyAllBubblesLabel: 'पूरा संदेश कॉपी करें',
    copiedToastLabel: 'कॉपी हो गया',
  },
  th: {
    copyAllBubblesLabel: 'คัดลอกข้อความทั้งหมด',
    copiedToastLabel: 'คัดลอกแล้ว',
  },
  vi: {
    copyAllBubblesLabel: 'Sao chép toàn bộ câu',
    copiedToastLabel: 'Đã sao chép',
  },
} satisfies Record<LegalDocumentLocale, LivePhoneDemoCopyActionCopy>

export function resolveLivePhoneDemoCopyActionCopy(
  uiLocale: string,
): LivePhoneDemoCopyActionCopy {
  const supportedLocale = resolveSupportedLocaleTag(uiLocale) ?? DEFAULT_LOCALE
  const resolvedLocale = resolveLegalDocumentLocale(supportedLocale)

  return COPY_ACTION_COPY_BY_LOCALE[resolvedLocale] ?? COPY_ACTION_COPY_BY_LOCALE.en
}
