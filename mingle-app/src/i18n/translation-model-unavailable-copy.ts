import { resolvePrimaryUiLocaleTag, type PrimaryUiLocale } from "@/i18n/mingle-locales";

/** Names shown to users; unknown ids fall back to the id itself. */
const TRANSLATION_MODEL_DISPLAY_NAMES: Record<string, string> = {
  "gpt-6-luna": "GPT-6 Luna",
  "claude-haiku-5-5": "Claude Haiku 5.5",
  "gemini-2.5-flash-lite": "Gemini 2.5 Flash-Lite",
};

/**
 * Shown when the translation model the user chose fails and another one
 * answers. It only names the model: the cause (billing, quota, outage) means
 * nothing to the user and "a payment failed" would read as their payment.
 */
const MODEL_UNAVAILABLE_COPY_BY_LOCALE: Record<PrimaryUiLocale, (model: string) => string> = {
  ko: (m) => `지금 ${m} 모델에 오류가 있어 다른 모델로 번역하고 있어요.`,
  en: (m) => `${m} is having problems right now, so another model is translating.`,
  ja: (m) => `現在${m}でエラーが発生しているため、別のモデルで翻訳しています。`,
  "zh-CN": (m) => `${m} 当前出现错误，正在使用其他模型翻译。`,
  "zh-TW": (m) => `${m} 目前發生錯誤，正在使用其他模型翻譯。`,
  fr: (m) => `${m} rencontre un problème, un autre modèle traduit pour le moment.`,
  de: (m) => `${m} hat gerade Probleme, deshalb übersetzt ein anderes Modell.`,
  es: (m) => `${m} tiene problemas ahora mismo, así que otro modelo está traduciendo.`,
  pt: (m) => `O ${m} está com problemas agora, então outro modelo está traduzindo.`,
  it: (m) => `${m} ha dei problemi in questo momento, quindi traduce un altro modello.`,
  ru: (m) => `В ${m} сейчас ошибка, поэтому переводит другая модель.`,
  ar: (m) => `يواجه ${m} مشكلة الآن، لذا يترجم نموذج آخر.`,
  hi: (m) => `${m} में अभी समस्या है, इसलिए दूसरा मॉडल अनुवाद कर रहा है।`,
  th: (m) => `ขณะนี้ ${m} มีข้อผิดพลาด จึงใช้โมเดลอื่นแปลแทน`,
  vi: (m) => `${m} đang gặp lỗi, nên một mô hình khác đang dịch.`,
};

export function translationModelDisplayName(model: string): string {
  return TRANSLATION_MODEL_DISPLAY_NAMES[model] ?? model;
}

export function resolveTranslationModelUnavailableCopy(rawLocale: string, model: string): string {
  const locale = resolvePrimaryUiLocaleTag(rawLocale) ?? "en";
  const build = MODEL_UNAVAILABLE_COPY_BY_LOCALE[locale] ?? MODEL_UNAVAILABLE_COPY_BY_LOCALE.en;
  return build(translationModelDisplayName(model));
}
