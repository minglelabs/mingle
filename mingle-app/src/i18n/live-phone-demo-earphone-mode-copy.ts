import { DEFAULT_LOCALE, resolveLegalDocumentLocale, resolveSupportedLocaleTag, type LegalDocumentLocale } from "@/i18n/config";
import { getSttLanguageDisplayName } from "@/lib/stt-languages";

export type LivePhoneDemoEarphoneModeCopy = {
  // Button / "+" menu row label and the notice title.
  label: string;
  onStateLabel: string;
  offStateLabel: string;
  // Toggle is on but no earphones are connected.
  waitingLabel: string;
  // The notice: the mode works only with earphones or a headset.
  noticeBody: string;
  // Added to the notice only while no earphones are connected.
  noticeNotConnectedBody: string;
  // Heading of the notice's language list.
  readLanguageLabel: string;
  noticeConfirmLabel: string;
};

const EARPHONE_MODE_COPY_BY_LOCALE = {
  ko: {
    label: "이어폰 모드",
    onStateLabel: "켜짐",
    offStateLabel: "꺼짐",
    waitingLabel: "이어폰 연결 대기 중",
    noticeBody: "이어폰이나 헤드셋을 착용하고 있을 때만 동작해요.",
    noticeNotConnectedBody: "지금은 이어폰이 연결되어 있지 않아요. 이어폰을 연결하면 읽기 시작해요.",
    readLanguageLabel: "들려드릴 언어",
    noticeConfirmLabel: "확인",
  },
  en: {
    label: "Earphone mode",
    onStateLabel: "On",
    offStateLabel: "Off",
    waitingLabel: "Waiting for earphones",
    noticeBody: "Works only while you are wearing earphones or a headset.",
    noticeNotConnectedBody: "No earphones are connected right now. Reading starts when you connect them.",
    readLanguageLabel: "Language to read aloud",
    noticeConfirmLabel: "OK",
  },
  ja: {
    label: "イヤホンモード",
    onStateLabel: "オン",
    offStateLabel: "オフ",
    waitingLabel: "イヤホンの接続待ち",
    noticeBody: "イヤホンまたはヘッドセットを装着しているときだけ動作します。",
    noticeNotConnectedBody: "現在イヤホンが接続されていません。イヤホンを接続すると読み上げを開始します。",
    readLanguageLabel: "読み上げる言語",
    noticeConfirmLabel: "OK",
  },
  "zh-CN": {
    label: "耳机模式",
    onStateLabel: "已开启",
    offStateLabel: "已关闭",
    waitingLabel: "等待连接耳机",
    noticeBody: "仅在佩戴耳机或头戴式耳机时生效。",
    noticeNotConnectedBody: "当前未连接耳机。连接耳机后将开始朗读。",
    readLanguageLabel: "朗读语言",
    noticeConfirmLabel: "确定",
  },
  "zh-TW": {
    label: "耳機模式",
    onStateLabel: "已開啟",
    offStateLabel: "已關閉",
    waitingLabel: "等待連接耳機",
    noticeBody: "僅在戴著耳機或耳麥時運作。",
    noticeNotConnectedBody: "目前未連接耳機。連接耳機後就會開始朗讀。",
    readLanguageLabel: "朗讀語言",
    noticeConfirmLabel: "確定",
  },
  fr: {
    label: "Mode écouteurs",
    onStateLabel: "Activé",
    offStateLabel: "Désactivé",
    waitingLabel: "En attente des écouteurs",
    noticeBody: "Fonctionne uniquement lorsque vous portez des écouteurs ou un casque.",
    noticeNotConnectedBody: "Aucun écouteur n’est connecté pour le moment. La lecture commencera dès que vous les connecterez.",
    readLanguageLabel: "Langue de lecture",
    noticeConfirmLabel: "OK",
  },
  de: {
    label: "Kopfhörermodus",
    onStateLabel: "Ein",
    offStateLabel: "Aus",
    waitingLabel: "Warten auf Kopfhörer",
    noticeBody: "Funktioniert nur, während Sie Kopfhörer oder ein Headset tragen.",
    noticeNotConnectedBody: "Derzeit sind keine Kopfhörer verbunden. Das Vorlesen beginnt, sobald Sie sie verbinden.",
    readLanguageLabel: "Vorlesesprache",
    noticeConfirmLabel: "OK",
  },
  es: {
    label: "Modo auriculares",
    onStateLabel: "Activado",
    offStateLabel: "Desactivado",
    waitingLabel: "Esperando auriculares",
    noticeBody: "Solo funciona mientras llevas auriculares o cascos.",
    noticeNotConnectedBody: "Ahora mismo no hay auriculares conectados. La lectura empezará cuando los conectes.",
    readLanguageLabel: "Idioma de lectura",
    noticeConfirmLabel: "Aceptar",
  },
  pt: {
    label: "Modo fones de ouvido",
    onStateLabel: "Ativado",
    offStateLabel: "Desativado",
    waitingLabel: "Aguardando fones de ouvido",
    noticeBody: "Funciona apenas enquanto você usa fones de ouvido ou headset.",
    noticeNotConnectedBody: "Nenhum fone de ouvido está conectado agora. A leitura começa quando você conectá-los.",
    readLanguageLabel: "Idioma da leitura",
    noticeConfirmLabel: "OK",
  },
  it: {
    label: "Modalità auricolari",
    onStateLabel: "Attiva",
    offStateLabel: "Disattiva",
    waitingLabel: "In attesa degli auricolari",
    noticeBody: "Funziona solo mentre indossi auricolari o cuffie.",
    noticeNotConnectedBody: "Al momento non ci sono auricolari collegati. La lettura inizierà quando li colleghi.",
    readLanguageLabel: "Lingua di lettura",
    noticeConfirmLabel: "OK",
  },
  ru: {
    label: "Режим наушников",
    onStateLabel: "Вкл.",
    offStateLabel: "Выкл.",
    waitingLabel: "Ожидание наушников",
    noticeBody: "Работает, только когда вы в наушниках или гарнитуре.",
    noticeNotConnectedBody: "Сейчас наушники не подключены. Чтение начнётся, когда вы их подключите.",
    readLanguageLabel: "Язык чтения",
    noticeConfirmLabel: "OK",
  },
  ar: {
    label: "وضع السماعات",
    onStateLabel: "مفعّل",
    offStateLabel: "متوقف",
    waitingLabel: "بانتظار توصيل السماعات",
    noticeBody: "يعمل فقط أثناء ارتداء سماعات الأذن أو سماعة الرأس.",
    noticeNotConnectedBody: "لا توجد سماعات متصلة الآن. ستبدأ القراءة عند توصيلها.",
    readLanguageLabel: "لغة القراءة",
    noticeConfirmLabel: "حسنًا",
  },
  hi: {
    label: "ईयरफ़ोन मोड",
    onStateLabel: "चालू",
    offStateLabel: "बंद",
    waitingLabel: "ईयरफ़ोन कनेक्ट होने का इंतज़ार",
    noticeBody: "यह केवल तभी काम करता है जब आपने ईयरफ़ोन या हेडसेट पहना हो।",
    noticeNotConnectedBody: "अभी कोई ईयरफ़ोन कनेक्ट नहीं है। ईयरफ़ोन कनेक्ट करते ही पढ़ना शुरू हो जाएगा।",
    readLanguageLabel: "पढ़कर सुनाने की भाषा",
    noticeConfirmLabel: "ठीक है",
  },
  th: {
    label: "โหมดหูฟัง",
    onStateLabel: "เปิด",
    offStateLabel: "ปิด",
    waitingLabel: "กำลังรอเชื่อมต่อหูฟัง",
    noticeBody: "ทำงานเฉพาะเมื่อคุณสวมหูฟังหรือชุดหูฟังอยู่",
    noticeNotConnectedBody: "ขณะนี้ไม่ได้เชื่อมต่อหูฟัง ระบบจะเริ่มอ่านเมื่อคุณเชื่อมต่อหูฟัง",
    readLanguageLabel: "ภาษาที่อ่านออกเสียง",
    noticeConfirmLabel: "ตกลง",
  },
  vi: {
    label: "Chế độ tai nghe",
    onStateLabel: "Bật",
    offStateLabel: "Tắt",
    waitingLabel: "Đang chờ kết nối tai nghe",
    noticeBody: "Chỉ hoạt động khi bạn đang đeo tai nghe hoặc headset.",
    noticeNotConnectedBody: "Hiện chưa có tai nghe nào được kết nối. Việc đọc sẽ bắt đầu khi bạn kết nối tai nghe.",
    readLanguageLabel: "Ngôn ngữ đọc",
    noticeConfirmLabel: "OK",
  },
} satisfies Record<LegalDocumentLocale, LivePhoneDemoEarphoneModeCopy>;

// Korean directional particle: 로 after a vowel or a final ㄹ, 으로 after any
// other final consonant. Decided by the last Hangul syllable, so
// "중국어(대만)" reads "중국어(대만)으로".
function withKoreanDirectionalParticle(word: string): string {
  const lastSyllable = word.match(/[\uAC00-\uD7A3]/g)?.at(-1);
  if (!lastSyllable) return `${word}(으)로`;
  const finalConsonant = (lastSyllable.charCodeAt(0) - 0xac00) % 28;
  return `${word}${finalConsonant === 0 || finalConsonant === 8 ? "로" : "으로"}`;
}

// "Every sentence translated into L is read aloud in L; sentences spoken in L
// are not read." `name` is L's name in the same locale.
const READ_LANGUAGE_NOTICE_BY_LOCALE = {
  ko: (name) => {
    const into = withKoreanDirectionalParticle(name);
    return `${into} 번역된 모든 문장을 ${name} 음성으로 들려드려요. ${into} 말한 문장은 읽지 않아요.`;
  },
  en: (name) => `Every sentence translated into ${name} is read aloud in ${name}. Sentences spoken in ${name} are not read.`,
  ja: (name) => `${name}に翻訳されたすべての文を${name}の音声で読み上げます。${name}で話された文は読み上げません。`,
  "zh-CN": (name) => `所有翻译成${name}的句子都会用${name}语音朗读。用${name}说的句子不会朗读。`,
  "zh-TW": (name) => `所有翻譯成${name}的句子都會以${name}語音朗讀。以${name}說的句子不會朗讀。`,
  fr: (name) => `Toutes les phrases traduites en ${name} sont lues à voix haute en ${name}. Les phrases prononcées en ${name} ne sont pas lues.`,
  de: (name) => `Alle Sätze, die auf ${name} übersetzt werden, werden auf ${name} vorgelesen. Auf ${name} gesprochene Sätze werden nicht vorgelesen.`,
  es: (name) => `Todas las frases traducidas al ${name} se leen en voz alta en ${name}. Las frases dichas en ${name} no se leen.`,
  pt: (name) => `Todas as frases traduzidas para o ${name} são lidas em voz alta em ${name}. As frases faladas em ${name} não são lidas.`,
  it: (name) => `Tutte le frasi tradotte in ${name} vengono lette ad alta voce in ${name}. Le frasi pronunciate in ${name} non vengono lette.`,
  ru: (name) => `Все предложения, переведённые на ${name}, зачитываются вслух на этом языке. Предложения, исходный язык которых — ${name}, не зачитываются.`,
  ar: (name) => `تُقرأ كل الجمل المترجمة إلى ${name} بصوت عالٍ باللغة ${name}. لا تُقرأ الجمل المنطوقة باللغة ${name}.`,
  hi: (name) => `${name} में अनुवादित सभी वाक्य ${name} में पढ़कर सुनाए जाते हैं। ${name} में बोले गए वाक्य नहीं पढ़े जाते।`,
  th: (name) => `ประโยคทั้งหมดที่แปลเป็นภาษา${name}จะอ่านออกเสียงเป็นภาษา${name} ประโยคที่พูดเป็นภาษา${name}จะไม่ถูกอ่าน`,
  vi: (name) => `Mọi câu được dịch sang ${name} sẽ được đọc to bằng ${name}. Những câu được nói bằng ${name} sẽ không được đọc.`,
} satisfies Record<LegalDocumentLocale, (name: string) => string>;

function resolveEarphoneModeCopyLocale(uiLocale: string): LegalDocumentLocale {
  const supportedLocale = resolveSupportedLocaleTag(uiLocale) ?? DEFAULT_LOCALE;
  const resolvedLocale = resolveLegalDocumentLocale(supportedLocale);
  return resolvedLocale in EARPHONE_MODE_COPY_BY_LOCALE ? resolvedLocale : "en";
}

export function resolveLivePhoneDemoEarphoneModeCopy(
  uiLocale: string,
): LivePhoneDemoEarphoneModeCopy {
  return EARPHONE_MODE_COPY_BY_LOCALE[resolveEarphoneModeCopyLocale(uiLocale)];
}

// The notice sentence for the read language, with the language named by the
// app's language-name helper in the sentence's own locale.
export function formatLivePhoneDemoEarphoneModeReadLanguageNotice(
  uiLocale: string,
  language: string,
): string {
  const locale = resolveEarphoneModeCopyLocale(uiLocale);
  const name = getSttLanguageDisplayName(language, locale) || language;
  return READ_LANGUAGE_NOTICE_BY_LOCALE[locale](name);
}
