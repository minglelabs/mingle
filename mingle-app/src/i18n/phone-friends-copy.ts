import { resolvePrimaryUiLocaleTag, type PrimaryUiLocale } from "@/i18n/mingle-locales";

/**
 * Copy for finding friends by phone number on the contact-sync screen: the
 * "friends on HashChat" list, and the sheet where the user proves their own
 * number with an SMS code. {count} is a number of people, {phone} a number.
 */
export type PhoneFriendsCopy = {
  friendsOnHashChat: string;
  follow: string;
  following: string;
  findTitle: string;
  findBody: string;
  verifyButton: string;
  verifiedAs: string;
  sheetTitle: string;
  sheetBody: string;
  countryLabel: string;
  phoneLabel: string;
  sendCode: string;
  resendCode: string;
  codeSent: string;
  codeLabel: string;
  confirm: string;
  close: string;
  verifiedToast: string;
  matching: string;
  noMatches: string;
  errorPhone: string;
  errorCode: string;
  errorTooMany: string;
  errorUnavailable: string;
  errorGeneric: string;
};

const PHONE_FRIENDS_COPY_BY_LOCALE: Record<PrimaryUiLocale, PhoneFriendsCopy> = {
  ko: {
    friendsOnHashChat: "HashChat에 있는 친구 {count}명", follow: "팔로우", following: "팔로잉",
    findTitle: "HashChat에 있는 친구 찾기",
    findBody: "내 번호를 인증하면 연락처에서 HashChat을 쓰는 친구에게 ✓ 표시가 떠요. 연락처 번호는 알아볼 수 없는 값으로 바꿔 확인만 하고 저장하지 않아요.",
    verifyButton: "번호 인증하기", verifiedAs: "{phone} 인증됨",
    sheetTitle: "휴대폰 번호 인증", sheetBody: "인증한 번호로 친구가 나를 찾을 수 있어요. 번호는 다른 사람에게 보이지 않아요.",
    countryLabel: "국가", phoneLabel: "휴대폰 번호", sendCode: "인증번호 받기", resendCode: "다시 받기",
    codeSent: "{phone}로 인증번호를 보냈어요", codeLabel: "인증번호 6자리", confirm: "확인", close: "닫기",
    verifiedToast: "번호를 인증했어요", matching: "친구를 찾는 중…",
    noMatches: "아직 HashChat에 있는 친구가 없어요. 아래에서 초대해 보세요!",
    errorPhone: "번호를 다시 확인해 주세요.", errorCode: "인증번호가 맞지 않아요.",
    errorTooMany: "오늘은 더 보낼 수 없어요. 내일 다시 시도해 주세요.", errorUnavailable: "지금은 번호 인증을 할 수 없어요.",
    errorGeneric: "잠시 후 다시 시도해 주세요.",
  },
  en: {
    friendsOnHashChat: "{count} friends on HashChat", follow: "Follow", following: "Following",
    findTitle: "Find friends on HashChat",
    findBody: "Verify your number and friends in your contacts who use HashChat get a ✓. Contact numbers are turned into unreadable codes, checked, and never saved.",
    verifyButton: "Verify my number", verifiedAs: "{phone} verified",
    sheetTitle: "Verify your phone number", sheetBody: "Friends can find you by this number. Nobody else sees it.",
    countryLabel: "Country", phoneLabel: "Phone number", sendCode: "Send code", resendCode: "Send again",
    codeSent: "We texted a code to {phone}", codeLabel: "6-digit code", confirm: "Confirm", close: "Close",
    verifiedToast: "Your number is verified", matching: "Finding your friends…",
    noMatches: "None of your contacts are on HashChat yet. Invite them below!",
    errorPhone: "Check the number and try again.", errorCode: "That code is not right.",
    errorTooMany: "No more codes today. Try again tomorrow.", errorUnavailable: "Phone verification isn't available right now.",
    errorGeneric: "Please try again in a moment.",
  },
  ja: {
    friendsOnHashChat: "HashChatにいる友だち {count}人", follow: "フォロー", following: "フォロー中",
    findTitle: "HashChatにいる友だちを探す",
    findBody: "電話番号を認証すると、連絡先でHashChatを使っている友だちに✓が付きます。連絡先の番号は読めない値に変えて確認するだけで、保存しません。",
    verifyButton: "番号を認証する", verifiedAs: "{phone} 認証済み",
    sheetTitle: "電話番号の認証", sheetBody: "認証した番号で友だちがあなたを見つけられます。番号は他の人には見えません。",
    countryLabel: "国", phoneLabel: "電話番号", sendCode: "認証コードを受け取る", resendCode: "もう一度送る",
    codeSent: "{phone} に認証コードを送りました", codeLabel: "6桁の認証コード", confirm: "確認", close: "閉じる",
    verifiedToast: "番号を認証しました", matching: "友だちを探しています…",
    noMatches: "HashChatにいる友だちはまだいません。下から招待してみましょう!",
    errorPhone: "番号をもう一度確認してください。", errorCode: "認証コードが違います。",
    errorTooMany: "今日はこれ以上送れません。明日もう一度お試しください。", errorUnavailable: "現在、電話番号の認証はできません。",
    errorGeneric: "しばらくしてからもう一度お試しください。",
  },
  "zh-CN": {
    friendsOnHashChat: "HashChat 上的好友 {count} 人", follow: "关注", following: "已关注",
    findTitle: "查找 HashChat 上的好友",
    findBody: "验证手机号后，通讯录里使用 HashChat 的好友会显示 ✓。通讯录号码只会转换成无法辨认的值进行比对，不会保存。",
    verifyButton: "验证手机号", verifiedAs: "{phone} 已验证",
    sheetTitle: "验证手机号", sheetBody: "好友可以通过这个号码找到你。其他人看不到你的号码。",
    countryLabel: "国家/地区", phoneLabel: "手机号", sendCode: "获取验证码", resendCode: "重新发送",
    codeSent: "验证码已发送到 {phone}", codeLabel: "6 位验证码", confirm: "确认", close: "关闭",
    verifiedToast: "手机号已验证", matching: "正在查找好友…",
    noMatches: "通讯录里还没有人在用 HashChat。在下面邀请他们吧！",
    errorPhone: "请检查号码后重试。", errorCode: "验证码不正确。",
    errorTooMany: "今天不能再发送了，请明天再试。", errorUnavailable: "暂时无法验证手机号。",
    errorGeneric: "请稍后再试。",
  },
  "zh-TW": {
    friendsOnHashChat: "HashChat 上的好友 {count} 人", follow: "追蹤", following: "追蹤中",
    findTitle: "尋找 HashChat 上的好友",
    findBody: "驗證手機號碼後，通訊錄裡使用 HashChat 的好友會顯示 ✓。通訊錄號碼只會轉換成無法辨識的值進行比對，不會儲存。",
    verifyButton: "驗證手機號碼", verifiedAs: "{phone} 已驗證",
    sheetTitle: "驗證手機號碼", sheetBody: "好友可以用這個號碼找到你。其他人看不到你的號碼。",
    countryLabel: "國家/地區", phoneLabel: "手機號碼", sendCode: "取得驗證碼", resendCode: "重新傳送",
    codeSent: "驗證碼已傳送到 {phone}", codeLabel: "6 位數驗證碼", confirm: "確認", close: "關閉",
    verifiedToast: "手機號碼已驗證", matching: "正在尋找好友…",
    noMatches: "通訊錄裡還沒有人在用 HashChat。在下面邀請他們吧！",
    errorPhone: "請確認號碼後再試一次。", errorCode: "驗證碼不正確。",
    errorTooMany: "今天無法再傳送，請明天再試。", errorUnavailable: "目前無法驗證手機號碼。",
    errorGeneric: "請稍後再試。",
  },
  fr: {
    friendsOnHashChat: "{count} amis sur HashChat", follow: "Suivre", following: "Abonné",
    findTitle: "Trouver des amis sur HashChat",
    findBody: "Vérifiez votre numéro et vos contacts qui utilisent HashChat auront un ✓. Leurs numéros sont transformés en codes illisibles, comparés, puis jamais enregistrés.",
    verifyButton: "Vérifier mon numéro", verifiedAs: "{phone} vérifié",
    sheetTitle: "Vérifier votre numéro", sheetBody: "Vos amis pourront vous trouver avec ce numéro. Personne d'autre ne le voit.",
    countryLabel: "Pays", phoneLabel: "Numéro de téléphone", sendCode: "Recevoir le code", resendCode: "Renvoyer",
    codeSent: "Code envoyé au {phone}", codeLabel: "Code à 6 chiffres", confirm: "Valider", close: "Fermer",
    verifiedToast: "Votre numéro est vérifié", matching: "Recherche de vos amis…",
    noMatches: "Aucun de vos contacts n'est encore sur HashChat. Invitez-les ci-dessous !",
    errorPhone: "Vérifiez le numéro et réessayez.", errorCode: "Ce code n'est pas bon.",
    errorTooMany: "Plus de codes aujourd'hui. Réessayez demain.", errorUnavailable: "La vérification du numéro n'est pas disponible pour le moment.",
    errorGeneric: "Réessayez dans un instant.",
  },
  de: {
    friendsOnHashChat: "{count} Freunde auf HashChat", follow: "Folgen", following: "Folge ich",
    findTitle: "Freunde auf HashChat finden",
    findBody: "Bestätige deine Nummer, und Kontakte, die HashChat nutzen, bekommen ein ✓. Ihre Nummern werden in unlesbare Werte umgewandelt, nur abgeglichen und nie gespeichert.",
    verifyButton: "Nummer bestätigen", verifiedAs: "{phone} bestätigt",
    sheetTitle: "Telefonnummer bestätigen", sheetBody: "Freunde finden dich über diese Nummer. Andere sehen sie nicht.",
    countryLabel: "Land", phoneLabel: "Handynummer", sendCode: "Code senden", resendCode: "Erneut senden",
    codeSent: "Code an {phone} gesendet", codeLabel: "6-stelliger Code", confirm: "Bestätigen", close: "Schließen",
    verifiedToast: "Deine Nummer ist bestätigt", matching: "Freunde werden gesucht…",
    noMatches: "Noch keiner deiner Kontakte ist auf HashChat. Lade sie unten ein!",
    errorPhone: "Prüfe die Nummer und versuche es erneut.", errorCode: "Der Code stimmt nicht.",
    errorTooMany: "Heute keine weiteren Codes. Versuche es morgen wieder.", errorUnavailable: "Die Nummernbestätigung ist gerade nicht verfügbar.",
    errorGeneric: "Bitte versuche es gleich noch einmal.",
  },
  es: {
    friendsOnHashChat: "{count} amigos en HashChat", follow: "Seguir", following: "Siguiendo",
    findTitle: "Encuentra amigos en HashChat",
    findBody: "Verifica tu número y tus contactos que usan HashChat tendrán un ✓. Sus números se convierten en códigos ilegibles, se comparan y nunca se guardan.",
    verifyButton: "Verificar mi número", verifiedAs: "{phone} verificado",
    sheetTitle: "Verifica tu número", sheetBody: "Tus amigos podrán encontrarte con este número. Nadie más lo ve.",
    countryLabel: "País", phoneLabel: "Número de teléfono", sendCode: "Recibir código", resendCode: "Enviar de nuevo",
    codeSent: "Enviamos un código al {phone}", codeLabel: "Código de 6 dígitos", confirm: "Confirmar", close: "Cerrar",
    verifiedToast: "Tu número está verificado", matching: "Buscando a tus amigos…",
    noMatches: "Ninguno de tus contactos está en HashChat todavía. ¡Invítalos abajo!",
    errorPhone: "Revisa el número e inténtalo de nuevo.", errorCode: "Ese código no es correcto.",
    errorTooMany: "No se pueden enviar más códigos hoy. Inténtalo mañana.", errorUnavailable: "La verificación del número no está disponible ahora.",
    errorGeneric: "Inténtalo de nuevo en un momento.",
  },
  pt: {
    friendsOnHashChat: "{count} amigos no HashChat", follow: "Seguir", following: "Seguindo",
    findTitle: "Encontre amigos no HashChat",
    findBody: "Verifique seu número e os contatos que usam o HashChat ganham um ✓. Os números viram códigos ilegíveis, são comparados e nunca são salvos.",
    verifyButton: "Verificar meu número", verifiedAs: "{phone} verificado",
    sheetTitle: "Verifique seu número", sheetBody: "Seus amigos podem encontrar você por este número. Ninguém mais o vê.",
    countryLabel: "País", phoneLabel: "Número de celular", sendCode: "Receber código", resendCode: "Enviar de novo",
    codeSent: "Enviamos um código para {phone}", codeLabel: "Código de 6 dígitos", confirm: "Confirmar", close: "Fechar",
    verifiedToast: "Seu número foi verificado", matching: "Procurando seus amigos…",
    noMatches: "Nenhum contato seu está no HashChat ainda. Convide-os abaixo!",
    errorPhone: "Confira o número e tente de novo.", errorCode: "Esse código não está certo.",
    errorTooMany: "Não dá para enviar mais códigos hoje. Tente amanhã.", errorUnavailable: "A verificação de número não está disponível agora.",
    errorGeneric: "Tente de novo em instantes.",
  },
  it: {
    friendsOnHashChat: "{count} amici su HashChat", follow: "Segui", following: "Segui già",
    findTitle: "Trova amici su HashChat",
    findBody: "Verifica il tuo numero e i contatti che usano HashChat avranno una ✓. I loro numeri diventano codici illeggibili, vengono confrontati e mai salvati.",
    verifyButton: "Verifica il mio numero", verifiedAs: "{phone} verificato",
    sheetTitle: "Verifica il tuo numero", sheetBody: "Gli amici potranno trovarti con questo numero. Nessun altro lo vede.",
    countryLabel: "Paese", phoneLabel: "Numero di cellulare", sendCode: "Ricevi il codice", resendCode: "Invia di nuovo",
    codeSent: "Codice inviato al {phone}", codeLabel: "Codice a 6 cifre", confirm: "Conferma", close: "Chiudi",
    verifiedToast: "Il tuo numero è verificato", matching: "Cerco i tuoi amici…",
    noMatches: "Nessuno dei tuoi contatti è ancora su HashChat. Invitali qui sotto!",
    errorPhone: "Controlla il numero e riprova.", errorCode: "Il codice non è corretto.",
    errorTooMany: "Oggi non si possono inviare altri codici. Riprova domani.", errorUnavailable: "La verifica del numero non è disponibile ora.",
    errorGeneric: "Riprova tra un momento.",
  },
  ru: {
    friendsOnHashChat: "Друзья в HashChat: {count}", follow: "Подписаться", following: "Вы подписаны",
    findTitle: "Найти друзей в HashChat",
    findBody: "Подтвердите свой номер, и у контактов, которые пользуются HashChat, появится ✓. Их номера превращаются в нечитаемые коды, только сверяются и не сохраняются.",
    verifyButton: "Подтвердить номер", verifiedAs: "{phone} подтверждён",
    sheetTitle: "Подтверждение номера", sheetBody: "Друзья смогут найти вас по этому номеру. Другие его не видят.",
    countryLabel: "Страна", phoneLabel: "Номер телефона", sendCode: "Получить код", resendCode: "Отправить снова",
    codeSent: "Код отправлен на {phone}", codeLabel: "Код из 6 цифр", confirm: "Подтвердить", close: "Закрыть",
    verifiedToast: "Номер подтверждён", matching: "Ищем ваших друзей…",
    noMatches: "Пока никого из ваших контактов нет в HashChat. Пригласите их ниже!",
    errorPhone: "Проверьте номер и попробуйте снова.", errorCode: "Неверный код.",
    errorTooMany: "Сегодня больше кодов отправить нельзя. Попробуйте завтра.", errorUnavailable: "Подтверждение номера сейчас недоступно.",
    errorGeneric: "Попробуйте ещё раз чуть позже.",
  },
  ar: {
    friendsOnHashChat: "{count} من الأصدقاء على HashChat", follow: "متابعة", following: "تتابعه",
    findTitle: "ابحث عن أصدقائك على HashChat",
    findBody: "وثّق رقمك وستظهر ✓ بجانب جهات الاتصال التي تستخدم HashChat. تُحوَّل أرقامهم إلى رموز غير مقروءة وتُطابَق فقط ولا تُحفَظ أبدًا.",
    verifyButton: "توثيق رقمي", verifiedAs: "تم توثيق {phone}",
    sheetTitle: "توثيق رقم الهاتف", sheetBody: "يمكن لأصدقائك العثور عليك بهذا الرقم. لا يراه أحد غيرهم.",
    countryLabel: "الدولة", phoneLabel: "رقم الجوال", sendCode: "إرسال الرمز", resendCode: "إعادة الإرسال",
    codeSent: "أرسلنا رمزًا إلى {phone}", codeLabel: "رمز من 6 أرقام", confirm: "تأكيد", close: "إغلاق",
    verifiedToast: "تم توثيق رقمك", matching: "جارٍ البحث عن أصدقائك…",
    noMatches: "لا أحد من جهات اتصالك على HashChat بعد. ادعهم من الأسفل!",
    errorPhone: "تحقّق من الرقم وحاول مجددًا.", errorCode: "الرمز غير صحيح.",
    errorTooMany: "لا يمكن إرسال رموز أخرى اليوم. حاول غدًا.", errorUnavailable: "توثيق الرقم غير متاح حاليًا.",
    errorGeneric: "حاول مرة أخرى بعد قليل.",
  },
  hi: {
    friendsOnHashChat: "HashChat पर {count} दोस्त", follow: "फ़ॉलो करें", following: "फ़ॉलो कर रहे हैं",
    findTitle: "HashChat पर दोस्त खोजें",
    findBody: "अपना नंबर सत्यापित करें, फिर आपके संपर्कों में जो HashChat इस्तेमाल करते हैं उन पर ✓ दिखेगा। उनके नंबर ऐसे कोड में बदले जाते हैं जिन्हें पढ़ा नहीं जा सकता, सिर्फ़ मिलाए जाते हैं और कभी सेव नहीं होते।",
    verifyButton: "मेरा नंबर सत्यापित करें", verifiedAs: "{phone} सत्यापित",
    sheetTitle: "फ़ोन नंबर सत्यापित करें", sheetBody: "दोस्त इस नंबर से आपको ढूँढ सकते हैं। कोई और इसे नहीं देखता।",
    countryLabel: "देश", phoneLabel: "मोबाइल नंबर", sendCode: "कोड भेजें", resendCode: "फिर से भेजें",
    codeSent: "{phone} पर कोड भेजा गया", codeLabel: "6 अंकों का कोड", confirm: "पुष्टि करें", close: "बंद करें",
    verifiedToast: "आपका नंबर सत्यापित हो गया", matching: "आपके दोस्त खोजे जा रहे हैं…",
    noMatches: "आपके संपर्कों में से अभी कोई HashChat पर नहीं है। नीचे से उन्हें आमंत्रित करें!",
    errorPhone: "नंबर जाँचकर फिर से कोशिश करें।", errorCode: "यह कोड सही नहीं है।",
    errorTooMany: "आज और कोड नहीं भेजे जा सकते। कल फिर कोशिश करें।", errorUnavailable: "अभी नंबर सत्यापन उपलब्ध नहीं है।",
    errorGeneric: "थोड़ी देर बाद फिर कोशिश करें।",
  },
  th: {
    friendsOnHashChat: "เพื่อนใน HashChat {count} คน", follow: "ติดตาม", following: "กำลังติดตาม",
    findTitle: "ค้นหาเพื่อนใน HashChat",
    findBody: "ยืนยันเบอร์ของคุณ แล้วรายชื่อติดต่อที่ใช้ HashChat จะมีเครื่องหมาย ✓ เบอร์ของพวกเขาจะถูกแปลงเป็นค่าที่อ่านไม่ออก ใช้เทียบเท่านั้นและไม่ถูกบันทึก",
    verifyButton: "ยืนยันเบอร์ของฉัน", verifiedAs: "ยืนยัน {phone} แล้ว",
    sheetTitle: "ยืนยันเบอร์โทรศัพท์", sheetBody: "เพื่อนจะค้นหาคุณได้ด้วยเบอร์นี้ คนอื่นจะไม่เห็นเบอร์",
    countryLabel: "ประเทศ", phoneLabel: "เบอร์มือถือ", sendCode: "รับรหัส", resendCode: "ส่งอีกครั้ง",
    codeSent: "ส่งรหัสไปที่ {phone} แล้ว", codeLabel: "รหัส 6 หลัก", confirm: "ยืนยัน", close: "ปิด",
    verifiedToast: "ยืนยันเบอร์แล้ว", matching: "กำลังค้นหาเพื่อน…",
    noMatches: "ยังไม่มีรายชื่อติดต่อของคุณใน HashChat ชวนพวกเขาด้านล่างเลย!",
    errorPhone: "ตรวจสอบเบอร์แล้วลองอีกครั้ง", errorCode: "รหัสไม่ถูกต้อง",
    errorTooMany: "วันนี้ส่งรหัสเพิ่มไม่ได้แล้ว ลองใหม่พรุ่งนี้", errorUnavailable: "ตอนนี้ยังยืนยันเบอร์ไม่ได้",
    errorGeneric: "โปรดลองอีกครั้งในอีกสักครู่",
  },
  vi: {
    friendsOnHashChat: "{count} bạn bè trên HashChat", follow: "Theo dõi", following: "Đang theo dõi",
    findTitle: "Tìm bạn bè trên HashChat",
    findBody: "Xác minh số của bạn, danh bạ nào dùng HashChat sẽ có dấu ✓. Số của họ được đổi thành mã không đọc được, chỉ dùng để đối chiếu và không bao giờ được lưu.",
    verifyButton: "Xác minh số của tôi", verifiedAs: "Đã xác minh {phone}",
    sheetTitle: "Xác minh số điện thoại", sheetBody: "Bạn bè có thể tìm bạn bằng số này. Người khác không thấy số.",
    countryLabel: "Quốc gia", phoneLabel: "Số điện thoại", sendCode: "Nhận mã", resendCode: "Gửi lại",
    codeSent: "Đã gửi mã tới {phone}", codeLabel: "Mã 6 chữ số", confirm: "Xác nhận", close: "Đóng",
    verifiedToast: "Đã xác minh số của bạn", matching: "Đang tìm bạn bè…",
    noMatches: "Chưa có ai trong danh bạ của bạn dùng HashChat. Hãy mời họ bên dưới!",
    errorPhone: "Kiểm tra lại số rồi thử lại.", errorCode: "Mã không đúng.",
    errorTooMany: "Hôm nay không gửi thêm mã được. Hãy thử lại vào ngày mai.", errorUnavailable: "Hiện chưa thể xác minh số.",
    errorGeneric: "Vui lòng thử lại sau giây lát.",
  },
};

export const PHONE_FRIENDS_COPY_LOCALES = Object.keys(PHONE_FRIENDS_COPY_BY_LOCALE);

export function resolvePhoneFriendsCopy(rawLocale: string): PhoneFriendsCopy {
  const locale = resolvePrimaryUiLocaleTag(rawLocale) ?? "en";
  return PHONE_FRIENDS_COPY_BY_LOCALE[locale] ?? PHONE_FRIENDS_COPY_BY_LOCALE.en;
}

export function fillPhoneFriendsCopy(template: string, input: { count?: number; phone?: string }): string {
  return template
    .replaceAll("{count}", (input.count ?? 0).toLocaleString("en-US"))
    .replaceAll("{phone}", input.phone ?? "");
}
