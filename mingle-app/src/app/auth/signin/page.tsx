import { redirect } from "next/navigation";
import { resolveSignInCallbackUrl } from "@/app/[locale]/auth/signin/callback-url";
import { resolveNativeOAuthProvider, resolveSafeCallbackPath } from "@/lib/native-auth-bridge";

type SignInPageProps = {
  searchParams: Promise<{
    provider?: string | string[];
    callbackUrl?: string | string[];
  }>;
};

function takeFirst(value: string | string[] | undefined): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value[0] ?? "";
  return "";
}

function resolveCallbackUrl(rawValue: string): string {
  // Same guard as the localized sign-in page: only same-origin relative paths
  // survive (open-redirect fix), then the shared path normalisation.
  return resolveSafeCallbackPath(resolveSignInCallbackUrl(rawValue), "/");
}

export default async function SignInPage({ searchParams }: SignInPageProps) {
  const query = await searchParams;
  const provider = resolveNativeOAuthProvider(takeFirst(query.provider)) ?? "google";
  const callbackUrl = resolveCallbackUrl(takeFirst(query.callbackUrl));

  const signInUrl = new URL(`/api/auth/signin/${provider}`, "https://mingle.local");
  signInUrl.searchParams.set("callbackUrl", callbackUrl);
  signInUrl.searchParams.set("ngrok-skip-browser-warning", "1");

  redirect(`${signInUrl.pathname}${signInUrl.search}`);
}
