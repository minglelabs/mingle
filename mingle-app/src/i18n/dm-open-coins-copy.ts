import { resolvePrimaryUiLocaleTag, type PrimaryUiLocale } from "@/i18n/mingle-locales";

/**
 * The question before a man opens a new room with a woman (it costs Hash,
 * given back if she does not write; src/server/dm-open-charge.ts), and the
 * daily attendance notes (src/server/coins/attendance.ts). Owner, 2026-11-26.
 * {coins} {hours} {balance} {day} {bonus} are filled in.
 */
export type DmOpenCoinsCopy = {
  title: string;
  body: string;
  confirm: string;
  cancel: string;
  shortTitle: string;
  shortBody: string;
  buy: string;
  refunded: string;
  attendance: string;
  attendanceBonus: string;
  /** Lines of the Hash history. */
  historyDmOpen: string;
  historyDmOpenRefund: string;
  historyAttendance: string;
  historyAttendanceBonus: string;
};

type Row = [title: string, body: string, confirm: string, cancel: string, shortTitle: string, shortBody: string, buy: string, refunded: string, attendance: string, attendanceBonus: string,
  historyDmOpen: string, historyDmOpenRefund: string, historyAttendance: string, historyAttendanceBonus: string];

const ROWS: Record<PrimaryUiLocale, Row> = {
  ko: ["새 대화 열기", "새 대화를 열면 {coins}해씨가 들어요. {hours}시간 안에 상대가 답장하지 않으면 그대로 돌려드려요.", "{coins}해씨로 대화 열기", "취소", "해씨가 부족해요", "새 대화를 열려면 {coins}해씨가 필요해요. 지금 {balance}해씨가 있어요.", "해씨 충전하기", "답장이 없던 대화 {coins}해씨를 돌려드렸어요", "출석 {day}일째 · {coins}해씨를 받았어요", "7일 연속 출석! {bonus}해씨를 더 드려요", "새 대화 열기", "답장 없는 대화 환불", "출석체크", "7일 연속 출석"],
  en: ["Start a new chat", "Starting a new chat costs {coins} Hash. If they don't reply within {hours} hours, you get it all back.", "Start for {coins} Hash", "Cancel", "Not enough Hash", "Starting a new chat takes {coins} Hash. You have {balance} Hash.", "Get Hash", "No reply came, so {coins} Hash went back to you", "Day {day} check-in · You got {coins} Hash", "7 days in a row! Here's {bonus} Hash more", "New chat", "Refund: no reply", "Daily check-in", "7-day streak"],
  ja: ["新しいトークを始める", "新しいトークを始めるには{coins}ハッシュかかります。{hours}時間以内に返信がなければ全額お返しします。", "{coins}ハッシュで始める", "キャンセル", "ハッシュが足りません", "新しいトークには{coins}ハッシュ必要です。今は{balance}ハッシュです。", "ハッシュをチャージ", "返信がなかったトークの{coins}ハッシュをお返ししました", "出席{day}日目 · {coins}ハッシュを受け取りました", "7日連続出席！さらに{bonus}ハッシュをどうぞ", "新しいトーク", "返信なしの返金", "出席チェック", "7日連続出席"],
  "zh-CN": ["开始新聊天", "开始新聊天需要 {coins} 哈希。如果对方 {hours} 小时内没有回复，将全额退还。", "用 {coins} 哈希开始", "取消", "哈希不足", "开始新聊天需要 {coins} 哈希，你现在有 {balance} 哈希。", "获取哈希", "对方没有回复，已退还 {coins} 哈希", "签到第 {day} 天 · 获得 {coins} 哈希", "连续签到 7 天！再送 {bonus} 哈希", "开始新聊天", "无回复退还", "每日签到", "连续签到 7 天"],
  "zh-TW": ["開始新聊天", "開始新聊天需要 {coins} 哈希。如果對方 {hours} 小時內沒有回覆，將全額退還。", "用 {coins} 哈希開始", "取消", "哈希不足", "開始新聊天需要 {coins} 哈希，你現在有 {balance} 哈希。", "取得哈希", "對方沒有回覆，已退還 {coins} 哈希", "簽到第 {day} 天 · 獲得 {coins} 哈希", "連續簽到 7 天！再送 {bonus} 哈希", "開始新聊天", "無回覆退還", "每日簽到", "連續簽到 7 天"],
  fr: ["Nouvelle conversation", "Démarrer une nouvelle conversation coûte {coins} Hash. Sans réponse sous {hours} heures, tout vous est rendu.", "Démarrer pour {coins} Hash", "Annuler", "Pas assez de Hash", "Une nouvelle conversation coûte {coins} Hash. Vous avez {balance} Hash.", "Obtenir des Hash", "Pas de réponse : {coins} Hash vous ont été rendus", "Jour {day} de présence · {coins} Hash reçus", "7 jours d’affilée ! Voici {bonus} Hash en plus", "Nouvelle conversation", "Remboursement : sans réponse", "Présence du jour", "7 jours d’affilée"],
  de: ["Neuen Chat starten", "Ein neuer Chat kostet {coins} Hash. Kommt innerhalb von {hours} Stunden keine Antwort, bekommst du alles zurück.", "Für {coins} Hash starten", "Abbrechen", "Nicht genug Hash", "Ein neuer Chat kostet {coins} Hash. Du hast {balance} Hash.", "Hash holen", "Keine Antwort – {coins} Hash sind zurück bei dir", "Tag {day} eingecheckt · {coins} Hash erhalten", "7 Tage in Folge! Hier sind {bonus} Hash extra", "Neuer Chat", "Erstattung: keine Antwort", "Täglicher Check-in", "7 Tage in Folge"],
  es: ["Iniciar un chat nuevo", "Iniciar un chat nuevo cuesta {coins} Hash. Si no responde en {hours} horas, te lo devolvemos todo.", "Iniciar por {coins} Hash", "Cancelar", "No tienes suficientes Hash", "Un chat nuevo cuesta {coins} Hash. Tienes {balance} Hash.", "Conseguir Hash", "No hubo respuesta: te devolvimos {coins} Hash", "Día {day} de asistencia · Recibiste {coins} Hash", "¡7 días seguidos! Aquí tienes {bonus} Hash más", "Chat nuevo", "Reembolso: sin respuesta", "Asistencia diaria", "7 días seguidos"],
  pt: ["Iniciar nova conversa", "Iniciar uma nova conversa custa {coins} Hash. Se não houver resposta em {hours} horas, você recebe tudo de volta.", "Iniciar por {coins} Hash", "Cancelar", "Hash insuficiente", "Uma nova conversa custa {coins} Hash. Você tem {balance} Hash.", "Obter Hash", "Sem resposta: {coins} Hash voltaram para você", "Dia {day} de presença · Você recebeu {coins} Hash", "7 dias seguidos! Ganhe mais {bonus} Hash", "Nova conversa", "Reembolso: sem resposta", "Presença diária", "7 dias seguidos"],
  it: ["Inizia una nuova chat", "Iniziare una nuova chat costa {coins} Hash. Se non risponde entro {hours} ore, ti restituiamo tutto.", "Inizia per {coins} Hash", "Annulla", "Hash insufficienti", "Una nuova chat costa {coins} Hash. Hai {balance} Hash.", "Ottieni Hash", "Nessuna risposta: ti abbiamo restituito {coins} Hash", "Giorno {day} di presenza · Hai ricevuto {coins} Hash", "7 giorni di fila! Ecco altri {bonus} Hash", "Nuova chat", "Rimborso: nessuna risposta", "Presenza giornaliera", "7 giorni di fila"],
  ru: ["Начать новый чат", "Новый чат стоит {coins} Хэш. Если ответа не будет {hours} ч., вернём всё.", "Начать за {coins} Хэш", "Отмена", "Недостаточно Хэш", "Новый чат стоит {coins} Хэш. У вас {balance} Хэш.", "Получить Хэш", "Ответа не было — {coins} Хэш вернулись к вам", "День {day} подряд · Вы получили {coins} Хэш", "7 дней подряд! Ещё {bonus} Хэш в подарок", "Новый чат", "Возврат: нет ответа", "Ежедневная отметка", "7 дней подряд"],
  ar: ["بدء محادثة جديدة", "بدء محادثة جديدة يكلّف {coins} هاش. إن لم يصلك رد خلال {hours} ساعة نعيدها كاملة.", "ابدأ مقابل {coins} هاش", "إلغاء", "لا يكفي الهاش", "المحادثة الجديدة تحتاج {coins} هاش، ولديك {balance} هاش.", "احصل على هاش", "لم يصل رد، فأعدنا إليك {coins} هاش", "اليوم {day} من الحضور · حصلت على {coins} هاش", "7 أيام متتالية! إليك {bonus} هاش إضافية", "محادثة جديدة", "استرداد: بلا رد", "الحضور اليومي", "7 أيام متتالية"],
  hi: ["नई चैट शुरू करें", "नई चैट शुरू करने में {coins} हैश लगते हैं। {hours} घंटे में जवाब न आए तो पूरे वापस मिलेंगे।", "{coins} हैश में शुरू करें", "रद्द करें", "हैश कम है", "नई चैट के लिए {coins} हैश चाहिए। आपके पास {balance} हैश हैं।", "हैश लें", "जवाब नहीं आया, {coins} हैश वापस कर दिए गए", "हाज़िरी दिन {day} · {coins} हैश मिले", "लगातार 7 दिन! {bonus} हैश और लीजिए", "नई चैट", "वापसी: जवाब नहीं", "रोज़ की हाज़िरी", "लगातार 7 दिन"],
  th: ["เริ่มแชตใหม่", "เริ่มแชตใหม่ใช้ {coins} แฮช ถ้าอีกฝ่ายไม่ตอบภายใน {hours} ชั่วโมง เราคืนให้ทั้งหมด", "เริ่มด้วย {coins} แฮช", "ยกเลิก", "แฮชไม่พอ", "แชตใหม่ต้องใช้ {coins} แฮช ตอนนี้คุณมี {balance} แฮช", "เติมแฮช", "ไม่มีการตอบกลับ คืน {coins} แฮชให้แล้ว", "เช็กอินวันที่ {day} · ได้รับ {coins} แฮช", "ครบ 7 วันติด! รับเพิ่มอีก {bonus} แฮช", "แชตใหม่", "คืนเงิน: ไม่มีการตอบ", "เช็กอินรายวัน", "ติดต่อกัน 7 วัน"],
  vi: ["Bắt đầu trò chuyện mới", "Bắt đầu trò chuyện mới tốn {coins} Hash. Nếu không có trả lời trong {hours} giờ, bạn được hoàn lại toàn bộ.", "Bắt đầu với {coins} Hash", "Hủy", "Không đủ Hash", "Trò chuyện mới cần {coins} Hash. Bạn đang có {balance} Hash.", "Nạp Hash", "Không có trả lời, đã hoàn {coins} Hash cho bạn", "Điểm danh ngày {day} · Bạn nhận {coins} Hash", "7 ngày liên tiếp! Tặng thêm {bonus} Hash", "Trò chuyện mới", "Hoàn lại: không trả lời", "Điểm danh hằng ngày", "7 ngày liên tiếp"],
};

export function resolveDmOpenCoinsCopy(rawLocale: string): DmOpenCoinsCopy {
  const locale = resolvePrimaryUiLocaleTag(rawLocale) ?? "en";
  const row = ROWS[locale] ?? ROWS.en;
  return {
    title: row[0], body: row[1], confirm: row[2], cancel: row[3], shortTitle: row[4], shortBody: row[5],
    buy: row[6], refunded: row[7], attendance: row[8], attendanceBonus: row[9],
    historyDmOpen: row[10], historyDmOpenRefund: row[11], historyAttendance: row[12], historyAttendanceBonus: row[13],
  };
}

export function fillDmOpenCoins(template: string, values: Record<string, number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => (key in values ? values[key].toLocaleString() : match));
}
