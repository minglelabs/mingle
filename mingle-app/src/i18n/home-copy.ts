import { resolvePrimaryUiLocaleTag, type PrimaryUiLocale } from "@/i18n/mingle-locales";

/** The reasons a ban notice can name. Only the category is shown, never details. */
export const BAN_NOTICE_CATEGORIES = ["harassment", "spam", "scam", "inappropriate", "impersonation", "other"] as const;
export type BanNoticeCategory = (typeof BAN_NOTICE_CATEGORIES)[number];

/**
 * Copy for the home tab (people cards), its notice strip and notice list, the
 * posts section of the explore tab, and the daily limit on starting chats
 * with new people. {count} is a number.
 */
export type HomeCopy = {
  /** Accessible name of the first bottom tab. */
  tabLabel: string;
  /** Card badge: seen in the last five minutes. */
  badgeOnline: string;
  empty: string;
  loadError: string;
  retry: string;
  signInPrompt: string;
  signIn: string;
  /** Strip on top of home: how many accounts were permanently banned this week. */
  banStrip: string;
  noticesTitle: string;
  noticesEmpty: string;
  /** Label in front of a ban notice row. */
  banLabel: string;
  banCategory: Record<BanNoticeCategory, string>;
  /** Shown when the free daily number of new people is used up. */
  dailyLimit: string;
  /** Accessible name of the "…" button on a profile. */
  more: string;
  /** Heading of the posts grid on the explore tab. */
  postsHeading: string;
  back: string;
};

const COPY: Record<PrimaryUiLocale, HomeCopy> = {
  ko: {
    tabLabel: "홈", badgeOnline: "접속 중", empty: "아직 보여 줄 사람이 없어요.", loadError: "불러오지 못했어요.", retry: "다시 시도",
    signInPrompt: "로그인하고 새로운 친구를 만나 보세요.", signIn: "로그인",
    banStrip: "이번 주 영구 퇴출 {count}명", noticesTitle: "공지", noticesEmpty: "아직 공지가 없어요.", banLabel: "영구 퇴출",
    banCategory: { harassment: "성희롱·괴롭힘", spam: "스팸·도배", scam: "사기", inappropriate: "부적절한 콘텐츠", impersonation: "사칭", other: "규칙 위반" },
    dailyLimit: "오늘은 새로운 사람 {count}명에게만 먼저 말을 걸 수 있어요. 내일 다시 시도해 주세요.",
    more: "더 보기", postsHeading: "게시물", back: "뒤로",
  },
  en: {
    tabLabel: "Home", badgeOnline: "Online", empty: "No one to show yet.", loadError: "Couldn't load.", retry: "Try again",
    signInPrompt: "Sign in to meet new friends.", signIn: "Sign in",
    banStrip: "{count} permanently banned this week", noticesTitle: "Notices", noticesEmpty: "No notices yet.", banLabel: "Permanent ban",
    banCategory: { harassment: "Harassment", spam: "Spam", scam: "Scam", inappropriate: "Inappropriate content", impersonation: "Impersonation", other: "Rule violation" },
    dailyLimit: "You can start chats with up to {count} new people a day. Please try again tomorrow.",
    more: "More", postsHeading: "Posts", back: "Back",
  },
  ja: {
    tabLabel: "ホーム", badgeOnline: "オンライン", empty: "まだ表示できる人がいません。", loadError: "読み込めませんでした。", retry: "もう一度",
    signInPrompt: "ログインして新しい友だちに出会いましょう。", signIn: "ログイン",
    banStrip: "今週の永久利用停止 {count}人", noticesTitle: "お知らせ", noticesEmpty: "まだお知らせはありません。", banLabel: "永久利用停止",
    banCategory: { harassment: "セクハラ・嫌がらせ", spam: "スパム", scam: "詐欺", inappropriate: "不適切なコンテンツ", impersonation: "なりすまし", other: "ルール違反" },
    dailyLimit: "新しい人に自分から話しかけられるのは1日{count}人までです。明日もう一度お試しください。",
    more: "その他", postsHeading: "投稿", back: "戻る",
  },
  "zh-CN": {
    tabLabel: "首页", badgeOnline: "在线", empty: "暂时没有可显示的人。", loadError: "加载失败。", retry: "重试",
    signInPrompt: "登录后认识新朋友。", signIn: "登录",
    banStrip: "本周永久封禁 {count} 人", noticesTitle: "公告", noticesEmpty: "暂无公告。", banLabel: "永久封禁",
    banCategory: { harassment: "性骚扰·骚扰", spam: "垃圾信息", scam: "诈骗", inappropriate: "不当内容", impersonation: "冒充他人", other: "违反规则" },
    dailyLimit: "每天只能主动和 {count} 位新朋友开始聊天，请明天再试。",
    more: "更多", postsHeading: "帖子", back: "返回",
  },
  "zh-TW": {
    tabLabel: "首頁", badgeOnline: "上線中", empty: "目前沒有可顯示的人。", loadError: "載入失敗。", retry: "重試",
    signInPrompt: "登入後認識新朋友。", signIn: "登入",
    banStrip: "本週永久停權 {count} 人", noticesTitle: "公告", noticesEmpty: "目前沒有公告。", banLabel: "永久停權",
    banCategory: { harassment: "性騷擾·騷擾", spam: "垃圾訊息", scam: "詐騙", inappropriate: "不當內容", impersonation: "冒充他人", other: "違反規則" },
    dailyLimit: "每天只能主動和 {count} 位新朋友開始聊天，請明天再試。",
    more: "更多", postsHeading: "貼文", back: "返回",
  },
  fr: {
    tabLabel: "Accueil", badgeOnline: "En ligne", empty: "Personne à afficher pour le moment.", loadError: "Chargement impossible.", retry: "Réessayer",
    signInPrompt: "Connectez-vous pour rencontrer de nouveaux amis.", signIn: "Se connecter",
    banStrip: "{count} bannis définitivement cette semaine", noticesTitle: "Annonces", noticesEmpty: "Aucune annonce pour le moment.", banLabel: "Bannissement définitif",
    banCategory: { harassment: "Harcèlement", spam: "Spam et messages répétés", scam: "Arnaque", inappropriate: "Contenu inapproprié", impersonation: "Usurpation d’identité", other: "Non-respect des règles" },
    dailyLimit: "Vous pouvez engager la conversation avec {count} nouvelle personne par jour. Réessayez demain.",
    more: "Plus", postsHeading: "Publications", back: "Retour",
  },
  de: {
    tabLabel: "Start", badgeOnline: "Jetzt online", empty: "Noch niemand zum Anzeigen.", loadError: "Laden fehlgeschlagen.", retry: "Erneut versuchen",
    signInPrompt: "Melde dich an, um neue Freunde zu treffen.", signIn: "Anmelden",
    banStrip: "{count} dauerhaft gesperrt diese Woche", noticesTitle: "Mitteilungen", noticesEmpty: "Noch keine Mitteilungen.", banLabel: "Dauerhafte Sperre",
    banCategory: { harassment: "Belästigung", spam: "Spam und Massennachrichten", scam: "Betrug", inappropriate: "Unangemessene Inhalte", impersonation: "Identitätsbetrug", other: "Regelverstoß" },
    dailyLimit: "Du kannst pro Tag {count} neue Person anschreiben. Versuche es morgen wieder.",
    more: "Mehr", postsHeading: "Beiträge", back: "Zurück",
  },
  es: {
    tabLabel: "Inicio", badgeOnline: "En línea", empty: "Aún no hay nadie que mostrar.", loadError: "No se pudo cargar.", retry: "Reintentar",
    signInPrompt: "Inicia sesión para conocer nuevos amigos.", signIn: "Iniciar sesión",
    banStrip: "{count} expulsados permanentemente esta semana", noticesTitle: "Avisos", noticesEmpty: "Aún no hay avisos.", banLabel: "Expulsión permanente",
    banCategory: { harassment: "Acoso", spam: "Spam y mensajes repetidos", scam: "Estafa", inappropriate: "Contenido inapropiado", impersonation: "Suplantación", other: "Incumplimiento de normas" },
    dailyLimit: "Puedes iniciar un chat con {count} persona nueva al día. Inténtalo mañana.",
    more: "Más", postsHeading: "Publicaciones", back: "Atrás",
  },
  pt: {
    tabLabel: "Início", badgeOnline: "Online agora", empty: "Ainda não há ninguém para mostrar.", loadError: "Não foi possível carregar.", retry: "Tentar de novo",
    signInPrompt: "Entre para conhecer novos amigos.", signIn: "Entrar",
    banStrip: "{count} banidos permanentemente nesta semana", noticesTitle: "Avisos", noticesEmpty: "Ainda não há avisos.", banLabel: "Banimento permanente",
    banCategory: { harassment: "Assédio", spam: "Spam e mensagens repetidas", scam: "Golpe", inappropriate: "Conteúdo impróprio", impersonation: "Falsa identidade", other: "Violação das regras" },
    dailyLimit: "Você pode iniciar conversa com {count} pessoa nova por dia. Tente de novo amanhã.",
    more: "Mais", postsHeading: "Publicações", back: "Voltar",
  },
  it: {
    tabLabel: "Principale", badgeOnline: "Online ora", empty: "Ancora nessuno da mostrare.", loadError: "Caricamento non riuscito.", retry: "Riprova",
    signInPrompt: "Accedi per conoscere nuovi amici.", signIn: "Accedi",
    banStrip: "{count} banditi in modo permanente questa settimana", noticesTitle: "Avvisi", noticesEmpty: "Ancora nessun avviso.", banLabel: "Ban permanente",
    banCategory: { harassment: "Molestie", spam: "Spam e messaggi ripetuti", scam: "Truffa", inappropriate: "Contenuti inappropriati", impersonation: "Furto d’identità", other: "Violazione delle regole" },
    dailyLimit: "Puoi iniziare una chat con {count} persona nuova al giorno. Riprova domani.",
    more: "Altro", postsHeading: "Post", back: "Indietro",
  },
  ru: {
    tabLabel: "Главная", badgeOnline: "В сети", empty: "Пока некого показать.", loadError: "Не удалось загрузить.", retry: "Повторить",
    signInPrompt: "Войдите, чтобы найти новых друзей.", signIn: "Войти",
    banStrip: "Заблокировано навсегда за неделю: {count}", noticesTitle: "Объявления", noticesEmpty: "Объявлений пока нет.", banLabel: "Блокировка навсегда",
    banCategory: { harassment: "Домогательства", spam: "Спам", scam: "Мошенничество", inappropriate: "Неприемлемый контент", impersonation: "Выдача себя за другого", other: "Нарушение правил" },
    dailyLimit: "В день можно первым написать только {count} новому человеку. Попробуйте завтра.",
    more: "Ещё", postsHeading: "Посты", back: "Назад",
  },
  ar: {
    tabLabel: "الرئيسية", badgeOnline: "متصل الآن", empty: "لا يوجد أحد لعرضه بعد.", loadError: "تعذّر التحميل.", retry: "أعد المحاولة",
    signInPrompt: "سجّل الدخول لتتعرّف على أصدقاء جدد.", signIn: "تسجيل الدخول",
    banStrip: "المحظورون نهائيًا هذا الأسبوع: {count}", noticesTitle: "الإعلانات", noticesEmpty: "لا توجد إعلانات بعد.", banLabel: "حظر نهائي",
    banCategory: { harassment: "تحرّش ومضايقة", spam: "رسائل مزعجة", scam: "احتيال", inappropriate: "محتوى غير لائق", impersonation: "انتحال شخصية", other: "مخالفة القواعد" },
    dailyLimit: "يمكنك بدء محادثة مع {count} شخص جديد في اليوم. حاول مجددًا غدًا.",
    more: "المزيد", postsHeading: "المنشورات", back: "رجوع",
  },
  hi: {
    tabLabel: "होम", badgeOnline: "ऑनलाइन", empty: "अभी दिखाने के लिए कोई नहीं है।", loadError: "लोड नहीं हो सका।", retry: "फिर कोशिश करें",
    signInPrompt: "नए दोस्तों से मिलने के लिए साइन इन करें।", signIn: "साइन इन",
    banStrip: "इस हफ़्ते हमेशा के लिए बैन: {count}", noticesTitle: "सूचनाएँ", noticesEmpty: "अभी कोई सूचना नहीं है।", banLabel: "स्थायी बैन",
    banCategory: { harassment: "उत्पीड़न", spam: "स्पैम", scam: "धोखाधड़ी", inappropriate: "अनुचित सामग्री", impersonation: "किसी और का रूप धरना", other: "नियम तोड़ना" },
    dailyLimit: "आप दिन में {count} नए व्यक्ति से ही खुद चैट शुरू कर सकते हैं। कल फिर कोशिश करें।",
    more: "और", postsHeading: "पोस्ट", back: "वापस",
  },
  th: {
    tabLabel: "หน้าแรก", badgeOnline: "ออนไลน์", empty: "ยังไม่มีใครให้แสดง", loadError: "โหลดไม่สำเร็จ", retry: "ลองอีกครั้ง",
    signInPrompt: "เข้าสู่ระบบเพื่อพบเพื่อนใหม่", signIn: "เข้าสู่ระบบ",
    banStrip: "สัปดาห์นี้แบนถาวร {count} คน", noticesTitle: "ประกาศ", noticesEmpty: "ยังไม่มีประกาศ", banLabel: "แบนถาวร",
    banCategory: { harassment: "คุกคาม", spam: "สแปม", scam: "หลอกลวง", inappropriate: "เนื้อหาไม่เหมาะสม", impersonation: "แอบอ้างเป็นผู้อื่น", other: "ทำผิดกฎ" },
    dailyLimit: "คุณเริ่มแชตกับคนใหม่ได้วันละ {count} คน ลองใหม่พรุ่งนี้",
    more: "เพิ่มเติม", postsHeading: "โพสต์", back: "กลับ",
  },
  vi: {
    tabLabel: "Trang chủ", badgeOnline: "Đang online", empty: "Chưa có ai để hiển thị.", loadError: "Không tải được.", retry: "Thử lại",
    signInPrompt: "Đăng nhập để gặp bạn mới.", signIn: "Đăng nhập",
    banStrip: "Tuần này cấm vĩnh viễn {count} người", noticesTitle: "Thông báo", noticesEmpty: "Chưa có thông báo.", banLabel: "Cấm vĩnh viễn",
    banCategory: { harassment: "Quấy rối", spam: "Spam, tin lặp lại", scam: "Lừa đảo", inappropriate: "Nội dung không phù hợp", impersonation: "Mạo danh", other: "Vi phạm quy tắc" },
    dailyLimit: "Mỗi ngày bạn chỉ có thể chủ động trò chuyện với {count} người mới. Hãy thử lại vào ngày mai.",
    more: "Thêm", postsHeading: "Bài đăng", back: "Quay lại",
  },
};

export const HOME_COPY_LOCALES = Object.keys(COPY);

export function resolveHomeCopy(rawLocale: string): HomeCopy {
  const locale = resolvePrimaryUiLocaleTag(rawLocale) ?? "en";
  return COPY[locale] ?? COPY.en;
}

export function fillHomeCount(template: string, count: number): string {
  return template.replace("{count}", String(count));
}
