import NextAuth from "next-auth/next";
import type { NextRequest } from "next/server";
import type { NextAuthOptions } from "next-auth";
import { getAuthOptions } from "@/lib/auth-options";

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
    + ` stateCookie=${request.cookies.has(`${cookiePrefix}next-auth.state`) ? "1" : "0"}`
    + ` pkceCookie=${request.cookies.has(`${cookiePrefix}next-auth.pkce.code_verifier`) ? "1" : "0"}`
    + ` nonceCookie=${request.cookies.has(`${cookiePrefix}next-auth.nonce`) ? "1" : "0"}`;
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
  return NextAuth(request, { params }, resolveRouteAuthOptions(authOptions, params?.nextauth));
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
  return NextAuth(request, { params }, resolveRouteAuthOptions(authOptions, params?.nextauth));
}
