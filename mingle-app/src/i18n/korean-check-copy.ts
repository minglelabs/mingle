import { resolvePrimaryUiLocaleTag, type PrimaryUiLocale } from "@/i18n/mingle-locales";

/** The first-run question right after the language: "Are you Korean?" (see @/lib/korean-signup). */
export type KoreanCheckCopy = {
  label: string;
  title: string;
  description: string;
  yes: string;
  no: string;
};

const COPY: Record<PrimaryUiLocale, KoreanCheckCopy> = {
  ko: { label: "국적", title: "한국인이신가요?", description: "앱 언어와 상관없이 골라 주세요. 가입 방법이 달라져요.", yes: "네, 한국인이에요", no: "아니요" },
  en: { label: "Nationality", title: "Are you Korean?", description: "Whatever app language you picked. It changes how you sign up.", yes: "Yes, I'm Korean", no: "No" },
  ja: { label: "国籍", title: "韓国の方ですか？", description: "アプリの言語に関係なく選んでください。登録方法が変わります。", yes: "はい、韓国人です", no: "いいえ" },
  "zh-CN": { label: "国籍", title: "你是韩国人吗？", description: "与应用语言无关，请如实选择。注册方式会有所不同。", yes: "是，我是韩国人", no: "不是" },
  "zh-TW": { label: "國籍", title: "你是韓國人嗎？", description: "與 App 語言無關，請如實選擇。註冊方式會有所不同。", yes: "是，我是韓國人", no: "不是" },
  fr: { label: "Nationalité", title: "Êtes-vous coréen ?", description: "Quelle que soit la langue de l’app. Cela change la façon de s’inscrire.", yes: "Oui, je suis coréen", no: "Non" },
  de: { label: "Nationalität", title: "Bist du Koreaner?", description: "Unabhängig von der App-Sprache. Davon hängt die Anmeldung ab.", yes: "Ja, ich bin Koreaner", no: "Nein" },
  es: { label: "Nacionalidad", title: "¿Eres coreano?", description: "Sin importar el idioma de la app. Cambia la forma de registrarte.", yes: "Sí, soy coreano", no: "No soy coreano" },
  pt: { label: "Nacionalidade", title: "Você é coreano?", description: "Independente do idioma do app. Isso muda como você se cadastra.", yes: "Sim, sou coreano", no: "Não" },
  it: { label: "Nazionalità", title: "Sei coreano?", description: "Qualunque sia la lingua dell’app. Cambia il modo di registrarti.", yes: "Sì, sono coreano", no: "Non sono coreano" },
  ru: { label: "Гражданство", title: "Вы кореец?", description: "Независимо от языка приложения. От этого зависит способ регистрации.", yes: "Да, я кореец", no: "Нет" },
  ar: { label: "الجنسية", title: "هل أنت كوري؟", description: "بغض النظر عن لغة التطبيق. يغيّر ذلك طريقة التسجيل.", yes: "نعم، أنا كوري", no: "لا" },
  hi: { label: "राष्ट्रीयता", title: "क्या आप कोरियाई हैं?", description: "ऐप की भाषा जो भी हो। इससे साइन अप का तरीका बदलता है।", yes: "हाँ, मैं कोरियाई हूँ", no: "नहीं" },
  th: { label: "สัญชาติ", title: "คุณเป็นคนเกาหลีไหม?", description: "ไม่ว่าจะเลือกภาษาแอปอะไร คำตอบนี้มีผลกับวิธีสมัคร", yes: "ใช่ ฉันเป็นคนเกาหลี", no: "ไม่ใช่" },
  vi: { label: "Quốc tịch", title: "Bạn là người Hàn Quốc?", description: "Dù bạn chọn ngôn ngữ nào. Câu trả lời thay đổi cách đăng ký.", yes: "Đúng, tôi là người Hàn", no: "Không" },
};

export function resolveKoreanCheckCopy(rawLocale: string): KoreanCheckCopy {
  const locale = resolvePrimaryUiLocaleTag(rawLocale) ?? "en";
  return COPY[locale] ?? COPY.en;
}
