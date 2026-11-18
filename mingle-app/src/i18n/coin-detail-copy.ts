import type { AppLocale } from "@/i18n";
import { resolvePrimaryUiLocale, type PrimaryUiLocale } from "@/i18n/mingle-locales";

// Hash usage in detail (15 primary UI languages): what each charge in the
// history paid for, and the cost tips shown the first time voice talk
// interpretation or its read-aloud is turned on.

export type CoinUsageFeatureKey = "voice_caption" | "voice_listen" | "speech" | "read_aloud" | "typed" | "translation" | "photo";

export type CoinDetailCopy = {
  features: Record<CoinUsageFeatureKey, string>;
  /** "{count} times" */
  count: string;
  /** The first time interpretation is turned on in a voice talk. */
  interpretTip: string;
  /** The first time read-aloud is turned on. */
  listenTip: string;
  gotIt: string;
};

const COPY: Record<PrimaryUiLocale, CoinDetailCopy> = {
  ko: {
    features: { voice_caption: "보이스톡 자막·번역", voice_listen: "보이스톡 통역 듣기", speech: "음성 인식", read_aloud: "번역 읽어 주기", typed: "입력한 메시지 번역", translation: "번역", photo: "사진 번역" },
    count: "{count}회",
    interpretTip: "통역을 켜면 상대가 말한 1분에 약 {coins}해씨가 들어요.",
    listenTip: "통역 듣기를 켜면 읽어 준 음성 1분에 약 {coins}해씨가 더 들어요.",
    gotIt: "알겠어요",
  },
  en: {
    features: { voice_caption: "Voice talk captions", voice_listen: "Voice talk interpretation audio", speech: "Speech recognition", read_aloud: "Translation read aloud", typed: "Typed message translation", translation: "Translation", photo: "Photo translation" },
    count: "{count}×",
    interpretTip: "Interpretation uses about {coins} Hash per minute the others speak.",
    listenTip: "Hearing the interpretation adds about {coins} Hash per minute of audio.",
    gotIt: "Got it",
  },
  ja: {
    features: { voice_caption: "ボイストーク字幕・翻訳", voice_listen: "ボイストーク通訳音声", speech: "音声認識", read_aloud: "翻訳の読み上げ", typed: "入力メッセージの翻訳", translation: "翻訳", photo: "写真翻訳" },
    count: "{count}回",
    interpretTip: "通訳をオンにすると、相手が話した1分あたり約{coins}ハッシュかかります。",
    listenTip: "通訳音声をオンにすると、読み上げ1分あたり約{coins}ハッシュ追加でかかります。",
    gotIt: "OK",
  },
  "zh-CN": {
    features: { voice_caption: "语音通话字幕·翻译", voice_listen: "语音通话口译语音", speech: "语音识别", read_aloud: "朗读翻译", typed: "输入消息翻译", translation: "翻译", photo: "图片翻译" },
    count: "{count}次",
    interpretTip: "开启口译后，对方每说1分钟约消耗{coins}个Hash。",
    listenTip: "开启口译语音后，每朗读1分钟约再消耗{coins}个Hash。",
    gotIt: "知道了",
  },
  "zh-TW": {
    features: { voice_caption: "語音通話字幕·翻譯", voice_listen: "語音通話口譯語音", speech: "語音辨識", read_aloud: "朗讀翻譯", typed: "輸入訊息翻譯", translation: "翻譯", photo: "圖片翻譯" },
    count: "{count}次",
    interpretTip: "開啟口譯後，對方每說1分鐘約消耗{coins}個Hash。",
    listenTip: "開啟口譯語音後，每朗讀1分鐘約再消耗{coins}個Hash。",
    gotIt: "知道了",
  },
  fr: {
    features: { voice_caption: "Sous-titres d'appel vocal", voice_listen: "Audio d'interprétation", speech: "Reconnaissance vocale", read_aloud: "Traduction lue à voix haute", typed: "Traduction de messages saisis", translation: "Traduction", photo: "Traduction de photo" },
    count: "{count} fois",
    interpretTip: "L'interprétation coûte environ {coins} Hash par minute de parole des autres.",
    listenTip: "Écouter l'interprétation ajoute environ {coins} Hash par minute d'audio.",
    gotIt: "Compris",
  },
  de: {
    features: { voice_caption: "Sprachanruf-Untertitel", voice_listen: "Dolmetsch-Audio", speech: "Spracherkennung", read_aloud: "Übersetzung vorlesen", typed: "Übersetzung getippter Nachrichten", translation: "Übersetzung", photo: "Fotoübersetzung" },
    count: "{count}×",
    interpretTip: "Dolmetschen kostet etwa {coins} Hash pro Minute, die andere sprechen.",
    listenTip: "Das Anhören der Verdolmetschung kostet etwa {coins} Hash mehr pro Audiominute.",
    gotIt: "Verstanden",
  },
  es: {
    features: { voice_caption: "Subtítulos de llamada de voz", voice_listen: "Audio de interpretación", speech: "Reconocimiento de voz", read_aloud: "Traducción leída en voz alta", typed: "Traducción de mensajes escritos", translation: "Traducción", photo: "Traducción de fotos" },
    count: "{count} veces",
    interpretTip: "La interpretación cuesta unos {coins} Hash por minuto que hablan los demás.",
    listenTip: "Escuchar la interpretación suma unos {coins} Hash por minuto de audio.",
    gotIt: "Entendido",
  },
  pt: {
    features: { voice_caption: "Legendas de chamada de voz", voice_listen: "Áudio de interpretação", speech: "Reconhecimento de voz", read_aloud: "Tradução lida em voz alta", typed: "Tradução de mensagens digitadas", translation: "Tradução", photo: "Tradução de foto" },
    count: "{count} vezes",
    interpretTip: "A interpretação custa cerca de {coins} Hash por minuto de fala dos outros.",
    listenTip: "Ouvir a interpretação acrescenta cerca de {coins} Hash por minuto de áudio.",
    gotIt: "Entendi",
  },
  it: {
    features: { voice_caption: "Sottotitoli chiamata vocale", voice_listen: "Audio dell'interpretazione", speech: "Riconoscimento vocale", read_aloud: "Traduzione letta ad alta voce", typed: "Traduzione dei messaggi scritti", translation: "Traduzione", photo: "Traduzione foto" },
    count: "{count} volte",
    interpretTip: "L'interpretazione costa circa {coins} Hash per minuto di parlato degli altri.",
    listenTip: "Ascoltare l'interpretazione aggiunge circa {coins} Hash per minuto di audio.",
    gotIt: "Ho capito",
  },
  ru: {
    features: { voice_caption: "Субтитры голосового звонка", voice_listen: "Озвучка перевода в звонке", speech: "Распознавание речи", read_aloud: "Озвучивание перевода", typed: "Перевод набранных сообщений", translation: "Перевод", photo: "Перевод фото" },
    count: "{count} раз",
    interpretTip: "Перевод стоит около {coins} Hash за минуту речи собеседников.",
    listenTip: "Озвучка перевода добавляет около {coins} Hash за минуту аудио.",
    gotIt: "Понятно",
  },
  ar: {
    features: { voice_caption: "ترجمة المكالمة الصوتية", voice_listen: "صوت الترجمة الفورية", speech: "التعرف على الكلام", read_aloud: "قراءة الترجمة بصوت عالٍ", typed: "ترجمة الرسائل المكتوبة", translation: "ترجمة", photo: "ترجمة الصور" },
    count: "{count} مرة",
    interpretTip: "تكلّف الترجمة الفورية نحو {coins} Hash لكل دقيقة يتحدث فيها الآخرون.",
    listenTip: "يضيف الاستماع إلى الترجمة نحو {coins} Hash لكل دقيقة صوت.",
    gotIt: "حسنًا",
  },
  hi: {
    features: { voice_caption: "वॉइस कॉल कैप्शन", voice_listen: "वॉइस कॉल अनुवाद ऑडियो", speech: "वाक् पहचान", read_aloud: "अनुवाद पढ़कर सुनाना", typed: "टाइप किए संदेश का अनुवाद", translation: "अनुवाद", photo: "फ़ोटो अनुवाद" },
    count: "{count} बार",
    interpretTip: "दुभाषिया दूसरों के बोलने के हर मिनट पर लगभग {coins} Hash लेता है।",
    listenTip: "अनुवाद सुनने पर ऑडियो के हर मिनट पर लगभग {coins} Hash और लगते हैं।",
    gotIt: "समझ गया",
  },
  th: {
    features: { voice_caption: "คำบรรยายวอยซ์คอล", voice_listen: "เสียงล่ามวอยซ์คอล", speech: "การรู้จำเสียง", read_aloud: "อ่านคำแปลออกเสียง", typed: "แปลข้อความที่พิมพ์", translation: "การแปล", photo: "แปลรูปภาพ" },
    count: "{count} ครั้ง",
    interpretTip: "การล่ามใช้ประมาณ {coins} Hash ต่อนาทีที่คนอื่นพูด",
    listenTip: "การฟังเสียงล่ามใช้เพิ่มประมาณ {coins} Hash ต่อนาทีของเสียง",
    gotIt: "เข้าใจแล้ว",
  },
  vi: {
    features: { voice_caption: "Phụ đề cuộc gọi thoại", voice_listen: "Âm thanh phiên dịch", speech: "Nhận dạng giọng nói", read_aloud: "Đọc bản dịch", typed: "Dịch tin nhắn đã gõ", translation: "Dịch", photo: "Dịch ảnh" },
    count: "{count} lần",
    interpretTip: "Phiên dịch tốn khoảng {coins} Hash cho mỗi phút người khác nói.",
    listenTip: "Nghe phiên dịch tốn thêm khoảng {coins} Hash mỗi phút âm thanh.",
    gotIt: "Đã hiểu",
  },
};

export function getCoinDetailCopy(locale: AppLocale): CoinDetailCopy {
  return COPY[resolvePrimaryUiLocale(locale)];
}
