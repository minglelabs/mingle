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
    playPronunciationLabel: '듣기',
    playbackFailedLabel: '이 발화의 오디오를 재생하지 못했습니다.',
  },
  en: {
    playPronunciationLabel: 'Listen',
    playbackFailedLabel: 'Failed to play audio for this message.',
  },
  ja: {
    playPronunciationLabel: '聴く',
    playbackFailedLabel: 'この発話の音声を再生できませんでした。',
  },
  'zh-CN': {
    playPronunciationLabel: '播放',
    playbackFailedLabel: '无法播放这条发言的音频。',
  },
  'zh-TW': {
    playPronunciationLabel: '播放',
    playbackFailedLabel: '無法播放這則發言的音訊。',
  },
  fr: {
    playPronunciationLabel: 'Écouter',
    playbackFailedLabel: 'Impossible de lire l’audio de ce message.',
  },
  de: {
    playPronunciationLabel: 'Anhören',
    playbackFailedLabel: 'Audio fur diese Nachricht konnte nicht abgespielt werden.',
  },
  es: {
    playPronunciationLabel: 'Escuchar',
    playbackFailedLabel: 'No se pudo reproducir el audio de este mensaje.',
  },
  pt: {
    playPronunciationLabel: 'Ouvir',
    playbackFailedLabel: 'Nao foi possivel reproduzir o audio desta mensagem.',
  },
  it: {
    playPronunciationLabel: 'Ascolta',
    playbackFailedLabel: 'Impossibile riprodurre l’audio di questo messaggio.',
  },
  ru: {
    playPronunciationLabel: 'Слушать',
    playbackFailedLabel: 'Не удалось воспроизвести аудио для этого сообщения.',
  },
  ar: {
    playPronunciationLabel: 'استماع',
    playbackFailedLabel: 'تعذر تشغيل الصوت لهذه الرسالة.',
  },
  hi: {
    playPronunciationLabel: 'सुनें',
    playbackFailedLabel: 'इस संदेश का ऑडियो नहीं चलाया जा सका।',
  },
  th: {
    playPronunciationLabel: 'ฟัง',
    playbackFailedLabel: 'ไม่สามารถเล่นเสียงของข้อความนี้ได้',
  },
  vi: {
    playPronunciationLabel: 'Nghe',
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
