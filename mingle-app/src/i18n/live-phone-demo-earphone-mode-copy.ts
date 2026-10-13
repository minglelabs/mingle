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
  // Heading of the notice's "what to translate" choice, shown only on a shell
  // that can capture the sound other apps play on this device.
  captureSourceLabel: string;
  captureSourceMicrophoneLabel: string;
  captureSourceDeviceAudioLabel: string;
  // Shown under the choice while device audio is picked.
  captureSourceDeviceAudioHint: string;
  // The same, for iOS: the system shows its screen broadcast sheet there, and
  // the translation is read in the left earphone only.
  captureSourceDeviceAudioHintIos: string;
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
    captureSourceLabel: "번역할 소리",
    captureSourceMicrophoneLabel: "마이크",
    captureSourceDeviceAudioLabel: "이 기기에서 재생되는 소리",
    captureSourceDeviceAudioHint: "Start를 누르면 화면 공유 동의 창이 떠요. 동의하면 영상 앱 등 다른 앱에서 나는 소리를 번역해요. 소리 캡처를 막아 둔 앱은 번역되지 않아요.",
    captureSourceDeviceAudioHintIos: "Start를 누르면 화면 방송 창이 떠요. 방송을 시작한 뒤 영상 앱으로 이동하면 그 소리를 번역해요. 번역 음성은 왼쪽 이어폰에서만 들려요. 소리 캡처를 막아 둔 앱은 번역되지 않아요.",
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
    captureSourceLabel: "Sound to translate",
    captureSourceMicrophoneLabel: "Microphone",
    captureSourceDeviceAudioLabel: "Sound playing on this device",
    captureSourceDeviceAudioHint: "Pressing Start opens a screen-sharing prompt. Once you allow it, sound from other apps, such as a video app, is translated. Apps that block audio capture are not translated.",
    captureSourceDeviceAudioHintIos: "Pressing Start opens the screen broadcast sheet. Start the broadcast, then switch to the video app: its sound is translated. The translation is read in the left earphone only. Apps that block audio capture are not translated.",
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
    captureSourceLabel: "翻訳する音",
    captureSourceMicrophoneLabel: "マイク",
    captureSourceDeviceAudioLabel: "この端末で再生される音",
    captureSourceDeviceAudioHint: "Start を押すと画面共有の確認が表示されます。許可すると、動画アプリなど他のアプリの音を翻訳します。音声のキャプチャを禁止しているアプリは翻訳されません。",
    captureSourceDeviceAudioHintIos: "Start を押すと画面ブロードキャストの画面が表示されます。ブロードキャストを開始してから動画アプリに切り替えると、その音を翻訳します。翻訳の音声は左のイヤホンからのみ流れます。音声のキャプチャを禁止しているアプリは翻訳されません。",
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
    captureSourceLabel: "要翻译的声音",
    captureSourceMicrophoneLabel: "麦克风",
    captureSourceDeviceAudioLabel: "此设备播放的声音",
    captureSourceDeviceAudioHint: "点击 Start 后会出现屏幕共享确认窗口。允许后，将翻译视频应用等其他应用播放的声音。禁止音频采集的应用不会被翻译。",
    captureSourceDeviceAudioHintIos: "点击 Start 后会出现屏幕直播窗口。开始直播后切换到视频应用，即可翻译其中的声音。翻译语音只在左耳机播放。禁止音频采集的应用不会被翻译。",
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
    captureSourceLabel: "要翻譯的聲音",
    captureSourceMicrophoneLabel: "麥克風",
    captureSourceDeviceAudioLabel: "此裝置播放的聲音",
    captureSourceDeviceAudioHint: "按下 Start 後會出現螢幕分享確認視窗。允許後，會翻譯影片 App 等其他 App 播放的聲音。禁止音訊擷取的 App 不會被翻譯。",
    captureSourceDeviceAudioHintIos: "按下 Start 後會出現螢幕直播視窗。開始直播後切換到影片 App，即可翻譯其中的聲音。翻譯語音只會從左耳機播放。禁止音訊擷取的 App 不會被翻譯。",
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
    captureSourceLabel: "Son à traduire",
    captureSourceMicrophoneLabel: "Microphone",
    captureSourceDeviceAudioLabel: "Son diffusé sur cet appareil",
    captureSourceDeviceAudioHint: "Appuyer sur Start ouvre une demande de partage d’écran. Une fois acceptée, le son des autres applications, comme une application vidéo, est traduit. Les applications qui bloquent la capture audio ne sont pas traduites.",
    captureSourceDeviceAudioHintIos: "Appuyer sur Start ouvre la fenêtre de diffusion de l’écran. Lancez la diffusion, puis passez à l’application vidéo : son audio est traduit. La traduction n’est lue que dans l’écouteur gauche. Les applications qui bloquent la capture audio ne sont pas traduites.",
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
    captureSourceLabel: "Zu übersetzender Ton",
    captureSourceMicrophoneLabel: "Mikrofon",
    captureSourceDeviceAudioLabel: "Auf diesem Gerät abgespielter Ton",
    captureSourceDeviceAudioHint: "Beim Tippen auf Start erscheint eine Abfrage zur Bildschirmfreigabe. Nach der Zustimmung wird der Ton anderer Apps, etwa einer Video-App, übersetzt. Apps, die die Audioaufnahme sperren, werden nicht übersetzt.",
    captureSourceDeviceAudioHintIos: "Beim Tippen auf Start erscheint das Fenster für die Bildschirmübertragung. Starten Sie die Übertragung und wechseln Sie dann zur Video-App: Deren Ton wird übersetzt. Die Übersetzung ist nur im linken Ohrhörer zu hören. Apps, die die Audioaufnahme sperren, werden nicht übersetzt.",
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
    captureSourceLabel: "Sonido que traducir",
    captureSourceMicrophoneLabel: "Micrófono",
    captureSourceDeviceAudioLabel: "Sonido que se reproduce en este dispositivo",
    captureSourceDeviceAudioHint: "Al pulsar Start se abre una solicitud para compartir pantalla. Cuando la aceptas, se traduce el sonido de otras apps, como una app de vídeo. Las apps que bloquean la captura de audio no se traducen.",
    captureSourceDeviceAudioHintIos: "Al pulsar Start se abre la ventana de emisión de pantalla. Inicia la emisión y cambia a la app de vídeo: se traduce su sonido. La traducción solo se oye en el auricular izquierdo. Las apps que bloquean la captura de audio no se traducen.",
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
    captureSourceLabel: "Som a traduzir",
    captureSourceMicrophoneLabel: "Microfone",
    captureSourceDeviceAudioLabel: "Som reproduzido neste dispositivo",
    captureSourceDeviceAudioHint: "Ao tocar em Start, aparece um pedido de compartilhamento de tela. Depois de permitir, o som de outros apps, como um app de vídeo, é traduzido. Apps que bloqueiam a captura de áudio não são traduzidos.",
    captureSourceDeviceAudioHintIos: "Ao tocar em Start, abre-se a janela de transmissão de tela. Inicie a transmissão e mude para o app de vídeo: o som dele é traduzido. A tradução é lida apenas no fone esquerdo. Apps que bloqueiam a captura de áudio não são traduzidos.",
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
    captureSourceLabel: "Audio da tradurre",
    captureSourceMicrophoneLabel: "Microfono",
    captureSourceDeviceAudioLabel: "Audio riprodotto su questo dispositivo",
    captureSourceDeviceAudioHint: "Toccando Start compare una richiesta di condivisione dello schermo. Dopo il consenso, viene tradotto l'audio delle altre app, ad esempio un'app video. Le app che bloccano l'acquisizione audio non vengono tradotte.",
    captureSourceDeviceAudioHintIos: "Toccando Start si apre la finestra di trasmissione dello schermo. Avvia la trasmissione e passa all'app video: il suo audio viene tradotto. La traduzione si sente solo nell'auricolare sinistro. Le app che bloccano l'acquisizione audio non vengono tradotte.",
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
    captureSourceLabel: "Что переводить",
    captureSourceMicrophoneLabel: "Микрофон",
    captureSourceDeviceAudioLabel: "Звук, который воспроизводится на этом устройстве",
    captureSourceDeviceAudioHint: "После нажатия Start появится запрос на показ экрана. Когда вы разрешите его, будет переводиться звук других приложений, например видеоприложения. Приложения, запрещающие захват звука, не переводятся.",
    captureSourceDeviceAudioHintIos: "После нажатия Start откроется окно трансляции экрана. Запустите трансляцию и перейдите в видеоприложение: его звук будет переводиться. Перевод звучит только в левом наушнике. Приложения, запрещающие захват звука, не переводятся.",
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
    captureSourceLabel: "الصوت المراد ترجمته",
    captureSourceMicrophoneLabel: "الميكروفون",
    captureSourceDeviceAudioLabel: "الصوت الذي يُشغَّل على هذا الجهاز",
    captureSourceDeviceAudioHint: "عند الضغط على Start يظهر طلب مشاركة الشاشة. بعد السماح، يُترجَم صوت التطبيقات الأخرى مثل تطبيقات الفيديو. التطبيقات التي تمنع التقاط الصوت لا تُترجَم.",
    captureSourceDeviceAudioHintIos: "عند الضغط على Start تظهر نافذة بث الشاشة. ابدأ البث ثم انتقل إلى تطبيق الفيديو، وسيُترجَم صوته. تُسمَع الترجمة في السماعة اليسرى فقط. التطبيقات التي تمنع التقاط الصوت لا تُترجَم.",
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
    captureSourceLabel: "अनुवाद की जाने वाली आवाज़",
    captureSourceMicrophoneLabel: "माइक्रोफ़ोन",
    captureSourceDeviceAudioLabel: "इस डिवाइस पर चल रही आवाज़",
    captureSourceDeviceAudioHint: "Start दबाने पर स्क्रीन शेयर करने की अनुमति का संदेश खुलता है। अनुमति देने पर वीडियो ऐप जैसे दूसरे ऐप की आवाज़ का अनुवाद होता है। जो ऐप ऑडियो कैप्चर रोकते हैं, उनका अनुवाद नहीं होता।",
    captureSourceDeviceAudioHintIos: "Start दबाने पर स्क्रीन ब्रॉडकास्ट की विंडो खुलती है। ब्रॉडकास्ट शुरू करें, फिर वीडियो ऐप पर जाएँ: उसकी आवाज़ का अनुवाद होगा। अनुवाद केवल बाएँ ईयरफ़ोन में सुनाई देता है। जो ऐप ऑडियो कैप्चर रोकते हैं, उनका अनुवाद नहीं होता।",
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
    captureSourceLabel: "เสียงที่จะแปล",
    captureSourceMicrophoneLabel: "ไมโครโฟน",
    captureSourceDeviceAudioLabel: "เสียงที่เล่นบนอุปกรณ์นี้",
    captureSourceDeviceAudioHint: "เมื่อกด Start จะมีหน้าต่างขออนุญาตแชร์หน้าจอ เมื่ออนุญาตแล้ว ระบบจะแปลเสียงจากแอปอื่น เช่น แอปวิดีโอ แอปที่ปิดกั้นการบันทึกเสียงจะไม่ถูกแปล",
    captureSourceDeviceAudioHintIos: "เมื่อกด Start จะมีหน้าต่างถ่ายทอดหน้าจอ เริ่มการถ่ายทอด แล้วสลับไปที่แอปวิดีโอ ระบบจะแปลเสียงจากแอปนั้น เสียงแปลจะดังที่หูฟังข้างซ้ายเท่านั้น แอปที่ปิดกั้นการบันทึกเสียงจะไม่ถูกแปล",
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
    captureSourceLabel: "Âm thanh cần dịch",
    captureSourceMicrophoneLabel: "Micrô",
    captureSourceDeviceAudioLabel: "Âm thanh phát trên thiết bị này",
    captureSourceDeviceAudioHint: "Khi nhấn Start, một hộp thoại xin chia sẻ màn hình sẽ hiện ra. Sau khi bạn cho phép, âm thanh từ ứng dụng khác, chẳng hạn ứng dụng video, sẽ được dịch. Ứng dụng chặn thu âm thanh sẽ không được dịch.",
    captureSourceDeviceAudioHintIos: "Khi nhấn Start, cửa sổ phát sóng màn hình sẽ hiện ra. Hãy bắt đầu phát sóng rồi chuyển sang ứng dụng video: âm thanh của ứng dụng đó sẽ được dịch. Bản dịch chỉ phát ở tai nghe bên trái. Ứng dụng chặn thu âm thanh sẽ không được dịch.",
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
