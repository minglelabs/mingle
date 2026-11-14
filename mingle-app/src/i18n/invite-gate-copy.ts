import { resolvePrimaryUiLocaleTag, type PrimaryUiLocale } from "@/i18n/mingle-locales";

/** The invite gate after sign-in (see @/server/app-access). */
export type InviteGateCopy = {
  title: string;
  body: string;
  placeholder: string;
  submit: string;
  signOut: string;
  errorNotFound: string;
  errorOwn: string;
  errorGeneric: string;
} & InviteWaitlistCopy;

/** The waitlist part of the gate: no invite code, so verify a phone and wait for an admin to let you in. */
export type InviteWaitlistCopy = {
  waitlistDivider: string;
  waitlistJoin: string;
  waitlistHint: string;
  waitlistedTitle: string;
  waitlistedBody: string;
  waitlistCheck: string;
};

const WAITLIST_COPY: Record<PrimaryUiLocale, InviteWaitlistCopy> = {
  ko: { waitlistDivider: "초대 코드가 없나요?", waitlistJoin: "대기 명단에 올리기", waitlistHint: "전화번호를 인증하면 대기 명단에 올라가요. 차례가 되면 들어올 수 있어요.", waitlistedTitle: "대기 명단에 올라갔어요", waitlistedBody: "차례가 되면 바로 쓸 수 있어요. 그 전에 친구에게 초대 코드를 받으면 위에 넣어 주세요.", waitlistCheck: "내 차례인지 확인하기" },
  en: { waitlistDivider: "No invite code?", waitlistJoin: "Join the waitlist", waitlistHint: "Verify your phone number to join the waitlist. You can come in when it's your turn.", waitlistedTitle: "You're on the waitlist", waitlistedBody: "You can start as soon as it's your turn. If a friend gives you an invite code before then, enter it above.", waitlistCheck: "Check if it's my turn" },
  ja: { waitlistDivider: "招待コードがない場合", waitlistJoin: "ウェイトリストに登録", waitlistHint: "電話番号を認証するとウェイトリストに登録されます。順番が来たら入れます。", waitlistedTitle: "ウェイトリストに登録しました", waitlistedBody: "順番が来たらすぐに使えます。それまでに友だちから招待コードをもらったら、上に入力してください。", waitlistCheck: "順番が来たか確認する" },
  "zh-CN": { waitlistDivider: "没有邀请码？", waitlistJoin: "加入候补名单", waitlistHint: "验证手机号即可加入候补名单，轮到你时就能进入。", waitlistedTitle: "已加入候补名单", waitlistedBody: "轮到你时就能马上使用。在此之前如果朋友给了你邀请码，请在上方输入。", waitlistCheck: "查看是否轮到我" },
  "zh-TW": { waitlistDivider: "沒有邀請碼？", waitlistJoin: "加入候補名單", waitlistHint: "驗證手機號碼即可加入候補名單，輪到你時就能進入。", waitlistedTitle: "已加入候補名單", waitlistedBody: "輪到你時就能馬上使用。在此之前如果朋友給了你邀請碼，請在上方輸入。", waitlistCheck: "查看是否輪到我" },
  fr: { waitlistDivider: "Pas de code d’invitation ?", waitlistJoin: "Rejoindre la liste d’attente", waitlistHint: "Vérifiez votre numéro de téléphone pour rejoindre la liste d’attente. Vous pourrez entrer quand ce sera votre tour.", waitlistedTitle: "Vous êtes sur la liste d’attente", waitlistedBody: "Vous pourrez commencer dès que ce sera votre tour. Si un ami vous donne un code avant, saisissez-le ci-dessus.", waitlistCheck: "Vérifier si c’est mon tour" },
  de: { waitlistDivider: "Kein Einladungscode?", waitlistJoin: "Auf die Warteliste", waitlistHint: "Bestätige deine Telefonnummer, um auf die Warteliste zu kommen. Wenn du dran bist, kannst du rein.", waitlistedTitle: "Du stehst auf der Warteliste", waitlistedBody: "Sobald du dran bist, kannst du loslegen. Bekommst du vorher einen Code von Freunden, gib ihn oben ein.", waitlistCheck: "Prüfen, ob ich dran bin" },
  es: { waitlistDivider: "¿No tienes código de invitación?", waitlistJoin: "Unirme a la lista de espera", waitlistHint: "Verifica tu número de teléfono para unirte a la lista de espera. Podrás entrar cuando sea tu turno.", waitlistedTitle: "Estás en la lista de espera", waitlistedBody: "Podrás empezar en cuanto sea tu turno. Si antes un amigo te da un código, escríbelo arriba.", waitlistCheck: "Ver si ya es mi turno" },
  pt: { waitlistDivider: "Não tem código de convite?", waitlistJoin: "Entrar na lista de espera", waitlistHint: "Verifique seu número de telefone para entrar na lista de espera. Você entra quando chegar a sua vez.", waitlistedTitle: "Você está na lista de espera", waitlistedBody: "Você pode começar assim que chegar a sua vez. Se um amigo te der um código antes, digite-o acima.", waitlistCheck: "Ver se já é a minha vez" },
  it: { waitlistDivider: "Non hai un codice d’invito?", waitlistJoin: "Entra in lista d’attesa", waitlistHint: "Verifica il tuo numero di telefono per entrare in lista d’attesa. Potrai entrare quando sarà il tuo turno.", waitlistedTitle: "Sei in lista d’attesa", waitlistedBody: "Potrai iniziare appena sarà il tuo turno. Se prima un amico ti dà un codice, inseriscilo qui sopra.", waitlistCheck: "Controlla se è il mio turno" },
  ru: { waitlistDivider: "Нет кода приглашения?", waitlistJoin: "Встать в лист ожидания", waitlistHint: "Подтвердите номер телефона, чтобы встать в лист ожидания. Когда подойдёт ваша очередь, вы сможете войти.", waitlistedTitle: "Вы в листе ожидания", waitlistedBody: "Начать можно, как только подойдёт ваша очередь. Если друг даст вам код раньше, введите его выше.", waitlistCheck: "Проверить, моя ли очередь" },
  ar: { waitlistDivider: "ليس لديك رمز دعوة؟", waitlistJoin: "الانضمام إلى قائمة الانتظار", waitlistHint: "وثّق رقم هاتفك للانضمام إلى قائمة الانتظار. يمكنك الدخول عندما يحين دورك.", waitlistedTitle: "أنت في قائمة الانتظار", waitlistedBody: "يمكنك البدء فور أن يحين دورك. إذا أعطاك صديق رمزًا قبل ذلك، أدخله في الأعلى.", waitlistCheck: "تحقّق إن حان دوري" },
  hi: { waitlistDivider: "निमंत्रण कोड नहीं है?", waitlistJoin: "प्रतीक्षा सूची में जुड़ें", waitlistHint: "प्रतीक्षा सूची में जुड़ने के लिए अपना फ़ोन नंबर सत्यापित करें। आपकी बारी आने पर आप अंदर आ सकेंगे।", waitlistedTitle: "आप प्रतीक्षा सूची में हैं", waitlistedBody: "आपकी बारी आते ही आप शुरू कर सकेंगे। उससे पहले किसी दोस्त से कोड मिले तो ऊपर डालें।", waitlistCheck: "देखें कि मेरी बारी आई या नहीं" },
  th: { waitlistDivider: "ไม่มีรหัสเชิญ?", waitlistJoin: "เข้ารายชื่อรอ", waitlistHint: "ยืนยันเบอร์โทรเพื่อเข้ารายชื่อรอ ถึงคิวเมื่อไหร่ก็เข้าใช้ได้เลย", waitlistedTitle: "คุณอยู่ในรายชื่อรอแล้ว", waitlistedBody: "ถึงคิวเมื่อไหร่ก็เริ่มใช้ได้ทันที ถ้าได้รหัสเชิญจากเพื่อนก่อนหน้านั้น ใส่ไว้ด้านบนได้เลย", waitlistCheck: "ดูว่าถึงคิวฉันหรือยัง" },
  vi: { waitlistDivider: "Chưa có mã mời?", waitlistJoin: "Vào danh sách chờ", waitlistHint: "Xác minh số điện thoại để vào danh sách chờ. Đến lượt bạn là vào được.", waitlistedTitle: "Bạn đã vào danh sách chờ", waitlistedBody: "Đến lượt là bạn dùng được ngay. Nếu trước đó bạn bè gửi mã mời, hãy nhập ở trên.", waitlistCheck: "Xem đã đến lượt mình chưa" },
};

const COPY: Record<PrimaryUiLocale, Omit<InviteGateCopy, keyof InviteWaitlistCopy>> = {
  ko: { title: "초대권이 있어야 계속 쓸 수 있어요", body: "HashChat은 지금 초대로만 들어올 수 있어요. 친구에게 받은 초대 코드를 넣어 주세요. 초대 링크로 들어오면 자동으로 열려요.", placeholder: "초대 코드", submit: "입장하기", signOut: "로그아웃", errorNotFound: "없는 초대 코드예요. 다시 확인해 주세요.", errorOwn: "내 초대 코드는 쓸 수 없어요.", errorGeneric: "잠시 후 다시 시도해 주세요." },
  en: { title: "You need an invite to keep going", body: "HashChat is invite-only for now. Enter the invite code a friend gave you. Opening an invite link lets you in automatically.", placeholder: "Invite code", submit: "Enter", signOut: "Sign out", errorNotFound: "That invite code doesn't exist. Please check it.", errorOwn: "You can't use your own invite code.", errorGeneric: "Please try again in a moment." },
  ja: { title: "続けるには招待が必要です", body: "HashChatは現在、招待制です。友だちからもらった招待コードを入力してください。招待リンクから開くと自動で入れます。", placeholder: "招待コード", submit: "入る", signOut: "ログアウト", errorNotFound: "存在しない招待コードです。もう一度ご確認ください。", errorOwn: "自分の招待コードは使えません。", errorGeneric: "しばらくしてからもう一度お試しください。" },
  "zh-CN": { title: "需要邀请才能继续使用", body: "HashChat 目前仅限邀请。请输入朋友给你的邀请码。通过邀请链接打开会自动进入。", placeholder: "邀请码", submit: "进入", signOut: "退出登录", errorNotFound: "邀请码不存在，请再确认一下。", errorOwn: "不能使用自己的邀请码。", errorGeneric: "请稍后再试。" },
  "zh-TW": { title: "需要邀請才能繼續使用", body: "HashChat 目前僅限邀請。請輸入朋友給你的邀請碼。透過邀請連結開啟會自動進入。", placeholder: "邀請碼", submit: "進入", signOut: "登出", errorNotFound: "邀請碼不存在，請再確認一下。", errorOwn: "不能使用自己的邀請碼。", errorGeneric: "請稍後再試。" },
  fr: { title: "Il faut une invitation pour continuer", body: "HashChat est sur invitation pour l’instant. Saisissez le code qu’un ami vous a donné. Un lien d’invitation vous fait entrer automatiquement.", placeholder: "Code d’invitation", submit: "Entrer", signOut: "Se déconnecter", errorNotFound: "Ce code n’existe pas. Vérifiez-le.", errorOwn: "Vous ne pouvez pas utiliser votre propre code.", errorGeneric: "Réessayez dans un instant." },
  de: { title: "Zum Weitermachen brauchst du eine Einladung", body: "HashChat gibt es gerade nur auf Einladung. Gib den Code ein, den du von Freunden bekommen hast. Über einen Einladungslink kommst du automatisch rein.", placeholder: "Einladungscode", submit: "Rein", signOut: "Abmelden", errorNotFound: "Diesen Code gibt es nicht. Bitte prüfen.", errorOwn: "Deinen eigenen Code kannst du nicht nutzen.", errorGeneric: "Bitte gleich noch einmal versuchen." },
  es: { title: "Necesitas una invitación para seguir", body: "HashChat es solo por invitación por ahora. Escribe el código que te dio un amigo. Si entras con un enlace de invitación, se abre solo.", placeholder: "Código de invitación", submit: "Entrar", signOut: "Cerrar sesión", errorNotFound: "Ese código no existe. Revísalo.", errorOwn: "No puedes usar tu propio código.", errorGeneric: "Inténtalo de nuevo en un momento." },
  pt: { title: "Você precisa de um convite para continuar", body: "O HashChat é só por convite por enquanto. Digite o código que um amigo te deu. Pelo link de convite você entra automaticamente.", placeholder: "Código de convite", submit: "Entrar", signOut: "Sair", errorNotFound: "Esse código não existe. Confira.", errorOwn: "Você não pode usar seu próprio código.", errorGeneric: "Tente de novo daqui a pouco." },
  it: { title: "Serve un invito per continuare", body: "Per ora HashChat è solo su invito. Inserisci il codice che ti ha dato un amico. Con un link d’invito entri in automatico.", placeholder: "Codice d’invito", submit: "Entra", signOut: "Esci", errorNotFound: "Questo codice non esiste. Controllalo.", errorOwn: "Non puoi usare il tuo codice.", errorGeneric: "Riprova tra poco." },
  ru: { title: "Чтобы продолжить, нужно приглашение", body: "Пока в HashChat можно попасть только по приглашению. Введите код, который дал друг. По ссылке-приглашению вход откроется сам.", placeholder: "Код приглашения", submit: "Войти", signOut: "Выйти", errorNotFound: "Такого кода нет. Проверьте его.", errorOwn: "Свой код использовать нельзя.", errorGeneric: "Попробуйте чуть позже." },
  ar: { title: "تحتاج إلى دعوة للمتابعة", body: "HashChat متاح بالدعوة فقط حاليًا. أدخل رمز الدعوة الذي أعطاك إياه صديق. فتح رابط الدعوة يُدخلك تلقائيًا.", placeholder: "رمز الدعوة", submit: "دخول", signOut: "تسجيل الخروج", errorNotFound: "هذا الرمز غير موجود. تحقّق منه.", errorOwn: "لا يمكنك استخدام رمزك.", errorGeneric: "حاول مرة أخرى بعد قليل." },
  hi: { title: "आगे बढ़ने के लिए निमंत्रण चाहिए", body: "HashChat अभी सिर्फ़ निमंत्रण से खुलता है। दोस्त से मिला कोड डालें। निमंत्रण लिंक से खोलने पर अपने-आप अंदर आ जाएँगे।", placeholder: "निमंत्रण कोड", submit: "अंदर जाएँ", signOut: "साइन आउट", errorNotFound: "यह कोड मौजूद नहीं है। जाँच लें।", errorOwn: "अपना कोड इस्तेमाल नहीं कर सकते।", errorGeneric: "थोड़ी देर बाद फिर कोशिश करें।" },
  th: { title: "ต้องมีคำเชิญจึงจะใช้ต่อได้", body: "ตอนนี้ HashChat ใช้ได้เฉพาะผู้ได้รับเชิญ ใส่รหัสเชิญที่ได้จากเพื่อน ถ้าเปิดจากลิงก์เชิญจะเข้าได้อัตโนมัติ", placeholder: "รหัสเชิญ", submit: "เข้าใช้งาน", signOut: "ออกจากระบบ", errorNotFound: "ไม่มีรหัสเชิญนี้ ตรวจสอบอีกครั้ง", errorOwn: "ใช้รหัสเชิญของตัวเองไม่ได้", errorGeneric: "ลองใหม่อีกครั้งในอีกสักครู่" },
  vi: { title: "Cần lời mời để tiếp tục", body: "Hiện HashChat chỉ dành cho người được mời. Nhập mã mời bạn bè đã gửi. Mở bằng liên kết mời sẽ tự vào.", placeholder: "Mã mời", submit: "Vào", signOut: "Đăng xuất", errorNotFound: "Mã mời không tồn tại. Hãy kiểm tra lại.", errorOwn: "Không thể dùng mã mời của chính bạn.", errorGeneric: "Hãy thử lại sau ít phút." },
};

export function resolveInviteGateCopy(rawLocale: string): InviteGateCopy {
  const locale = resolvePrimaryUiLocaleTag(rawLocale) ?? "en";
  return { ...(COPY[locale] ?? COPY.en), ...(WAITLIST_COPY[locale] ?? WAITLIST_COPY.en) };
}
