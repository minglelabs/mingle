import NextAuth from "next-auth/next";
import type { NextRequest } from "next/server";
import type { NextAuthOptions } from "next-auth";
import { getAuthOptions } from "@/lib/auth-options";
import {
  NATIVE_AUTH_OAUTH_FAILED_MESSAGE,
  NATIVE_AUTH_RETURN_COOKIE,
  appendNativeAuthError,
  buildAppAuthRedirectUrl,
  renderReturnToAppResponse,
  resolveNativeAuthCompletePath,
} from "@/lib/native-auth-return";
import { resolveNativeOAuthProvider } from "@/lib/native-auth-bridge";
import { resolveSignInCallbackUrl } from "@/app/[locale]/auth/signin/callback-url";
import { DEFAULT_LOCALE, isSupportedLocale } from "@/i18n";

type AppRouteContext = {
  params: Promise<{
    nextauth: string[];
  }>;
};

function summarizeText(rawValue: string, maxLength: number): string {
  const normalized = rawValue.trim().replace(/\s+/g, " ");
  if (!normalized) return "";
  return normalized.slice(0, maxLength);
}

function summarizeCallbackUrl(rawValue: string): string {
  const trimmed = rawValue.trim();
  if (!trimmed) return "-";
  try {
    const parsed = new URL(trimmed);
    const pathname = parsed.pathname || "/";
    const host = parsed.host || "-";
    return `${host}${pathname}`.slice(0, 120);
  } catch {
    return summarizeText(trimmed, 120) || "-";
  }
}

function summarizeNextAuthCookieNames(cookieNames: string[]): string {
  const nextAuthCookieNames = [...new Set(
    cookieNames.filter((cookieName) => cookieName.includes("next-auth.")),
  )].sort();
  return nextAuthCookieNames.join(",") || "-";
}

function summarizeResponseSetCookieNames(response: Response): string {
  const headers = response.headers as Headers & {
    getSetCookie?: () => string[];
  };
  const setCookieHeaders = typeof headers.getSetCookie === "function"
    ? headers.getSetCookie()
    : [];

  if (setCookieHeaders.length > 0) {
    return summarizeNextAuthCookieNames(
      setCookieHeaders.map((setCookieHeader) => setCookieHeader.split("=", 1)[0].trim()),
    );
  }

  const combinedSetCookieHeader = response.headers.get("set-cookie") || "";
  const cookieNames = [...combinedSetCookieHeader.matchAll(
    /(?:^|,\s*)((?:__Host-|__Secure-)?next-auth\.[^=;,\s]+)=/g,
  )].map((match) => match[1] || "");
  return summarizeNextAuthCookieNames(cookieNames);
}

function resolveAction(nextauth: string[] | undefined): string {
  const action = nextauth?.[0];
  if (typeof action !== "string") return "";
  return action.trim().toLowerCase();
}

function resolveRouteAuthOptions(baseAuthOptions: NextAuthOptions, nextauth: string[] | undefined) {
  const action = resolveAction(nextauth);
  if (action !== "signin") {
    return baseAuthOptions;
  }

  const requestedProvider = summarizeText(nextauth?.[1] || "", 32).toLowerCase();
  const providers = baseAuthOptions.providers || [];
  const requestedProviderConfig = requestedProvider
    ? providers.find((provider) => provider.id === requestedProvider)
    : null;

  // Programmatic sign-in for credentials providers (e.g. signIn("email-password"))
  // requires the provider to remain available on signin action.
  if (requestedProviderConfig?.type === "credentials") {
    return {
      ...baseAuthOptions,
      providers: [requestedProviderConfig],
    };
  }

  // Keep built-in NextAuth sign-in page for OAuth providers only.
  // Force social provider order to Apple -> Google for consistent UX with native app.
  let oauthOnlyProviders = providers
    .filter((provider) => provider.type !== "credentials")
    .slice()
    .sort((a, b) => {
      const rank = (id: string): number => {
        if (id === "apple") return 0;
        if (id === "google") return 1;
        return 10;
      };
      return rank(a.id) - rank(b.id);
    });

  if (requestedProvider) {
    const narrowed = oauthOnlyProviders.filter((provider) => provider.id === requestedProvider);
    if (narrowed.length > 0) {
      oauthOnlyProviders = narrowed;
    }
  }

  return {
    ...baseAuthOptions,
    providers: oauthOnlyProviders,
  };
}

function summarizeOAuthCookieState(request: NextRequest, action: string): string {
  if (action !== "callback") return "";

  const cookiePrefix = (
    process.env.NEXTAUTH_URL
    || process.env.AUTH_URL
    || process.env.NEXT_PUBLIC_SITE_URL
    || request.nextUrl.origin
  ).trim().startsWith("https://")
    ? "__Secure-"
    : "";

  return ` origin=${request.nextUrl.origin}`
    + ` host=${summarizeText(request.headers.get("host") || "-", 120) || "-"}`
    + ` xForwardedHost=${summarizeText(request.headers.get("x-forwarded-host") || "-", 120) || "-"}`
    + ` xForwardedProto=${summarizeText(request.headers.get("x-forwarded-proto") || "-", 32) || "-"}`
    + ` requestCookieNames=${summarizeNextAuthCookieNames(request.cookies.getAll().map(({ name }) => name))}`
    + ` stateCookie=${request.cookies.has(`${cookiePrefix}next-auth.state`) ? "1" : "0"}`
    + ` pkceCookie=${request.cookies.has(`${cookiePrefix}next-auth.pkce.code_verifier`) ? "1" : "0"}`
    + ` nonceCookie=${request.cookies.has(`${cookiePrefix}next-auth.nonce`) ? "1" : "0"}`;
}

function logNextAuthResponse(response: Response, method: string, action: string, provider: string): void {
  if (action !== "signin") return;
  console.info(
    `[nextauth] response method=${method} action=${action} provider=${provider}`
      + ` status=${response.status}`
      + ` setCookieNames=${summarizeResponseSetCookieNames(response)}`,
  );
}

const SAFE_PATH_ORIGIN = "https://mingle.local";

/** Keeps only the path of a same-site or absolute URL, so the result never leaves this site. */
function toSafeReturnPath(rawValue: string | null | undefined): string | null {
  const trimmed = (rawValue ?? "").trim();
  if (!trimmed) return null;
  // Cookie values arrive decoded; only a still-encoded value ("%2F…") is decoded once.
  // Decoding a decoded value would unescape the nested callbackUrl and drop its parameters.
  let decoded = trimmed;
  if (trimmed.startsWith("%")) {
    try {
      decoded = decodeURIComponent(trimmed);
    } catch {
      // Keep the raw value.
    }
  }
  try {
    const parsed = new URL(decoded, SAFE_PATH_ORIGIN);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    const path = resolveSignInCallbackUrl(`${parsed.pathname}${parsed.search}`);
    return path;
  } catch {
    return null;
  }
}

function resolveLocaleFromPath(path: string | null): string {
  const firstSegment = (path ?? "").split("?")[0]?.split("/").filter(Boolean)[0] ?? "";
  return isSupportedLocale(firstSegment) ? firstSegment : DEFAULT_LOCALE;
}

function redirectResponse(location: string): Response {
  return new Response(null, {
    status: 302,
    headers: { location, "cache-control": "no-store" },
  });
}

/**
 * NextAuth's built-in sign-in and error pages are never shown.
 *
 * - A sign-in the native app started (its browser sheet) goes back to the app:
 *   on a failure through `/api/native-auth/complete`, which closes the sheet
 *   and reports the error; inside the sheet NextAuth's page would sign the user
 *   in to the website instead of the app.
 * - Everything else goes to the app's own sign-in screen
 *   (`/{locale}/auth/login`), with the failure shown on it.
 */
function resolveBuiltInPageReplacement(
  request: NextRequest,
  nextauth: string[] | undefined,
): Response | null {
  const action = resolveAction(nextauth);
  if (action !== "signin" && action !== "error") return null;

  const errorCode = (request.nextUrl.searchParams.get("error") || "").trim();
  const queryCallbackUrl = request.nextUrl.searchParams.get("callbackUrl");
  const cookies = request.cookies?.getAll() ?? [];
  const cookieValue = (name: string) => cookies.find((cookie) => cookie.name === name)?.value;
  const callbackCookie = cookieValue("__Secure-next-auth.callback-url") ?? cookieValue("next-auth.callback-url");

  if (errorCode) {
    const completePath =
      resolveNativeAuthCompletePath(cookieValue(NATIVE_AUTH_RETURN_COOKIE))
      ?? resolveNativeAuthCompletePath(callbackCookie)
      ?? resolveNativeAuthCompletePath(queryCallbackUrl);
    if (completePath) {
      console.warn(`[nextauth] native sign-in failed error=${summarizeText(errorCode, 64)}; returning to app`);
      return redirectResponse(appendNativeAuthError(completePath, errorCode));
    }

    // The browser sheet can come back from the provider without any of the
    // cookies set before it left ("State cookie was missing"). A website sign-in
    // always carries at least the CSRF cookie, so a phone browser with no auth
    // cookies at all is the app's sheet: hand it back to the app without a
    // request id. The app treats that as a failed sign-in and closes the sheet.
    const hasAuthCookie = cookies.some(
      ({ name }) => name.includes("next-auth.") || name === NATIVE_AUTH_RETURN_COOKIE,
    );
    const userAgent = request.headers?.get("user-agent") || "";
    if (!hasAuthCookie && /iPhone|iPad|iPod|Android/i.test(userAgent)) {
      console.warn(
        `[nextauth] sign-in failed without cookies on a phone browser error=${summarizeText(errorCode, 64)}; returning to app`,
      );
      return renderReturnToAppResponse(buildAppAuthRedirectUrl({
        status: "error",
        provider: "google",
        message: NATIVE_AUTH_OAUTH_FAILED_MESSAGE,
      }));
    }
  } else {
    // An older app opens `/{locale}/auth/signin?callbackUrl=/api/native-auth/complete…`
    // in its sheet, which lands here: start the OAuth flow right away.
    const completePath = resolveNativeAuthCompletePath(queryCallbackUrl);
    if (completePath) {
      const completeUrl = new URL(completePath, SAFE_PATH_ORIGIN);
      const provider = resolveNativeOAuthProvider(nextauth?.[1] || completeUrl.searchParams.get("provider")) ?? "google";
      const locale = resolveLocaleFromPath(completeUrl.searchParams.get("callbackUrl"));
      const launchUrl = new URL(`/${locale}/auth/native`, SAFE_PATH_ORIGIN);
      launchUrl.searchParams.set("provider", provider);
      launchUrl.searchParams.set("callbackUrl", completePath);
      return redirectResponse(`${launchUrl.pathname}${launchUrl.search}`);
    }
  }

  const returnPath =
    toSafeReturnPath(queryCallbackUrl)
    ?? (errorCode ? toSafeReturnPath(callbackCookie) : null)
    ?? "/";
  const loginUrl = new URL(`/${resolveLocaleFromPath(returnPath)}/auth/login`, SAFE_PATH_ORIGIN);
  loginUrl.searchParams.set("callbackUrl", returnPath);
  if (errorCode) {
    loginUrl.searchParams.set("authError", errorCode.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 64) || "unknown");
  }
  return redirectResponse(`${loginUrl.pathname}${loginUrl.search}`);
}

export async function GET(request: NextRequest, context: AppRouteContext) {
  const params = await context.params;
  const action = resolveAction(params?.nextauth);
  const provider = summarizeText(params?.nextauth?.[1] || "-", 48) || "-";
  const authOptions = getAuthOptions(provider);
  const callbackUrl = summarizeCallbackUrl(request.nextUrl.searchParams.get("callbackUrl") || "");
  const error = summarizeText(request.nextUrl.searchParams.get("error") || "-", 64) || "-";
  console.info(
    `[nextauth] method=GET action=${action || "-"} provider=${provider} callback=${callbackUrl} error=${error}${summarizeOAuthCookieState(request, action)}`,
  );
  const builtInPageReplacement = resolveBuiltInPageReplacement(request, params?.nextauth);
  if (builtInPageReplacement) return builtInPageReplacement;
  const response = await NextAuth(
    request,
    { params },
    resolveRouteAuthOptions(authOptions, params?.nextauth),
  );
  logNextAuthResponse(response, "GET", action, provider);
  return response;
}

export async function POST(request: NextRequest, context: AppRouteContext) {
  const params = await context.params;
  const action = resolveAction(params?.nextauth);
  const provider = summarizeText(params?.nextauth?.[1] || "-", 48) || "-";
  const authOptions = getAuthOptions(provider);
  const callbackUrl = summarizeCallbackUrl(request.nextUrl.searchParams.get("callbackUrl") || "");
  const error = summarizeText(request.nextUrl.searchParams.get("error") || "-", 64) || "-";
  console.info(
    `[nextauth] method=POST action=${action || "-"} provider=${provider} callback=${callbackUrl} error=${error}${summarizeOAuthCookieState(request, action)}`,
  );
  const response = await NextAuth(
    request,
    { params },
    resolveRouteAuthOptions(authOptions, params?.nextauth),
  );
  logNextAuthResponse(response, "POST", action, provider);
  return response;
}
