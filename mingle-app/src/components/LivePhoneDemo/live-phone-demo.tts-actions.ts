import {
  DEFAULT_LOCALE,
  resolveLegalDocumentLocale,
  resolveSupportedLocaleTag,
  type LegalDocumentLocale,
} from '@/i18n'

export type LivePhoneDemoTtsActionCopy = {
  playPronunciationLabel: string
  playbackFailedLabel: string
}

const TTS_ACTION_COPY_BY_LOCALE = {
  ko: {
    playPronunciationLabel: '발음 듣기',
    playbackFailedLabel: '이 발화의 오디오를 재생하지 못했습니다.',
  },
  en: {
    playPronunciationLabel: 'Listen to pronunciation',
    playbackFailedLabel: 'Failed to play audio for this message.',
  },
  ja: {
    playPronunciationLabel: '発音を聞く',
    playbackFailedLabel: 'この発話の音声を再生できませんでした。',
  },
  'zh-CN': {
    playPronunciationLabel: '收听发音',
    playbackFailedLabel: '无法播放这条发言的音频。',
  },
  'zh-TW': {
    playPronunciationLabel: '聽發音',
    playbackFailedLabel: '無法播放這則發言的音訊。',
  },
  fr: {
    playPronunciationLabel: 'Écouter la prononciation',
    playbackFailedLabel: 'Impossible de lire l’audio de ce message.',
  },
  de: {
    playPronunciationLabel: 'Aussprache anhören',
    playbackFailedLabel: 'Audio fur diese Nachricht konnte nicht abgespielt werden.',
  },
  es: {
    playPronunciationLabel: 'Escuchar pronunciación',
    playbackFailedLabel: 'No se pudo reproducir el audio de este mensaje.',
  },
  pt: {
    playPronunciationLabel: 'Ouvir pronúncia',
    playbackFailedLabel: 'Nao foi possivel reproduzir o audio desta mensagem.',
  },
  it: {
    playPronunciationLabel: 'Ascolta pronuncia',
    playbackFailedLabel: 'Impossibile riprodurre l’audio di questo messaggio.',
  },
  ru: {
    playPronunciationLabel: 'Слушать произношение',
    playbackFailedLabel: 'Не удалось воспроизвести аудио для этого сообщения.',
  },
  ar: {
    playPronunciationLabel: 'الاستماع إلى النطق',
    playbackFailedLabel: 'تعذر تشغيل الصوت لهذه الرسالة.',
  },
  hi: {
    playPronunciationLabel: 'उच्चारण सुनें',
    playbackFailedLabel: 'इस संदेश का ऑडियो नहीं चलाया जा सका।',
  },
  th: {
    playPronunciationLabel: 'ฟังการออกเสียง',
    playbackFailedLabel: 'ไม่สามารถเล่นเสียงของข้อความนี้ได้',
  },
  vi: {
    playPronunciationLabel: 'Nghe phát âm',
    playbackFailedLabel: 'Khong the phat am thanh cho tin nhan nay.',
  },
} satisfies Record<LegalDocumentLocale, LivePhoneDemoTtsActionCopy>

export function resolveLivePhoneDemoTtsActionCopy(
  uiLocale: string,
): LivePhoneDemoTtsActionCopy {
  const supportedLocale = resolveSupportedLocaleTag(uiLocale) ?? DEFAULT_LOCALE
  const resolvedLocale = resolveLegalDocumentLocale(supportedLocale)
  return TTS_ACTION_COPY_BY_LOCALE[resolvedLocale] ?? TTS_ACTION_COPY_BY_LOCALE.en
}
