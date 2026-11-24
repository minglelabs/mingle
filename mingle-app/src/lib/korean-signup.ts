/**
 * Korean sign-ups (owner, 2026-11-21): the first sign-in option is the phone
 * number, an account without a verified number verifies it after sign-in (the
 * server's PHONE_REQUIRED, Korean by default: PHONE_REQUIRED_LOCALES), and the
 * contact sync screen must be passed right after sign-up (allowed or refused in
 * the system dialog).
 *
 * "Korean" is asked right after the language on the first screen ("한국인이신가요?",
 * many Koreans pick English), kept on the device and saved as the profile's
 * nationality (KR) once signed in. Without an answer (accounts from before the
 * question) the Korean app language counts.
 */
const ANSWER_KEY = "mingle.koreanAnswer.v1";
// The country picked after "no" (2026-11-24): the profile's 국적, shown as the
// flag on the avatar; separate from the languages.
const COUNTRY_KEY = "mingle.nationalityAnswer.v1";
const SYNCED_KEY = "mingle.koreanAnswer.synced.v1";

export type KoreanAnswer = "yes" | "no";

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function readKoreanAnswer(): KoreanAnswer | null {
  try {
    const value = storage()?.getItem(ANSWER_KEY);
    return value === "yes" || value === "no" ? value : null;
  } catch {
    return null;
  }
}

export function writeKoreanAnswer(answer: KoreanAnswer): void {
  try {
    storage()?.setItem(ANSWER_KEY, answer);
    storage()?.removeItem(SYNCED_KEY);
  } catch {
    // The language rule decides instead.
  }
}

export function readNationalityAnswer(): string | null {
  try {
    const value = storage()?.getItem(COUNTRY_KEY) ?? "";
    return /^[A-Z]{2}$/.test(value) ? value : null;
  } catch {
    return null;
  }
}

export function writeNationalityAnswer(country: string): void {
  try {
    storage()?.setItem(COUNTRY_KEY, country.toUpperCase());
    storage()?.removeItem(SYNCED_KEY);
  } catch {
    // The language's country is used instead.
  }
}

/** Whether the answer still has to be saved on the signed-in profile. */
export function isKoreanAnswerUnsynced(): boolean {
  try {
    return readKoreanAnswer() !== null && storage()?.getItem(SYNCED_KEY) !== "1";
  } catch {
    return false;
  }
}

export function markKoreanAnswerSynced(): void {
  try {
    storage()?.setItem(SYNCED_KEY, "1");
  } catch {
    // Saved again next time; harmless.
  }
}

export function isKoreanAppLocale(rawLocale: string | null | undefined): boolean {
  return (rawLocale ?? "").trim().toLowerCase().split(/[-_]/)[0] === "ko";
}

/** The answer when there is one, otherwise the Korean app language. */
export function resolveIsKorean(answer: KoreanAnswer | null, rawLocale: string | null | undefined): boolean {
  if (answer) return answer === "yes";
  return isKoreanAppLocale(rawLocale);
}

export function isKoreanUser(rawLocale: string | null | undefined): boolean {
  return resolveIsKorean(readKoreanAnswer(), rawLocale);
}

/** Query for /account/access: the app language, and the answer when there is one. */
export function appAccessQuery(rawLocale: string): string {
  const answer = readKoreanAnswer();
  const korean = answer ? `&korean=${answer === "yes" ? "1" : "0"}` : "";
  return `locale=${encodeURIComponent(rawLocale)}${korean}`;
}
