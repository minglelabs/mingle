import { resolvePrimaryUiLocaleTag, type PrimaryUiLocale } from "@/i18n/mingle-locales";

/** Copy for the "when are you coming to Korea?" first-run step (see @/lib/korea-visit). */
export type KoreaVisitCopy = {
  label: string;
  title: string;
  description: string;
  skip: string;
  pickEnd: string;
  pickStart: string;
};

const COPY: Record<PrimaryUiLocale, KoreaVisitCopy> = {
  ko: { label: "한국 여행", title: "한국에 언제 올 예정이에요?", description: "최근에 다녀왔다면 그 날짜도 좋아요.", skip: "아직 일정은 안 정해졌어요", pickStart: "오는 날을 눌러 주세요", pickEnd: "떠나는 날을 눌러 주세요" },
  en: { label: "Trip to Korea", title: "When are you coming to Korea?", description: "Or when were you there last?", skip: "I haven't decided yet", pickStart: "Tap the day you arrive", pickEnd: "Now tap the day you leave" },
  ja: { label: "韓国旅行", title: "いつ韓国に来る予定ですか？", description: "最近行ったなら、その日付でも大丈夫です。", skip: "まだ予定は決まっていません", pickStart: "到着日をタップしてください", pickEnd: "出発日をタップしてください" },
  "zh-CN": { label: "韩国之行", title: "你打算什么时候来韩国？", description: "最近去过的话，也可以选那次的日期。", skip: "还没定好行程", pickStart: "请点选到达日期", pickEnd: "再点选离开日期" },
  "zh-TW": { label: "韓國之旅", title: "你打算什麼時候來韓國？", description: "最近去過的話，也可以選那次的日期。", skip: "還沒決定行程", pickStart: "請點選抵達日期", pickEnd: "再點選離開日期" },
  fr: { label: "Voyage en Corée", title: "Quand venez-vous en Corée ?", description: "Ou quand y êtes-vous allé la dernière fois ?", skip: "Je n’ai pas encore décidé", pickStart: "Touchez le jour d’arrivée", pickEnd: "Touchez le jour de départ" },
  de: { label: "Korea-Reise", title: "Wann kommst du nach Korea?", description: "Oder wann warst du zuletzt dort?", skip: "Steht noch nicht fest", pickStart: "Tippe auf den Ankunftstag", pickEnd: "Jetzt den Abreisetag antippen" },
  es: { label: "Viaje a Corea", title: "¿Cuándo vienes a Corea?", description: "O cuándo fuiste la última vez.", skip: "Aún no lo he decidido", pickStart: "Toca el día de llegada", pickEnd: "Ahora toca el día de salida" },
  pt: { label: "Viagem à Coreia", title: "Quando você vem para a Coreia?", description: "Ou quando foi a última vez que esteve lá.", skip: "Ainda não decidi", pickStart: "Toque no dia da chegada", pickEnd: "Agora toque no dia da partida" },
  it: { label: "Viaggio in Corea", title: "Quando vieni in Corea?", description: "Oppure quando ci sei stato l’ultima volta.", skip: "Non ho ancora deciso", pickStart: "Tocca il giorno di arrivo", pickEnd: "Ora tocca il giorno di partenza" },
  ru: { label: "Поездка в Корею", title: "Когда вы приедете в Корею?", description: "Или когда были там в последний раз.", skip: "Ещё не решил", pickStart: "Нажмите день приезда", pickEnd: "Теперь — день отъезда" },
  ar: { label: "رحلة إلى كوريا", title: "متى ستأتي إلى كوريا؟", description: "أو متى كنت هناك آخر مرة.", skip: "لم أحدد بعد", pickStart: "اضغط على يوم الوصول", pickEnd: "الآن اضغط على يوم المغادرة" },
  hi: { label: "कोरिया यात्रा", title: "आप कोरिया कब आ रहे हैं?", description: "या आप पिछली बार कब गए थे।", skip: "अभी तय नहीं किया", pickStart: "पहुँचने का दिन चुनें", pickEnd: "अब लौटने का दिन चुनें" },
  th: { label: "ทริปเกาหลี", title: "คุณจะมาเกาหลีเมื่อไร?", description: "หรือไปครั้งล่าสุดเมื่อไร ก็เลือกได้", skip: "ยังไม่ได้กำหนด", pickStart: "แตะวันที่มาถึง", pickEnd: "แตะวันที่เดินทางกลับ" },
  vi: { label: "Chuyến đi Hàn Quốc", title: "Khi nào bạn đến Hàn Quốc?", description: "Hoặc lần gần nhất bạn đến là khi nào.", skip: "Mình chưa quyết định", pickStart: "Chạm vào ngày đến", pickEnd: "Giờ chạm vào ngày về" },
};

export function resolveKoreaVisitCopy(rawLocale: string): KoreaVisitCopy {
  const locale = resolvePrimaryUiLocaleTag(rawLocale) ?? "en";
  return COPY[locale] ?? COPY.en;
}
