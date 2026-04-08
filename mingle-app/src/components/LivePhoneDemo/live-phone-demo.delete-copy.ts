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
    menuItemLabel: '대화 전체 삭제',
    dialogTitle: '대화 전체 삭제',
    dialogMessage: '삭제하시겠습니까?',
    cancelLabel: '취소',
    confirmLabel: '삭제',
    deletingLabel: '삭제 중...',
    successToastLabel: '대화가 전체 삭제되었습니다.',
    errorToastLabel: '대화 삭제에 실패했습니다. 잠시 후 다시 시도해 주세요.',
  },
  en: {
    menuItemLabel: 'Delete all conversation messages',
    dialogTitle: 'Delete all conversation messages',
    dialogMessage: 'Delete all conversation messages?',
    cancelLabel: 'Cancel',
    confirmLabel: 'Delete',
    deletingLabel: 'Deleting...',
    successToastLabel: 'All conversation messages were deleted.',
    errorToastLabel: 'Failed to delete the conversation. Please try again.',
  },
  ja: {
    menuItemLabel: '会話をすべて削除',
    dialogTitle: '会話をすべて削除',
    dialogMessage: '削除しますか？',
    cancelLabel: 'キャンセル',
    confirmLabel: '削除',
    deletingLabel: '削除中...',
    successToastLabel: '会話をすべて削除しました。',
    errorToastLabel: '会話を削除できませんでした。しばらくしてからもう一度お試しください。',
  },
  'zh-CN': {
    menuItemLabel: '删除全部对话',
    dialogTitle: '删除全部对话',
    dialogMessage: '要删除吗？',
    cancelLabel: '取消',
    confirmLabel: '删除',
    deletingLabel: '删除中...',
    successToastLabel: '已删除全部对话。',
    errorToastLabel: '删除对话失败。请稍后再试。',
  },
  'zh-TW': {
    menuItemLabel: '刪除全部對話',
    dialogTitle: '刪除全部對話',
    dialogMessage: '要刪除嗎？',
    cancelLabel: '取消',
    confirmLabel: '刪除',
    deletingLabel: '刪除中...',
    successToastLabel: '已刪除全部對話。',
    errorToastLabel: '刪除對話失敗。請稍後再試。',
  },
  fr: {
    menuItemLabel: 'Supprimer toute la conversation',
    dialogTitle: 'Supprimer toute la conversation',
    dialogMessage: 'Voulez-vous supprimer ?',
    cancelLabel: 'Annuler',
    confirmLabel: 'Supprimer',
    deletingLabel: 'Suppression...',
    successToastLabel: 'Toute la conversation a ete supprimee.',
    errorToastLabel: 'Impossible de supprimer la conversation. Veuillez reessayer plus tard.',
  },
  de: {
    menuItemLabel: 'Gesamtes Gesprach loschen',
    dialogTitle: 'Gesamtes Gesprach loschen',
    dialogMessage: 'Mochten Sie loschen?',
    cancelLabel: 'Abbrechen',
    confirmLabel: 'Loschen',
    deletingLabel: 'Wird geloscht...',
    successToastLabel: 'Das gesamte Gesprach wurde geloscht.',
    errorToastLabel: 'Das Gesprach konnte nicht geloscht werden. Bitte versuchen Sie es spater erneut.',
  },
  es: {
    menuItemLabel: 'Eliminar toda la conversacion',
    dialogTitle: 'Eliminar toda la conversacion',
    dialogMessage: '¿Desea eliminarla?',
    cancelLabel: 'Cancelar',
    confirmLabel: 'Eliminar',
    deletingLabel: 'Eliminando...',
    successToastLabel: 'Se elimino toda la conversacion.',
    errorToastLabel: 'No se pudo eliminar la conversacion. Intentalo de nuevo mas tarde.',
  },
  pt: {
    menuItemLabel: 'Excluir toda a conversa',
    dialogTitle: 'Excluir toda a conversa',
    dialogMessage: 'Deseja excluir?',
    cancelLabel: 'Cancelar',
    confirmLabel: 'Excluir',
    deletingLabel: 'Excluindo...',
    successToastLabel: 'Toda a conversa foi excluida.',
    errorToastLabel: 'Nao foi possivel excluir a conversa. Tente novamente mais tarde.',
  },
  it: {
    menuItemLabel: 'Elimina tutta la conversazione',
    dialogTitle: 'Elimina tutta la conversazione',
    dialogMessage: 'Vuoi eliminarla?',
    cancelLabel: 'Annulla',
    confirmLabel: 'Elimina',
    deletingLabel: 'Eliminazione...',
    successToastLabel: 'Tutta la conversazione e stata eliminata.',
    errorToastLabel: 'Impossibile eliminare la conversazione. Riprova piu tardi.',
  },
  ru: {
    menuItemLabel: 'Удалить весь разговор',
    dialogTitle: 'Удалить весь разговор',
    dialogMessage: 'Удалить?',
    cancelLabel: 'Отмена',
    confirmLabel: 'Удалить',
    deletingLabel: 'Удаление...',
    successToastLabel: 'Весь разговор удален.',
    errorToastLabel: 'Не удалось удалить разговор. Повторите попытку позже.',
  },
  ar: {
    menuItemLabel: 'حذف المحادثة بالكامل',
    dialogTitle: 'حذف المحادثة بالكامل',
    dialogMessage: 'هل تريد الحذف؟',
    cancelLabel: 'إلغاء',
    confirmLabel: 'حذف',
    deletingLabel: 'جارٍ الحذف...',
    successToastLabel: 'تم حذف المحادثة بالكامل.',
    errorToastLabel: 'تعذر حذف المحادثة. يرجى المحاولة مرة أخرى لاحقًا.',
  },
  hi: {
    menuItemLabel: 'पूरी बातचीत हटाएं',
    dialogTitle: 'पूरी बातचीत हटाएं',
    dialogMessage: 'क्या आप हटाना चाहते हैं?',
    cancelLabel: 'रद्द करें',
    confirmLabel: 'हटाएं',
    deletingLabel: 'हटाया जा रहा है...',
    successToastLabel: 'पूरी बातचीत हटा दी गई।',
    errorToastLabel: 'बातचीत हटाई नहीं जा सकी। कृपया थोड़ी देर बाद फिर कोशिश करें।',
  },
  th: {
    menuItemLabel: 'ลบบทสนทนาทั้งหมด',
    dialogTitle: 'ลบบทสนทนาทั้งหมด',
    dialogMessage: 'ต้องการลบหรือไม่?',
    cancelLabel: 'ยกเลิก',
    confirmLabel: 'ลบ',
    deletingLabel: 'กำลังลบ...',
    successToastLabel: 'ลบบทสนทนาทั้งหมดแล้ว',
    errorToastLabel: 'ไม่สามารถลบบทสนทนาได้ โปรดลองอีกครั้งภายหลัง',
  },
  vi: {
    menuItemLabel: 'Xoa toan bo cuoc tro chuyen',
    dialogTitle: 'Xoa toan bo cuoc tro chuyen',
    dialogMessage: 'Ban co muon xoa khong?',
    cancelLabel: 'Huy',
    confirmLabel: 'Xoa',
    deletingLabel: 'Dang xoa...',
    successToastLabel: 'Da xoa toan bo cuoc tro chuyen.',
    errorToastLabel: 'Khong the xoa cuoc tro chuyen. Vui long thu lai sau.',
  },
} satisfies Record<LegalDocumentLocale, LivePhoneDemoConversationDeleteCopy>

export function resolveLivePhoneDemoConversationDeleteCopy(
  uiLocale: string,
): LivePhoneDemoConversationDeleteCopy {
  const supportedLocale = resolveSupportedLocaleTag(uiLocale) ?? DEFAULT_LOCALE
  const resolvedLocale = resolveLegalDocumentLocale(supportedLocale)

  return DELETE_CONVERSATION_COPY_BY_LOCALE[resolvedLocale] ?? DELETE_CONVERSATION_COPY_BY_LOCALE.en
}
