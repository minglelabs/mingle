import {
  DEFAULT_LOCALE,
  resolveLegalDocumentLocale,
  resolveSupportedLocaleTag,
  type LegalDocumentLocale,
} from '@/i18n'

export type LivePhoneDemoCopyActionCopy = {
  copyBubbleLabel: string
  copyAllBubblesLabel: string
  copiedToastLabel: string
}

const COPY_ACTION_COPY_BY_LOCALE = {
  ko: {
    copyBubbleLabel: '복사',
    copyAllBubblesLabel: '전체 발화 복사',
    copiedToastLabel: '복사됨',
  },
  en: {
    copyBubbleLabel: 'Copy',
    copyAllBubblesLabel: 'Copy full message',
    copiedToastLabel: 'Copied',
  },
  ja: {
    copyBubbleLabel: 'コピー',
    copyAllBubblesLabel: '発話全体をコピー',
    copiedToastLabel: 'コピー済み',
  },
  'zh-CN': {
    copyBubbleLabel: '复制',
    copyAllBubblesLabel: '复制整条发言',
    copiedToastLabel: '已复制',
  },
  'zh-TW': {
    copyBubbleLabel: '複製',
    copyAllBubblesLabel: '複製整段發言',
    copiedToastLabel: '已複製',
  },
  fr: {
    copyBubbleLabel: 'Copier',
    copyAllBubblesLabel: 'Copier tout le message',
    copiedToastLabel: 'Copié',
  },
  de: {
    copyBubbleLabel: 'Kopieren',
    copyAllBubblesLabel: 'Gesamte Nachricht kopieren',
    copiedToastLabel: 'Kopiert',
  },
  es: {
    copyBubbleLabel: 'Copiar',
    copyAllBubblesLabel: 'Copiar mensaje completo',
    copiedToastLabel: 'Copiado',
  },
  pt: {
    copyBubbleLabel: 'Copiar',
    copyAllBubblesLabel: 'Copiar mensagem completa',
    copiedToastLabel: 'Copiado',
  },
  it: {
    copyBubbleLabel: 'Copia',
    copyAllBubblesLabel: 'Copia tutto il messaggio',
    copiedToastLabel: 'Copiato',
  },
  ru: {
    copyBubbleLabel: 'Копировать',
    copyAllBubblesLabel: 'Скопировать всё сообщение',
    copiedToastLabel: 'Скопировано',
  },
  ar: {
    copyBubbleLabel: 'نسخ',
    copyAllBubblesLabel: 'نسخ الرسالة كاملة',
    copiedToastLabel: 'تم النسخ',
  },
  hi: {
    copyBubbleLabel: 'कॉपी',
    copyAllBubblesLabel: 'पूरा संदेश कॉपी करें',
    copiedToastLabel: 'कॉपी हुआ',
  },
  th: {
    copyBubbleLabel: 'คัดลอก',
    copyAllBubblesLabel: 'คัดลอกข้อความทั้งหมด',
    copiedToastLabel: 'คัดลอกแล้ว',
  },
  vi: {
    copyBubbleLabel: 'Sao chép',
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
