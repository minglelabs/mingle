import type { NativeOAuthProvider } from "@/lib/native-auth-bridge";

/**
 * Getting a failed browser sign-in back into the native app.
 *
 * The app opens `/api/native-auth/start` in a system browser sheet. If the
 * OAuth round trip fails, NextAuth sends the browser to its built-in sign-in
 * page, which must never show inside that sheet: the user would sign in to the
 * website there instead of the app. These helpers let the NextAuth route send
 * the browser to `/api/native-auth/complete` (which closes the sheet and
 * reports the error to the app) instead.
 */

export const APP_AUTH_CALLBACK_URL = "mingleauth://auth";
export const NATIVE_AUTH_COMPLETE_PATH = "/api/native-auth/complete";
/** Holds the `/api/native-auth/complete?...` path of the sign-in in progress. */
export const NATIVE_AUTH_RETURN_COOKIE = "mingle-native-auth-return";
/** Longer than NextAuth's 15 minute OAuth cookies, so it outlives a slow sign-in. */
export const NATIVE_AUTH_RETURN_COOKIE_MAX_AGE_SECONDS = 60 * 60;
/** Query parameter that tells the complete route the OAuth step failed. */
export const NATIVE_AUTH_ERROR_PARAM = "authError";
export const NATIVE_AUTH_OAUTH_FAILED_MESSAGE = "native_auth_oauth_failed";

const PARSE_ORIGIN = "https://mingle.local";

/**
 * Returns the same-origin `/api/native-auth/complete?...` path held in a
 * cookie value (a relative path or an absolute URL), or null for anything else.
 */
export function resolveNativeAuthCompletePath(rawValue: string | null | undefined): string | null {
  const trimmed = (rawValue ?? "").trim();
  if (!trimmed) return null;
  let decoded = trimmed;
  try {
    decoded = decodeURIComponent(trimmed);
  } catch {
    // Keep the raw value.
  }
  try {
    const parsed = new URL(decoded, PARSE_ORIGIN);
    if (parsed.pathname !== NATIVE_AUTH_COMPLETE_PATH) return null;
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return null;
  }
}

/** Adds the OAuth error code to a complete path. */
export function appendNativeAuthError(completePath: string, errorCode: string): string {
  const parsed = new URL(completePath, PARSE_ORIGIN);
  const safeCode = errorCode.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 64) || "unknown";
  parsed.searchParams.set(NATIVE_AUTH_ERROR_PARAM, safeCode);
  return `${parsed.pathname}${parsed.search}`;
}

export function buildAppAuthRedirectUrl(params: {
  status: "success" | "error";
  provider?: NativeOAuthProvider;
  callbackUrl?: string;
  token?: string;
  message?: string;
  requestId?: string;
}): string {
  const redirectUrl = new URL(APP_AUTH_CALLBACK_URL);
  redirectUrl.searchParams.set("status", params.status);
  if (params.provider) redirectUrl.searchParams.set("provider", params.provider);
  if (params.callbackUrl) redirectUrl.searchParams.set("callbackUrl", params.callbackUrl);
  if (params.token) redirectUrl.searchParams.set("token", params.token);
  if (params.message) redirectUrl.searchParams.set("message", params.message);
  if (params.requestId) redirectUrl.searchParams.set("requestId", params.requestId);
  return redirectUrl.toString();
}

/**
 * A page that hands the browser back to the app through the custom scheme.
 * Some iOS browsers keep a blank tab after a custom-scheme redirect, so the
 * page opens the app itself and keeps a visible button as a fallback.
 */
export function renderReturnToAppResponse(redirectUrl: string): Response {
  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta http-equiv="refresh" content="0;url=${redirectUrl}" />
    <title>Return to HashChat</title>
    <style>
      body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #fff; color: #111827; }
      main { min-height: 100dvh; display: grid; place-items: center; padding: 24px; text-align: center; }
      .card { max-width: 320px; width: 100%; border: 1px solid #e5e7eb; border-radius: 16px; padding: 18px; background: #f9fafb; }
      h1 { margin: 0; font-size: 18px; }
      p { margin: 8px 0 0; font-size: 14px; color: #4b5563; line-height: 1.45; }
      a { display: inline-block; margin-top: 14px; background: #111827; color: #fff; text-decoration: none; border-radius: 10px; padding: 10px 14px; font-size: 14px; font-weight: 600; }
    </style>
  </head>
  <body>
    <main>
      <section class="card">
        <h1>Returning to HashChat</h1>
        <p>If the app does not open automatically, tap the button below.</p>
        <a href="${redirectUrl}" id="open-app">Open HashChat App</a>
      </section>
    </main>
    <script>
      const url = ${JSON.stringify(redirectUrl)};
      const tryOpen = () => { window.location.href = url; };
      tryOpen();
      setTimeout(tryOpen, 300);
      setTimeout(tryOpen, 900);
    </script>
  </body>
</html>`;
  return new Response(html, {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store, max-age=0, must-revalidate",
      pragma: "no-cache",
      expires: "0",
    },
  });
}

/** `Set-Cookie` value that removes the return cookie. */
export function buildClearNativeAuthReturnCookie(secure: boolean): string {
  return `${NATIVE_AUTH_RETURN_COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax${secure ? "; Secure" : ""}`;
}
