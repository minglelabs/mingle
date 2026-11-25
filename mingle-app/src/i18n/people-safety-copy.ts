import { resolvePrimaryUiLocaleTag, type PrimaryUiLocale } from "@/i18n/mingle-locales";

/**
 * Copy for the owner's 2026-11-25 set: a woman can stop new rooms from men,
 * the explore filters, and "who visited my profile" (blurred until unlocked
 * for 30 Hash).
 */
export type PeopleSafetyCopy = {
  blockMenTitle: string;
  blockMenHint: string;
  recipientBlocksMen: string;
  filterButton: string;
  filterTitle: string;
  filterGender: string;
  filterAll: string;
  filterWomen: string;
  filterMen: string;
  filterAge: string;
  filterOnlineOnly: string;
  filterApply: string;
  filterReset: string;
  filterEmpty: string;
  visitorsTitle: string;
  visitorsHint: string;
  visitorsEmpty: string;
  visitorsUnlock: string;
  visitorsNotEnough: string;
  visitorsFailed: string;
};

const COPY: Record<PrimaryUiLocale, PeopleSafetyCopy> = {
  ko: {
    blockMenTitle: "남성의 새 대화 받지 않기", blockMenHint: "켜면 남성은 나에게 먼저 말을 걸 수 없어요. 이미 있는 대화와 내가 먼저 거는 대화는 그대로예요.",
    recipientBlocksMen: "이분은 지금 새 대화를 받지 않아요.",
    filterButton: "필터", filterTitle: "필터", filterGender: "성별", filterAll: "전체", filterWomen: "여성", filterMen: "남성", filterAge: "나이", filterOnlineOnly: "지금 접속 중인 사람만", filterApply: "적용하기", filterReset: "초기화", filterEmpty: "조건에 맞는 사람이 없어요.",
    visitorsTitle: "내 프로필을 본 사람", visitorsHint: "누가 봤는지 보려면 {coins}해씨가 필요해요.", visitorsEmpty: "아직 내 프로필을 본 사람이 없어요.", visitorsUnlock: "{coins}해씨로 보기", visitorsNotEnough: "해씨가 부족해요.", visitorsFailed: "지금은 열 수 없어요. 잠시 후 다시 시도해 주세요.",
  },
  en: {
    blockMenTitle: "Don't take new chats from men", blockMenHint: "When on, men can't message you first. Existing chats and chats you start stay as they are.",
    recipientBlocksMen: "This person isn't taking new chats right now.",
    filterButton: "Filter", filterTitle: "Filters", filterGender: "Gender", filterAll: "All", filterWomen: "Women", filterMen: "Men", filterAge: "Age", filterOnlineOnly: "Only people online now", filterApply: "Apply", filterReset: "Reset", filterEmpty: "No one matches these filters.",
    visitorsTitle: "Who viewed my profile", visitorsHint: "See who it was for {coins} Hash.", visitorsEmpty: "No one has viewed your profile yet.", visitorsUnlock: "See for {coins} Hash", visitorsNotEnough: "Not enough Hash.", visitorsFailed: "Couldn't open it right now. Please try again in a moment.",
  },
  ja: {
    blockMenTitle: "男性からの新しいトークを受け取らない", blockMenHint: "オンにすると、男性からは先に話しかけられません。既存のトークと自分から始めるトークはそのままです。",
    recipientBlocksMen: "この方は今、新しいトークを受け付けていません。",
    filterButton: "フィルター", filterTitle: "フィルター", filterGender: "性別", filterAll: "すべて", filterWomen: "女性", filterMen: "男性", filterAge: "年齢", filterOnlineOnly: "今オンラインの人だけ", filterApply: "適用", filterReset: "リセット", filterEmpty: "条件に合う人がいません。",
    visitorsTitle: "プロフィールを見た人", visitorsHint: "誰が見たかは{coins}ハッシュで見られます。", visitorsEmpty: "まだプロフィールを見た人はいません。", visitorsUnlock: "{coins}ハッシュで見る", visitorsNotEnough: "ハッシュが足りません。", visitorsFailed: "今は開けません。少し後でもう一度お試しください。",
  },
  "zh-CN": {
    blockMenTitle: "不接收男性的新聊天", blockMenHint: "开启后，男性无法先给你发消息。已有的聊天和你主动发起的聊天不受影响。",
    recipientBlocksMen: "对方现在不接收新的聊天。",
    filterButton: "筛选", filterTitle: "筛选", filterGender: "性别", filterAll: "全部", filterWomen: "女性", filterMen: "男性", filterAge: "年龄", filterOnlineOnly: "只看现在在线的人", filterApply: "应用", filterReset: "重置", filterEmpty: "没有符合条件的人。",
    visitorsTitle: "看过我主页的人", visitorsHint: "用 {coins} 哈希可查看是谁。", visitorsEmpty: "还没有人看过你的主页。", visitorsUnlock: "用 {coins} 哈希查看", visitorsNotEnough: "哈希不足。", visitorsFailed: "现在无法打开，请稍后再试。",
  },
  "zh-TW": {
    blockMenTitle: "不接收男性的新聊天", blockMenHint: "開啟後，男性無法先傳訊息給你。已有的聊天和你主動發起的聊天不受影響。",
    recipientBlocksMen: "對方現在不接收新的聊天。",
    filterButton: "篩選", filterTitle: "篩選", filterGender: "性別", filterAll: "全部", filterWomen: "女性", filterMen: "男性", filterAge: "年齡", filterOnlineOnly: "只看現在在線的人", filterApply: "套用", filterReset: "重設", filterEmpty: "沒有符合條件的人。",
    visitorsTitle: "看過我個人檔案的人", visitorsHint: "用 {coins} 哈希可查看是誰。", visitorsEmpty: "還沒有人看過你的個人檔案。", visitorsUnlock: "用 {coins} 哈希查看", visitorsNotEnough: "哈希不足。", visitorsFailed: "現在無法開啟，請稍後再試。",
  },
  fr: {
    blockMenTitle: "Refuser les nouvelles discussions des hommes", blockMenHint: "Activé, les hommes ne peuvent pas vous écrire en premier. Les discussions existantes et celles que vous lancez restent inchangées.",
    recipientBlocksMen: "Cette personne n'accepte pas de nouvelles discussions pour le moment.",
    filterButton: "Filtres", filterTitle: "Filtres", filterGender: "Genre", filterAll: "Tous", filterWomen: "Femmes", filterMen: "Hommes", filterAge: "Âge", filterOnlineOnly: "Seulement les personnes en ligne", filterApply: "Appliquer", filterReset: "Réinitialiser", filterEmpty: "Personne ne correspond à ces filtres.",
    visitorsTitle: "Qui a vu mon profil", visitorsHint: "Voyez qui c'était pour {coins} Hash.", visitorsEmpty: "Personne n'a encore vu votre profil.", visitorsUnlock: "Voir pour {coins} Hash", visitorsNotEnough: "Pas assez de Hash.", visitorsFailed: "Impossible de l'ouvrir pour l'instant. Réessayez dans un moment.",
  },
  de: {
    blockMenTitle: "Keine neuen Chats von Männern", blockMenHint: "Wenn aktiv, können Männer dir nicht zuerst schreiben. Bestehende Chats und Chats, die du beginnst, bleiben wie sie sind.",
    recipientBlocksMen: "Diese Person nimmt gerade keine neuen Chats an.",
    filterButton: "Filtern", filterTitle: "Filtern", filterGender: "Geschlecht", filterAll: "Alle", filterWomen: "Frauen", filterMen: "Männer", filterAge: "Alter", filterOnlineOnly: "Nur Leute, die gerade online sind", filterApply: "Anwenden", filterReset: "Zurücksetzen", filterEmpty: "Niemand passt zu diesen Filtern.",
    visitorsTitle: "Wer mein Profil angesehen hat", visitorsHint: "Für {coins} Hash siehst du, wer es war.", visitorsEmpty: "Noch hat niemand dein Profil angesehen.", visitorsUnlock: "Für {coins} Hash ansehen", visitorsNotEnough: "Nicht genug Hash.", visitorsFailed: "Gerade nicht möglich. Bitte versuch es gleich noch einmal.",
  },
  es: {
    blockMenTitle: "No recibir chats nuevos de hombres", blockMenHint: "Si está activado, los hombres no pueden escribirte primero. Los chats que ya tienes y los que empiezas tú no cambian.",
    recipientBlocksMen: "Esta persona no está aceptando chats nuevos ahora.",
    filterButton: "Filtros", filterTitle: "Filtros", filterGender: "Género", filterAll: "Todos", filterWomen: "Mujeres", filterMen: "Hombres", filterAge: "Edad", filterOnlineOnly: "Solo personas conectadas ahora", filterApply: "Aplicar", filterReset: "Restablecer", filterEmpty: "Nadie coincide con estos filtros.",
    visitorsTitle: "Quién vio mi perfil", visitorsHint: "Mira quién fue por {coins} Hash.", visitorsEmpty: "Nadie ha visto tu perfil todavía.", visitorsUnlock: "Ver por {coins} Hash", visitorsNotEnough: "No tienes suficientes Hash.", visitorsFailed: "No se puede abrir ahora. Inténtalo de nuevo en un momento.",
  },
  pt: {
    blockMenTitle: "Não receber novas conversas de homens", blockMenHint: "Ativado, os homens não podem falar com você primeiro. As conversas existentes e as que você começa continuam iguais.",
    recipientBlocksMen: "Esta pessoa não está aceitando novas conversas agora.",
    filterButton: "Filtros", filterTitle: "Filtros", filterGender: "Gênero", filterAll: "Todos", filterWomen: "Mulheres", filterMen: "Homens", filterAge: "Idade", filterOnlineOnly: "Só quem está online agora", filterApply: "Aplicar", filterReset: "Redefinir", filterEmpty: "Ninguém corresponde a esses filtros.",
    visitorsTitle: "Quem viu meu perfil", visitorsHint: "Veja quem foi por {coins} Hash.", visitorsEmpty: "Ninguém viu seu perfil ainda.", visitorsUnlock: "Ver por {coins} Hash", visitorsNotEnough: "Hash insuficiente.", visitorsFailed: "Não foi possível abrir agora. Tente de novo em instantes.",
  },
  it: {
    blockMenTitle: "Non ricevere nuove chat dagli uomini", blockMenHint: "Se attivo, gli uomini non possono scriverti per primi. Le chat esistenti e quelle che inizi tu restano come sono.",
    recipientBlocksMen: "Questa persona non accetta nuove chat al momento.",
    filterButton: "Filtri", filterTitle: "Filtri", filterGender: "Genere", filterAll: "Tutti", filterWomen: "Donne", filterMen: "Uomini", filterAge: "Età", filterOnlineOnly: "Solo persone online ora", filterApply: "Applica", filterReset: "Reimposta", filterEmpty: "Nessuno corrisponde a questi filtri.",
    visitorsTitle: "Chi ha visto il mio profilo", visitorsHint: "Scopri chi è stato per {coins} Hash.", visitorsEmpty: "Nessuno ha ancora visto il tuo profilo.", visitorsUnlock: "Vedi per {coins} Hash", visitorsNotEnough: "Hash insufficienti.", visitorsFailed: "Non si può aprire ora. Riprova tra poco.",
  },
  ru: {
    blockMenTitle: "Не принимать новые чаты от мужчин", blockMenHint: "Если включено, мужчины не смогут написать вам первыми. Существующие чаты и те, что начинаете вы, не меняются.",
    recipientBlocksMen: "Этот человек сейчас не принимает новые чаты.",
    filterButton: "Фильтры", filterTitle: "Фильтры", filterGender: "Пол", filterAll: "Все", filterWomen: "Женщины", filterMen: "Мужчины", filterAge: "Возраст", filterOnlineOnly: "Только те, кто сейчас онлайн", filterApply: "Применить", filterReset: "Сбросить", filterEmpty: "Никто не подходит под эти фильтры.",
    visitorsTitle: "Кто смотрел мой профиль", visitorsHint: "Узнайте, кто это был, за {coins} Hash.", visitorsEmpty: "Ваш профиль ещё никто не смотрел.", visitorsUnlock: "Посмотреть за {coins} Hash", visitorsNotEnough: "Недостаточно Hash.", visitorsFailed: "Сейчас не открыть. Попробуйте чуть позже.",
  },
  ar: {
    blockMenTitle: "عدم استقبال محادثات جديدة من الرجال", blockMenHint: "عند التفعيل، لا يمكن للرجال مراسلتك أولًا. تبقى المحادثات الحالية والتي تبدئينها كما هي.",
    recipientBlocksMen: "هذا الشخص لا يستقبل محادثات جديدة الآن.",
    filterButton: "تصفية", filterTitle: "التصفية", filterGender: "الجنس", filterAll: "الكل", filterWomen: "نساء", filterMen: "رجال", filterAge: "العمر", filterOnlineOnly: "المتصلون الآن فقط", filterApply: "تطبيق", filterReset: "إعادة ضبط", filterEmpty: "لا يوجد أحد يطابق هذه الشروط.",
    visitorsTitle: "من زار ملفي الشخصي", visitorsHint: "اعرف من زارك مقابل {coins} هاش.", visitorsEmpty: "لم يزر أحد ملفك الشخصي بعد.", visitorsUnlock: "اعرض مقابل {coins} هاش", visitorsNotEnough: "رصيد الهاش غير كافٍ.", visitorsFailed: "لا يمكن الفتح الآن. حاول مرة أخرى بعد قليل.",
  },
  hi: {
    blockMenTitle: "पुरुषों से नई चैट न लें", blockMenHint: "चालू होने पर पुरुष आपको पहले मैसेज नहीं कर सकते। पुरानी चैट और आपकी शुरू की गई चैट वैसी ही रहती हैं।",
    recipientBlocksMen: "यह व्यक्ति अभी नई चैट नहीं ले रहा है।",
    filterButton: "फ़िल्टर", filterTitle: "फ़िल्टर", filterGender: "लिंग", filterAll: "सभी", filterWomen: "महिलाएँ", filterMen: "पुरुष", filterAge: "उम्र", filterOnlineOnly: "सिर्फ़ अभी ऑनलाइन लोग", filterApply: "लागू करें", filterReset: "रीसेट करें", filterEmpty: "इन शर्तों से कोई मेल नहीं खाता।",
    visitorsTitle: "मेरी प्रोफ़ाइल किसने देखी", visitorsHint: "{coins} हैश में देखें कि कौन था।", visitorsEmpty: "अभी तक किसी ने आपकी प्रोफ़ाइल नहीं देखी।", visitorsUnlock: "{coins} हैश में देखें", visitorsNotEnough: "हैश कम है।", visitorsFailed: "अभी नहीं खुल सका। थोड़ी देर बाद फिर कोशिश करें।",
  },
  th: {
    blockMenTitle: "ไม่รับแชตใหม่จากผู้ชาย", blockMenHint: "เมื่อเปิด ผู้ชายจะทักคุณก่อนไม่ได้ แชตที่มีอยู่และแชตที่คุณเริ่มเองยังเหมือนเดิม",
    recipientBlocksMen: "คนนี้ยังไม่รับแชตใหม่ตอนนี้",
    filterButton: "ตัวกรอง", filterTitle: "ตัวกรอง", filterGender: "เพศ", filterAll: "ทั้งหมด", filterWomen: "ผู้หญิง", filterMen: "ผู้ชาย", filterAge: "อายุ", filterOnlineOnly: "เฉพาะคนที่ออนไลน์อยู่", filterApply: "ใช้", filterReset: "รีเซ็ต", filterEmpty: "ไม่มีใครตรงกับเงื่อนไขนี้",
    visitorsTitle: "คนที่ดูโปรไฟล์ของฉัน", visitorsHint: "ดูว่าเป็นใครด้วย {coins} แฮช", visitorsEmpty: "ยังไม่มีใครดูโปรไฟล์ของคุณ", visitorsUnlock: "ดูด้วย {coins} แฮช", visitorsNotEnough: "แฮชไม่พอ", visitorsFailed: "ตอนนี้เปิดไม่ได้ ลองใหม่อีกครั้งในอีกสักครู่",
  },
  vi: {
    blockMenTitle: "Không nhận trò chuyện mới từ nam", blockMenHint: "Khi bật, nam không thể nhắn cho bạn trước. Các cuộc trò chuyện đã có và do bạn bắt đầu vẫn giữ nguyên.",
    recipientBlocksMen: "Người này hiện không nhận trò chuyện mới.",
    filterButton: "Bộ lọc", filterTitle: "Bộ lọc", filterGender: "Giới tính", filterAll: "Tất cả", filterWomen: "Nữ", filterMen: "Nam", filterAge: "Tuổi", filterOnlineOnly: "Chỉ người đang online", filterApply: "Áp dụng", filterReset: "Đặt lại", filterEmpty: "Không có ai khớp với bộ lọc này.",
    visitorsTitle: "Ai đã xem hồ sơ của tôi", visitorsHint: "Xem đó là ai với {coins} Hash.", visitorsEmpty: "Chưa có ai xem hồ sơ của bạn.", visitorsUnlock: "Xem với {coins} Hash", visitorsNotEnough: "Không đủ Hash.", visitorsFailed: "Hiện không mở được. Vui lòng thử lại sau.",
  },
};

export function resolvePeopleSafetyCopy(rawLocale: string): PeopleSafetyCopy {
  const locale = resolvePrimaryUiLocaleTag(rawLocale) ?? "en";
  return COPY[locale] ?? COPY.en;
}

export function fillCoins(text: string, coins: number): string {
  return text.replace("{coins}", String(coins));
}
