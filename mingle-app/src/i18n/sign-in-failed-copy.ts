import { resolvePrimaryUiLocaleTag, type PrimaryUiLocale } from "@/i18n/mingle-locales";

/** Shown on the app's own sign-in screen after a Google / Apple sign-in failed on the web. */
const SIGN_IN_FAILED_COPY_BY_LOCALE: Record<PrimaryUiLocale, string> = {
  ko: "로그인하지 못했어요. 다시 시도해 주세요.",
  en: "Couldn't sign you in. Please try again.",
  ja: "ログインできませんでした。もう一度お試しください。",
  "zh-CN": "登录失败，请重试。",
  "zh-TW": "登入失敗，請再試一次。",
  fr: "Connexion impossible. Veuillez réessayer.",
  de: "Anmeldung fehlgeschlagen. Bitte versuche es erneut.",
  es: "No se pudo iniciar sesión. Inténtalo de nuevo.",
  pt: "Não foi possível entrar. Tente novamente.",
  it: "Accesso non riuscito. Riprova.",
  ru: "Не удалось войти. Попробуйте ещё раз.",
  ar: "تعذّر تسجيل الدخول. حاول مرة أخرى.",
  hi: "साइन इन नहीं हो सका। कृपया फिर से कोशिश करें।",
  th: "เข้าสู่ระบบไม่สำเร็จ โปรดลองอีกครั้ง",
  vi: "Không thể đăng nhập. Vui lòng thử lại.",
};

export function resolveSignInFailedCopy(rawLocale: string): string {
  const locale = resolvePrimaryUiLocaleTag(rawLocale) ?? "en";
  return SIGN_IN_FAILED_COPY_BY_LOCALE[locale] ?? SIGN_IN_FAILED_COPY_BY_LOCALE.en;
}
