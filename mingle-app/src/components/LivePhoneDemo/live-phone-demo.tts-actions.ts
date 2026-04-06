import {
  DEFAULT_LOCALE,
  resolveLegalDocumentLocale,
  resolveSupportedLocaleTag,
  type LegalDocumentLocale,
} from '@/i18n'

export type LivePhoneDemoTtsActionCopy = {
  playOriginalLabel: string
  playTranslationLabelPrefix: string
  playTranslationLabelSuffix: string
  playbackFailedLabel: string
  formatPlayTranslationLabel: (language: string) => string
}

type LivePhoneDemoTtsActionCopyInput = Omit<
  LivePhoneDemoTtsActionCopy,
  'formatPlayTranslationLabel'
>

const TTS_ACTION_COPY_INPUT_BY_LOCALE = {
  ko: {
    playOriginalLabel: '원문 재생',
    playTranslationLabelPrefix: '',
    playTranslationLabelSuffix: ' 번역 재생',
    playbackFailedLabel: '이 발화의 오디오를 재생하지 못했습니다.',
  },
  en: {
    playOriginalLabel: 'Play original message',
    playTranslationLabelPrefix: 'Play ',
    playTranslationLabelSuffix: ' translation',
    playbackFailedLabel: 'Failed to play audio for this message.',
  },
  ja: {
    playOriginalLabel: '原文を再生',
    playTranslationLabelPrefix: '',
    playTranslationLabelSuffix: ' 翻訳を再生',
    playbackFailedLabel: 'この発話の音声を再生できませんでした。',
  },
  'zh-CN': {
    playOriginalLabel: '播放原文',
    playTranslationLabelPrefix: '播放 ',
    playTranslationLabelSuffix: ' 翻译',
    playbackFailedLabel: '无法播放这条发言的音频。',
  },
  'zh-TW': {
    playOriginalLabel: '播放原文',
    playTranslationLabelPrefix: '播放 ',
    playTranslationLabelSuffix: ' 翻譯',
    playbackFailedLabel: '無法播放這則發言的音訊。',
  },
  fr: {
    playOriginalLabel: 'Lire le message original',
    playTranslationLabelPrefix: 'Lire la traduction ',
    playTranslationLabelSuffix: '',
    playbackFailedLabel: 'Impossible de lire l’audio de ce message.',
  },
  de: {
    playOriginalLabel: 'Originalnachricht abspielen',
    playTranslationLabelPrefix: '',
    playTranslationLabelSuffix: '-Ubersetzung abspielen',
    playbackFailedLabel: 'Audio fur diese Nachricht konnte nicht abgespielt werden.',
  },
  es: {
    playOriginalLabel: 'Reproducir mensaje original',
    playTranslationLabelPrefix: 'Reproducir traduccion en ',
    playTranslationLabelSuffix: '',
    playbackFailedLabel: 'No se pudo reproducir el audio de este mensaje.',
  },
  pt: {
    playOriginalLabel: 'Reproduzir mensagem original',
    playTranslationLabelPrefix: 'Reproduzir traducao em ',
    playTranslationLabelSuffix: '',
    playbackFailedLabel: 'Nao foi possivel reproduzir o audio desta mensagem.',
  },
  it: {
    playOriginalLabel: 'Riproduci messaggio originale',
    playTranslationLabelPrefix: 'Riproduci traduzione in ',
    playTranslationLabelSuffix: '',
    playbackFailedLabel: 'Impossibile riprodurre l’audio di questo messaggio.',
  },
  ru: {
    playOriginalLabel: 'Воспроизвести оригинал',
    playTranslationLabelPrefix: 'Воспроизвести перевод ',
    playTranslationLabelSuffix: '',
    playbackFailedLabel: 'Не удалось воспроизвести аудио для этого сообщения.',
  },
  ar: {
    playOriginalLabel: 'تشغيل الرسالة الأصلية',
    playTranslationLabelPrefix: 'تشغيل ترجمة ',
    playTranslationLabelSuffix: '',
    playbackFailedLabel: 'تعذر تشغيل الصوت لهذه الرسالة.',
  },
  hi: {
    playOriginalLabel: 'मूल संदेश चलाएं',
    playTranslationLabelPrefix: '',
    playTranslationLabelSuffix: ' अनुवाद चलाएं',
    playbackFailedLabel: 'इस संदेश का ऑडियो नहीं चलाया जा सका।',
  },
  th: {
    playOriginalLabel: 'เล่นข้อความต้นฉบับ',
    playTranslationLabelPrefix: 'เล่นคำแปล ',
    playTranslationLabelSuffix: '',
    playbackFailedLabel: 'ไม่สามารถเล่นเสียงของข้อความนี้ได้',
  },
  vi: {
    playOriginalLabel: 'Phat tin nhan goc',
    playTranslationLabelPrefix: 'Phat ban dich ',
    playTranslationLabelSuffix: '',
    playbackFailedLabel: 'Khong the phat am thanh cho tin nhan nay.',
  },
} satisfies Record<LegalDocumentLocale, LivePhoneDemoTtsActionCopyInput>

function buildLivePhoneDemoTtsActionCopy(
  input: LivePhoneDemoTtsActionCopyInput,
): LivePhoneDemoTtsActionCopy {
  return {
    ...input,
    formatPlayTranslationLabel: (language: string) => (
      `${input.playTranslationLabelPrefix}${language}${input.playTranslationLabelSuffix}`
    ),
  }
}

export function resolveLivePhoneDemoTtsActionCopy(
  uiLocale: string,
): LivePhoneDemoTtsActionCopy {
  const supportedLocale = resolveSupportedLocaleTag(uiLocale) ?? DEFAULT_LOCALE
  const resolvedLocale = resolveLegalDocumentLocale(supportedLocale)
  const input = TTS_ACTION_COPY_INPUT_BY_LOCALE[resolvedLocale] ?? TTS_ACTION_COPY_INPUT_BY_LOCALE.en

  return buildLivePhoneDemoTtsActionCopy(input)
}
