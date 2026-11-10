/**
 * A replayed OAuth callback after a native sign-in already finished.
 *
 * Android opens Google / Apple sign-in in the phone's browser. After the
 * sign-in, the browser tab still holds the provider's page in its history.
 * Going back to it (or the browser reloading it) sends the provider's
 * redirect again: same `state`, a fresh `code`. NextAuth used the state
 * cookie on the first callback, so the second fails with "State cookie was
 * missing" and the tab shows the sign-in error page, although the user is
 * signed in.
 *
 * When that failure comes from a browser that is already signed in and was
 * on its way back to the app (`/api/native-auth/complete`), send it there
 * again instead: that route hands the app the existing session and returns
 * to it. Anything else keeps NextAuth's error.
 */

const NATIVE_AUTH_COMPLETE_PATH = "/api/native-auth/complete";

export type OAuthReplayInput = {
  responseStatus: number;
  responseLocation: string | null;
  cookieNames: string[];
  callbackUrlCookie: string | null;
  siteUrl: string;
};

function isRedirect(status: number): boolean {
  return status === 302 || status === 303 || status === 307;
}

export function resolveNativeAuthReplayRedirect(input: OAuthReplayInput): string | null {
  if (!isRedirect(input.responseStatus) || !input.responseLocation) return null;
  if (!/[?&]error=OAuthCallback(?:&|$)/.test(input.responseLocation)) return null;

  const hasSession = input.cookieNames.some((name) =>
    name === "next-auth.session-token"
    || name === "__Secure-next-auth.session-token"
    || name.startsWith("__Secure-next-auth.session-token.")
    || name.startsWith("next-auth.session-token."));
  if (!hasSession) return null;

  const raw = (input.callbackUrlCookie || "").trim();
  if (!raw) return null;

  let site: URL;
  try {
    site = new URL(input.siteUrl);
  } catch {
    return null;
  }

  let target: URL;
  try {
    target = new URL(raw, site);
  } catch {
    return null;
  }
  if (target.origin !== site.origin) return null;
  if (target.pathname !== NATIVE_AUTH_COMPLETE_PATH) return null;
  return target.toString();
}
