import { resolveLegalDocumentLocale, resolveSupportedLocaleTag, type LegalDocumentLocale } from '@/i18n/config'

// The live room bubble (a call or live speech recognition running in a room
// that is not on screen), in the 15 primary UI languages. "Voice talk" and
// "Leave" come from voice-talk-copy.
export type LiveRoomBubbleCopy = {
  /** Shown for a few seconds after leaving from the bubble. */
  leftNotice: string
  undo: string
  /** The bubble's second line while speech recognition is running. */
  sttLive: string
  /** The bubble's leave strip for speech recognition. */
  stop: string
}

const COPY: Record<LegalDocumentLocale, LiveRoomBubbleCopy> = {
  ko: { leftNotice: '나갔어요', undo: '되돌리기', sttLive: '음성 인식 중', stop: '끄기' },
  en: { leftNotice: 'You left', undo: 'Undo', sttLive: 'Listening', stop: 'Stop' },
  ja: { leftNotice: '退出しました', undo: '元に戻す', sttLive: '音声認識中', stop: '停止' },
  'zh-CN': { leftNotice: '已离开', undo: '撤销', sttLive: '语音识别中', stop: '停止' },
  'zh-TW': { leftNotice: '已離開', undo: '復原', sttLive: '語音辨識中', stop: '停止' },
  fr: { leftNotice: 'Vous êtes sorti', undo: 'Annuler', sttLive: 'Écoute en cours', stop: 'Arrêter' },
  de: { leftNotice: 'Du bist raus', undo: 'Rückgängig', sttLive: 'Hört zu', stop: 'Stopp' },
  es: { leftNotice: 'Has salido', undo: 'Deshacer', sttLive: 'Escuchando', stop: 'Parar' },
  pt: { leftNotice: 'Você saiu', undo: 'Desfazer', sttLive: 'Ouvindo', stop: 'Parar' },
  it: { leftNotice: 'Sei uscito', undo: 'Annulla', sttLive: 'In ascolto', stop: 'Ferma' },
  ru: { leftNotice: 'Вы вышли', undo: 'Отменить', sttLive: 'Идёт распознавание', stop: 'Стоп' },
  ar: { leftNotice: 'لقد غادرت', undo: 'تراجع', sttLive: 'جارٍ الاستماع', stop: 'إيقاف' },
  hi: { leftNotice: 'आप बाहर आ गए', undo: 'वापस लें', sttLive: 'सुन रहा है', stop: 'रोकें' },
  th: { leftNotice: 'ออกแล้ว', undo: 'เลิกทำ', sttLive: 'กำลังฟังเสียง', stop: 'หยุด' },
  vi: { leftNotice: 'Bạn đã rời', undo: 'Hoàn tác', sttLive: 'Đang nghe', stop: 'Dừng' },
}

export function liveRoomBubbleCopy(locale: string): LiveRoomBubbleCopy {
  return COPY[resolveLegalDocumentLocale(resolveSupportedLocaleTag(locale) || 'en')] ?? COPY.en
}
