/**
 * The first-run onboarding as far as it got (owner, 2026-11-25): iOS may end
 * the web view while the photo picker or the camera is open, and the person
 * came back to the first screen with every answer gone. Each answer is kept
 * on the device as it is given and read back when the screens open again;
 * finishing clears it. The photo, the self-introduction and the nationality
 * have their own keys (pending-profile-extras, korean-signup).
 */
const DRAFT_KEY = "mingle.onboarding.draft.v1";
// "I already have an account" was tapped on the first screen: the screens are
// skipped. If the account that then signs in turns out to be new (no gender,
// no birth date), they open again; see conversation-list.
const HAVE_ACCOUNT_KEY = "mingle.onboarding.haveAccount.v1";

export type OnboardingDraft = {
  step: string;
  language: string;
  gender: string | null;
  birthDate: { year: number; month: number; day: number } | null;
  birthDatePicked: boolean;
  heightCm: number | null;
  heightPicked: boolean;
  tripPlan: string | null;
  koreaVisit: { start: string | null; end: string | null };
  visitedAgo: string | null;
  interestCode: string | null;
  interestLevel: number;
  discoverySource: string | null;
};

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

const text = (value: unknown): string | null => (typeof value === "string" && value ? value : null);
const day = (value: unknown): string | null => (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null);

export function parseOnboardingDraft(raw: string | null): OnboardingDraft | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Record<string, unknown> | null;
    const step = text(value?.step);
    const language = text(value?.language);
    if (!value || !step || !language) return null;
    const birth = value.birthDate as Record<string, unknown> | null | undefined;
    const birthDate = birth && [birth.year, birth.month, birth.day].every((part) => Number.isInteger(part))
      ? { year: birth.year as number, month: birth.month as number, day: birth.day as number }
      : null;
    const visit = value.koreaVisit as Record<string, unknown> | null | undefined;
    const start = day(visit?.start);
    return {
      step,
      language,
      gender: text(value.gender),
      birthDate,
      birthDatePicked: birthDate !== null && value.birthDatePicked === true,
      heightCm: Number.isInteger(value.heightCm) ? value.heightCm as number : null,
      heightPicked: Number.isInteger(value.heightCm) && value.heightPicked === true,
      tripPlan: text(value.tripPlan),
      koreaVisit: { start, end: start ? day(visit?.end) : null },
      visitedAgo: text(value.visitedAgo),
      interestCode: text(value.interestCode),
      interestLevel: Number.isInteger(value.interestLevel) ? value.interestLevel as number : 1,
      discoverySource: text(value.discoverySource),
    };
  } catch {
    return null;
  }
}

export function readOnboardingDraft(): OnboardingDraft | null {
  try {
    return parseOnboardingDraft(storage()?.getItem(DRAFT_KEY) ?? null);
  } catch {
    return null;
  }
}

export function writeOnboardingDraft(draft: OnboardingDraft): void {
  try {
    storage()?.setItem(DRAFT_KEY, JSON.stringify(draft));
  } catch {
    // Not kept: the screens then start over, as before.
  }
}

export function clearOnboardingDraft(): void {
  try {
    storage()?.removeItem(DRAFT_KEY);
  } catch {
    // Harmless: the next first run reads answers that are simply shown again.
  }
}

export function markHaveAccountSkip(): void {
  try {
    storage()?.setItem(HAVE_ACCOUNT_KEY, "1");
  } catch {
    // Without storage the account is simply not checked after sign-in.
  }
}

export function isHaveAccountSkipPending(): boolean {
  try {
    return storage()?.getItem(HAVE_ACCOUNT_KEY) === "1";
  } catch {
    return false;
  }
}

export function clearHaveAccountSkip(): void {
  try {
    storage()?.removeItem(HAVE_ACCOUNT_KEY);
  } catch {
    // Harmless.
  }
}
