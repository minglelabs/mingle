import { resolvePrimaryUiLocaleTag, type PrimaryUiLocale } from "./mingle-locales";

/**
 * One line shown next to the spinner while a loading screen is up. One is
 * picked at random each time. For now only the login screen uses it (session
 * check and social sign-in in progress).
 *
 * To add a line, append an entry. `ko` and `en` are required; any other
 * locale left out falls back to `en`.
 */
export type LoadingMessage = { ko: string; en: string } & Partial<Record<PrimaryUiLocale, string>>;

export const LOADING_MESSAGES: readonly LoadingMessage[] = [
  {
    ko: "로그인 각도 좁히는 중..",
    en: "Lining up the login angle..",
    ja: "ログインの角度を詰めています..",
    "zh-CN": "正在缩小登录角度..",
    "zh-TW": "正在縮小登入角度..",
    fr: "On resserre l'angle de connexion..",
    de: "Login-Winkel wird verengt..",
    es: "Cerrando el ángulo del inicio de sesión..",
    pt: "Fechando o ângulo do login..",
    it: "Stringiamo l'angolo del login..",
    ru: "Сужаем угол входа..",
    ar: "نضيّق زاوية تسجيل الدخول..",
    hi: "लॉगिन का एंगल कसा जा रहा है..",
    th: "กำลังบีบมุมล็อกอิน..",
    vi: "Đang khép góc đăng nhập..",
  },
];

/** Every loading line in the given locale, in declaration order. */
export function resolveLoadingMessages(rawLocale: string | null | undefined): string[] {
  const locale = (rawLocale ? resolvePrimaryUiLocaleTag(rawLocale) : null) ?? "en";
  return LOADING_MESSAGES.map((message) => message[locale] ?? message.en);
}

/** One loading line, picked at random. `random` is injectable for tests. */
export function pickLoadingMessage(
  rawLocale: string | null | undefined,
  random: () => number = Math.random,
): string {
  const messages = resolveLoadingMessages(rawLocale);
  if (messages.length === 0) return "";
  const index = Math.min(messages.length - 1, Math.max(0, Math.floor(random() * messages.length)));
  return messages[index];
}
