import { resolvePrimaryUiLocaleTag, type PrimaryUiLocale } from "@/i18n/mingle-locales";
import type { KoreaVisitAgo } from "@/lib/korea-visit";

/** Copy for the first-run Korea trip steps (see @/lib/korea-visit). No extra labels: only the questions and the choices (owner, 2026-11-25). */
export type KoreaVisitCopy = {
  /** "한국 여행 올 일정이 정해졌나요?" and its three answers. */
  planQuestion: string;
  planned: string;
  undecided: string;
  visited: string;
  /** The calendar: its question and the two fields. */
  title: string;
  arrive: string;
  leave: string;
  /** A past trip: how long ago. */
  visitedTitle: string;
  ago: Record<KoreaVisitAgo, string>;
};

const COPY: Record<PrimaryUiLocale, KoreaVisitCopy> = {
  ko: {
    planQuestion: "한국 여행 올 일정이 정해졌나요?", planned: "정해졌어요", undecided: "아직 안 정해졌어요", visited: "최근에 다녀왔어요",
    title: "언제 오고 언제 떠나요?", arrive: "오는 날", leave: "떠나는 날", visitedTitle: "언제 다녀왔어요?",
    ago: { month: "한 달 안", half_year: "6개월 안", year: "1년 안", older: "1년도 더 전" },
  },
  en: {
    planQuestion: "Do you have a trip to Korea planned?", planned: "Yes, I do", undecided: "Not yet", visited: "I was there recently",
    title: "When do you arrive and leave?", arrive: "Arrive", leave: "Leave", visitedTitle: "When were you there?",
    ago: { month: "Within a month", half_year: "Within 6 months", year: "Within a year", older: "Over a year ago" },
  },
  ja: {
    planQuestion: "韓国旅行の予定は決まっていますか？", planned: "決まっています", undecided: "まだ決まっていません", visited: "最近行ってきました",
    title: "いつ来ていつ帰りますか？", arrive: "到着日", leave: "出発日", visitedTitle: "いつ行きましたか？",
    ago: { month: "1か月以内", half_year: "6か月以内", year: "1年以内", older: "1年以上前" },
  },
  "zh-CN": {
    planQuestion: "来韩国旅行的行程定了吗？", planned: "定好了", undecided: "还没定", visited: "最近去过",
    title: "什么时候来、什么时候走？", arrive: "到达日", leave: "离开日", visitedTitle: "什么时候去的？",
    ago: { month: "一个月内", half_year: "半年内", year: "一年内", older: "一年多以前" },
  },
  "zh-TW": {
    planQuestion: "來韓國旅行的行程決定了嗎？", planned: "決定了", undecided: "還沒決定", visited: "最近去過",
    title: "什麼時候來、什麼時候走？", arrive: "抵達日", leave: "離開日", visitedTitle: "什麼時候去的？",
    ago: { month: "一個月內", half_year: "半年內", year: "一年內", older: "一年多以前" },
  },
  fr: {
    planQuestion: "Avez-vous prévu un voyage en Corée ?", planned: "Oui", undecided: "Pas encore", visited: "J’y suis allé récemment",
    title: "Quand arrivez-vous et repartez-vous ?", arrive: "Arrivée", leave: "Départ", visitedTitle: "Quand y étiez-vous ?",
    ago: { month: "Il y a moins d’un mois", half_year: "Il y a moins de 6 mois", year: "Il y a moins d’un an", older: "Il y a plus d’un an" },
  },
  de: {
    planQuestion: "Steht deine Korea-Reise schon fest?", planned: "Ja", undecided: "Noch nicht", visited: "Ich war vor Kurzem dort",
    title: "Wann kommst du an, wann reist du ab?", arrive: "Ankunft", leave: "Abreise", visitedTitle: "Wann warst du dort?",
    ago: { month: "Vor weniger als einem Monat", half_year: "Vor weniger als 6 Monaten", year: "Vor weniger als einem Jahr", older: "Vor über einem Jahr" },
  },
  es: {
    planQuestion: "¿Ya tienes fechas para viajar a Corea?", planned: "Sí", undecided: "Todavía no", visited: "Estuve hace poco",
    title: "¿Cuándo llegas y cuándo te vas?", arrive: "Llegada", leave: "Salida", visitedTitle: "¿Cuándo estuviste?",
    ago: { month: "Hace menos de un mes", half_year: "Hace menos de 6 meses", year: "Hace menos de un año", older: "Hace más de un año" },
  },
  pt: {
    planQuestion: "Você já tem datas para a viagem à Coreia?", planned: "Sim", undecided: "Ainda não", visited: "Estive lá há pouco tempo",
    title: "Quando você chega e quando vai embora?", arrive: "Chegada", leave: "Partida", visitedTitle: "Quando você esteve lá?",
    ago: { month: "Há menos de um mês", half_year: "Há menos de 6 meses", year: "Há menos de um ano", older: "Há mais de um ano" },
  },
  it: {
    planQuestion: "Hai già le date per il viaggio in Corea?", planned: "Sì", undecided: "Non ancora", visited: "Ci sono stato da poco",
    title: "Quando arrivi e quando riparti?", arrive: "Arrivo", leave: "Partenza", visitedTitle: "Quando ci sei stato?",
    ago: { month: "Meno di un mese fa", half_year: "Meno di 6 mesi fa", year: "Meno di un anno fa", older: "Più di un anno fa" },
  },
  ru: {
    planQuestion: "Поездка в Корею уже запланирована?", planned: "Да", undecided: "Пока нет", visited: "Недавно там был",
    title: "Когда приезжаете и уезжаете?", arrive: "Приезд", leave: "Отъезд", visitedTitle: "Когда вы там были?",
    ago: { month: "Меньше месяца назад", half_year: "Меньше полугода назад", year: "Меньше года назад", older: "Больше года назад" },
  },
  ar: {
    planQuestion: "هل حدّدت موعد رحلتك إلى كوريا؟", planned: "نعم", undecided: "ليس بعد", visited: "زرتها مؤخرًا",
    title: "متى تصل ومتى تغادر؟", arrive: "الوصول", leave: "المغادرة", visitedTitle: "متى كنت هناك؟",
    ago: { month: "خلال شهر", half_year: "خلال 6 أشهر", year: "خلال سنة", older: "منذ أكثر من سنة" },
  },
  hi: {
    planQuestion: "क्या कोरिया यात्रा की तारीख़ें तय हैं?", planned: "हाँ, तय हैं", undecided: "अभी नहीं", visited: "हाल ही में गया था",
    title: "कब आएँगे और कब जाएँगे?", arrive: "आने का दिन", leave: "जाने का दिन", visitedTitle: "आप कब गए थे?",
    ago: { month: "एक महीने के भीतर", half_year: "6 महीने के भीतर", year: "एक साल के भीतर", older: "एक साल से पहले" },
  },
  th: {
    planQuestion: "กำหนดวันเที่ยวเกาหลีแล้วหรือยัง?", planned: "กำหนดแล้ว", undecided: "ยังไม่ได้กำหนด", visited: "เพิ่งไปมา",
    title: "มาถึงวันไหน กลับวันไหน?", arrive: "วันที่มาถึง", leave: "วันที่กลับ", visitedTitle: "ไปมาเมื่อไร?",
    ago: { month: "ภายใน 1 เดือน", half_year: "ภายใน 6 เดือน", year: "ภายใน 1 ปี", older: "นานกว่า 1 ปี" },
  },
  vi: {
    planQuestion: "Bạn đã có lịch đi Hàn Quốc chưa?", planned: "Có rồi", undecided: "Chưa có", visited: "Mình mới đi gần đây",
    title: "Khi nào bạn đến và khi nào về?", arrive: "Ngày đến", leave: "Ngày về", visitedTitle: "Bạn đi khi nào?",
    ago: { month: "Trong vòng 1 tháng", half_year: "Trong vòng 6 tháng", year: "Trong vòng 1 năm", older: "Hơn 1 năm trước" },
  },
};

export function resolveKoreaVisitCopy(rawLocale: string): KoreaVisitCopy {
  const locale = resolvePrimaryUiLocaleTag(rawLocale) ?? "en";
  return COPY[locale] ?? COPY.en;
}
