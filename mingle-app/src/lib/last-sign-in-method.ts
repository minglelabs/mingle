/**
 * The sign-in method this device last used successfully, so the sign-in screen
 * can mark it ("Last used") for someone who forgot whether they used Apple,
 * Google or email. Signed out, the server cannot know who is looking, so this
 * lives on the device only.
 *
 * Apple / Google finish after a redirect (web) or a browser sheet (app), so the
 * choice is held as pending when the button is pressed and committed once the
 * session is authenticated (`commitPendingSignInMethod`). Email knows its result
 * right away and is saved directly.
 */

export type SignInMethod = "apple" | "google" | "email";

const LAST_KEY = "mingle:last-sign-in-method:v1";
const PENDING_KEY = "mingle:pending-sign-in-method:v1";
/** Longer than the native flow timeout, so a slow OAuth round trip still counts. */
export const PENDING_SIGN_IN_METHOD_TTL_MS = 15 * 60 * 1000;

function isSignInMethod(value: unknown): value is SignInMethod {
  return value === "apple" || value === "google" || value === "email";
}

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function readLastSignInMethod(): SignInMethod | null {
  try {
    const value = storage()?.getItem(LAST_KEY);
    return isSignInMethod(value) ? value : null;
  } catch {
    return null;
  }
}

export function saveLastSignInMethod(method: SignInMethod): void {
  try {
    const store = storage();
    store?.setItem(LAST_KEY, method);
    store?.removeItem(PENDING_KEY);
  } catch {
    // Storage is optional; the badge just does not show.
  }
}

export function markPendingSignInMethod(method: SignInMethod, now = Date.now()): void {
  try {
    storage()?.setItem(PENDING_KEY, JSON.stringify({ method, at: now }));
  } catch {
    // Storage is optional.
  }
}

/** Call once the session is authenticated: a recent pending choice becomes the last used method. */
export function commitPendingSignInMethod(now = Date.now()): SignInMethod | null {
  try {
    const store = storage();
    const raw = store?.getItem(PENDING_KEY);
    if (!raw) return null;
    store?.removeItem(PENDING_KEY);
    const parsed = JSON.parse(raw) as { method?: unknown; at?: unknown };
    if (!isSignInMethod(parsed.method) || typeof parsed.at !== "number") return null;
    if (now < parsed.at || now - parsed.at > PENDING_SIGN_IN_METHOD_TTL_MS) return null;
    store?.setItem(LAST_KEY, parsed.method);
    return parsed.method;
  } catch {
    return null;
  }
}
