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
  openInAppConfirmMessage: string;
  cancelLabel: string;
  appStore: string;
  playStore: string;
  notFoundTitle: string;
  notFoundDescription: string;
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
    invitedTemplate: "{name}님이 {room}에 초대했습니다", userFallback: "Mingle 사용자", openInApp: "밍글 앱에서 보기", openInAppConfirmMessage: "이 대화방을 밍글 앱에서 보시겠습니까?", cancelLabel: "취소", appStore: "App Store에서 설치", playStore: "Google Play에서 설치",
    notFoundTitle: "더 이상 공유되지 않는 대화방입니다", notFoundDescription: "링크가 만료되었거나 공유가 중지되었습니다.",
  },
  en: {
    invitedTemplate: "{name} invited you to {room}", userFallback: "Mingle user", openInApp: "View in Mingle App", openInAppConfirmMessage: "View this conversation in the Mingle app?", cancelLabel: "Cancel", appStore: "App Store", playStore: "Google Play",
    notFoundTitle: "This conversation is no longer shared", notFoundDescription: "The link may have expired, or sharing was turned off.",
  },
  ja: {
    invitedTemplate: "{name}さんが{room}に招待しました", userFallback: "Mingleユーザー", openInApp: "Mingleアプリで見る", openInAppConfirmMessage: "このやり取りをMingleアプリで見ますか？", cancelLabel: "キャンセル", appStore: "App Storeからインストール", playStore: "Google Playからインストール",
    notFoundTitle: "この会話はもう共有されていません", notFoundDescription: "リンクの期限が切れたか、共有が停止されました。",
  },
  "zh-CN": {
    invitedTemplate: "{name}邀请你加入{room}", userFallback: "Mingle 用户", openInApp: "在 Mingle 应用中查看", openInAppConfirmMessage: "要在 Mingle 应用中查看此对话吗？", cancelLabel: "取消", appStore: "从 App Store 安装", playStore: "从 Google Play 安装",
    notFoundTitle: "此会话已不再共享", notFoundDescription: "链接可能已过期，或共享已被关闭。",
  },
  "zh-TW": {
    invitedTemplate: "{name}邀請你加入{room}", userFallback: "Mingle 使用者", openInApp: "在 Mingle 應用程式中查看", openInAppConfirmMessage: "要在 Mingle 應用程式中查看此對話嗎？", cancelLabel: "取消", appStore: "從 App Store 安裝", playStore: "從 Google Play 安裝",
    notFoundTitle: "此對話已不再共享", notFoundDescription: "連結可能已過期，或共享已被關閉。",
  },
  fr: {
    invitedTemplate: "{name} vous a invité à {room}", userFallback: "Utilisateur Mingle", openInApp: "Voir dans l’app Mingle", openInAppConfirmMessage: "Voir cette conversation dans l’app Mingle ?", cancelLabel: "Annuler", appStore: "Installer depuis l’App Store", playStore: "Installer depuis Google Play",
    notFoundTitle: "Cette conversation n’est plus partagée", notFoundDescription: "Le lien a peut-être expiré, ou le partage a été désactivé.",
  },
  de: {
    invitedTemplate: "{name} hat dich zu {room} eingeladen", userFallback: "Mingle-Nutzer", openInApp: "In der Mingle-App ansehen", openInAppConfirmMessage: "Diese Unterhaltung in der Mingle-App ansehen?", cancelLabel: "Abbrechen", appStore: "Im App Store installieren", playStore: "Bei Google Play installieren",
    notFoundTitle: "Diese Unterhaltung wird nicht mehr geteilt", notFoundDescription: "Der Link ist möglicherweise abgelaufen oder das Teilen wurde deaktiviert.",
  },
  es: {
    invitedTemplate: "{name} te invitó a {room}", userFallback: "Usuario de Mingle", openInApp: "Ver en la app de Mingle", openInAppConfirmMessage: "¿Ver esta conversación en la app de Mingle?", cancelLabel: "Cancelar", appStore: "Instalar desde App Store", playStore: "Instalar desde Google Play",
    notFoundTitle: "Esta conversación ya no se comparte", notFoundDescription: "El enlace pudo haber caducado, o el uso compartido se desactivó.",
  },
  pt: {
    invitedTemplate: "{name} convidou você para {room}", userFallback: "Usuário do Mingle", openInApp: "Ver no app Mingle", openInAppConfirmMessage: "Ver esta conversa no app Mingle?", cancelLabel: "Cancelar", appStore: "Instalar pela App Store", playStore: "Instalar pelo Google Play",
    notFoundTitle: "Esta conversa não está mais compartilhada", notFoundDescription: "O link pode ter expirado, ou o compartilhamento foi desativado.",
  },
  it: {
    invitedTemplate: "{name} ti ha invitato a {room}", userFallback: "Utente Mingle", openInApp: "Vedi nell’app Mingle", openInAppConfirmMessage: "Vedere questa conversazione nell’app Mingle?", cancelLabel: "Annulla", appStore: "Installa dall’App Store", playStore: "Installa da Google Play",
    notFoundTitle: "Questa conversazione non è più condivisa", notFoundDescription: "Il link potrebbe essere scaduto, oppure la condivisione è stata disattivata.",
  },
  ru: {
    invitedTemplate: "{name} пригласил вас в {room}", userFallback: "Пользователь Mingle", openInApp: "Смотреть в приложении Mingle", openInAppConfirmMessage: "Посмотреть этот разговор в приложении Mingle?", cancelLabel: "Отмена", appStore: "Установить из App Store", playStore: "Установить из Google Play",
    notFoundTitle: "Этот разговор больше не доступен по ссылке", notFoundDescription: "Ссылка могла устареть, либо общий доступ был отключён.",
  },
  ar: {
    invitedTemplate: "{name} دعاك إلى {room}", userFallback: "مستخدم Mingle", openInApp: "عرض في تطبيق Mingle", openInAppConfirmMessage: "عرض هذه المحادثة في تطبيق Mingle؟", cancelLabel: "إلغاء", appStore: "التثبيت من App Store", playStore: "التثبيت من Google Play",
    notFoundTitle: "لم تتم مشاركة هذه المحادثة بعد الآن", notFoundDescription: "قد تكون صلاحية الرابط انتهت، أو تم إيقاف المشاركة.",
  },
  hi: {
    invitedTemplate: "{name} ने आपको {room} में आमंत्रित किया", userFallback: "Mingle उपयोगकर्ता", openInApp: "Mingle ऐप में देखें", openInAppConfirmMessage: "इस बातचीत को Mingle ऐप में देखें?", cancelLabel: "रद्द करें", appStore: "App Store से इंस्टॉल करें", playStore: "Google Play से इंस्टॉल करें",
    notFoundTitle: "यह बातचीत अब शेयर नहीं की जा रही", notFoundDescription: "लिंक की अवधि समाप्त हो गई हो सकती है, या शेयरिंग बंद कर दी गई है।",
  },
  th: {
    invitedTemplate: "{name} เชิญคุณเข้าร่วม {room}", userFallback: "ผู้ใช้ Mingle", openInApp: "ดูในแอป Mingle", openInAppConfirmMessage: "ดูบทสนทนานี้ในแอป Mingle ไหม?", cancelLabel: "ยกเลิก", appStore: "ติดตั้งจาก App Store", playStore: "ติดตั้งจาก Google Play",
    notFoundTitle: "บทสนทนานี้ไม่ได้แชร์อีกต่อไป", notFoundDescription: "ลิงก์อาจหมดอายุแล้ว หรือปิดการแชร์ไปแล้ว",
  },
  vi: {
    invitedTemplate: "{name} đã mời bạn vào {room}", userFallback: "Người dùng Mingle", openInApp: "Xem trong ứng dụng Mingle", openInAppConfirmMessage: "Xem cuộc trò chuyện này trong ứng dụng Mingle?", cancelLabel: "Hủy", appStore: "Cài đặt từ App Store", playStore: "Cài đặt từ Google Play",
    notFoundTitle: "Cuộc trò chuyện này không còn được chia sẻ", notFoundDescription: "Liên kết có thể đã hết hạn, hoặc chia sẻ đã bị tắt.",
  },
};
