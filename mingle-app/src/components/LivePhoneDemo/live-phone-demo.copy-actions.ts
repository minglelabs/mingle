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
  playingIndicatorLabel: string
  originalLanguageLabel: string
  translationLanguageLabel: string
}

const COPY_ACTION_COPY_BY_LOCALE = {
  ko: {
    copyBubbleLabel: '복사',
    copyAllBubblesLabel: '전체 복사',
    copiedToastLabel: '복사됨',
    playingIndicatorLabel: '재생 중',
    originalLanguageLabel: '원문 언어',
    translationLanguageLabel: '번역 언어',
  },
  en: {
    copyBubbleLabel: 'Copy',
    copyAllBubblesLabel: 'Copy All',
    copiedToastLabel: 'Copied',
    playingIndicatorLabel: 'Playing',
    originalLanguageLabel: 'Original language',
    translationLanguageLabel: 'Translation language',
  },
  ja: {
    copyBubbleLabel: 'コピー',
    copyAllBubblesLabel: 'すべてコピー',
    copiedToastLabel: 'コピー済み',
    playingIndicatorLabel: '再生中',
    originalLanguageLabel: '原文の言語',
    translationLanguageLabel: '翻訳の言語',
  },
  'zh-CN': {
    copyBubbleLabel: '复制',
    copyAllBubblesLabel: '全部复制',
    copiedToastLabel: '已复制',
    playingIndicatorLabel: '播放中',
    originalLanguageLabel: '原文语言',
    translationLanguageLabel: '翻译语言',
  },
  'zh-TW': {
    copyBubbleLabel: '複製',
    copyAllBubblesLabel: '全部複製',
    copiedToastLabel: '已複製',
    playingIndicatorLabel: '播放中',
    originalLanguageLabel: '原文語言',
    translationLanguageLabel: '翻譯語言',
  },
  fr: {
    copyBubbleLabel: 'Copier',
    copyAllBubblesLabel: 'Tout copier',
    copiedToastLabel: 'Copié',
    playingIndicatorLabel: 'Lecture en cours',
    originalLanguageLabel: 'Langue d’origine',
    translationLanguageLabel: 'Langue de traduction',
  },
  de: {
    copyBubbleLabel: 'Kopieren',
    copyAllBubblesLabel: 'Alles kopieren',
    copiedToastLabel: 'Kopiert',
    playingIndicatorLabel: 'Wird abgespielt',
    originalLanguageLabel: 'Originalsprache',
    translationLanguageLabel: 'Übersetzungssprache',
  },
  es: {
    copyBubbleLabel: 'Copiar',
    copyAllBubblesLabel: 'Copiar todo',
    copiedToastLabel: 'Copiado',
    playingIndicatorLabel: 'Reproduciendo',
    originalLanguageLabel: 'Idioma original',
    translationLanguageLabel: 'Idioma de traducción',
  },
  pt: {
    copyBubbleLabel: 'Copiar',
    copyAllBubblesLabel: 'Copiar tudo',
    copiedToastLabel: 'Copiado',
    playingIndicatorLabel: 'Reproduzindo',
    originalLanguageLabel: 'Idioma original',
    translationLanguageLabel: 'Idioma da tradução',
  },
  it: {
    copyBubbleLabel: 'Copia',
    copyAllBubblesLabel: 'Copia tutto',
    copiedToastLabel: 'Copiato',
    playingIndicatorLabel: 'In riproduzione',
    originalLanguageLabel: 'Lingua originale',
    translationLanguageLabel: 'Lingua di traduzione',
  },
  ru: {
    copyBubbleLabel: 'Копировать',
    copyAllBubblesLabel: 'Копировать всё',
    copiedToastLabel: 'Скопировано',
    playingIndicatorLabel: 'Воспроизведение',
    originalLanguageLabel: 'Язык оригинала',
    translationLanguageLabel: 'Язык перевода',
  },
  ar: {
    copyBubbleLabel: 'نسخ',
    copyAllBubblesLabel: 'نسخ الكل',
    copiedToastLabel: 'تم النسخ',
    playingIndicatorLabel: 'قيد التشغيل',
    originalLanguageLabel: 'اللغة الأصلية',
    translationLanguageLabel: 'لغة الترجمة',
  },
  hi: {
    copyBubbleLabel: 'कॉपी',
    copyAllBubblesLabel: 'सब कॉपी करें',
    copiedToastLabel: 'कॉपी हुआ',
    playingIndicatorLabel: 'चल रहा है',
    originalLanguageLabel: 'मूल भाषा',
    translationLanguageLabel: 'अनुवाद की भाषा',
  },
  th: {
    copyBubbleLabel: 'คัดลอก',
    copyAllBubblesLabel: 'คัดลอกทั้งหมด',
    copiedToastLabel: 'คัดลอกแล้ว',
    playingIndicatorLabel: 'กำลังเล่น',
    originalLanguageLabel: 'ภาษาต้นฉบับ',
    translationLanguageLabel: 'ภาษาที่แปล',
  },
  vi: {
    copyBubbleLabel: 'Sao chép',
    copyAllBubblesLabel: 'Sao chép tất cả',
    copiedToastLabel: 'Đã sao chép',
    playingIndicatorLabel: 'Đang phát',
    originalLanguageLabel: 'Ngôn ngữ gốc',
    translationLanguageLabel: 'Ngôn ngữ dịch',
  },
} satisfies Record<LegalDocumentLocale, LivePhoneDemoCopyActionCopy>

export function resolveLivePhoneDemoCopyActionCopy(
  uiLocale: string,
): LivePhoneDemoCopyActionCopy {
  const supportedLocale = resolveSupportedLocaleTag(uiLocale) ?? DEFAULT_LOCALE
  const resolvedLocale = resolveLegalDocumentLocale(supportedLocale)

  return COPY_ACTION_COPY_BY_LOCALE[resolvedLocale] ?? COPY_ACTION_COPY_BY_LOCALE.en
}
