import { resolvePrimaryUiLocaleTag, type PrimaryUiLocale } from "@/i18n/mingle-locales";

/**
 * Short lines the speak trial suggests reading aloud, in the person's own
 * language (it is interpreted into the others). One is picked at random each
 * time the trial opens. Things you would say to a new friend.
 */
const PHRASES: Record<PrimaryUiLocale, readonly string[]> = {
  ko: ["안녕! 만나서 반가워.", "나는 한국 음식을 정말 좋아해.", "주말에 같이 커피 마실래?", "요즘 어떤 노래 들어?"],
  en: ["Hi! Nice to meet you.", "I really love Korean food.", "Want to grab coffee this weekend?", "What music are you into lately?"],
  ja: ["こんにちは！よろしくね。", "韓国料理が大好きです。", "週末に一緒にカフェ行かない？", "最近どんな曲を聴いてる？"],
  "zh-CN": ["你好！很高兴认识你。", "我很喜欢韩国菜。", "周末一起喝咖啡吗？", "你最近在听什么歌？"],
  "zh-TW": ["你好！很高興認識你。", "我很喜歡韓國菜。", "週末一起喝咖啡嗎？", "你最近在聽什麼歌？"],
  fr: ["Salut ! Ravi de te rencontrer.", "J'adore la cuisine coréenne.", "Un café ce week-end ?", "Tu écoutes quoi en ce moment ?"],
  de: ["Hallo! Schön, dich kennenzulernen.", "Ich liebe koreanisches Essen.", "Kaffee am Wochenende?", "Was hörst du gerade für Musik?"],
  es: ["¡Hola! Encantado de conocerte.", "Me encanta la comida coreana.", "¿Tomamos un café este fin de semana?", "¿Qué música escuchas últimamente?"],
  pt: ["Oi! Prazer em te conhecer.", "Eu adoro comida coreana.", "Vamos tomar um café no fim de semana?", "Que música você anda ouvindo?"],
  it: ["Ciao! Piacere di conoscerti.", "Adoro il cibo coreano.", "Un caffè questo weekend?", "Che musica ascolti in questo periodo?"],
  ru: ["Привет! Рад познакомиться.", "Я очень люблю корейскую еду.", "Выпьем кофе на выходных?", "Какую музыку ты сейчас слушаешь?"],
  ar: ["مرحبًا! سعيد بلقائك.", "أحب الطعام الكوري كثيرًا.", "هل نشرب القهوة في عطلة نهاية الأسبوع؟", "ما الموسيقى التي تسمعها هذه الأيام؟"],
  hi: ["नमस्ते! आपसे मिलकर खुशी हुई।", "मुझे कोरियाई खाना बहुत पसंद है।", "इस वीकेंड कॉफ़ी पर चलें?", "आजकल कौन-सा गाना सुन रहे हो?"],
  th: ["สวัสดี! ยินดีที่ได้รู้จัก", "ฉันชอบอาหารเกาหลีมาก", "สุดสัปดาห์นี้ไปกินกาแฟกันไหม?", "ช่วงนี้ฟังเพลงอะไรอยู่?"],
  vi: ["Chào bạn! Rất vui được làm quen.", "Mình rất thích đồ ăn Hàn Quốc.", "Cuối tuần đi cà phê không?", "Dạo này bạn nghe nhạc gì?"],
};

export const SPEAK_TRIAL_PHRASE_LOCALES = Object.keys(PHRASES);

export function resolveSpeakTrialPhrases(rawLocale: string): readonly string[] {
  const locale = resolvePrimaryUiLocaleTag(rawLocale) ?? "en";
  return PHRASES[locale] ?? PHRASES.en;
}

export function pickSpeakTrialPhrase(rawLocale: string, random: () => number = Math.random): string {
  const phrases = resolveSpeakTrialPhrases(rawLocale);
  return phrases[Math.min(phrases.length - 1, Math.floor(random() * phrases.length))];
}
