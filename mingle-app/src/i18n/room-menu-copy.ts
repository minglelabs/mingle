import { resolveLegalDocumentLocale, resolveSupportedLocaleTag, type LegalDocumentLocale } from '@/i18n/config'

// The room menu's one row that opens the interpreting and voice settings
// (display language, earphone and microphone, text size, sentence length,
// bubble style), in the 15 primary UI languages.
const VOICE_SETTINGS_LABEL: Record<LegalDocumentLocale, string> = {
  ko: '통역·음성 설정',
  en: 'Interpreting & voice settings',
  ja: '通訳・音声の設定',
  'zh-CN': '口译与语音设置',
  'zh-TW': '口譯與語音設定',
  fr: 'Interprétation et voix',
  de: 'Dolmetschen & Stimme',
  es: 'Interpretación y voz',
  pt: 'Interpretação e voz',
  it: 'Interpretazione e voce',
  ru: 'Перевод и голос',
  ar: 'إعدادات الترجمة والصوت',
  hi: 'इंटरप्रिटेशन और आवाज़ की सेटिंग',
  th: 'ตั้งค่าล่ามและเสียง',
  vi: 'Cài đặt phiên dịch và giọng nói',
}

export function roomMenuVoiceSettingsLabel(locale: string): string {
  return VOICE_SETTINGS_LABEL[resolveLegalDocumentLocale(resolveSupportedLocaleTag(locale) || 'en')] ?? VOICE_SETTINGS_LABEL.en
}
