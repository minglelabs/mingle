import { resolvePrimaryUiLocaleTag, type PrimaryUiLocale } from "@/i18n/mingle-locales";

// Copy for the contact-sync screen: invite friends by text message, the
// user's invite code, and entering someone else's code. {coins} is the reward
// (1,000), {name}/{code}/{link} are filled in the invite message.
export type ContactSyncCopy = {
  /** Screen title and the menu / follow-list entry label. */
  title: string;
  headline: string;
  description: string;
  myCodeLabel: string;
  copyCode: string;
  codeCopied: string;
  copyMessage: string;
  messageCopied: string;
  enterCodeLabel: string;
  enterCodePlaceholder: string;
  submit: string;
  redeemSuccess: string;
  redeemedDone: string;
  errorInvalid: string;
  errorNotFound: string;
  errorOwn: string;
  errorAlready: string;
  errorGeneric: string;
  syncButton: string;
  privacyNote: string;
  permissionBlocked: string;
  openSettings: string;
  searchPlaceholder: string;
  invite: string;
  invited: string;
  noContacts: string;
  noResults: string;
  appOnly: string;
  later: string;
  /** The text message written for a contact. */
  inviteMessage: string;
  /** Coin history row for the referral reward. */
  coinSource: string;
};

const CONTACT_SYNC_COPY_BY_LOCALE: Record<PrimaryUiLocale, ContactSyncCopy> = {
  ko: {
    title: "연락처 연동", headline: "친구를 초대하고 해씨 받기",
    description: "친구가 가입 후 내 초대 코드를 입력하면 서로 {coins}해씨를 받아요.",
    myCodeLabel: "내 초대 코드", copyCode: "코드 복사", codeCopied: "초대 코드를 복사했어요.",
    copyMessage: "초대 메시지 복사", messageCopied: "초대 메시지를 복사했어요.",
    enterCodeLabel: "초대 코드 입력", enterCodePlaceholder: "받은 코드 5자리", submit: "확인",
    redeemSuccess: "{coins}해씨를 받았어요!", redeemedDone: "초대 코드를 이미 입력했어요.",
    errorInvalid: "영소문자와 숫자 5자리를 입력해 주세요.", errorNotFound: "없는 초대 코드예요.",
    errorOwn: "내 코드는 입력할 수 없어요.", errorAlready: "초대 코드는 한 번만 입력할 수 있어요.",
    errorGeneric: "잠시 후 다시 시도해 주세요.",
    syncButton: "연락처 연동하기", privacyNote: "연락처는 이 기기에서만 사용하며 서버에 저장하지 않아요.",
    permissionBlocked: "연락처 접근이 꺼져 있어요. 설정에서 허용해 주세요.", openSettings: "설정 열기",
    searchPlaceholder: "이름 또는 전화번호 검색", invite: "초대", invited: "초대함",
    noContacts: "전화번호가 있는 연락처가 없어요.", noResults: "검색 결과가 없어요.",
    appOnly: "연락처 연동은 최신 버전 앱에서 사용할 수 있어요.", later: "나중에 하기",
    inviteMessage: "{name}님이 HashChat에 초대했어요! 가입 후 초대 코드 {code}를 입력하면 둘 다 {coins}해씨를 받아요.\n{link}",
    coinSource: "친구 초대",
  },
  en: {
    title: "Sync contacts", headline: "Invite friends, get Hash",
    description: "When a friend signs up and enters your invite code, you both get {coins} Hash.",
    myCodeLabel: "My invite code", copyCode: "Copy code", codeCopied: "Invite code copied.",
    copyMessage: "Copy invite message", messageCopied: "Invite message copied.",
    enterCodeLabel: "Enter an invite code", enterCodePlaceholder: "5-character code", submit: "Apply",
    redeemSuccess: "You got {coins} Hash!", redeemedDone: "You already entered an invite code.",
    errorInvalid: "Enter 5 lowercase letters or digits.", errorNotFound: "That invite code doesn't exist.",
    errorOwn: "You can't enter your own code.", errorAlready: "An invite code can be entered only once.",
    errorGeneric: "Please try again in a moment.",
    syncButton: "Sync contacts", privacyNote: "Your contacts are used only on this device and are never stored on our servers.",
    permissionBlocked: "Contacts access is off. Allow it in Settings.", openSettings: "Open Settings",
    searchPlaceholder: "Search name or phone number", invite: "Invite", invited: "Invited",
    noContacts: "No contacts with a phone number.", noResults: "No results.",
    appOnly: "Contact sync is available in the latest version of the app.", later: "Maybe later",
    inviteMessage: "{name} invited you to HashChat! Sign up and enter invite code {code} — we both get {coins} Hash.\n{link}",
    coinSource: "Friend invite",
  },
  ja: {
    title: "連絡先の連携", headline: "友だちを招待してハッシュをもらおう",
    description: "友だちが登録後にあなたの招待コードを入力すると、お互いに{coins}ハッシュがもらえます。",
    myCodeLabel: "自分の招待コード", copyCode: "コードをコピー", codeCopied: "招待コードをコピーしました。",
    copyMessage: "招待メッセージをコピー", messageCopied: "招待メッセージをコピーしました。",
    enterCodeLabel: "招待コードを入力", enterCodePlaceholder: "5文字のコード", submit: "確認",
    redeemSuccess: "{coins}ハッシュを受け取りました!", redeemedDone: "招待コードは入力済みです。",
    errorInvalid: "半角英小文字と数字の5文字で入力してください。", errorNotFound: "存在しない招待コードです。",
    errorOwn: "自分のコードは入力できません。", errorAlready: "招待コードは1回だけ入力できます。",
    errorGeneric: "しばらくしてからもう一度お試しください。",
    syncButton: "連絡先を連携する", privacyNote: "連絡先はこの端末内でのみ使用し、サーバーには保存しません。",
    permissionBlocked: "連絡先へのアクセスがオフです。設定で許可してください。", openSettings: "設定を開く",
    searchPlaceholder: "名前または電話番号で検索", invite: "招待", invited: "招待済み",
    noContacts: "電話番号のある連絡先がありません。", noResults: "検索結果がありません。",
    appOnly: "連絡先の連携は最新バージョンのアプリで利用できます。", later: "あとで",
    inviteMessage: "{name}さんがHashChatに招待しました!登録後に招待コード {code} を入力すると、2人とも{coins}ハッシュがもらえます。\n{link}",
    coinSource: "友だち招待",
  },
  "zh-CN": {
    title: "同步通讯录", headline: "邀请好友，领取哈希",
    description: "好友注册后输入你的邀请码，你们双方各得 {coins} 哈希。",
    myCodeLabel: "我的邀请码", copyCode: "复制邀请码", codeCopied: "已复制邀请码。",
    copyMessage: "复制邀请信息", messageCopied: "已复制邀请信息。",
    enterCodeLabel: "输入邀请码", enterCodePlaceholder: "5 位邀请码", submit: "确认",
    redeemSuccess: "已获得 {coins} 哈希！", redeemedDone: "你已输入过邀请码。",
    errorInvalid: "请输入 5 位小写字母或数字。", errorNotFound: "邀请码不存在。",
    errorOwn: "不能输入自己的邀请码。", errorAlready: "邀请码只能输入一次。",
    errorGeneric: "请稍后再试。",
    syncButton: "同步通讯录", privacyNote: "通讯录仅在本设备上使用，不会保存到服务器。",
    permissionBlocked: "通讯录权限已关闭，请在设置中允许。", openSettings: "打开设置",
    searchPlaceholder: "搜索姓名或电话号码", invite: "邀请", invited: "已邀请",
    noContacts: "没有带电话号码的联系人。", noResults: "没有搜索结果。",
    appOnly: "通讯录同步需使用最新版本的应用。", later: "以后再说",
    inviteMessage: "{name} 邀请你加入 HashChat！注册后输入邀请码 {code}，我们各得 {coins} 哈希。\n{link}",
    coinSource: "好友邀请",
  },
  "zh-TW": {
    title: "同步聯絡人", headline: "邀請好友，領取哈希",
    description: "好友註冊後輸入你的邀請碼，雙方各得 {coins} 哈希。",
    myCodeLabel: "我的邀請碼", copyCode: "複製邀請碼", codeCopied: "已複製邀請碼。",
    copyMessage: "複製邀請訊息", messageCopied: "已複製邀請訊息。",
    enterCodeLabel: "輸入邀請碼", enterCodePlaceholder: "5 位邀請碼", submit: "確認",
    redeemSuccess: "已獲得 {coins} 哈希！", redeemedDone: "你已輸入過邀請碼。",
    errorInvalid: "請輸入 5 位小寫英文字母或數字。", errorNotFound: "邀請碼不存在。",
    errorOwn: "不能輸入自己的邀請碼。", errorAlready: "邀請碼只能輸入一次。",
    errorGeneric: "請稍後再試。",
    syncButton: "同步聯絡人", privacyNote: "聯絡人僅在此裝置上使用，不會儲存到伺服器。",
    permissionBlocked: "聯絡人權限已關閉，請在設定中允許。", openSettings: "開啟設定",
    searchPlaceholder: "搜尋姓名或電話號碼", invite: "邀請", invited: "已邀請",
    noContacts: "沒有含電話號碼的聯絡人。", noResults: "沒有搜尋結果。",
    appOnly: "同步聯絡人需使用最新版本的 App。", later: "稍後再說",
    inviteMessage: "{name} 邀請你加入 HashChat！註冊後輸入邀請碼 {code}，我們各得 {coins} 哈希。\n{link}",
    coinSource: "好友邀請",
  },
  fr: {
    title: "Synchroniser les contacts", headline: "Invitez vos amis, gagnez des Hash",
    description: "Quand un ami s'inscrit et saisit votre code d'invitation, vous recevez chacun {coins} Hash.",
    myCodeLabel: "Mon code d'invitation", copyCode: "Copier le code", codeCopied: "Code d'invitation copié.",
    copyMessage: "Copier le message d'invitation", messageCopied: "Message d'invitation copié.",
    enterCodeLabel: "Saisir un code d'invitation", enterCodePlaceholder: "Code à 5 caractères", submit: "Valider",
    redeemSuccess: "Vous avez reçu {coins} Hash !", redeemedDone: "Vous avez déjà saisi un code d'invitation.",
    errorInvalid: "Saisissez 5 lettres minuscules ou chiffres.", errorNotFound: "Ce code d'invitation n'existe pas.",
    errorOwn: "Vous ne pouvez pas saisir votre propre code.", errorAlready: "Un code d'invitation ne peut être saisi qu'une fois.",
    errorGeneric: "Veuillez réessayer dans un instant.",
    syncButton: "Synchroniser les contacts", privacyNote: "Vos contacts sont utilisés uniquement sur cet appareil et ne sont jamais enregistrés sur nos serveurs.",
    permissionBlocked: "L'accès aux contacts est désactivé. Autorisez-le dans les Réglages.", openSettings: "Ouvrir les Réglages",
    searchPlaceholder: "Rechercher un nom ou un numéro", invite: "Inviter", invited: "Invité",
    noContacts: "Aucun contact avec un numéro de téléphone.", noResults: "Aucun résultat.",
    appOnly: "La synchronisation des contacts est disponible dans la dernière version de l'app.", later: "Plus tard",
    inviteMessage: "{name} vous invite sur HashChat ! Inscrivez-vous et saisissez le code {code} : nous recevons chacun {coins} Hash.\n{link}",
    coinSource: "Invitation d'ami",
  },
  de: {
    title: "Kontakte synchronisieren", headline: "Freunde einladen, Hash erhalten",
    description: "Wenn sich ein Freund registriert und deinen Einladungscode eingibt, bekommt ihr beide {coins} Hash.",
    myCodeLabel: "Mein Einladungscode", copyCode: "Code kopieren", codeCopied: "Einladungscode kopiert.",
    copyMessage: "Einladungsnachricht kopieren", messageCopied: "Einladungsnachricht kopiert.",
    enterCodeLabel: "Einladungscode eingeben", enterCodePlaceholder: "5-stelliger Code", submit: "Bestätigen",
    redeemSuccess: "Du hast {coins} Hash erhalten!", redeemedDone: "Du hast bereits einen Einladungscode eingegeben.",
    errorInvalid: "Gib 5 Kleinbuchstaben oder Ziffern ein.", errorNotFound: "Diesen Einladungscode gibt es nicht.",
    errorOwn: "Du kannst deinen eigenen Code nicht eingeben.", errorAlready: "Ein Einladungscode kann nur einmal eingegeben werden.",
    errorGeneric: "Bitte versuche es gleich noch einmal.",
    syncButton: "Kontakte synchronisieren", privacyNote: "Deine Kontakte werden nur auf diesem Gerät verwendet und nie auf unseren Servern gespeichert.",
    permissionBlocked: "Der Zugriff auf Kontakte ist aus. Erlaube ihn in den Einstellungen.", openSettings: "Einstellungen öffnen",
    searchPlaceholder: "Name oder Telefonnummer suchen", invite: "Einladen", invited: "Eingeladen",
    noContacts: "Keine Kontakte mit Telefonnummer.", noResults: "Keine Ergebnisse.",
    appOnly: "Die Kontaktsynchronisierung gibt es in der neuesten App-Version.", later: "Später",
    inviteMessage: "{name} lädt dich zu HashChat ein! Registriere dich und gib den Code {code} ein – wir bekommen beide {coins} Hash.\n{link}",
    coinSource: "Freundeseinladung",
  },
  es: {
    title: "Sincronizar contactos", headline: "Invita a tus amigos y gana Hash",
    description: "Cuando un amigo se registra e introduce tu código de invitación, ambos recibís {coins} Hash.",
    myCodeLabel: "Mi código de invitación", copyCode: "Copiar código", codeCopied: "Código de invitación copiado.",
    copyMessage: "Copiar mensaje de invitación", messageCopied: "Mensaje de invitación copiado.",
    enterCodeLabel: "Introducir un código de invitación", enterCodePlaceholder: "Código de 5 caracteres", submit: "Confirmar",
    redeemSuccess: "¡Has recibido {coins} Hash!", redeemedDone: "Ya has introducido un código de invitación.",
    errorInvalid: "Introduce 5 letras minúsculas o números.", errorNotFound: "Ese código de invitación no existe.",
    errorOwn: "No puedes introducir tu propio código.", errorAlready: "El código de invitación solo se puede introducir una vez.",
    errorGeneric: "Inténtalo de nuevo en un momento.",
    syncButton: "Sincronizar contactos", privacyNote: "Tus contactos solo se usan en este dispositivo y nunca se guardan en nuestros servidores.",
    permissionBlocked: "El acceso a los contactos está desactivado. Permítelo en Ajustes.", openSettings: "Abrir Ajustes",
    searchPlaceholder: "Buscar nombre o teléfono", invite: "Invitar", invited: "Invitado",
    noContacts: "No hay contactos con número de teléfono.", noResults: "Sin resultados.",
    appOnly: "La sincronización de contactos está disponible en la última versión de la app.", later: "Más tarde",
    inviteMessage: "¡{name} te invita a HashChat! Regístrate e introduce el código {code}: los dos recibimos {coins} Hash.\n{link}",
    coinSource: "Invitación de amigo",
  },
  pt: {
    title: "Sincronizar contatos", headline: "Convide amigos e ganhe Hash",
    description: "Quando um amigo se cadastra e digita seu código de convite, vocês dois ganham {coins} Hash.",
    myCodeLabel: "Meu código de convite", copyCode: "Copiar código", codeCopied: "Código de convite copiado.",
    copyMessage: "Copiar mensagem de convite", messageCopied: "Mensagem de convite copiada.",
    enterCodeLabel: "Digitar um código de convite", enterCodePlaceholder: "Código de 5 caracteres", submit: "Confirmar",
    redeemSuccess: "Você ganhou {coins} Hash!", redeemedDone: "Você já digitou um código de convite.",
    errorInvalid: "Digite 5 letras minúsculas ou números.", errorNotFound: "Esse código de convite não existe.",
    errorOwn: "Você não pode digitar seu próprio código.", errorAlready: "O código de convite só pode ser digitado uma vez.",
    errorGeneric: "Tente novamente em instantes.",
    syncButton: "Sincronizar contatos", privacyNote: "Seus contatos são usados apenas neste aparelho e nunca são salvos em nossos servidores.",
    permissionBlocked: "O acesso aos contatos está desativado. Permita nos Ajustes.", openSettings: "Abrir Ajustes",
    searchPlaceholder: "Buscar nome ou telefone", invite: "Convidar", invited: "Convidado",
    noContacts: "Nenhum contato com número de telefone.", noResults: "Nenhum resultado.",
    appOnly: "A sincronização de contatos está disponível na versão mais recente do app.", later: "Agora não",
    inviteMessage: "{name} convidou você para o HashChat! Cadastre-se e digite o código {code}: nós dois ganhamos {coins} Hash.\n{link}",
    coinSource: "Convite de amigo",
  },
  it: {
    title: "Sincronizza contatti", headline: "Invita gli amici e ricevi Hash",
    description: "Quando un amico si registra e inserisce il tuo codice invito, ricevete entrambi {coins} Hash.",
    myCodeLabel: "Il mio codice invito", copyCode: "Copia codice", codeCopied: "Codice invito copiato.",
    copyMessage: "Copia messaggio di invito", messageCopied: "Messaggio di invito copiato.",
    enterCodeLabel: "Inserisci un codice invito", enterCodePlaceholder: "Codice di 5 caratteri", submit: "Conferma",
    redeemSuccess: "Hai ricevuto {coins} Hash!", redeemedDone: "Hai già inserito un codice invito.",
    errorInvalid: "Inserisci 5 lettere minuscole o cifre.", errorNotFound: "Questo codice invito non esiste.",
    errorOwn: "Non puoi inserire il tuo codice.", errorAlready: "Il codice invito si può inserire una sola volta.",
    errorGeneric: "Riprova tra poco.",
    syncButton: "Sincronizza contatti", privacyNote: "I tuoi contatti vengono usati solo su questo dispositivo e non vengono mai salvati sui nostri server.",
    permissionBlocked: "L'accesso ai contatti è disattivato. Consentilo nelle Impostazioni.", openSettings: "Apri Impostazioni",
    searchPlaceholder: "Cerca nome o numero", invite: "Invita", invited: "Invitato",
    noContacts: "Nessun contatto con numero di telefono.", noResults: "Nessun risultato.",
    appOnly: "La sincronizzazione dei contatti è disponibile nell'ultima versione dell'app.", later: "Più tardi",
    inviteMessage: "{name} ti ha invitato su HashChat! Registrati e inserisci il codice {code}: riceviamo entrambi {coins} Hash.\n{link}",
    coinSource: "Invito amico",
  },
  ru: {
    title: "Синхронизация контактов", headline: "Приглашайте друзей и получайте Хэш",
    description: "Когда друг зарегистрируется и введёт ваш код приглашения, вы оба получите {coins} Хэш.",
    myCodeLabel: "Мой код приглашения", copyCode: "Скопировать код", codeCopied: "Код приглашения скопирован.",
    copyMessage: "Скопировать приглашение", messageCopied: "Приглашение скопировано.",
    enterCodeLabel: "Ввести код приглашения", enterCodePlaceholder: "Код из 5 символов", submit: "Готово",
    redeemSuccess: "Вы получили {coins} Хэш!", redeemedDone: "Вы уже ввели код приглашения.",
    errorInvalid: "Введите 5 строчных латинских букв или цифр.", errorNotFound: "Такого кода приглашения нет.",
    errorOwn: "Нельзя ввести собственный код.", errorAlready: "Код приглашения можно ввести только один раз.",
    errorGeneric: "Попробуйте ещё раз чуть позже.",
    syncButton: "Синхронизировать контакты", privacyNote: "Контакты используются только на этом устройстве и не сохраняются на наших серверах.",
    permissionBlocked: "Доступ к контактам выключен. Разрешите его в настройках.", openSettings: "Открыть настройки",
    searchPlaceholder: "Поиск по имени или номеру", invite: "Пригласить", invited: "Приглашён",
    noContacts: "Нет контактов с номером телефона.", noResults: "Ничего не найдено.",
    appOnly: "Синхронизация контактов доступна в последней версии приложения.", later: "Позже",
    inviteMessage: "{name} приглашает вас в HashChat! Зарегистрируйтесь и введите код {code} — мы оба получим {coins} Хэш.\n{link}",
    coinSource: "Приглашение друга",
  },
  ar: {
    title: "مزامنة جهات الاتصال", headline: "ادعُ أصدقاءك واحصل على هاش",
    description: "عندما يسجّل صديقك ويُدخل رمز دعوتك، يحصل كلٌّ منكما على {coins} هاش.",
    myCodeLabel: "رمز دعوتي", copyCode: "نسخ الرمز", codeCopied: "تم نسخ رمز الدعوة.",
    copyMessage: "نسخ رسالة الدعوة", messageCopied: "تم نسخ رسالة الدعوة.",
    enterCodeLabel: "إدخال رمز دعوة", enterCodePlaceholder: "رمز من 5 أحرف", submit: "تأكيد",
    redeemSuccess: "حصلت على {coins} هاش!", redeemedDone: "لقد أدخلت رمز دعوة من قبل.",
    errorInvalid: "أدخل 5 أحرف إنجليزية صغيرة أو أرقام.", errorNotFound: "رمز الدعوة هذا غير موجود.",
    errorOwn: "لا يمكنك إدخال رمزك الخاص.", errorAlready: "يمكن إدخال رمز الدعوة مرة واحدة فقط.",
    errorGeneric: "يُرجى المحاولة مرة أخرى بعد قليل.",
    syncButton: "مزامنة جهات الاتصال", privacyNote: "تُستخدم جهات اتصالك على هذا الجهاز فقط ولا تُحفظ على خوادمنا أبدًا.",
    permissionBlocked: "الوصول إلى جهات الاتصال متوقف. اسمح به من الإعدادات.", openSettings: "فتح الإعدادات",
    searchPlaceholder: "ابحث بالاسم أو رقم الهاتف", invite: "دعوة", invited: "تمت الدعوة",
    noContacts: "لا توجد جهات اتصال لها رقم هاتف.", noResults: "لا توجد نتائج.",
    appOnly: "مزامنة جهات الاتصال متاحة في أحدث إصدار من التطبيق.", later: "لاحقًا",
    inviteMessage: "{name} يدعوك إلى HashChat! سجّل وأدخل رمز الدعوة {code} ليحصل كلٌّ منا على {coins} هاش.\n{link}",
    coinSource: "دعوة صديق",
  },
  hi: {
    title: "संपर्क सिंक करें", headline: "दोस्तों को बुलाएँ, हैश पाएँ",
    description: "जब कोई दोस्त साइन अप करके आपका आमंत्रण कोड डालता है, तो आप दोनों को {coins} हैश मिलते हैं।",
    myCodeLabel: "मेरा आमंत्रण कोड", copyCode: "कोड कॉपी करें", codeCopied: "आमंत्रण कोड कॉपी हो गया।",
    copyMessage: "आमंत्रण संदेश कॉपी करें", messageCopied: "आमंत्रण संदेश कॉपी हो गया।",
    enterCodeLabel: "आमंत्रण कोड डालें", enterCodePlaceholder: "5 अक्षरों का कोड", submit: "पुष्टि करें",
    redeemSuccess: "आपको {coins} हैश मिले!", redeemedDone: "आप पहले ही आमंत्रण कोड डाल चुके हैं।",
    errorInvalid: "5 छोटे अंग्रेज़ी अक्षर या अंक डालें।", errorNotFound: "यह आमंत्रण कोड मौजूद नहीं है।",
    errorOwn: "आप अपना ही कोड नहीं डाल सकते।", errorAlready: "आमंत्रण कोड सिर्फ़ एक बार डाला जा सकता है।",
    errorGeneric: "कृपया थोड़ी देर बाद फिर कोशिश करें।",
    syncButton: "संपर्क सिंक करें", privacyNote: "आपके संपर्क सिर्फ़ इसी डिवाइस पर इस्तेमाल होते हैं और हमारे सर्वर पर कभी सेव नहीं होते।",
    permissionBlocked: "संपर्कों की अनुमति बंद है। सेटिंग्स में अनुमति दें।", openSettings: "सेटिंग्स खोलें",
    searchPlaceholder: "नाम या फ़ोन नंबर खोजें", invite: "आमंत्रित करें", invited: "आमंत्रित",
    noContacts: "फ़ोन नंबर वाला कोई संपर्क नहीं है।", noResults: "कोई नतीजा नहीं।",
    appOnly: "संपर्क सिंक ऐप के नवीनतम संस्करण में उपलब्ध है।", later: "बाद में",
    inviteMessage: "{name} ने आपको HashChat पर बुलाया है! साइन अप करके आमंत्रण कोड {code} डालें — हम दोनों को {coins} हैश मिलेंगे।\n{link}",
    coinSource: "दोस्त का आमंत्रण",
  },
  th: {
    title: "ซิงค์รายชื่อติดต่อ", headline: "ชวนเพื่อน รับแฮช",
    description: "เมื่อเพื่อนสมัครและกรอกรหัสเชิญของคุณ ทั้งคู่จะได้รับ {coins} แฮช",
    myCodeLabel: "รหัสเชิญของฉัน", copyCode: "คัดลอกรหัส", codeCopied: "คัดลอกรหัสเชิญแล้ว",
    copyMessage: "คัดลอกข้อความเชิญ", messageCopied: "คัดลอกข้อความเชิญแล้ว",
    enterCodeLabel: "กรอกรหัสเชิญ", enterCodePlaceholder: "รหัส 5 ตัว", submit: "ยืนยัน",
    redeemSuccess: "คุณได้รับ {coins} แฮช!", redeemedDone: "คุณกรอกรหัสเชิญไปแล้ว",
    errorInvalid: "กรอกตัวอักษรอังกฤษพิมพ์เล็กหรือตัวเลข 5 ตัว", errorNotFound: "ไม่มีรหัสเชิญนี้",
    errorOwn: "กรอกรหัสของตัวเองไม่ได้", errorAlready: "กรอกรหัสเชิญได้เพียงครั้งเดียว",
    errorGeneric: "โปรดลองอีกครั้งในอีกสักครู่",
    syncButton: "ซิงค์รายชื่อติดต่อ", privacyNote: "รายชื่อติดต่อใช้เฉพาะบนอุปกรณ์นี้และไม่ถูกเก็บบนเซิร์ฟเวอร์ของเรา",
    permissionBlocked: "การเข้าถึงรายชื่อติดต่อปิดอยู่ โปรดอนุญาตในการตั้งค่า", openSettings: "เปิดการตั้งค่า",
    searchPlaceholder: "ค้นหาชื่อหรือเบอร์โทร", invite: "เชิญ", invited: "เชิญแล้ว",
    noContacts: "ไม่มีรายชื่อที่มีเบอร์โทร", noResults: "ไม่พบผลลัพธ์",
    appOnly: "การซิงค์รายชื่อติดต่อใช้ได้ในแอปเวอร์ชันล่าสุด", later: "ไว้ทีหลัง",
    inviteMessage: "{name} ชวนคุณมาใช้ HashChat! สมัครแล้วกรอกรหัสเชิญ {code} เราทั้งคู่จะได้รับ {coins} แฮช\n{link}",
    coinSource: "ชวนเพื่อน",
  },
  vi: {
    title: "Đồng bộ danh bạ", headline: "Mời bạn bè, nhận Hash",
    description: "Khi bạn bè đăng ký và nhập mã mời của bạn, cả hai cùng nhận {coins} Hash.",
    myCodeLabel: "Mã mời của tôi", copyCode: "Sao chép mã", codeCopied: "Đã sao chép mã mời.",
    copyMessage: "Sao chép lời mời", messageCopied: "Đã sao chép lời mời.",
    enterCodeLabel: "Nhập mã mời", enterCodePlaceholder: "Mã 5 ký tự", submit: "Xác nhận",
    redeemSuccess: "Bạn đã nhận {coins} Hash!", redeemedDone: "Bạn đã nhập mã mời rồi.",
    errorInvalid: "Hãy nhập 5 chữ cái thường hoặc chữ số.", errorNotFound: "Mã mời này không tồn tại.",
    errorOwn: "Bạn không thể nhập mã của chính mình.", errorAlready: "Mã mời chỉ được nhập một lần.",
    errorGeneric: "Vui lòng thử lại sau giây lát.",
    syncButton: "Đồng bộ danh bạ", privacyNote: "Danh bạ chỉ được dùng trên thiết bị này và không bao giờ được lưu trên máy chủ của chúng tôi.",
    permissionBlocked: "Quyền truy cập danh bạ đang tắt. Hãy cho phép trong Cài đặt.", openSettings: "Mở Cài đặt",
    searchPlaceholder: "Tìm tên hoặc số điện thoại", invite: "Mời", invited: "Đã mời",
    noContacts: "Không có liên hệ nào có số điện thoại.", noResults: "Không có kết quả.",
    appOnly: "Đồng bộ danh bạ có trong phiên bản ứng dụng mới nhất.", later: "Để sau",
    inviteMessage: "{name} mời bạn dùng HashChat! Đăng ký rồi nhập mã mời {code} — cả hai cùng nhận {coins} Hash.\n{link}",
    coinSource: "Mời bạn bè",
  },
};

export function resolveContactSyncCopy(rawLocale: string): ContactSyncCopy {
  const locale = resolvePrimaryUiLocaleTag(rawLocale) ?? "en";
  return CONTACT_SYNC_COPY_BY_LOCALE[locale] ?? CONTACT_SYNC_COPY_BY_LOCALE.en;
}

export const CONTACT_SYNC_COPY_LOCALES = Object.keys(CONTACT_SYNC_COPY_BY_LOCALE);
