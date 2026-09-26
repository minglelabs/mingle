import {
  resolveLegalDocumentLocale,
  resolveSupportedLocaleTag,
  type LegalDocumentLocale,
} from "@/i18n/config";

export type ConversationSpectateLocale = LegalDocumentLocale;

export type ConversationSpectateCopy = {
  // {name} and {room} are replaced by the inviter's name and the room's
  // title — see formatConversationSpectateInvite below.
  invitedTemplate: string;
  userFallback: string;
  openInApp: string;
  appStore: string;
  playStore: string;
  notFoundTitle: string;
  notFoundDescription: string;
  // NativeConversationShareOverlay-only: the button that turns the viewer
  // into a real member of the room (see joinConversationChannelViaShareToken).
  // The public /s/ page never renders this — it has no session to join with.
  joinRoom: string;
  joinRoomError: string;
};

function readLanguageTagQuality(part: string, index: number): { tag: string; quality: number; index: number } | null {
  const [rawTag, ...parameters] = part.trim().split(";");
  const tag = rawTag?.trim().toLowerCase();
  if (!tag) return null;

  const qualityParameter = parameters.find((parameter) => parameter.trim().toLowerCase().startsWith("q="));
  const parsedQuality = qualityParameter ? Number(qualityParameter.trim().slice(2)) : 1;
  const quality = Number.isFinite(parsedQuality) ? Math.max(0, Math.min(1, parsedQuality)) : 0;

  return { tag, quality, index };
}

export function resolveConversationSpectateLocale(
  acceptLanguage: string | null | undefined,
): ConversationSpectateLocale {
  const candidates = (acceptLanguage || "")
    .split(",")
    .map(readLanguageTagQuality)
    .filter((candidate): candidate is NonNullable<typeof candidate> => candidate !== null)
    .sort((left, right) => right.quality - left.quality || left.index - right.index);

  for (const candidate of candidates) {
    const supportedLocale = resolveSupportedLocaleTag(candidate.tag);
    if (supportedLocale) return resolveLegalDocumentLocale(supportedLocale);
  }

  return "en";
}

export function getConversationSpectateCopy(locale: ConversationSpectateLocale): ConversationSpectateCopy {
  return CONVERSATION_SPECTATE_COPY_BY_LOCALE[locale] ?? CONVERSATION_SPECTATE_COPY_BY_LOCALE.en;
}

export function formatConversationSpectateInvite(
  copy: ConversationSpectateCopy,
  inviterName: string,
  roomTitle: string,
): string {
  return copy.invitedTemplate.replace("{name}", inviterName).replace("{room}", roomTitle);
}

const CONVERSATION_SPECTATE_COPY_BY_LOCALE: Record<ConversationSpectateLocale, ConversationSpectateCopy> = {
  ko: {
    invitedTemplate: "{name}님이 {room}에 초대했습니다", userFallback: "Mingle 사용자", openInApp: "밍글 앱에서 보기", appStore: "App Store에서 설치", playStore: "Google Play에서 설치",
    notFoundTitle: "더 이상 공유되지 않는 대화방입니다", notFoundDescription: "링크가 잘못되었거나 대화방이 삭제되었습니다.",
    joinRoom: "대화방 참여하기", joinRoomError: "참여에 실패했습니다. 다시 시도해주세요.",
  },
  en: {
    invitedTemplate: "{name} invited you to {room}", userFallback: "Mingle user", openInApp: "View in Mingle App", appStore: "App Store", playStore: "Google Play",
    notFoundTitle: "This conversation is no longer shared", notFoundDescription: "The link may be invalid, or the conversation was deleted.",
    joinRoom: "Join Conversation", joinRoomError: "Couldn't join. Please try again.",
  },
  ja: {
    invitedTemplate: "{name}さんが{room}に招待しました", userFallback: "Mingleユーザー", openInApp: "Mingleアプリで見る", appStore: "App Storeからインストール", playStore: "Google Playからインストール",
    notFoundTitle: "この会話はもう共有されていません", notFoundDescription: "リンクが無効か、会話が削除された可能性があります。",
    joinRoom: "会話に参加する", joinRoomError: "参加できませんでした。もう一度お試しください。",
  },
  "zh-CN": {
    invitedTemplate: "{name}邀请你加入{room}", userFallback: "Mingle 用户", openInApp: "在 Mingle 应用中查看", appStore: "从 App Store 安装", playStore: "从 Google Play 安装",
    notFoundTitle: "此会话已不再共享", notFoundDescription: "链接可能无效，或该对话已被删除。",
    joinRoom: "加入对话", joinRoomError: "加入失败，请重试。",
  },
  "zh-TW": {
    invitedTemplate: "{name}邀請你加入{room}", userFallback: "Mingle 使用者", openInApp: "在 Mingle 應用程式中查看", appStore: "從 App Store 安裝", playStore: "從 Google Play 安裝",
    notFoundTitle: "此對話已不再共享", notFoundDescription: "連結可能無效，或該對話已被刪除。",
    joinRoom: "加入對話", joinRoomError: "加入失敗，請再試一次。",
  },
  fr: {
    invitedTemplate: "{name} vous a invité à {room}", userFallback: "Utilisateur Mingle", openInApp: "Voir dans l’app Mingle", appStore: "Installer depuis l’App Store", playStore: "Installer depuis Google Play",
    notFoundTitle: "Cette conversation n’est plus partagée", notFoundDescription: "Le lien est peut-être invalide, ou la conversation a été supprimée.",
    joinRoom: "Rejoindre la conversation", joinRoomError: "Impossible de rejoindre. Réessayez.",
  },
  de: {
    invitedTemplate: "{name} hat dich zu {room} eingeladen", userFallback: "Mingle-Nutzer", openInApp: "In der Mingle-App ansehen", appStore: "Im App Store installieren", playStore: "Bei Google Play installieren",
    notFoundTitle: "Diese Unterhaltung wird nicht mehr geteilt", notFoundDescription: "Der Link ist möglicherweise ungültig, oder die Unterhaltung wurde gelöscht.",
    joinRoom: "Unterhaltung beitreten", joinRoomError: "Beitritt fehlgeschlagen. Bitte erneut versuchen.",
  },
  es: {
    invitedTemplate: "{name} te invitó a {room}", userFallback: "Usuario de Mingle", openInApp: "Ver en la app de Mingle", appStore: "Instalar desde App Store", playStore: "Instalar desde Google Play",
    notFoundTitle: "Esta conversación ya no se comparte", notFoundDescription: "El enlace puede ser inválido, o la conversación fue eliminada.",
    joinRoom: "Unirse a la conversación", joinRoomError: "No se pudo unir. Inténtalo de nuevo.",
  },
  pt: {
    invitedTemplate: "{name} convidou você para {room}", userFallback: "Usuário do Mingle", openInApp: "Ver no app Mingle", appStore: "Instalar pela App Store", playStore: "Instalar pelo Google Play",
    notFoundTitle: "Esta conversa não está mais compartilhada", notFoundDescription: "O link pode ser inválido, ou a conversa foi excluída.",
    joinRoom: "Entrar na conversa", joinRoomError: "Não foi possível entrar. Tente novamente.",
  },
  it: {
    invitedTemplate: "{name} ti ha invitato a {room}", userFallback: "Utente Mingle", openInApp: "Vedi nell’app Mingle", appStore: "Installa dall’App Store", playStore: "Installa da Google Play",
    notFoundTitle: "Questa conversazione non è più condivisa", notFoundDescription: "Il link potrebbe non essere valido, oppure la conversazione è stata eliminata.",
    joinRoom: "Unisciti alla conversazione", joinRoomError: "Impossibile unirsi. Riprova.",
  },
  ru: {
    invitedTemplate: "{name} пригласил вас в {room}", userFallback: "Пользователь Mingle", openInApp: "Смотреть в приложении Mingle", appStore: "Установить из App Store", playStore: "Установить из Google Play",
    notFoundTitle: "Этот разговор больше не доступен по ссылке", notFoundDescription: "Ссылка может быть недействительной, либо разговор был удалён.",
    joinRoom: "Присоединиться к разговору", joinRoomError: "Не удалось присоединиться. Попробуйте снова.",
  },
  ar: {
    invitedTemplate: "{name} دعاك إلى {room}", userFallback: "مستخدم Mingle", openInApp: "عرض في تطبيق Mingle", appStore: "التثبيت من App Store", playStore: "التثبيت من Google Play",
    notFoundTitle: "لم تتم مشاركة هذه المحادثة بعد الآن", notFoundDescription: "قد يكون الرابط غير صالح، أو تم حذف المحادثة.",
    joinRoom: "الانضمام إلى المحادثة", joinRoomError: "تعذر الانضمام. حاول مرة أخرى.",
  },
  hi: {
    invitedTemplate: "{name} ने आपको {room} में आमंत्रित किया", userFallback: "Mingle उपयोगकर्ता", openInApp: "Mingle ऐप में देखें", appStore: "App Store से इंस्टॉल करें", playStore: "Google Play से इंस्टॉल करें",
    notFoundTitle: "यह बातचीत अब शेयर नहीं की जा रही", notFoundDescription: "लिंक अमान्य हो सकता है, या बातचीत हटा दी गई है।",
    joinRoom: "बातचीत में शामिल हों", joinRoomError: "शामिल नहीं हो सके। कृपया पुनः प्रयास करें।",
  },
  th: {
    invitedTemplate: "{name} เชิญคุณเข้าร่วม {room}", userFallback: "ผู้ใช้ Mingle", openInApp: "ดูในแอป Mingle", appStore: "ติดตั้งจาก App Store", playStore: "ติดตั้งจาก Google Play",
    notFoundTitle: "บทสนทนานี้ไม่ได้แชร์อีกต่อไป", notFoundDescription: "ลิงก์อาจไม่ถูกต้อง หรือบทสนทนานี้ถูกลบไปแล้ว",
    joinRoom: "เข้าร่วมบทสนทนา", joinRoomError: "เข้าร่วมไม่สำเร็จ กรุณาลองอีกครั้ง",
  },
  vi: {
    invitedTemplate: "{name} đã mời bạn vào {room}", userFallback: "Người dùng Mingle", openInApp: "Xem trong ứng dụng Mingle", appStore: "Cài đặt từ App Store", playStore: "Cài đặt từ Google Play",
    notFoundTitle: "Cuộc trò chuyện này không còn được chia sẻ", notFoundDescription: "Liên kết có thể không hợp lệ, hoặc cuộc trò chuyện đã bị xóa.",
    joinRoom: "Tham gia cuộc trò chuyện", joinRoomError: "Không thể tham gia. Vui lòng thử lại.",
  },
};
