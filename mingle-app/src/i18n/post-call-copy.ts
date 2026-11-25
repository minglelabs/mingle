import { resolvePrimaryUiLocaleTag, type PrimaryUiLocale } from "@/i18n/mingle-locales";

/** 1:1 voice talk from a post (owner, 2026-11-25; see @/lib/post-call and src/server/post-calls.ts). */
export type PostCallCopy = {
  /** The category on the write screen and the badge on the card. */
  category: string;
  /** Under the chips while it is picked. */
  hint: string;
  callButton: string;
  /** The caller's screen while the author's phone rings. */
  waiting: string;
  /** The author's screen while it rings. */
  incoming: string;
  accept: string;
  decline: string;
  cancel: string;
  hangUp: string;
  connecting: string;
  /** Nobody answered, or it was declined. */
  notConnected: string;
  ended: string;
  /** The author is in another call. */
  busy: string;
  /** Any other reason the call cannot be made. */
  unavailable: string;
  appOnly: string;
  tooSoon: string;
  translate: string;
  readAloud: string;
  mic: string;
};

type Row = [
  category: string, hint: string, callButton: string, waiting: string, incoming: string, accept: string, decline: string,
  cancel: string, hangUp: string, connecting: string, notConnected: string, ended: string, busy: string, unavailable: string,
  appOnly: string, tooSoon: string, translate: string, readAloud: string, mic: string,
];

const ROWS: Record<PrimaryUiLocale, Row> = {
  ko: ["1:1 보이스톡", "1시간 동안 1:1 통화를 받아요. 한 번에 한 명과 통화해요.", "통화 걸기", "연결을 기다리는 중", "1:1 보이스톡이 왔어요", "받기", "거절", "취소", "끊기", "연결 중", "통화가 연결되지 않았어요", "통화가 끝났어요", "지금 다른 통화 중이에요", "지금은 통화를 걸 수 없어요", "통화는 앱에서 할 수 있어요", "잠시 후 다시 걸어 주세요", "번역", "읽어주기", "마이크"],
  en: ["1:1 voice talk", "Takes 1:1 calls for an hour, one person at a time.", "Call", "Waiting for an answer", "Incoming 1:1 voice talk", "Answer", "Decline", "Cancel", "Hang up", "Connecting", "The call did not connect", "The call ended", "They are on another call", "You cannot call right now", "Calls work in the app", "Try again in a moment", "Translate", "Read aloud", "Mic"],
  ja: ["1対1ボイストーク", "1時間、1対1の通話を受け付けます。同時に話せるのは1人です。", "通話する", "応答を待っています", "1対1ボイストークの着信", "出る", "拒否", "キャンセル", "切る", "接続中", "通話はつながりませんでした", "通話が終わりました", "相手は別の通話中です", "今は通話できません", "通話はアプリでできます", "少ししてからもう一度かけてください", "翻訳", "読み上げ", "マイク"],
  "zh-CN": ["1对1语音通话", "1小时内接听1对1通话，每次只和一个人通话。", "拨打", "正在等待接听", "收到1对1语音通话", "接听", "拒绝", "取消", "挂断", "连接中", "通话未接通", "通话已结束", "对方正在通话中", "现在无法拨打", "通话只能在应用中进行", "请稍后再拨", "翻译", "朗读", "麦克风"],
  "zh-TW": ["1對1語音通話", "1小時內接聽1對1通話，每次只和一個人通話。", "撥打", "正在等待接聽", "收到1對1語音通話", "接聽", "拒絕", "取消", "掛斷", "連線中", "通話未接通", "通話已結束", "對方正在通話中", "現在無法撥打", "通話只能在應用程式中進行", "請稍後再撥", "翻譯", "朗讀", "麥克風"],
  fr: ["Appel vocal 1:1", "Reçoit des appels 1:1 pendant une heure, une personne à la fois.", "Appeler", "En attente de réponse", "Appel vocal 1:1 entrant", "Répondre", "Refuser", "Annuler", "Raccrocher", "Connexion", "L’appel n’a pas abouti", "L’appel est terminé", "Cette personne est déjà en appel", "Appel impossible pour le moment", "Les appels se font dans l’appli", "Réessayez dans un instant", "Traduire", "Lire à voix haute", "Micro"],
  de: ["1:1-Sprachanruf", "Nimmt eine Stunde lang 1:1-Anrufe an, immer nur eine Person.", "Anrufen", "Warten auf Antwort", "Eingehender 1:1-Sprachanruf", "Annehmen", "Ablehnen", "Abbrechen", "Auflegen", "Verbindung wird aufgebaut", "Der Anruf kam nicht zustande", "Der Anruf ist beendet", "Die Person telefoniert gerade", "Anruf im Moment nicht möglich", "Anrufe gehen in der App", "Versuch es gleich noch einmal", "Übersetzen", "Vorlesen", "Mikrofon"],
  es: ["Llamada de voz 1:1", "Recibe llamadas 1:1 durante una hora, de una persona cada vez.", "Llamar", "Esperando respuesta", "Llamada de voz 1:1 entrante", "Contestar", "Rechazar", "Cancelar", "Colgar", "Conectando", "La llamada no se conectó", "La llamada terminó", "Está en otra llamada", "Ahora no se puede llamar", "Las llamadas funcionan en la app", "Inténtalo de nuevo en un momento", "Traducir", "Leer en voz alta", "Micrófono"],
  pt: ["Chamada de voz 1:1", "Recebe chamadas 1:1 por uma hora, uma pessoa de cada vez.", "Ligar", "Aguardando resposta", "Chamada de voz 1:1 recebida", "Atender", "Recusar", "Cancelar", "Desligar", "Conectando", "A chamada não foi completada", "A chamada terminou", "A pessoa está em outra chamada", "Não dá para ligar agora", "As chamadas funcionam no app", "Tente de novo daqui a pouco", "Traduzir", "Ler em voz alta", "Microfone"],
  it: ["Chiamata vocale 1:1", "Riceve chiamate 1:1 per un’ora, una persona alla volta.", "Chiama", "In attesa di risposta", "Chiamata vocale 1:1 in arrivo", "Rispondi", "Rifiuta", "Annulla", "Riaggancia", "Connessione", "La chiamata non è andata a buon fine", "La chiamata è terminata", "È già in un’altra chiamata", "Ora non puoi chiamare", "Le chiamate funzionano nell’app", "Riprova tra un attimo", "Traduci", "Leggi ad alta voce", "Microfono"],
  ru: ["Голосовой звонок 1:1", "Принимает звонки 1:1 в течение часа, по одному человеку.", "Позвонить", "Ждём ответа", "Входящий голосовой звонок 1:1", "Ответить", "Отклонить", "Отмена", "Завершить", "Соединение", "Звонок не состоялся", "Звонок завершён", "Собеседник уже разговаривает", "Сейчас позвонить нельзя", "Звонки работают в приложении", "Попробуйте чуть позже", "Перевод", "Читать вслух", "Микрофон"],
  ar: ["مكالمة صوتية 1:1", "يستقبل مكالمات 1:1 لمدة ساعة، شخص واحد في كل مرة.", "اتصال", "في انتظار الرد", "مكالمة صوتية 1:1 واردة", "رد", "رفض", "إلغاء", "إنهاء", "جارٍ الاتصال", "لم تتم المكالمة", "انتهت المكالمة", "الطرف الآخر في مكالمة أخرى", "لا يمكن الاتصال الآن", "المكالمات تعمل داخل التطبيق", "حاول مرة أخرى بعد قليل", "ترجمة", "قراءة بصوت عالٍ", "الميكروفون"],
  hi: ["1:1 वॉइस कॉल", "एक घंटे तक 1:1 कॉल लेता है, एक बार में एक व्यक्ति से।", "कॉल करें", "जवाब का इंतज़ार है", "1:1 वॉइस कॉल आ रही है", "उठाएँ", "मना करें", "रद्द करें", "काटें", "जुड़ रहा है", "कॉल नहीं जुड़ी", "कॉल खत्म हो गई", "वे दूसरी कॉल पर हैं", "अभी कॉल नहीं की जा सकती", "कॉल ऐप में होती है", "थोड़ी देर बाद फिर कोशिश करें", "अनुवाद", "पढ़कर सुनाएँ", "माइक"],
  th: ["คุยเสียง 1:1", "รับสาย 1:1 เป็นเวลา 1 ชั่วโมง ครั้งละหนึ่งคน", "โทร", "กำลังรอรับสาย", "มีสายคุยเสียง 1:1 เข้ามา", "รับสาย", "ปฏิเสธ", "ยกเลิก", "วางสาย", "กำลังเชื่อมต่อ", "สายไม่ได้เชื่อมต่อ", "สายสิ้นสุดแล้ว", "อีกฝ่ายกำลังคุยสายอื่น", "ตอนนี้โทรไม่ได้", "โทรได้ในแอป", "ลองอีกครั้งในอีกสักครู่", "แปล", "อ่านออกเสียง", "ไมค์"],
  vi: ["Gọi thoại 1:1", "Nhận cuộc gọi 1:1 trong một giờ, mỗi lần một người.", "Gọi", "Đang chờ trả lời", "Có cuộc gọi thoại 1:1", "Nghe máy", "Từ chối", "Hủy", "Cúp máy", "Đang kết nối", "Cuộc gọi không kết nối được", "Cuộc gọi đã kết thúc", "Người ấy đang có cuộc gọi khác", "Hiện không gọi được", "Gọi được trong ứng dụng", "Hãy thử lại sau giây lát", "Dịch", "Đọc to", "Micrô"],
};

function build(row: Row): PostCallCopy {
  return {
    category: row[0], hint: row[1], callButton: row[2], waiting: row[3], incoming: row[4], accept: row[5], decline: row[6],
    cancel: row[7], hangUp: row[8], connecting: row[9], notConnected: row[10], ended: row[11], busy: row[12], unavailable: row[13],
    appOnly: row[14], tooSoon: row[15], translate: row[16], readAloud: row[17], mic: row[18],
  };
}

export function resolvePostCallCopy(rawLocale: string): PostCallCopy {
  const locale = resolvePrimaryUiLocaleTag(rawLocale) ?? "en";
  return build(ROWS[locale] ?? ROWS.en);
}
