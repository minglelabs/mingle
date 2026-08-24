import {
  DEFAULT_LOCALE,
  resolveLegalDocumentLocale,
  resolveSupportedLocaleTag,
  type LegalDocumentLocale,
} from '@/i18n'

export type LivePhoneDemoConversationLeaveCopy = {
  menuItemLabel: string
  dialogTitle: string
  dialogMessage: string
  cancelLabel: string
  confirmLabel: string
  leavingLabel: string
  successToastLabel: string
  errorToastLabel: string
  // Rendered in-room when a member leaves (see leaveNotices in the
  // conversation hydration response). Contains a literal `{name}`
  // placeholder — use formatLivePhoneDemoLeaveNoticeText below instead of
  // interpolating it directly.
  noticeTemplate: string
  // Short badge shown next to a departed member's name in the participants
  // list — e.g. "나감" / "Left" — distinct from the full noticeTemplate
  // sentence rendered in the message timeline.
  leftBadgeLabel: string
}

const LEAVE_CONVERSATION_COPY_BY_LOCALE = {
  ko: {
    menuItemLabel: '대화방 나가기',
    dialogTitle: '대화방 나가기',
    dialogMessage: '나가시겠습니까?',
    cancelLabel: '취소',
    confirmLabel: '나가기',
    leavingLabel: '나가는 중...',
    successToastLabel: '대화방에서 나갔습니다.',
    errorToastLabel: '대화방 나가기에 실패했습니다. 잠시 후 다시 시도해 주세요.',
    noticeTemplate: '{name}님이 나가셨습니다.',
    leftBadgeLabel: '나감',
  },
  en: {
    menuItemLabel: 'Leave',
    dialogTitle: 'Leave conversation room',
    dialogMessage: 'Leave this conversation room?',
    cancelLabel: 'Cancel',
    confirmLabel: 'Leave',
    leavingLabel: 'Leaving...',
    successToastLabel: 'You left the conversation room.',
    errorToastLabel: 'Failed to leave the conversation room. Please try again.',
    noticeTemplate: '{name} left the conversation.',
    leftBadgeLabel: 'Left',
  },
  ja: {
    menuItemLabel: '会話ルームを退出',
    dialogTitle: '会話ルームを退出',
    dialogMessage: '退出しますか？',
    cancelLabel: 'キャンセル',
    confirmLabel: '退出',
    leavingLabel: '退出中...',
    successToastLabel: '会話ルームから退出しました。',
    errorToastLabel: '会話ルームを退出できませんでした。しばらくしてからもう一度お試しください。',
    noticeTemplate: '{name}さんが退出しました。',
    leftBadgeLabel: '退出済み',
  },
  'zh-CN': {
    menuItemLabel: '退出对话房间',
    dialogTitle: '退出对话房间',
    dialogMessage: '要退出吗？',
    cancelLabel: '取消',
    confirmLabel: '退出',
    leavingLabel: '退出中...',
    successToastLabel: '已退出对话房间。',
    errorToastLabel: '退出对话房间失败。请稍后再试。',
    noticeTemplate: '{name}已退出对话。',
    leftBadgeLabel: '已退出',
  },
  'zh-TW': {
    menuItemLabel: '退出對話房間',
    dialogTitle: '退出對話房間',
    dialogMessage: '要退出嗎？',
    cancelLabel: '取消',
    confirmLabel: '退出',
    leavingLabel: '退出中...',
    successToastLabel: '已退出對話房間。',
    errorToastLabel: '退出對話房間失敗。請稍後再試。',
    noticeTemplate: '{name}已退出對話。',
    leftBadgeLabel: '已退出',
  },
  fr: {
    menuItemLabel: 'Quitter',
    dialogTitle: 'Quitter la salle de conversation',
    dialogMessage: 'Voulez-vous quitter cette salle de conversation ?',
    cancelLabel: 'Annuler',
    confirmLabel: 'Quitter',
    leavingLabel: 'Depart en cours...',
    successToastLabel: 'Vous avez quitte la salle de conversation.',
    errorToastLabel: 'Impossible de quitter la salle de conversation. Veuillez reessayer plus tard.',
    noticeTemplate: '{name} a quitte la conversation.',
    leftBadgeLabel: 'Parti(e)',
  },
  de: {
    menuItemLabel: 'Verlassen',
    dialogTitle: 'Gesprächsraum verlassen',
    dialogMessage: 'Mochten Sie diesen Gesprächsraum verlassen?',
    cancelLabel: 'Abbrechen',
    confirmLabel: 'Verlassen',
    leavingLabel: 'Wird verlassen...',
    successToastLabel: 'Sie haben den Gesprächsraum verlassen.',
    errorToastLabel: 'Der Gesprächsraum konnte nicht verlassen werden. Bitte versuchen Sie es später erneut.',
    noticeTemplate: '{name} hat die Unterhaltung verlassen.',
    leftBadgeLabel: 'Verlassen',
  },
  es: {
    menuItemLabel: 'Salir',
    dialogTitle: 'Salir de la sala de conversacion',
    dialogMessage: '¿Desea salir de esta sala de conversacion?',
    cancelLabel: 'Cancelar',
    confirmLabel: 'Salir',
    leavingLabel: 'Saliendo...',
    successToastLabel: 'Saliste de la sala de conversacion.',
    errorToastLabel: 'No se pudo salir de la sala de conversacion. Intentalo de nuevo mas tarde.',
    noticeTemplate: '{name} salio de la conversacion.',
    leftBadgeLabel: 'Salio',
  },
  pt: {
    menuItemLabel: 'Sair',
    dialogTitle: 'Sair da sala de conversa',
    dialogMessage: 'Deseja sair desta sala de conversa?',
    cancelLabel: 'Cancelar',
    confirmLabel: 'Sair',
    leavingLabel: 'Saindo...',
    successToastLabel: 'Voce saiu da sala de conversa.',
    errorToastLabel: 'Nao foi possivel sair da sala de conversa. Tente novamente mais tarde.',
    noticeTemplate: '{name} saiu da conversa.',
    leftBadgeLabel: 'Saiu',
  },
  it: {
    menuItemLabel: 'Esci',
    dialogTitle: 'Esci dalla stanza della conversazione',
    dialogMessage: 'Vuoi uscire da questa stanza della conversazione?',
    cancelLabel: 'Annulla',
    confirmLabel: 'Esci',
    leavingLabel: 'Uscita in corso...',
    successToastLabel: 'Hai lasciato la stanza della conversazione.',
    errorToastLabel: 'Impossibile uscire dalla stanza della conversazione. Riprova piu tardi.',
    noticeTemplate: '{name} ha lasciato la conversazione.',
    leftBadgeLabel: 'Uscito/a',
  },
  ru: {
    menuItemLabel: 'Покинуть',
    dialogTitle: 'Покинуть комнату разговора',
    dialogMessage: 'Покинуть эту комнату разговора?',
    cancelLabel: 'Отмена',
    confirmLabel: 'Покинуть',
    leavingLabel: 'Выход...',
    successToastLabel: 'Вы покинули комнату разговора.',
    errorToastLabel: 'Не удалось покинуть комнату разговора. Повторите попытку позже.',
    noticeTemplate: '{name} покинул(а) разговор.',
    leftBadgeLabel: 'Покинул(а)',
  },
  ar: {
    menuItemLabel: 'مغادرة',
    dialogTitle: 'مغادرة غرفة المحادثة',
    dialogMessage: 'هل تريد مغادرة غرفة المحادثة هذه؟',
    cancelLabel: 'إلغاء',
    confirmLabel: 'مغادرة',
    leavingLabel: 'جارٍ المغادرة...',
    successToastLabel: 'لقد غادرت غرفة المحادثة.',
    errorToastLabel: 'تعذرت مغادرة غرفة المحادثة. يرجى المحاولة مرة أخرى لاحقًا.',
    noticeTemplate: 'غادر {name} المحادثة.',
    leftBadgeLabel: 'غادر',
  },
  hi: {
    menuItemLabel: 'छोड़ें',
    dialogTitle: 'बातचीत कक्ष छोड़ें',
    dialogMessage: 'क्या आप यह बातचीत कक्ष छोड़ना चाहते हैं?',
    cancelLabel: 'रद्द करें',
    confirmLabel: 'छोड़ें',
    leavingLabel: 'छोड़ा जा रहा है...',
    successToastLabel: 'आपने बातचीत कक्ष छोड़ दिया।',
    errorToastLabel: 'बातचीत कक्ष नहीं छोड़ा जा सका। कृपया थोड़ी देर बाद फिर कोशिश करें।',
    noticeTemplate: '{name} ने बातचीत छोड़ दी।',
    leftBadgeLabel: 'छोड़ चुके',
  },
  th: {
    menuItemLabel: 'ออกจากห้องสนทนา',
    dialogTitle: 'ออกจากห้องสนทนา',
    dialogMessage: 'ต้องการออกจากห้องสนทนานี้หรือไม่?',
    cancelLabel: 'ยกเลิก',
    confirmLabel: 'ออก',
    leavingLabel: 'กำลังออก...',
    successToastLabel: 'คุณออกจากห้องสนทนาแล้ว',
    errorToastLabel: 'ไม่สามารถออกจากห้องสนทนาได้ โปรดลองอีกครั้งภายหลัง',
    noticeTemplate: '{name} ออกจากการสนทนาแล้ว',
    leftBadgeLabel: 'ออกแล้ว',
  },
  vi: {
    menuItemLabel: 'Roi khoi',
    dialogTitle: 'Roi khoi phong tro chuyen',
    dialogMessage: 'Ban co muon roi khoi phong tro chuyen nay khong?',
    cancelLabel: 'Huy',
    confirmLabel: 'Roi khoi',
    leavingLabel: 'Dang roi khoi...',
    successToastLabel: 'Ban da roi khoi phong tro chuyen.',
    errorToastLabel: 'Khong the roi khoi phong tro chuyen. Vui long thu lai sau.',
    noticeTemplate: '{name} da roi khoi cuoc tro chuyen.',
    leftBadgeLabel: 'Da roi',
  },
} satisfies Record<LegalDocumentLocale, LivePhoneDemoConversationLeaveCopy>

export function resolveLivePhoneDemoConversationLeaveCopy(
  uiLocale: string,
): LivePhoneDemoConversationLeaveCopy {
  const supportedLocale = resolveSupportedLocaleTag(uiLocale) ?? DEFAULT_LOCALE
  const resolvedLocale = resolveLegalDocumentLocale(supportedLocale)

  return LEAVE_CONVERSATION_COPY_BY_LOCALE[resolvedLocale] ?? LEAVE_CONVERSATION_COPY_BY_LOCALE.en
}

export function formatLivePhoneDemoLeaveNoticeText(uiLocale: string, name: string): string {
  const copy = resolveLivePhoneDemoConversationLeaveCopy(uiLocale)
  return copy.noticeTemplate.replace('{name}', name)
}
