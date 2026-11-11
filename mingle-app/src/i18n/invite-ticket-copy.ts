import { resolvePrimaryUiLocaleTag, type PrimaryUiLocale } from "@/i18n/mingle-locales";

// Copy for invite tickets: the sheet where a user copies their ticket, the
// public landing page (/i/{code}) and the toast after joining through one.
// {name} is the inviter, {coins} the join reward.
export type InviteTicketCopy = {
  /** Entry button: empty conversation list, friend picker. */
  sendTicket: string;
  ticketTitle: string;
  /** On the ticket in the sender's sheet. */
  ticketFrom: string;
  ticketBenefit: string;
  copyTicket: string;
  ticketCopied: string;
  share: string;
  /** Landing page. */
  landingHeadline: string;
  landingBody: string;
  landingReward: string;
  install: string;
  openApp: string;
  codeHint: string;
  invalidTitle: string;
  invalidBody: string;
  /** Toast after the invite opened the room. */
  joinedToast: string;
  userFallback: string;
  /** What the sender pastes into a messenger, written in the first person. The link is added after it. */
  message: string;
};

const INVITE_TICKET_COPY_BY_LOCALE: Record<PrimaryUiLocale, InviteTicketCopy> = {
  ko: {
    sendTicket: "친구에게 초대권 보내기", ticketTitle: "HashChat 초대권", ticketFrom: "{name}님이 보내는 초대권",
    ticketBenefit: "친구가 링크로 들어오면 둘만의 대화방이 바로 열리고, 서로 {coins}해씨를 받아요.",
    copyTicket: "초대권 복사", ticketCopied: "초대권을 복사했어요. 메신저에 붙여넣어 보내세요.", share: "공유하기",
    landingHeadline: "{name}님이 HashChat 초대권을 보냈어요",
    landingBody: "각자 자기 말로 얘기해도 바로 통역돼요. 설치하면 {name}님과의 대화방이 바로 열려요.",
    landingReward: "초대권으로 가입하면 {coins}해씨를 드려요",
    install: "설치하고 초대 받기", openApp: "이미 설치했어요 · 앱에서 열기",
    codeHint: "앱에서 초대 코드를 물으면 이 코드를 입력하세요",
    invalidTitle: "사용할 수 없는 초대권이에요", invalidBody: "링크를 다시 확인하거나 친구에게 새 초대권을 부탁해 보세요.",
    joinedToast: "{name}님의 초대권으로 들어왔어요", userFallback: "HashChat 친구",
    message: "HashChat에서 같이 얘기하자! 🎟️ 내 초대권이야. 각자 자기 말로 써도 바로 번역돼.",
  },
  en: {
    sendTicket: "Send a friend an invite ticket", ticketTitle: "HashChat invite ticket", ticketFrom: "An invite ticket from {name}",
    ticketBenefit: "When your friend opens the link, a room for the two of you opens right away and you both get {coins} Hash.",
    copyTicket: "Copy ticket", ticketCopied: "Ticket copied. Paste it into a chat to send it.", share: "Share",
    landingHeadline: "{name} sent you a HashChat invite ticket",
    landingBody: "Each of you talks in your own language and it's interpreted on the spot. Install the app and your room with {name} opens right away.",
    landingReward: "Join with this ticket and get {coins} Hash",
    install: "Install and accept", openApp: "Already installed · Open in app",
    codeHint: "If the app asks for an invite code, enter this one",
    invalidTitle: "This invite ticket can't be used", invalidBody: "Check the link again or ask your friend for a new ticket.",
    joinedToast: "You joined with {name}'s invite ticket", userFallback: "A HashChat friend",
    message: "Let's talk on HashChat! 🎟️ Here's my invite ticket. We each write in our own language and it's translated right away.",
  },
  ja: {
    sendTicket: "友だちに招待券を送る", ticketTitle: "HashChat 招待券", ticketFrom: "{name}さんからの招待券",
    ticketBenefit: "友だちがリンクから入ると2人のトークルームがすぐ開いて、お互いに{coins}ハッシュがもらえます。",
    copyTicket: "招待券をコピー", ticketCopied: "招待券をコピーしました。トークに貼り付けて送ってください。", share: "シェアする",
    landingHeadline: "{name}さんからHashChatの招待券が届きました",
    landingBody: "お互い自分の言葉で話しても、その場で通訳されます。インストールすると{name}さんとのトークルームがすぐ開きます。",
    landingReward: "招待券で登録すると{coins}ハッシュをプレゼント",
    install: "インストールして招待を受ける", openApp: "インストール済みの方 · アプリで開く",
    codeHint: "アプリで招待コードを聞かれたら、このコードを入力してください",
    invalidTitle: "この招待券は使えません", invalidBody: "リンクをもう一度確認するか、友だちに新しい招待券を送ってもらってください。",
    joinedToast: "{name}さんの招待券で参加しました", userFallback: "HashChatの友だち",
    message: "HashChatで話そう!🎟️ 招待券を送るね。お互い自分の言葉で書いてもすぐ翻訳されるよ。",
  },
  "zh-CN": {
    sendTicket: "给好友发送邀请券", ticketTitle: "HashChat 邀请券", ticketFrom: "来自 {name} 的邀请券",
    ticketBenefit: "好友通过链接进入后，你们两人的聊天室会立即打开，双方各得 {coins} 哈希。",
    copyTicket: "复制邀请券", ticketCopied: "已复制邀请券，粘贴到聊天中发送吧。", share: "分享",
    landingHeadline: "{name} 给你发来了 HashChat 邀请券",
    landingBody: "各说各的语言也能即时翻译。安装后会立即打开你和 {name} 的聊天室。",
    landingReward: "使用邀请券注册可获得 {coins} 哈希",
    install: "安装并接受邀请", openApp: "已安装 · 在应用中打开",
    codeHint: "如果应用询问邀请码，请输入此邀请码",
    invalidTitle: "此邀请券无法使用", invalidBody: "请再次确认链接，或请好友重新发送邀请券。",
    joinedToast: "已通过 {name} 的邀请券加入", userFallback: "HashChat 好友",
    message: "来 HashChat 聊天吧！🎟️ 这是我的邀请券。各自用自己的语言写，也会马上翻译。",
  },
  "zh-TW": {
    sendTicket: "傳送邀請券給好友", ticketTitle: "HashChat 邀請券", ticketFrom: "來自 {name} 的邀請券",
    ticketBenefit: "好友透過連結進入後，你們兩人的聊天室會立即開啟，雙方各得 {coins} 哈希。",
    copyTicket: "複製邀請券", ticketCopied: "已複製邀請券，貼到聊天中傳送吧。", share: "分享",
    landingHeadline: "{name} 傳了 HashChat 邀請券給你",
    landingBody: "各說各的語言也能即時翻譯。安裝後會立即開啟你和 {name} 的聊天室。",
    landingReward: "使用邀請券註冊可獲得 {coins} 哈希",
    install: "安裝並接受邀請", openApp: "已安裝 · 在 App 中開啟",
    codeHint: "如果 App 詢問邀請碼，請輸入這組邀請碼",
    invalidTitle: "這張邀請券無法使用", invalidBody: "請再確認連結，或請好友重新傳送邀請券。",
    joinedToast: "已透過 {name} 的邀請券加入", userFallback: "HashChat 好友",
    message: "來 HashChat 聊天吧！🎟️ 這是我的邀請券。各自用自己的語言寫，也會馬上翻譯。",
  },
  fr: {
    sendTicket: "Envoyer un ticket d'invitation à un ami", ticketTitle: "Ticket d'invitation HashChat", ticketFrom: "Un ticket d'invitation de {name}",
    ticketBenefit: "Quand votre ami ouvre le lien, votre salon à deux s'ouvre aussitôt et vous recevez chacun {coins} Hash.",
    copyTicket: "Copier le ticket", ticketCopied: "Ticket copié. Collez-le dans une conversation pour l'envoyer.", share: "Partager",
    landingHeadline: "{name} vous a envoyé un ticket d'invitation HashChat",
    landingBody: "Chacun parle dans sa langue et tout est interprété sur-le-champ. Installez l'app et votre salon avec {name} s'ouvre aussitôt.",
    landingReward: "Inscrivez-vous avec ce ticket et recevez {coins} Hash",
    install: "Installer et accepter", openApp: "Déjà installée · Ouvrir dans l'app",
    codeHint: "Si l'app demande un code d'invitation, saisissez celui-ci",
    invalidTitle: "Ce ticket d'invitation est inutilisable", invalidBody: "Vérifiez le lien ou demandez un nouveau ticket à votre ami.",
    joinedToast: "Vous avez rejoint avec le ticket de {name}", userFallback: "Un ami HashChat",
    message: "On discute sur HashChat ? 🎟️ Voici mon ticket d'invitation. Chacun écrit dans sa langue et c'est traduit aussitôt.",
  },
  de: {
    sendTicket: "Einladungsticket an einen Freund senden", ticketTitle: "HashChat-Einladungsticket", ticketFrom: "Ein Einladungsticket von {name}",
    ticketBenefit: "Öffnet dein Freund den Link, geht euer Raum zu zweit sofort auf und ihr bekommt beide {coins} Hash.",
    copyTicket: "Ticket kopieren", ticketCopied: "Ticket kopiert. Füge es in einen Chat ein, um es zu senden.", share: "Teilen",
    landingHeadline: "{name} hat dir ein HashChat-Einladungsticket geschickt",
    landingBody: "Jeder spricht in seiner Sprache und es wird sofort gedolmetscht. Installiere die App und euer Raum mit {name} geht sofort auf.",
    landingReward: "Mit diesem Ticket registrieren und {coins} Hash erhalten",
    install: "Installieren und annehmen", openApp: "Schon installiert · In der App öffnen",
    codeHint: "Fragt die App nach einem Einladungscode, gib diesen ein",
    invalidTitle: "Dieses Einladungsticket ist nicht nutzbar", invalidBody: "Prüfe den Link oder bitte deinen Freund um ein neues Ticket.",
    joinedToast: "Du bist mit dem Ticket von {name} beigetreten", userFallback: "Ein HashChat-Freund",
    message: "Lass uns auf HashChat reden! 🎟️ Hier ist mein Einladungsticket. Jeder schreibt in seiner Sprache und es wird sofort übersetzt.",
  },
  es: {
    sendTicket: "Enviar un ticket de invitación a un amigo", ticketTitle: "Ticket de invitación de HashChat", ticketFrom: "Un ticket de invitación de {name}",
    ticketBenefit: "Cuando tu amigo abra el enlace, vuestra sala se abrirá al instante y ambos recibiréis {coins} Hash.",
    copyTicket: "Copiar ticket", ticketCopied: "Ticket copiado. Pégalo en un chat para enviarlo.", share: "Compartir",
    landingHeadline: "{name} te ha enviado un ticket de invitación de HashChat",
    landingBody: "Cada uno habla en su idioma y se interpreta al momento. Instala la app y tu sala con {name} se abrirá al instante.",
    landingReward: "Regístrate con este ticket y recibe {coins} Hash",
    install: "Instalar y aceptar", openApp: "Ya la tengo · Abrir en la app",
    codeHint: "Si la app te pide un código de invitación, introduce este",
    invalidTitle: "Este ticket de invitación no se puede usar", invalidBody: "Revisa el enlace o pide a tu amigo un ticket nuevo.",
    joinedToast: "Has entrado con el ticket de {name}", userFallback: "Un amigo de HashChat",
    message: "¡Hablemos en HashChat! 🎟️ Aquí tienes mi ticket de invitación. Cada uno escribe en su idioma y se traduce al momento.",
  },
  pt: {
    sendTicket: "Enviar um ingresso de convite a um amigo", ticketTitle: "Ingresso de convite do HashChat", ticketFrom: "Um ingresso de convite de {name}",
    ticketBenefit: "Quando seu amigo abrir o link, a sala de vocês dois abre na hora e ambos ganham {coins} Hash.",
    copyTicket: "Copiar ingresso", ticketCopied: "Ingresso copiado. Cole em uma conversa para enviar.", share: "Compartilhar",
    landingHeadline: "{name} enviou um ingresso de convite do HashChat para você",
    landingBody: "Cada um fala no seu idioma e tudo é interpretado na hora. Instale o app e sua sala com {name} abre na hora.",
    landingReward: "Cadastre-se com este ingresso e ganhe {coins} Hash",
    install: "Instalar e aceitar", openApp: "Já instalei · Abrir no app",
    codeHint: "Se o app pedir um código de convite, digite este",
    invalidTitle: "Este ingresso de convite não pode ser usado", invalidBody: "Confira o link ou peça um novo ingresso ao seu amigo.",
    joinedToast: "Você entrou com o ingresso de {name}", userFallback: "Um amigo do HashChat",
    message: "Vamos conversar no HashChat! 🎟️ Aqui está meu ingresso de convite. Cada um escreve no seu idioma e é traduzido na hora.",
  },
  it: {
    sendTicket: "Invia un biglietto d'invito a un amico", ticketTitle: "Biglietto d'invito HashChat", ticketFrom: "Un biglietto d'invito da {name}",
    ticketBenefit: "Quando il tuo amico apre il link, la vostra stanza si apre subito e ricevete entrambi {coins} Hash.",
    copyTicket: "Copia biglietto", ticketCopied: "Biglietto copiato. Incollalo in una chat per inviarlo.", share: "Condividi",
    landingHeadline: "{name} ti ha inviato un biglietto d'invito HashChat",
    landingBody: "Ognuno parla nella propria lingua e tutto viene interpretato all'istante. Installa l'app e la tua stanza con {name} si apre subito.",
    landingReward: "Registrati con questo biglietto e ricevi {coins} Hash",
    install: "Installa e accetta", openApp: "Già installata · Apri nell'app",
    codeHint: "Se l'app chiede un codice invito, inserisci questo",
    invalidTitle: "Questo biglietto d'invito non è utilizzabile", invalidBody: "Controlla il link o chiedi al tuo amico un nuovo biglietto.",
    joinedToast: "Sei entrato con il biglietto di {name}", userFallback: "Un amico di HashChat",
    message: "Parliamo su HashChat! 🎟️ Ecco il mio biglietto d'invito. Ognuno scrive nella propria lingua e viene tradotto subito.",
  },
  ru: {
    sendTicket: "Отправить другу пригласительный билет", ticketTitle: "Пригласительный билет HashChat", ticketFrom: "Пригласительный билет от {name}",
    ticketBenefit: "Когда друг откроет ссылку, сразу откроется ваш чат на двоих, и вы оба получите {coins} Хэш.",
    copyTicket: "Скопировать билет", ticketCopied: "Билет скопирован. Вставьте его в чат и отправьте.", share: "Поделиться",
    landingHeadline: "{name} прислал(а) вам пригласительный билет HashChat",
    landingBody: "Каждый говорит на своём языке, а перевод идёт сразу. Установите приложение — и чат с {name} откроется сразу.",
    landingReward: "Зарегистрируйтесь по билету и получите {coins} Хэш",
    install: "Установить и принять", openApp: "Уже установлено · Открыть в приложении",
    codeHint: "Если приложение спросит код приглашения, введите этот",
    invalidTitle: "Этот пригласительный билет недействителен", invalidBody: "Проверьте ссылку или попросите у друга новый билет.",
    joinedToast: "Вы вошли по билету от {name}", userFallback: "Друг из HashChat",
    message: "Давай общаться в HashChat! 🎟️ Вот мой пригласительный билет. Каждый пишет на своём языке, и всё сразу переводится.",
  },
  ar: {
    sendTicket: "أرسل تذكرة دعوة إلى صديق", ticketTitle: "تذكرة دعوة HashChat", ticketFrom: "تذكرة دعوة من {name}",
    ticketBenefit: "عندما يفتح صديقك الرابط تُفتح غرفتكما فورًا ويحصل كلٌّ منكما على {coins} هاش.",
    copyTicket: "نسخ التذكرة", ticketCopied: "تم نسخ التذكرة. الصقها في محادثة لإرسالها.", share: "مشاركة",
    landingHeadline: "أرسل لك {name} تذكرة دعوة إلى HashChat",
    landingBody: "يتحدث كلٌّ منكما بلغته وتُترجم المحادثة فورًا. ثبّت التطبيق وستُفتح غرفتك مع {name} فورًا.",
    landingReward: "سجّل بهذه التذكرة واحصل على {coins} هاش",
    install: "ثبّت واقبل الدعوة", openApp: "مثبّت بالفعل · افتح في التطبيق",
    codeHint: "إذا طلب التطبيق رمز دعوة فأدخل هذا الرمز",
    invalidTitle: "لا يمكن استخدام تذكرة الدعوة هذه", invalidBody: "تحقق من الرابط أو اطلب من صديقك تذكرة جديدة.",
    joinedToast: "انضممت بتذكرة دعوة {name}", userFallback: "صديق على HashChat",
    message: "لنتحدث على HashChat! 🎟️ هذه تذكرة دعوتي. يكتب كلٌّ منا بلغته وتُترجم الرسائل فورًا.",
  },
  hi: {
    sendTicket: "दोस्त को आमंत्रण टिकट भेजें", ticketTitle: "HashChat आमंत्रण टिकट", ticketFrom: "{name} की ओर से आमंत्रण टिकट",
    ticketBenefit: "जब आपका दोस्त लिंक खोलेगा, आप दोनों का रूम तुरंत खुल जाएगा और दोनों को {coins} हैश मिलेंगे।",
    copyTicket: "टिकट कॉपी करें", ticketCopied: "टिकट कॉपी हो गया। भेजने के लिए इसे चैट में पेस्ट करें।", share: "शेयर करें",
    landingHeadline: "{name} ने आपको HashChat का आमंत्रण टिकट भेजा है",
    landingBody: "दोनों अपनी-अपनी भाषा में बात करें, अनुवाद तुरंत होता है। ऐप इंस्टॉल करें और {name} के साथ आपका रूम तुरंत खुल जाएगा।",
    landingReward: "इस टिकट से साइन अप करें और {coins} हैश पाएँ",
    install: "इंस्टॉल करें और स्वीकार करें", openApp: "पहले से इंस्टॉल है · ऐप में खोलें",
    codeHint: "अगर ऐप आमंत्रण कोड पूछे, तो यह कोड डालें",
    invalidTitle: "यह आमंत्रण टिकट इस्तेमाल नहीं हो सकता", invalidBody: "लिंक दोबारा जाँचें या अपने दोस्त से नया टिकट माँगें।",
    joinedToast: "आप {name} के आमंत्रण टिकट से जुड़े", userFallback: "HashChat दोस्त",
    message: "चलो HashChat पर बात करें! 🎟️ यह रहा मेरा आमंत्रण टिकट। दोनों अपनी भाषा में लिखें, तुरंत अनुवाद हो जाता है।",
  },
  th: {
    sendTicket: "ส่งบัตรเชิญให้เพื่อน", ticketTitle: "บัตรเชิญ HashChat", ticketFrom: "บัตรเชิญจาก {name}",
    ticketBenefit: "เมื่อเพื่อนเปิดลิงก์ ห้องแชทของคุณสองคนจะเปิดทันที และทั้งคู่ได้รับ {coins} แฮช",
    copyTicket: "คัดลอกบัตรเชิญ", ticketCopied: "คัดลอกบัตรเชิญแล้ว วางในแชทเพื่อส่งได้เลย", share: "แชร์",
    landingHeadline: "{name} ส่งบัตรเชิญ HashChat ให้คุณ",
    landingBody: "ต่างคนต่างพูดภาษาของตัวเองก็แปลให้ทันที ติดตั้งแอปแล้วห้องแชทกับ {name} จะเปิดทันที",
    landingReward: "สมัครด้วยบัตรเชิญนี้ รับ {coins} แฮช",
    install: "ติดตั้งและรับคำเชิญ", openApp: "ติดตั้งแล้ว · เปิดในแอป",
    codeHint: "ถ้าแอปถามรหัสเชิญ ให้กรอกรหัสนี้",
    invalidTitle: "บัตรเชิญนี้ใช้ไม่ได้", invalidBody: "ตรวจสอบลิงก์อีกครั้ง หรือขอบัตรเชิญใหม่จากเพื่อน",
    joinedToast: "คุณเข้าร่วมด้วยบัตรเชิญของ {name}", userFallback: "เพื่อนใน HashChat",
    message: "มาคุยกันใน HashChat นะ! 🎟️ นี่บัตรเชิญของฉัน ต่างคนต่างพิมพ์ภาษาตัวเองก็แปลให้ทันที",
  },
  vi: {
    sendTicket: "Gửi vé mời cho bạn bè", ticketTitle: "Vé mời HashChat", ticketFrom: "Vé mời từ {name}",
    ticketBenefit: "Khi bạn của bạn mở liên kết, phòng trò chuyện của hai người mở ngay và cả hai cùng nhận {coins} Hash.",
    copyTicket: "Sao chép vé mời", ticketCopied: "Đã sao chép vé mời. Dán vào cuộc trò chuyện để gửi.", share: "Chia sẻ",
    landingHeadline: "{name} đã gửi cho bạn vé mời HashChat",
    landingBody: "Mỗi người nói tiếng của mình và được phiên dịch ngay. Cài ứng dụng là phòng trò chuyện với {name} mở ngay.",
    landingReward: "Đăng ký bằng vé mời này để nhận {coins} Hash",
    install: "Cài đặt và nhận lời mời", openApp: "Đã cài đặt · Mở trong ứng dụng",
    codeHint: "Nếu ứng dụng hỏi mã mời, hãy nhập mã này",
    invalidTitle: "Không dùng được vé mời này", invalidBody: "Hãy kiểm tra lại liên kết hoặc nhờ bạn gửi vé mời mới.",
    joinedToast: "Bạn đã tham gia bằng vé mời của {name}", userFallback: "Một người bạn HashChat",
    message: "Nói chuyện trên HashChat nhé! 🎟️ Đây là vé mời của mình. Mỗi người viết tiếng của mình và được dịch ngay.",
  },
};

export const INVITE_TICKET_COPY_LOCALES = Object.keys(INVITE_TICKET_COPY_BY_LOCALE);

export function resolveInviteTicketCopy(rawLocale: string): InviteTicketCopy {
  const locale = resolvePrimaryUiLocaleTag(rawLocale) ?? "en";
  return INVITE_TICKET_COPY_BY_LOCALE[locale] ?? INVITE_TICKET_COPY_BY_LOCALE.en;
}

export function fillInviteTicketCopy(template: string, input: { name?: string; coins?: number }): string {
  return template
    .replaceAll("{name}", input.name ?? "")
    .replaceAll("{coins}", (input.coins ?? 0).toLocaleString("en-US"));
}

/**
 * Which languages the pasted message is written in. The main target is a
 * Korean-Japanese pair, so each of those writes the partner's language first;
 * everyone else writes their own language, then English.
 */
export function resolveInviteTicketMessageLocales(rawLocale: string): PrimaryUiLocale[] {
  const locale = resolvePrimaryUiLocaleTag(rawLocale) ?? "en";
  if (locale === "ko") return ["ja", "ko"];
  if (locale === "ja") return ["ko", "ja"];
  return locale === "en" ? ["en"] : [locale, "en"];
}

/** The text copied for a messenger: one short line per language, then the link. */
export function buildInviteTicketMessage(rawLocale: string, link: string): string {
  return [
    ...resolveInviteTicketMessageLocales(rawLocale).map((locale) => INVITE_TICKET_COPY_BY_LOCALE[locale].message),
    link,
  ].join("\n");
}

/** Landing-page language from Accept-Language; Japanese when the browser names none we support. */
export function resolveInviteLandingLocale(acceptLanguage: string | null | undefined): PrimaryUiLocale {
  const tags = (acceptLanguage ?? "")
    .split(",")
    .map((part, index) => {
      const [tag, ...params] = part.trim().split(";");
      const quality = Number(params.find((param) => param.trim().startsWith("q="))?.trim().slice(2) ?? "1");
      return { tag: tag.trim(), quality: Number.isFinite(quality) ? quality : 0, index };
    })
    .filter((entry) => entry.tag && entry.tag !== "*" && entry.quality > 0)
    .sort((left, right) => right.quality - left.quality || left.index - right.index);
  for (const { tag } of tags) {
    const locale = resolvePrimaryUiLocaleTag(tag);
    if (locale) return locale;
  }
  return "ja";
}
