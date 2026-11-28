import { resolvePrimaryUiLocaleTag, type PrimaryUiLocale } from "@/i18n/mingle-locales";

/**
 * The first onboarding screen's way in for someone who already has an account
 * (owner, 2026-11-25): a reinstall used to ask every question again before
 * the sign-in screen showed.
 */
const COPY: Record<PrimaryUiLocale, string> = {
  ko: "이미 계정이 있어요",
  en: "I already have an account",
  ja: "すでにアカウントがあります",
  "zh-CN": "我已有账号",
  "zh-TW": "我已有帳號",
  fr: "J'ai déjà un compte",
  de: "Ich habe schon ein Konto",
  es: "Ya tengo una cuenta",
  pt: "Já tenho uma conta",
  it: "Ho già un account",
  ru: "У меня уже есть аккаунт",
  ar: "لديّ حساب بالفعل",
  hi: "मेरा खाता पहले से है",
  th: "ฉันมีบัญชีอยู่แล้ว",
  vi: "Tôi đã có tài khoản",
};

export function resolveHaveAccountCopy(rawLocale: string): string {
  const locale = resolvePrimaryUiLocaleTag(rawLocale) ?? "en";
  return COPY[locale] ?? COPY.en;
}
