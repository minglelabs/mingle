import { resolveLegalDocumentLocale, type AppLocale } from "@/i18n/config";

export function formatProfileAge(age: number | null | undefined, locale: AppLocale): string | null {
  if (typeof age !== "number" || !Number.isSafeInteger(age) || age < 0) return null;

  const resolvedLocale = resolveLegalDocumentLocale(locale);
  const count = new Intl.NumberFormat(resolvedLocale).format(age);

  switch (resolvedLocale) {
    case "ko":
      return `${count}세`;
    case "en":
      return `${count} ${age === 1 ? "year" : "years"} old`;
    case "ja":
      return `${count}歳`;
    case "zh-CN":
      return `${count}岁`;
    case "zh-TW":
      return `${count}歲`;
    case "fr":
      return `${count} ${age === 1 ? "an" : "ans"}`;
    case "de":
      return `${count} ${age === 1 ? "Jahr" : "Jahre"} alt`;
    case "es":
      return `${count} ${age === 1 ? "año" : "años"}`;
    case "pt":
      return `${count} ${age === 1 ? "ano" : "anos"}`;
    case "it":
      return `${count} ${age === 1 ? "anno" : "anni"}`;
    case "ru": {
      const category = new Intl.PluralRules("ru").select(age);
      const unit = category === "one" ? "год" : category === "few" ? "года" : "лет";
      return `${count} ${unit}`;
    }
    case "ar": {
      const category = new Intl.PluralRules("ar").select(age);
      const unit = category === "two" ? "سنتان" : category === "few" ? "سنوات" : "سنة";
      return `${count} ${unit}`;
    }
    case "hi":
      return `${count} वर्ष`;
    case "th":
      return `${count} ปี`;
    case "vi":
      return `${count} tuổi`;
  }
}
