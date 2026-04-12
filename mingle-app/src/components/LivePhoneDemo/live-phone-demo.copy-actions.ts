import {
  DEFAULT_LOCALE,
  resolveLegalDocumentLocale,
  resolveSupportedLocaleTag,
  type LegalDocumentLocale,
} from '@/i18n/config'

export type LivePhoneDemoCopyActionCopy = {
  copyBubbleLabel: string
  copyAllBubblesLabel: string
  copiedToastLabel: string
}

const COPY_ACTION_COPY_BY_LOCALE = {
  ko: {
    copyBubbleLabel: '복사',
    copyAllBubblesLabel: '전체 복사',
    copiedToastLabel: '복사됨',
  },
  en: {
    copyBubbleLabel: 'Copy',
    copyAllBubblesLabel: 'Copy All',
    copiedToastLabel: 'Copied',
  },
  ja: {
    copyBubbleLabel: 'コピー',
    copyAllBubblesLabel: 'すべてコピー',
    copiedToastLabel: 'コピー済み',
  },
  'zh-CN': {
    copyBubbleLabel: '复制',
    copyAllBubblesLabel: '全部复制',
    copiedToastLabel: '已复制',
  },
  'zh-TW': {
    copyBubbleLabel: '複製',
    copyAllBubblesLabel: '全部複製',
    copiedToastLabel: '已複製',
  },
  fr: {
    copyBubbleLabel: 'Copier',
    copyAllBubblesLabel: 'Tout copier',
    copiedToastLabel: 'Copié',
  },
  de: {
    copyBubbleLabel: 'Kopieren',
    copyAllBubblesLabel: 'Alles kopieren',
    copiedToastLabel: 'Kopiert',
  },
  es: {
    copyBubbleLabel: 'Copiar',
    copyAllBubblesLabel: 'Copiar todo',
    copiedToastLabel: 'Copiado',
  },
  pt: {
    copyBubbleLabel: 'Copiar',
    copyAllBubblesLabel: 'Copiar tudo',
    copiedToastLabel: 'Copiado',
  },
  it: {
    copyBubbleLabel: 'Copia',
    copyAllBubblesLabel: 'Copia tutto',
    copiedToastLabel: 'Copiato',
  },
  ru: {
    copyBubbleLabel: 'Копировать',
    copyAllBubblesLabel: 'Копировать всё',
    copiedToastLabel: 'Скопировано',
  },
  ar: {
    copyBubbleLabel: 'نسخ',
    copyAllBubblesLabel: 'نسخ الكل',
    copiedToastLabel: 'تم النسخ',
  },
  hi: {
    copyBubbleLabel: 'कॉपी',
    copyAllBubblesLabel: 'सब कॉपी करें',
    copiedToastLabel: 'कॉपी हुआ',
  },
  th: {
    copyBubbleLabel: 'คัดลอก',
    copyAllBubblesLabel: 'คัดลอกทั้งหมด',
    copiedToastLabel: 'คัดลอกแล้ว',
  },
  vi: {
    copyBubbleLabel: 'Sao chép',
    copyAllBubblesLabel: 'Sao chép tất cả',
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
