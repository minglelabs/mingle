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
  earphoneStatusConnectedLabel: string;
  earphoneStatusDisconnectedLabel: string;
  // Heading of the notice's language list.
  readLanguageLabel: string;
  noticeConfirmLabel: string;
  noticeNextLabel: string;
  noticeBackLabel: string;
  // Heading of the notice's "what to translate" choice, shown only on a shell
  // that can capture the sound other apps play on this device.
  captureSourceLabel: string;
  captureSourceMicrophoneLabel: string;
  captureSourceDeviceAudioLabel: string;
  // Shown under the choice while device audio is picked.
  captureSourceDeviceAudioHint: string;
  // The same, for iOS: the system shows its screen broadcast sheet there.
  captureSourceDeviceAudioHintIos: string;
  // Shown before Start opens the system screen broadcast / sharing prompt.
  screenCaptureNoticeTitle: string;
  screenCaptureNoticeBodyIos: string;
  screenCaptureNoticeBody: string;
  screenCaptureNoticeContinueLabel: string;
  screenCaptureNoticeCancelLabel: string;
};

const EARPHONE_MODE_COPY_BY_LOCALE = {
  ko: {
    label: "이어폰 모드",
    onStateLabel: "켜짐",
    offStateLabel: "꺼짐",
    waitingLabel: "이어폰 연결 대기 중",
    noticeBody: "이어폰이나 헤드셋을 착용하고 있을 때만 동작해요.",
    earphoneStatusConnectedLabel: "이어폰 연결됨",
    earphoneStatusDisconnectedLabel: "이어폰 연결 안 됨",
    readLanguageLabel: "들려드릴 언어",
    noticeConfirmLabel: "확인",
    noticeNextLabel: "다음",
    noticeBackLabel: "이전",
    captureSourceLabel: "번역할 소리",
    captureSourceMicrophoneLabel: "마이크만",
    captureSourceDeviceAudioLabel: "마이크 + 이 기기에서 재생되는 소리",
    captureSourceDeviceAudioHint: "Start를 누르면 화면 공유 동의 창이 떠요. 동의하면 영상 앱 등 다른 앱에서 나는 소리를 번역해요. 소리 캡처를 막아 둔 앱은 번역되지 않아요. 내 목소리(마이크)도 함께 번역돼요. 다른 앱 소리도 서버로 전송되고 대화에 저장돼요.",
    captureSourceDeviceAudioHintIos: "Start를 누르면 화면 방송 창이 떠요. 방송을 시작한 뒤 영상 앱으로 이동하면 그 소리를 번역해요. 소리 캡처를 막아 둔 앱은 번역되지 않아요. 내 목소리(마이크)도 함께 번역돼요. 다른 앱 소리도 서버로 전송되고 대화에 저장돼요.",
    screenCaptureNoticeTitle: "화면 기록을 요청할게요",
    screenCaptureNoticeBodyIos: "놀라지 마세요! 다음 화면에서 iPhone의 화면 방송(화면 기록) 창이 떠요. '방송 시작'을 누르면 다른 앱 소리를 번역할 수 있어요. 화면은 저장하지 않고 소리만 번역에 사용해요.",
    screenCaptureNoticeBody: "놀라지 마세요! 다음 화면에서 화면 공유 동의 창이 떠요. 허용하면 다른 앱 소리를 번역할 수 있어요. 화면은 저장하지 않고 소리만 번역에 사용해요.",
    screenCaptureNoticeContinueLabel: "계속",
    screenCaptureNoticeCancelLabel: "취소",
  },
  en: {
    label: "Earphone mode",
    onStateLabel: "On",
    offStateLabel: "Off",
    waitingLabel: "Waiting for earphones",
    noticeBody: "Works only while you are wearing earphones or a headset.",
    earphoneStatusConnectedLabel: "Earphones connected",
    earphoneStatusDisconnectedLabel: "Earphones not connected",
    readLanguageLabel: "Language to read aloud",
    noticeConfirmLabel: "OK",
    noticeNextLabel: "Next",
    noticeBackLabel: "Back",
    captureSourceLabel: "Sound to translate",
    captureSourceMicrophoneLabel: "Microphone only",
    captureSourceDeviceAudioLabel: "Microphone + sound playing on this device",
    captureSourceDeviceAudioHint: "Pressing Start opens a screen-sharing prompt. Once you allow it, sound from other apps, such as a video app, is translated. Apps that block audio capture are not translated. Your own voice (microphone) is translated too. Other apps' sound is also sent to our server and saved in the conversation.",
    captureSourceDeviceAudioHintIos: "Pressing Start opens the screen broadcast sheet. Start the broadcast, then switch to the video app: its sound is translated. Apps that block audio capture are not translated. Your own voice (microphone) is translated too. Other apps' sound is also sent to our server and saved in the conversation.",
    screenCaptureNoticeTitle: "We'll ask to record your screen",
    screenCaptureNoticeBodyIos: "Don't be alarmed! Next, iPhone shows its screen broadcast (screen recording) sheet. Tap 'Start Broadcast' to translate other apps' sound. Your screen is not saved; only the sound is used for translation.",
    screenCaptureNoticeBody: "Don't be alarmed! Next, a screen-sharing prompt appears. Allow it to translate other apps' sound. Your screen is not saved; only the sound is used for translation.",
    screenCaptureNoticeContinueLabel: "Continue",
    screenCaptureNoticeCancelLabel: "Cancel",
  },
  ja: {
    label: "イヤホンモード",
    onStateLabel: "オン",
    offStateLabel: "オフ",
    waitingLabel: "イヤホンの接続待ち",
    noticeBody: "イヤホンまたはヘッドセットを装着しているときだけ動作します。",
    earphoneStatusConnectedLabel: "イヤホン接続中",
    earphoneStatusDisconnectedLabel: "イヤホン未接続",
    readLanguageLabel: "読み上げる言語",
    noticeConfirmLabel: "OK",
    noticeNextLabel: "次へ",
    noticeBackLabel: "戻る",
    captureSourceLabel: "翻訳する音",
    captureSourceMicrophoneLabel: "マイクのみ",
    captureSourceDeviceAudioLabel: "マイク + この端末で再生される音",
    captureSourceDeviceAudioHint: "Start を押すと画面共有の確認が表示されます。許可すると、動画アプリなど他のアプリの音を翻訳します。音声のキャプチャを禁止しているアプリは翻訳されません。 自分の声（マイク）も一緒に翻訳されます。他のアプリの音もサーバーに送信され、会話に保存されます。",
    captureSourceDeviceAudioHintIos: "Start を押すと画面ブロードキャストの画面が表示されます。ブロードキャストを開始してから動画アプリに切り替えると、その音を翻訳します。音声のキャプチャを禁止しているアプリは翻訳されません。 自分の声（マイク）も一緒に翻訳されます。他のアプリの音もサーバーに送信され、会話に保存されます。",
    screenCaptureNoticeTitle: "画面収録をリクエストします",
    screenCaptureNoticeBodyIos: "驚かないでください！次に iPhone の画面ブロードキャスト（画面収録）の画面が表示されます。「ブロードキャストを開始」を押すと他のアプリの音を翻訳できます。画面は保存されず、音だけを翻訳に使います。",
    screenCaptureNoticeBody: "驚かないでください！次に画面共有の確認が表示されます。許可すると他のアプリの音を翻訳できます。画面は保存されず、音だけを翻訳に使います。",
    screenCaptureNoticeContinueLabel: "続ける",
    screenCaptureNoticeCancelLabel: "キャンセル",
  },
  "zh-CN": {
    label: "耳机模式",
    onStateLabel: "已开启",
    offStateLabel: "已关闭",
    waitingLabel: "等待连接耳机",
    noticeBody: "仅在佩戴耳机或头戴式耳机时生效。",
    earphoneStatusConnectedLabel: "耳机已连接",
    earphoneStatusDisconnectedLabel: "耳机未连接",
    readLanguageLabel: "朗读语言",
    noticeConfirmLabel: "确定",
    noticeNextLabel: "下一步",
    noticeBackLabel: "上一步",
    captureSourceLabel: "要翻译的声音",
    captureSourceMicrophoneLabel: "仅麦克风",
    captureSourceDeviceAudioLabel: "麦克风 + 此设备播放的声音",
    captureSourceDeviceAudioHint: "点击 Start 后会出现屏幕共享确认窗口。允许后，将翻译视频应用等其他应用播放的声音。禁止音频采集的应用不会被翻译。您自己的声音（麦克风）也会一起翻译。其他应用的声音也会发送到服务器并保存在对话中。",
    captureSourceDeviceAudioHintIos: "点击 Start 后会出现屏幕直播窗口。开始直播后切换到视频应用，即可翻译其中的声音。禁止音频采集的应用不会被翻译。您自己的声音（麦克风）也会一起翻译。其他应用的声音也会发送到服务器并保存在对话中。",
    screenCaptureNoticeTitle: "我们将请求屏幕录制",
    screenCaptureNoticeBodyIos: "别担心！接下来 iPhone 会显示屏幕直播（屏幕录制）窗口。点击“开始直播”即可翻译其他应用的声音。不会保存屏幕画面，只使用声音进行翻译。",
    screenCaptureNoticeBody: "别担心！接下来会显示屏幕共享确认窗口。允许后即可翻译其他应用的声音。不会保存屏幕画面，只使用声音进行翻译。",
    screenCaptureNoticeContinueLabel: "继续",
    screenCaptureNoticeCancelLabel: "取消",
  },
  "zh-TW": {
    label: "耳機模式",
    onStateLabel: "已開啟",
    offStateLabel: "已關閉",
    waitingLabel: "等待連接耳機",
    noticeBody: "僅在戴著耳機或耳麥時運作。",
    earphoneStatusConnectedLabel: "耳機已連接",
    earphoneStatusDisconnectedLabel: "耳機未連接",
    readLanguageLabel: "朗讀語言",
    noticeConfirmLabel: "確定",
    noticeNextLabel: "下一步",
    noticeBackLabel: "上一步",
    captureSourceLabel: "要翻譯的聲音",
    captureSourceMicrophoneLabel: "僅麥克風",
    captureSourceDeviceAudioLabel: "麥克風 + 此裝置播放的聲音",
    captureSourceDeviceAudioHint: "按下 Start 後會出現螢幕分享確認視窗。允許後，會翻譯影片 App 等其他 App 播放的聲音。禁止音訊擷取的 App 不會被翻譯。您自己的聲音（麥克風）也會一起翻譯。其他 App 的聲音也會傳送到伺服器並儲存在對話中。",
    captureSourceDeviceAudioHintIos: "按下 Start 後會出現螢幕直播視窗。開始直播後切換到影片 App，即可翻譯其中的聲音。禁止音訊擷取的 App 不會被翻譯。您自己的聲音（麥克風）也會一起翻譯。其他 App 的聲音也會傳送到伺服器並儲存在對話中。",
    screenCaptureNoticeTitle: "我們將請求螢幕錄製",
    screenCaptureNoticeBodyIos: "別擔心！接下來 iPhone 會顯示螢幕直播（螢幕錄製）視窗。點選「開始直播」即可翻譯其他 App 的聲音。不會儲存螢幕畫面，只使用聲音進行翻譯。",
    screenCaptureNoticeBody: "別擔心！接下來會顯示螢幕分享確認視窗。允許後即可翻譯其他 App 的聲音。不會儲存螢幕畫面，只使用聲音進行翻譯。",
    screenCaptureNoticeContinueLabel: "繼續",
    screenCaptureNoticeCancelLabel: "取消",
  },
  fr: {
    label: "Mode écouteurs",
    onStateLabel: "Activé",
    offStateLabel: "Désactivé",
    waitingLabel: "En attente des écouteurs",
    noticeBody: "Fonctionne uniquement lorsque vous portez des écouteurs ou un casque.",
    earphoneStatusConnectedLabel: "Écouteurs connectés",
    earphoneStatusDisconnectedLabel: "Écouteurs non connectés",
    readLanguageLabel: "Langue de lecture",
    noticeConfirmLabel: "OK",
    noticeNextLabel: "Suivant",
    noticeBackLabel: "Retour",
    captureSourceLabel: "Son à traduire",
    captureSourceMicrophoneLabel: "Micro uniquement",
    captureSourceDeviceAudioLabel: "Micro + son diffusé sur cet appareil",
    captureSourceDeviceAudioHint: "Appuyer sur Start ouvre une demande de partage d’écran. Une fois acceptée, le son des autres applications, comme une application vidéo, est traduit. Les applications qui bloquent la capture audio ne sont pas traduites. Votre propre voix (micro) est aussi traduite. Le son des autres applications est aussi envoyé à notre serveur et enregistré dans la conversation.",
    captureSourceDeviceAudioHintIos: "Appuyer sur Start ouvre la fenêtre de diffusion de l’écran. Lancez la diffusion, puis passez à l’application vidéo : son audio est traduit. Les applications qui bloquent la capture audio ne sont pas traduites. Votre propre voix (micro) est aussi traduite. Le son des autres applications est aussi envoyé à notre serveur et enregistré dans la conversation.",
    screenCaptureNoticeTitle: "Nous allons demander l’enregistrement de l’écran",
    screenCaptureNoticeBodyIos: "Pas d’inquiétude ! L’iPhone va afficher la fenêtre de diffusion (enregistrement) de l’écran. Touchez « Commencer la diffusion » pour traduire le son des autres applications. L’écran n’est pas enregistré ; seul le son sert à la traduction.",
    screenCaptureNoticeBody: "Pas d’inquiétude ! Une demande de partage d’écran va s’afficher. Acceptez-la pour traduire le son des autres applications. L’écran n’est pas enregistré ; seul le son sert à la traduction.",
    screenCaptureNoticeContinueLabel: "Continuer",
    screenCaptureNoticeCancelLabel: "Annuler",
  },
  de: {
    label: "Kopfhörermodus",
    onStateLabel: "Ein",
    offStateLabel: "Aus",
    waitingLabel: "Warten auf Kopfhörer",
    noticeBody: "Funktioniert nur, während Sie Kopfhörer oder ein Headset tragen.",
    earphoneStatusConnectedLabel: "Kopfhörer verbunden",
    earphoneStatusDisconnectedLabel: "Kopfhörer nicht verbunden",
    readLanguageLabel: "Vorlesesprache",
    noticeConfirmLabel: "OK",
    noticeNextLabel: "Weiter",
    noticeBackLabel: "Zurück",
    captureSourceLabel: "Zu übersetzender Ton",
    captureSourceMicrophoneLabel: "Nur Mikrofon",
    captureSourceDeviceAudioLabel: "Mikrofon + auf diesem Gerät abgespielter Ton",
    captureSourceDeviceAudioHint: "Beim Tippen auf Start erscheint eine Abfrage zur Bildschirmfreigabe. Nach der Zustimmung wird der Ton anderer Apps, etwa einer Video-App, übersetzt. Apps, die die Audioaufnahme sperren, werden nicht übersetzt. Deine eigene Stimme (Mikrofon) wird ebenfalls übersetzt. Der Ton anderer Apps wird ebenfalls an unseren Server gesendet und im Gespräch gespeichert.",
    captureSourceDeviceAudioHintIos: "Beim Tippen auf Start erscheint das Fenster für die Bildschirmübertragung. Starten Sie die Übertragung und wechseln Sie dann zur Video-App: Deren Ton wird übersetzt. Apps, die die Audioaufnahme sperren, werden nicht übersetzt. Deine eigene Stimme (Mikrofon) wird ebenfalls übersetzt. Der Ton anderer Apps wird ebenfalls an unseren Server gesendet und im Gespräch gespeichert.",
    screenCaptureNoticeTitle: "Wir fragen nach einer Bildschirmaufnahme",
    screenCaptureNoticeBodyIos: "Keine Sorge! Gleich zeigt das iPhone das Fenster für die Bildschirmübertragung (Bildschirmaufnahme). Tippe auf „Übertragung starten“, um den Ton anderer Apps zu übersetzen. Der Bildschirm wird nicht gespeichert; nur der Ton wird zum Übersetzen genutzt.",
    screenCaptureNoticeBody: "Keine Sorge! Gleich erscheint eine Anfrage zur Bildschirmfreigabe. Erlaube sie, um den Ton anderer Apps zu übersetzen. Der Bildschirm wird nicht gespeichert; nur der Ton wird zum Übersetzen genutzt.",
    screenCaptureNoticeContinueLabel: "Weiter",
    screenCaptureNoticeCancelLabel: "Abbrechen",
  },
  es: {
    label: "Modo auriculares",
    onStateLabel: "Activado",
    offStateLabel: "Desactivado",
    waitingLabel: "Esperando auriculares",
    noticeBody: "Solo funciona mientras llevas auriculares o cascos.",
    earphoneStatusConnectedLabel: "Auriculares conectados",
    earphoneStatusDisconnectedLabel: "Auriculares no conectados",
    readLanguageLabel: "Idioma de lectura",
    noticeConfirmLabel: "Aceptar",
    noticeNextLabel: "Siguiente",
    noticeBackLabel: "Atrás",
    captureSourceLabel: "Sonido que traducir",
    captureSourceMicrophoneLabel: "Solo micrófono",
    captureSourceDeviceAudioLabel: "Micrófono + sonido de este dispositivo",
    captureSourceDeviceAudioHint: "Al pulsar Start se abre una solicitud para compartir pantalla. Cuando la aceptas, se traduce el sonido de otras apps, como una app de vídeo. Las apps que bloquean la captura de audio no se traducen. Tu propia voz (micrófono) también se traduce. El sonido de otras apps también se envía a nuestro servidor y se guarda en la conversación.",
    captureSourceDeviceAudioHintIos: "Al pulsar Start se abre la ventana de emisión de pantalla. Inicia la emisión y cambia a la app de vídeo: se traduce su sonido. Las apps que bloquean la captura de audio no se traducen. Tu propia voz (micrófono) también se traduce. El sonido de otras apps también se envía a nuestro servidor y se guarda en la conversación.",
    screenCaptureNoticeTitle: "Vamos a pedir grabar la pantalla",
    screenCaptureNoticeBodyIos: "¡No te asustes! A continuación el iPhone mostrará la ventana de emisión (grabación) de pantalla. Toca «Iniciar emisión» para traducir el sonido de otras apps. La pantalla no se guarda; solo se usa el sonido para traducir.",
    screenCaptureNoticeBody: "¡No te asustes! A continuación aparecerá una solicitud para compartir la pantalla. Permítela para traducir el sonido de otras apps. La pantalla no se guarda; solo se usa el sonido para traducir.",
    screenCaptureNoticeContinueLabel: "Continuar",
    screenCaptureNoticeCancelLabel: "Cancelar",
  },
  pt: {
    label: "Modo fones de ouvido",
    onStateLabel: "Ativado",
    offStateLabel: "Desativado",
    waitingLabel: "Aguardando fones de ouvido",
    noticeBody: "Funciona apenas enquanto você usa fones de ouvido ou headset.",
    earphoneStatusConnectedLabel: "Fones conectados",
    earphoneStatusDisconnectedLabel: "Fones não conectados",
    readLanguageLabel: "Idioma da leitura",
    noticeConfirmLabel: "OK",
    noticeNextLabel: "Próximo",
    noticeBackLabel: "Voltar",
    captureSourceLabel: "Som a traduzir",
    captureSourceMicrophoneLabel: "Só microfone",
    captureSourceDeviceAudioLabel: "Microfone + som reproduzido neste dispositivo",
    captureSourceDeviceAudioHint: "Ao tocar em Start, aparece um pedido de compartilhamento de tela. Depois de permitir, o som de outros apps, como um app de vídeo, é traduzido. Apps que bloqueiam a captura de áudio não são traduzidos. A sua própria voz (microfone) também é traduzida. O som de outros apps também é enviado ao nosso servidor e salvo na conversa.",
    captureSourceDeviceAudioHintIos: "Ao tocar em Start, abre-se a janela de transmissão de tela. Inicie a transmissão e mude para o app de vídeo: o som dele é traduzido. Apps que bloqueiam a captura de áudio não são traduzidos. A sua própria voz (microfone) também é traduzida. O som de outros apps também é enviado ao nosso servidor e salvo na conversa.",
    screenCaptureNoticeTitle: "Vamos pedir para gravar a tela",
    screenCaptureNoticeBodyIos: "Não se assuste! Em seguida o iPhone mostra a janela de transmissão (gravação) de tela. Toque em \"Iniciar transmissão\" para traduzir o som de outros apps. A tela não é salva; só o som é usado na tradução.",
    screenCaptureNoticeBody: "Não se assuste! Em seguida aparece um pedido de compartilhamento de tela. Permita para traduzir o som de outros apps. A tela não é salva; só o som é usado na tradução.",
    screenCaptureNoticeContinueLabel: "Continuar",
    screenCaptureNoticeCancelLabel: "Cancelar",
  },
  it: {
    label: "Modalità auricolari",
    onStateLabel: "Attiva",
    offStateLabel: "Disattiva",
    waitingLabel: "In attesa degli auricolari",
    noticeBody: "Funziona solo mentre indossi auricolari o cuffie.",
    earphoneStatusConnectedLabel: "Auricolari collegati",
    earphoneStatusDisconnectedLabel: "Auricolari non collegati",
    readLanguageLabel: "Lingua di lettura",
    noticeConfirmLabel: "OK",
    noticeNextLabel: "Avanti",
    noticeBackLabel: "Indietro",
    captureSourceLabel: "Audio da tradurre",
    captureSourceMicrophoneLabel: "Solo microfono",
    captureSourceDeviceAudioLabel: "Microfono + audio riprodotto su questo dispositivo",
    captureSourceDeviceAudioHint: "Toccando Start compare una richiesta di condivisione dello schermo. Dopo il consenso, viene tradotto l'audio delle altre app, ad esempio un'app video. Le app che bloccano l'acquisizione audio non vengono tradotte. Anche la tua voce (microfono) viene tradotta. Anche l'audio delle altre app viene inviato al nostro server e salvato nella conversazione.",
    captureSourceDeviceAudioHintIos: "Toccando Start si apre la finestra di trasmissione dello schermo. Avvia la trasmissione e passa all'app video: il suo audio viene tradotto. Le app che bloccano l'acquisizione audio non vengono tradotte. Anche la tua voce (microfono) viene tradotta. Anche l'audio delle altre app viene inviato al nostro server e salvato nella conversazione.",
    screenCaptureNoticeTitle: "Chiederemo di registrare lo schermo",
    screenCaptureNoticeBodyIos: "Niente paura! Ora l'iPhone mostrerà la finestra di trasmissione (registrazione) dello schermo. Tocca \"Avvia trasmissione\" per tradurre l'audio delle altre app. Lo schermo non viene salvato; si usa solo l'audio per tradurre.",
    screenCaptureNoticeBody: "Niente paura! Ora comparirà una richiesta di condivisione dello schermo. Consentila per tradurre l'audio delle altre app. Lo schermo non viene salvato; si usa solo l'audio per tradurre.",
    screenCaptureNoticeContinueLabel: "Continua",
    screenCaptureNoticeCancelLabel: "Annulla",
  },
  ru: {
    label: "Режим наушников",
    onStateLabel: "Вкл.",
    offStateLabel: "Выкл.",
    waitingLabel: "Ожидание наушников",
    noticeBody: "Работает, только когда вы в наушниках или гарнитуре.",
    earphoneStatusConnectedLabel: "Наушники подключены",
    earphoneStatusDisconnectedLabel: "Наушники не подключены",
    readLanguageLabel: "Язык чтения",
    noticeConfirmLabel: "OK",
    noticeNextLabel: "Далее",
    noticeBackLabel: "Назад",
    captureSourceLabel: "Что переводить",
    captureSourceMicrophoneLabel: "Только микрофон",
    captureSourceDeviceAudioLabel: "Микрофон + звук этого устройства",
    captureSourceDeviceAudioHint: "После нажатия Start появится запрос на показ экрана. Когда вы разрешите его, будет переводиться звук других приложений, например видеоприложения. Приложения, запрещающие захват звука, не переводятся. Ваш собственный голос (микрофон) тоже переводится. Звук других приложений также отправляется на наш сервер и сохраняется в разговоре.",
    captureSourceDeviceAudioHintIos: "После нажатия Start откроется окно трансляции экрана. Запустите трансляцию и перейдите в видеоприложение: его звук будет переводиться. Приложения, запрещающие захват звука, не переводятся. Ваш собственный голос (микрофон) тоже переводится. Звук других приложений также отправляется на наш сервер и сохраняется в разговоре.",
    screenCaptureNoticeTitle: "Мы запросим запись экрана",
    screenCaptureNoticeBodyIos: "Не пугайтесь! Сейчас iPhone покажет окно трансляции (записи) экрана. Нажмите «Начать трансляцию», чтобы переводить звук других приложений. Экран не сохраняется, для перевода используется только звук.",
    screenCaptureNoticeBody: "Не пугайтесь! Сейчас появится запрос на демонстрацию экрана. Разрешите его, чтобы переводить звук других приложений. Экран не сохраняется, для перевода используется только звук.",
    screenCaptureNoticeContinueLabel: "Продолжить",
    screenCaptureNoticeCancelLabel: "Отмена",
  },
  ar: {
    label: "وضع السماعات",
    onStateLabel: "مفعّل",
    offStateLabel: "متوقف",
    waitingLabel: "بانتظار توصيل السماعات",
    noticeBody: "يعمل فقط أثناء ارتداء سماعات الأذن أو سماعة الرأس.",
    earphoneStatusConnectedLabel: "السماعات متصلة",
    earphoneStatusDisconnectedLabel: "السماعات غير متصلة",
    readLanguageLabel: "لغة القراءة",
    noticeConfirmLabel: "حسنًا",
    noticeNextLabel: "التالي",
    noticeBackLabel: "رجوع",
    captureSourceLabel: "الصوت المراد ترجمته",
    captureSourceMicrophoneLabel: "الميكروفون فقط",
    captureSourceDeviceAudioLabel: "الميكروفون + الصوت الذي يُشغَّل على هذا الجهاز",
    captureSourceDeviceAudioHint: "عند الضغط على Start يظهر طلب مشاركة الشاشة. بعد السماح، يُترجَم صوت التطبيقات الأخرى مثل تطبيقات الفيديو. التطبيقات التي تمنع التقاط الصوت لا تُترجَم. يُترجم صوتك أيضًا (الميكروفون). كما يُرسل صوت التطبيقات الأخرى إلى خادمنا ويُحفظ في المحادثة.",
    captureSourceDeviceAudioHintIos: "عند الضغط على Start تظهر نافذة بث الشاشة. ابدأ البث ثم انتقل إلى تطبيق الفيديو، وسيُترجَم صوته. التطبيقات التي تمنع التقاط الصوت لا تُترجَم. يُترجم صوتك أيضًا (الميكروفون). كما يُرسل صوت التطبيقات الأخرى إلى خادمنا ويُحفظ في المحادثة.",
    screenCaptureNoticeTitle: "سنطلب تسجيل الشاشة",
    screenCaptureNoticeBodyIos: "لا تقلق! سيعرض iPhone الآن نافذة بث الشاشة (تسجيل الشاشة). اضغط «بدء البث» لترجمة صوت التطبيقات الأخرى. لا يتم حفظ الشاشة، ويُستخدم الصوت فقط للترجمة.",
    screenCaptureNoticeBody: "لا تقلق! سيظهر الآن طلب مشاركة الشاشة. اسمح به لترجمة صوت التطبيقات الأخرى. لا يتم حفظ الشاشة، ويُستخدم الصوت فقط للترجمة.",
    screenCaptureNoticeContinueLabel: "متابعة",
    screenCaptureNoticeCancelLabel: "إلغاء",
  },
  hi: {
    label: "ईयरफ़ोन मोड",
    onStateLabel: "चालू",
    offStateLabel: "बंद",
    waitingLabel: "ईयरफ़ोन कनेक्ट होने का इंतज़ार",
    noticeBody: "यह केवल तभी काम करता है जब आपने ईयरफ़ोन या हेडसेट पहना हो।",
    earphoneStatusConnectedLabel: "ईयरफ़ोन कनेक्टेड",
    earphoneStatusDisconnectedLabel: "ईयरफ़ोन कनेक्ट नहीं",
    readLanguageLabel: "पढ़कर सुनाने की भाषा",
    noticeConfirmLabel: "ठीक है",
    noticeNextLabel: "आगे",
    noticeBackLabel: "पीछे",
    captureSourceLabel: "अनुवाद की जाने वाली आवाज़",
    captureSourceMicrophoneLabel: "सिर्फ़ माइक्रोफ़ोन",
    captureSourceDeviceAudioLabel: "माइक्रोफ़ोन + इस डिवाइस पर चल रही आवाज़",
    captureSourceDeviceAudioHint: "Start दबाने पर स्क्रीन शेयर करने की अनुमति का संदेश खुलता है। अनुमति देने पर वीडियो ऐप जैसे दूसरे ऐप की आवाज़ का अनुवाद होता है। जो ऐप ऑडियो कैप्चर रोकते हैं, उनका अनुवाद नहीं होता। आपकी अपनी आवाज़ (माइक्रोफ़ोन) का भी अनुवाद होता है। दूसरे ऐप्स की आवाज़ भी हमारे सर्वर पर भेजी जाती है और बातचीत में सेव होती है।",
    captureSourceDeviceAudioHintIos: "Start दबाने पर स्क्रीन ब्रॉडकास्ट की विंडो खुलती है। ब्रॉडकास्ट शुरू करें, फिर वीडियो ऐप पर जाएँ: उसकी आवाज़ का अनुवाद होगा। जो ऐप ऑडियो कैप्चर रोकते हैं, उनका अनुवाद नहीं होता। आपकी अपनी आवाज़ (माइक्रोफ़ोन) का भी अनुवाद होता है। दूसरे ऐप्स की आवाज़ भी हमारे सर्वर पर भेजी जाती है और बातचीत में सेव होती है।",
    screenCaptureNoticeTitle: "हम स्क्रीन रिकॉर्डिंग की अनुमति मांगेंगे",
    screenCaptureNoticeBodyIos: "घबराएँ नहीं! अब iPhone स्क्रीन ब्रॉडकास्ट (स्क्रीन रिकॉर्डिंग) की विंडो दिखाएगा। दूसरे ऐप्स की आवाज़ का अनुवाद करने के लिए 'ब्रॉडकास्ट शुरू करें' दबाएँ। स्क्रीन सेव नहीं होती; अनुवाद के लिए सिर्फ़ आवाज़ इस्तेमाल होती है।",
    screenCaptureNoticeBody: "घबराएँ नहीं! अब स्क्रीन शेयर करने की अनुमति का अनुरोध दिखेगा। दूसरे ऐप्स की आवाज़ का अनुवाद करने के लिए इसे अनुमति दें। स्क्रीन सेव नहीं होती; अनुवाद के लिए सिर्फ़ आवाज़ इस्तेमाल होती है।",
    screenCaptureNoticeContinueLabel: "जारी रखें",
    screenCaptureNoticeCancelLabel: "रद्द करें",
  },
  th: {
    label: "โหมดหูฟัง",
    onStateLabel: "เปิด",
    offStateLabel: "ปิด",
    waitingLabel: "กำลังรอเชื่อมต่อหูฟัง",
    noticeBody: "ทำงานเฉพาะเมื่อคุณสวมหูฟังหรือชุดหูฟังอยู่",
    earphoneStatusConnectedLabel: "เชื่อมต่อหูฟังแล้ว",
    earphoneStatusDisconnectedLabel: "ยังไม่ได้เชื่อมต่อหูฟัง",
    readLanguageLabel: "ภาษาที่อ่านออกเสียง",
    noticeConfirmLabel: "ตกลง",
    noticeNextLabel: "ถัดไป",
    noticeBackLabel: "ย้อนกลับ",
    captureSourceLabel: "เสียงที่จะแปล",
    captureSourceMicrophoneLabel: "ไมโครโฟนเท่านั้น",
    captureSourceDeviceAudioLabel: "ไมโครโฟน + เสียงที่เล่นบนอุปกรณ์นี้",
    captureSourceDeviceAudioHint: "เมื่อกด Start จะมีหน้าต่างขออนุญาตแชร์หน้าจอ เมื่ออนุญาตแล้ว ระบบจะแปลเสียงจากแอปอื่น เช่น แอปวิดีโอ แอปที่ปิดกั้นการบันทึกเสียงจะไม่ถูกแปล เสียงของคุณเอง (ไมโครโฟน) ก็จะถูกแปลด้วย เสียงจากแอปอื่นจะถูกส่งไปยังเซิร์ฟเวอร์ของเราและบันทึกไว้ในบทสนทนาด้วย",
    captureSourceDeviceAudioHintIos: "เมื่อกด Start จะมีหน้าต่างถ่ายทอดหน้าจอ เริ่มการถ่ายทอด แล้วสลับไปที่แอปวิดีโอ ระบบจะแปลเสียงจากแอปนั้น แอปที่ปิดกั้นการบันทึกเสียงจะไม่ถูกแปล เสียงของคุณเอง (ไมโครโฟน) ก็จะถูกแปลด้วย เสียงจากแอปอื่นจะถูกส่งไปยังเซิร์ฟเวอร์ของเราและบันทึกไว้ในบทสนทนาด้วย",
    screenCaptureNoticeTitle: "เราจะขออนุญาตบันทึกหน้าจอ",
    screenCaptureNoticeBodyIos: "ไม่ต้องตกใจ! ต่อไป iPhone จะแสดงหน้าต่างถ่ายทอดหน้าจอ (บันทึกหน้าจอ) แตะ \"เริ่มการถ่ายทอด\" เพื่อแปลเสียงจากแอปอื่น หน้าจอจะไม่ถูกบันทึก ใช้แค่เสียงในการแปล",
    screenCaptureNoticeBody: "ไม่ต้องตกใจ! ต่อไปจะมีคำขอแชร์หน้าจอ อนุญาตเพื่อแปลเสียงจากแอปอื่น หน้าจอจะไม่ถูกบันทึก ใช้แค่เสียงในการแปล",
    screenCaptureNoticeContinueLabel: "ดำเนินการต่อ",
    screenCaptureNoticeCancelLabel: "ยกเลิก",
  },
  vi: {
    label: "Chế độ tai nghe",
    onStateLabel: "Bật",
    offStateLabel: "Tắt",
    waitingLabel: "Đang chờ kết nối tai nghe",
    noticeBody: "Chỉ hoạt động khi bạn đang đeo tai nghe hoặc headset.",
    earphoneStatusConnectedLabel: "Đã kết nối tai nghe",
    earphoneStatusDisconnectedLabel: "Chưa kết nối tai nghe",
    readLanguageLabel: "Ngôn ngữ đọc",
    noticeConfirmLabel: "OK",
    noticeNextLabel: "Tiếp",
    noticeBackLabel: "Quay lại",
    captureSourceLabel: "Âm thanh cần dịch",
    captureSourceMicrophoneLabel: "Chỉ micrô",
    captureSourceDeviceAudioLabel: "Micrô + âm thanh phát trên thiết bị này",
    captureSourceDeviceAudioHint: "Khi nhấn Start, một hộp thoại xin chia sẻ màn hình sẽ hiện ra. Sau khi bạn cho phép, âm thanh từ ứng dụng khác, chẳng hạn ứng dụng video, sẽ được dịch. Ứng dụng chặn thu âm thanh sẽ không được dịch. Giọng nói của bạn (micrô) cũng được dịch. Âm thanh của ứng dụng khác cũng được gửi đến máy chủ của chúng tôi và lưu trong cuộc trò chuyện.",
    captureSourceDeviceAudioHintIos: "Khi nhấn Start, cửa sổ phát sóng màn hình sẽ hiện ra. Hãy bắt đầu phát sóng rồi chuyển sang ứng dụng video: âm thanh của ứng dụng đó sẽ được dịch. Ứng dụng chặn thu âm thanh sẽ không được dịch. Giọng nói của bạn (micrô) cũng được dịch. Âm thanh của ứng dụng khác cũng được gửi đến máy chủ của chúng tôi và lưu trong cuộc trò chuyện.",
    screenCaptureNoticeTitle: "Chúng tôi sẽ xin quyền ghi màn hình",
    screenCaptureNoticeBodyIos: "Đừng lo! Tiếp theo iPhone sẽ hiện cửa sổ phát sóng (ghi) màn hình. Nhấn \"Bắt đầu phát sóng\" để dịch âm thanh của ứng dụng khác. Màn hình không được lưu; chỉ âm thanh được dùng để dịch.",
    screenCaptureNoticeBody: "Đừng lo! Tiếp theo sẽ hiện yêu cầu chia sẻ màn hình. Hãy cho phép để dịch âm thanh của ứng dụng khác. Màn hình không được lưu; chỉ âm thanh được dùng để dịch.",
    screenCaptureNoticeContinueLabel: "Tiếp tục",
    screenCaptureNoticeCancelLabel: "Hủy",
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
