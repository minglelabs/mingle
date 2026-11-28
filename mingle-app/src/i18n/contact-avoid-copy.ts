import { resolvePrimaryUiLocaleTag, type PrimaryUiLocale } from "@/i18n/mingle-locales";

/** Hiding from people in the address book (owner, 2026-11-26; src/server/contact-avoid.ts). */
export type ContactAvoidCopy = {
  /** The switch on the contacts screen. */
  title: string;
  /** Under it while it is on. */
  onBody: string;
  /** Under it while it is off. */
  offBody: string;
  /** On a friend's row: the two do not see each other. */
  hidden: string;
  /** On a friend's row: let through. */
  shown: string;
};

type Row = [title: string, onBody: string, offBody: string, hidden: string, shown: string];

const ROWS: Record<PrimaryUiLocale, Row> = {
  ko: ["지인에게 내 프로필 숨기기", "연락처에 있는 사람과는 탐색에서 서로 보이지 않아요. 나중에 가입하는 지인도 마찬가지예요. 아래에서 사람별로 풀 수 있어요.", "꺼져 있어요. 연락처에 있는 사람에게도 탐색에서 내 프로필이 보여요.", "숨김", "보임"],
  en: ["Hide my profile from people I know", "You and the people in your contacts do not see each other on Explore, including those who join later. You can let someone through below.", "Off. People in your contacts can see your profile on Explore.", "Hidden", "Shown"],
  ja: ["知り合いにプロフィールを見せない", "連絡先にいる人とは、探すタブでお互いに表示されません。あとから登録した知り合いも同じです。下で人ごとに解除できます。", "オフです。連絡先にいる人にも探すタブであなたのプロフィールが表示されます。", "非表示", "表示"],
  "zh-CN": ["对熟人隐藏我的资料", "你和通讯录里的人在探索页互相看不到，之后加入的熟人也一样。可以在下方逐个取消。", "已关闭。通讯录里的人也能在探索页看到你的资料。", "已隐藏", "可见"],
  "zh-TW": ["對熟人隱藏我的檔案", "你和通訊錄裡的人在探索頁互相看不到，之後加入的熟人也一樣。可以在下方逐一取消。", "已關閉。通訊錄裡的人也能在探索頁看到你的檔案。", "已隱藏", "可見"],
  fr: ["Cacher mon profil à mes connaissances", "Vous et les personnes de vos contacts ne vous voyez pas dans Explorer, y compris celles qui s’inscrivent plus tard. Vous pouvez faire une exception ci-dessous.", "Désactivé. Les personnes de vos contacts voient votre profil dans Explorer.", "Caché", "Visible"],
  de: ["Mein Profil vor Bekannten verbergen", "Du und die Leute in deinen Kontakten seht euch unter Entdecken nicht, auch wer später dazukommt. Unten kannst du einzelne freigeben.", "Aus. Leute in deinen Kontakten sehen dein Profil unter Entdecken.", "Verborgen", "Sichtbar"],
  es: ["Ocultar mi perfil a mis conocidos", "Tú y las personas de tus contactos no os veis en Explorar, tampoco quienes se unan después. Abajo puedes hacer excepciones.", "Desactivado. Las personas de tus contactos ven tu perfil en Explorar.", "Oculto", "Visible para esa persona"],
  pt: ["Ocultar meu perfil de conhecidos", "Você e as pessoas dos seus contatos não se veem em Explorar, nem quem entrar depois. Abaixo você pode liberar alguém.", "Desativado. As pessoas dos seus contatos veem seu perfil em Explorar.", "Oculto", "Liberado"],
  it: ["Nascondi il mio profilo ai conoscenti", "Tu e le persone nei tuoi contatti non vi vedete in Esplora, nemmeno chi si iscrive dopo. Sotto puoi fare eccezioni.", "Disattivato. Le persone nei tuoi contatti vedono il tuo profilo in Esplora.", "Nascosto", "Visibile"],
  ru: ["Скрыть мой профиль от знакомых", "Вы и люди из ваших контактов не видите друг друга в «Поиске людей», включая тех, кто присоединится позже. Ниже можно сделать исключение.", "Выключено. Люди из ваших контактов видят ваш профиль в «Поиске людей».", "Скрыт", "Виден"],
  ar: ["إخفاء ملفي عن معارفي", "أنت والأشخاص في جهات اتصالك لا ترون بعضكم في الاستكشاف، ومن ينضم لاحقًا كذلك. يمكنك استثناء شخص بالأسفل.", "متوقف. الأشخاص في جهات اتصالك يرون ملفك في الاستكشاف.", "مخفي", "ظاهر"],
  hi: ["जान-पहचान वालों से मेरी प्रोफ़ाइल छिपाएँ", "आप और आपके संपर्कों के लोग एक्सप्लोर में एक-दूसरे को नहीं दिखते, बाद में जुड़ने वाले भी। नीचे किसी को छूट दे सकते हैं।", "बंद है। आपके संपर्कों के लोग एक्सप्लोर में आपकी प्रोफ़ाइल देख सकते हैं।", "छिपा है", "दिखता है"],
  th: ["ซ่อนโปรไฟล์จากคนรู้จัก", "คุณกับคนในรายชื่อติดต่อจะไม่เห็นกันในหน้าสำรวจ รวมถึงคนที่สมัครทีหลัง ยกเว้นเป็นรายคนได้ด้านล่าง", "ปิดอยู่ คนในรายชื่อติดต่อเห็นโปรไฟล์ของคุณในหน้าสำรวจ", "ซ่อนอยู่", "มองเห็น"],
  vi: ["Ẩn hồ sơ với người quen", "Bạn và những người trong danh bạ không thấy nhau ở mục Khám phá, kể cả người tham gia sau. Có thể bỏ ẩn từng người bên dưới.", "Đang tắt. Người trong danh bạ thấy hồ sơ của bạn ở mục Khám phá.", "Đang ẩn", "Hiển thị"],
};

export function resolveContactAvoidCopy(rawLocale: string): ContactAvoidCopy {
  const locale = resolvePrimaryUiLocaleTag(rawLocale) ?? "en";
  const row = ROWS[locale] ?? ROWS.en;
  return { title: row[0], onBody: row[1], offBody: row[2], hidden: row[3], shown: row[4] };
}
