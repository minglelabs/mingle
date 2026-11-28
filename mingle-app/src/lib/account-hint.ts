import { readLastSignInMethod, saveLastSignInMethod, type SignInMethod } from "@/lib/last-sign-in-method";
import { markHaveAccountSkip } from "@/lib/onboarding-draft";
import { markSpeakTrialDone } from "@/lib/speak-trial";

/**
 * "This phone already has an account" (owner, 2026-11-25), kept by the iOS
 * shell in the keychain so it outlives deleting the app, like the device id.
 * Only the last sign-in method; never a token. The shell hands it to the page
 * before any code runs (NATIVE_ACCOUNT_HINT_WINDOW_KEY in rn/src/nativeNavigationBridge.ts).
 *
 * A reinstall with the note skips the questions and the speak trial and goes
 * to sign-in with the method marked "last used". If the account that signs in
 * turns out to be new, the questions open again (see markHaveAccountSkip).
 */
const WINDOW_KEY = "__MINGLE_NATIVE_ACCOUNT_HINT";
const APPLIED_KEY = "mingle.accountHint.applied.v1";

export type AccountHint = { v: 1; method: SignInMethod };
const SIGN_IN_METHODS: readonly SignInMethod[] = ["apple", "google", "email", "phone"];

export function parseAccountHint(raw: unknown): AccountHint | null {
  if (typeof raw !== "string" || !raw || raw.length > 256) return null;
  try {
    const value = JSON.parse(raw) as { v?: unknown; method?: unknown } | null;
    if (value?.v !== 1 || !SIGN_IN_METHODS.includes(value.method as SignInMethod)) return null;
    return { v: 1, method: value.method as SignInMethod };
  } catch {
    return null;
  }
}

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

/**
 * Called before the first screen decides between the questions and sign-in.
 * Runs once per install: true when this install was recognised from the note.
 */
export function applyNativeAccountHint(markOnboardingDone: () => void): boolean {
  if (typeof window === "undefined") return false;
  const store = storage();
  if (!store || store.getItem(APPLIED_KEY) === "1") return false;
  const hint = parseAccountHint((window as unknown as Record<string, unknown>)[WINDOW_KEY]);
  if (!hint) return false;
  try {
    store.setItem(APPLIED_KEY, "1");
  } catch {
    return false;
  }
  // An install that already signed in here keeps its own state.
  if (readLastSignInMethod() !== null) return false;
  saveLastSignInMethod(hint.method);
  markSpeakTrialDone();
  markHaveAccountSkip();
  markOnboardingDone();
  return true;
}

/** Asks the iOS shell to keep the note (an account that finished onboarding is signed in here). */
export function saveNativeAccountHint(method: SignInMethod | null): void {
  if (!method || typeof window === "undefined") return;
  const bridge = (window as unknown as { ReactNativeWebView?: { postMessage?: (message: string) => void } }).ReactNativeWebView;
  if (typeof bridge?.postMessage !== "function") return;
  const hint: AccountHint = { v: 1, method };
  try {
    bridge.postMessage(JSON.stringify({ type: "native_account_hint_save", payload: { hint: JSON.stringify(hint) } }));
  } catch {
    // Older shells: nothing kept, the questions show again after a reinstall.
  }
}
