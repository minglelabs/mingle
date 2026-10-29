import { redirect } from "next/navigation";
import { resolveNativeOAuthProvider } from "@/lib/native-auth-bridge";
import { resolveSignInCallbackUrl } from "./callback-url";

type LocaleSignInPageProps = {
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

export default async function LocaleSignInPage({ searchParams }: LocaleSignInPageProps) {
  const query = await searchParams;
  const provider = resolveNativeOAuthProvider(takeFirst(query.provider)) ?? "google";
  const callbackUrl = resolveSignInCallbackUrl(takeFirst(query.callbackUrl));

  const signInUrl = new URL(`/api/auth/signin/${provider}`, "https://mingle.local");
  signInUrl.searchParams.set("callbackUrl", callbackUrl);
  signInUrl.searchParams.set("ngrok-skip-browser-warning", "1");

  redirect(`${signInUrl.pathname}${signInUrl.search}`);
}
