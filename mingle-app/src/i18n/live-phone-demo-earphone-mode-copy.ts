import { DEFAULT_LOCALE, resolveLegalDocumentLocale, resolveSupportedLocaleTag, type LegalDocumentLocale } from "@/i18n/config";

export type LivePhoneDemoEarphoneModeCopy = {
  // Button / "+" menu row label and the notice title.
  label: string;
  onStateLabel: string;
  offStateLabel: string;
  // Toggle is on but no earphones are connected.
  waitingLabel: string;
  noticeBody: string;
  // Added to the notice only while no earphones are connected.
  noticeNotConnectedBody: string;
  noticeConfirmLabel: string;
};

const EARPHONE_MODE_COPY_BY_LOCALE = {
  ko: {
    label: "이어폰 모드",
    onStateLabel: "켜짐",
    offStateLabel: "꺼짐",
    waitingLabel: "이어폰 연결 대기 중",
    noticeBody: "이어폰이나 헤드셋을 착용하고 있을 때만 동작합니다. 켜져 있는 동안 새 메시지를 소리 내어 읽어 드립니다.",
    noticeNotConnectedBody: "지금은 이어폰이 연결되어 있지 않습니다. 이어폰을 연결하면 읽기 시작합니다.",
    noticeConfirmLabel: "확인",
  },
  en: {
    label: "Earphone mode",
    onStateLabel: "On",
    offStateLabel: "Off",
    waitingLabel: "Waiting for earphones",
    noticeBody: "Works only while you are wearing earphones or a headset. While it is on, new messages are read aloud.",
    noticeNotConnectedBody: "No earphones are connected right now. Reading starts when you connect them.",
    noticeConfirmLabel: "OK",
  },
  ja: {
    label: "イヤホンモード",
    onStateLabel: "オン",
    offStateLabel: "オフ",
    waitingLabel: "イヤホンの接続待ち",
    noticeBody: "イヤホンまたはヘッドセットを装着しているときだけ動作します。オンの間は新しいメッセージを読み上げます。",
    noticeNotConnectedBody: "現在イヤホンが接続されていません。イヤホンを接続すると読み上げを開始します。",
    noticeConfirmLabel: "OK",
  },
  "zh-CN": {
    label: "耳机模式",
    onStateLabel: "已开启",
    offStateLabel: "已关闭",
    waitingLabel: "等待连接耳机",
    noticeBody: "仅在佩戴耳机或头戴式耳机时生效。开启期间会朗读新消息。",
    noticeNotConnectedBody: "当前未连接耳机。连接耳机后将开始朗读。",
    noticeConfirmLabel: "确定",
  },
  "zh-TW": {
    label: "耳機模式",
    onStateLabel: "已開啟",
    offStateLabel: "已關閉",
    waitingLabel: "等待連接耳機",
    noticeBody: "僅在戴著耳機或耳麥時運作。開啟期間會朗讀新訊息。",
    noticeNotConnectedBody: "目前未連接耳機。連接耳機後就會開始朗讀。",
    noticeConfirmLabel: "確定",
  },
  fr: {
    label: "Mode écouteurs",
    onStateLabel: "Activé",
    offStateLabel: "Désactivé",
    waitingLabel: "En attente des écouteurs",
    noticeBody: "Fonctionne uniquement lorsque vous portez des écouteurs ou un casque. Tant qu’il est activé, les nouveaux messages sont lus à voix haute.",
    noticeNotConnectedBody: "Aucun écouteur n’est connecté pour le moment. La lecture commencera dès que vous les connecterez.",
    noticeConfirmLabel: "OK",
  },
  de: {
    label: "Kopfhörermodus",
    onStateLabel: "Ein",
    offStateLabel: "Aus",
    waitingLabel: "Warten auf Kopfhörer",
    noticeBody: "Funktioniert nur, während Sie Kopfhörer oder ein Headset tragen. Solange er aktiv ist, werden neue Nachrichten vorgelesen.",
    noticeNotConnectedBody: "Derzeit sind keine Kopfhörer verbunden. Das Vorlesen beginnt, sobald Sie sie verbinden.",
    noticeConfirmLabel: "OK",
  },
  es: {
    label: "Modo auriculares",
    onStateLabel: "Activado",
    offStateLabel: "Desactivado",
    waitingLabel: "Esperando auriculares",
    noticeBody: "Solo funciona mientras llevas auriculares o cascos. Mientras está activado, los mensajes nuevos se leen en voz alta.",
    noticeNotConnectedBody: "Ahora mismo no hay auriculares conectados. La lectura empezará cuando los conectes.",
    noticeConfirmLabel: "Aceptar",
  },
  pt: {
    label: "Modo fones de ouvido",
    onStateLabel: "Ativado",
    offStateLabel: "Desativado",
    waitingLabel: "Aguardando fones de ouvido",
    noticeBody: "Funciona apenas enquanto você usa fones de ouvido ou headset. Enquanto estiver ativado, as novas mensagens são lidas em voz alta.",
    noticeNotConnectedBody: "Nenhum fone de ouvido está conectado agora. A leitura começa quando você conectá-los.",
    noticeConfirmLabel: "OK",
  },
  it: {
    label: "Modalità auricolari",
    onStateLabel: "Attiva",
    offStateLabel: "Disattiva",
    waitingLabel: "In attesa degli auricolari",
    noticeBody: "Funziona solo mentre indossi auricolari o cuffie. Finché è attiva, i nuovi messaggi vengono letti ad alta voce.",
    noticeNotConnectedBody: "Al momento non ci sono auricolari collegati. La lettura inizierà quando li colleghi.",
    noticeConfirmLabel: "OK",
  },
  ru: {
    label: "Режим наушников",
    onStateLabel: "Вкл.",
    offStateLabel: "Выкл.",
    waitingLabel: "Ожидание наушников",
    noticeBody: "Работает, только когда вы в наушниках или гарнитуре. Пока режим включён, новые сообщения зачитываются вслух.",
    noticeNotConnectedBody: "Сейчас наушники не подключены. Чтение начнётся, когда вы их подключите.",
    noticeConfirmLabel: "OK",
  },
  ar: {
    label: "وضع السماعات",
    onStateLabel: "مفعّل",
    offStateLabel: "متوقف",
    waitingLabel: "بانتظار توصيل السماعات",
    noticeBody: "يعمل فقط أثناء ارتداء سماعات الأذن أو سماعة الرأس. أثناء تفعيله، تُقرأ الرسائل الجديدة بصوت عالٍ.",
    noticeNotConnectedBody: "لا توجد سماعات متصلة الآن. ستبدأ القراءة عند توصيلها.",
    noticeConfirmLabel: "حسنًا",
  },
  hi: {
    label: "ईयरफ़ोन मोड",
    onStateLabel: "चालू",
    offStateLabel: "बंद",
    waitingLabel: "ईयरफ़ोन कनेक्ट होने का इंतज़ार",
    noticeBody: "यह केवल तभी काम करता है जब आपने ईयरफ़ोन या हेडसेट पहना हो। चालू रहने पर नए संदेश पढ़कर सुनाए जाते हैं।",
    noticeNotConnectedBody: "अभी कोई ईयरफ़ोन कनेक्ट नहीं है। ईयरफ़ोन कनेक्ट करते ही पढ़ना शुरू हो जाएगा।",
    noticeConfirmLabel: "ठीक है",
  },
  th: {
    label: "โหมดหูฟัง",
    onStateLabel: "เปิด",
    offStateLabel: "ปิด",
    waitingLabel: "กำลังรอเชื่อมต่อหูฟัง",
    noticeBody: "ทำงานเฉพาะเมื่อคุณสวมหูฟังหรือชุดหูฟังอยู่ ระหว่างที่เปิดอยู่ ระบบจะอ่านข้อความใหม่ออกเสียงให้ฟัง",
    noticeNotConnectedBody: "ขณะนี้ไม่ได้เชื่อมต่อหูฟัง ระบบจะเริ่มอ่านเมื่อคุณเชื่อมต่อหูฟัง",
    noticeConfirmLabel: "ตกลง",
  },
  vi: {
    label: "Chế độ tai nghe",
    onStateLabel: "Bật",
    offStateLabel: "Tắt",
    waitingLabel: "Đang chờ kết nối tai nghe",
    noticeBody: "Chỉ hoạt động khi bạn đang đeo tai nghe hoặc headset. Khi bật, tin nhắn mới sẽ được đọc to.",
    noticeNotConnectedBody: "Hiện chưa có tai nghe nào được kết nối. Việc đọc sẽ bắt đầu khi bạn kết nối tai nghe.",
    noticeConfirmLabel: "OK",
  },
} satisfies Record<LegalDocumentLocale, LivePhoneDemoEarphoneModeCopy>;

export function resolveLivePhoneDemoEarphoneModeCopy(
  uiLocale: string,
): LivePhoneDemoEarphoneModeCopy {
  const supportedLocale = resolveSupportedLocaleTag(uiLocale) ?? DEFAULT_LOCALE;
  const resolvedLocale = resolveLegalDocumentLocale(supportedLocale);

  return EARPHONE_MODE_COPY_BY_LOCALE[resolvedLocale] ?? EARPHONE_MODE_COPY_BY_LOCALE.en;
}
