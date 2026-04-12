import {
  DEFAULT_LOCALE,
  resolveLegalDocumentLocale,
  resolveSupportedLocaleTag,
  type LegalDocumentLocale,
} from '@/i18n'

export type LivePhoneDemoConversationDeleteCopy = {
  menuItemLabel: string
  dialogTitle: string
  dialogMessage: string
  cancelLabel: string
  confirmLabel: string
  deletingLabel: string
  successToastLabel: string
  errorToastLabel: string
}

const DELETE_CONVERSATION_COPY_BY_LOCALE = {
  ko: {
    menuItemLabel: '대화방 삭제',
    dialogTitle: '대화방 삭제',
    dialogMessage: '삭제하시겠습니까?',
    cancelLabel: '취소',
    confirmLabel: '삭제',
    deletingLabel: '삭제 중...',
    successToastLabel: '대화방이 삭제되었습니다.',
    errorToastLabel: '대화방 삭제에 실패했습니다. 잠시 후 다시 시도해 주세요.',
  },
  en: {
    menuItemLabel: 'Delete',
    dialogTitle: 'Delete conversation room',
    dialogMessage: 'Delete this conversation room?',
    cancelLabel: 'Cancel',
    confirmLabel: 'Delete',
    deletingLabel: 'Deleting...',
    successToastLabel: 'The conversation room was deleted.',
    errorToastLabel: 'Failed to delete the conversation room. Please try again.',
  },
  ja: {
    menuItemLabel: '会話ルームを削除',
    dialogTitle: '会話ルームを削除',
    dialogMessage: '削除しますか？',
    cancelLabel: 'キャンセル',
    confirmLabel: '削除',
    deletingLabel: '削除中...',
    successToastLabel: '会話ルームを削除しました。',
    errorToastLabel: '会話ルームを削除できませんでした。しばらくしてからもう一度お試しください。',
  },
  'zh-CN': {
    menuItemLabel: '删除对话房间',
    dialogTitle: '删除对话房间',
    dialogMessage: '要删除吗？',
    cancelLabel: '取消',
    confirmLabel: '删除',
    deletingLabel: '删除中...',
    successToastLabel: '已删除对话房间。',
    errorToastLabel: '删除对话房间失败。请稍后再试。',
  },
  'zh-TW': {
    menuItemLabel: '刪除對話房間',
    dialogTitle: '刪除對話房間',
    dialogMessage: '要刪除嗎？',
    cancelLabel: '取消',
    confirmLabel: '刪除',
    deletingLabel: '刪除中...',
    successToastLabel: '已刪除對話房間。',
    errorToastLabel: '刪除對話房間失敗。請稍後再試。',
  },
  fr: {
    menuItemLabel: 'Supprimer la salle de conversation',
    dialogTitle: 'Supprimer',
    dialogMessage: 'Voulez-vous supprimer ?',
    cancelLabel: 'Annuler',
    confirmLabel: 'Supprimer',
    deletingLabel: 'Suppression...',
    successToastLabel: 'La salle de conversation a ete supprimee.',
    errorToastLabel: 'Impossible de supprimer la salle de conversation. Veuillez reessayer plus tard.',
  },
  de: {
    menuItemLabel: 'Gesprächsraum löschen',
    dialogTitle: 'Löschen',
    dialogMessage: 'Mochten Sie loschen?',
    cancelLabel: 'Abbrechen',
    confirmLabel: 'Loschen',
    deletingLabel: 'Wird geloscht...',
    successToastLabel: 'Der Gesprächsraum wurde gelöscht.',
    errorToastLabel: 'Der Gesprächsraum konnte nicht gelöscht werden. Bitte versuchen Sie es später erneut.',
  },
  es: {
    menuItemLabel: 'Eliminar sala de conversacion',
    dialogTitle: 'Eliminar',
    dialogMessage: '¿Desea eliminarla?',
    cancelLabel: 'Cancelar',
    confirmLabel: 'Eliminar',
    deletingLabel: 'Eliminando...',
    successToastLabel: 'Se elimino la sala de conversacion.',
    errorToastLabel: 'No se pudo eliminar la sala de conversacion. Intentalo de nuevo mas tarde.',
  },
  pt: {
    menuItemLabel: 'Excluir sala de conversa',
    dialogTitle: 'Excluir',
    dialogMessage: 'Deseja excluir?',
    cancelLabel: 'Cancelar',
    confirmLabel: 'Excluir',
    deletingLabel: 'Excluindo...',
    successToastLabel: 'A sala de conversa foi excluida.',
    errorToastLabel: 'Nao foi possivel excluir a sala de conversa. Tente novamente mais tarde.',
  },
  it: {
    menuItemLabel: 'Elimina la stanza della conversazione',
    dialogTitle: 'Elimina',
    dialogMessage: 'Vuoi eliminarla?',
    cancelLabel: 'Annulla',
    confirmLabel: 'Elimina',
    deletingLabel: 'Eliminazione...',
    successToastLabel: 'La stanza della conversazione e stata eliminata.',
    errorToastLabel: 'Impossibile eliminare la stanza della conversazione. Riprova piu tardi.',
  },
  ru: {
    menuItemLabel: 'Удалить комнату разговора',
    dialogTitle: 'Удалить',
    dialogMessage: 'Удалить?',
    cancelLabel: 'Отмена',
    confirmLabel: 'Удалить',
    deletingLabel: 'Удаление...',
    successToastLabel: 'Комната разговора удалена.',
    errorToastLabel: 'Не удалось удалить комнату разговора. Повторите попытку позже.',
  },
  ar: {
    menuItemLabel: 'حذف غرفة المحادثة',
    dialogTitle: 'حذف',
    dialogMessage: 'هل تريد الحذف؟',
    cancelLabel: 'إلغاء',
    confirmLabel: 'حذف',
    deletingLabel: 'جارٍ الحذف...',
    successToastLabel: 'تم حذف غرفة المحادثة.',
    errorToastLabel: 'تعذر حذف غرفة المحادثة. يرجى المحاولة مرة أخرى لاحقًا.',
  },
  hi: {
    menuItemLabel: 'बातचीत कक्ष हटाएं',
    dialogTitle: 'हटाएं',
    dialogMessage: 'क्या आप हटाना चाहते हैं?',
    cancelLabel: 'रद्द करें',
    confirmLabel: 'हटाएं',
    deletingLabel: 'हटाया जा रहा है...',
    successToastLabel: 'बातचीत कक्ष हटा दिया गया।',
    errorToastLabel: 'बातचीत कक्ष हटाया नहीं जा सका। कृपया थोड़ी देर बाद फिर कोशिश करें।',
  },
  th: {
    menuItemLabel: 'ลบห้องสนทนา',
    dialogTitle: 'ลบห้องสนทนา',
    dialogMessage: 'ต้องการลบหรือไม่?',
    cancelLabel: 'ยกเลิก',
    confirmLabel: 'ลบ',
    deletingLabel: 'กำลังลบ...',
    successToastLabel: 'ลบห้องสนทนาแล้ว',
    errorToastLabel: 'ไม่สามารถลบห้องสนทนาได้ โปรดลองอีกครั้งภายหลัง',
  },
  vi: {
    menuItemLabel: 'Xoa phong tro chuyen',
    dialogTitle: 'Xoa',
    dialogMessage: 'Ban co muon xoa khong?',
    cancelLabel: 'Huy',
    confirmLabel: 'Xoa',
    deletingLabel: 'Dang xoa...',
    successToastLabel: 'Da xoa phong tro chuyen.',
    errorToastLabel: 'Khong the xoa phong tro chuyen. Vui long thu lai sau.',
  },
} satisfies Record<LegalDocumentLocale, LivePhoneDemoConversationDeleteCopy>

export function resolveLivePhoneDemoConversationDeleteCopy(
  uiLocale: string,
): LivePhoneDemoConversationDeleteCopy {
  const supportedLocale = resolveSupportedLocaleTag(uiLocale) ?? DEFAULT_LOCALE
  const resolvedLocale = resolveLegalDocumentLocale(supportedLocale)

  return DELETE_CONVERSATION_COPY_BY_LOCALE[resolvedLocale] ?? DELETE_CONVERSATION_COPY_BY_LOCALE.en
}
