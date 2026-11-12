import { notFound } from "next/navigation";
import SignInScreen from "@/components/sign-in-screen";
import { getDictionary, isSupportedLocale } from "@/i18n";
import { resolveSignInFailedCopy } from "@/i18n/sign-in-failed-copy";
import { isAppleOAuthConfigured, isGoogleOAuthConfigured } from "@/lib/auth-options";
import { resolveSignInCallbackUrl } from "@/app/[locale]/auth/signin/callback-url";

type LoginPageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{
    callbackUrl?: string | string[];
    authError?: string | string[];
  }>;
};

function takeFirst(value: string | string[] | undefined): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value[0] ?? "";
  return "";
}

/**
 * The app's own sign-in screen. The NextAuth route sends every visit to its
 * built-in sign-in or error page here, so that page never shows.
 */
export default async function LoginPage({ params, searchParams }: LoginPageProps) {
  const { locale } = await params;
  if (!isSupportedLocale(locale)) notFound();
  const query = await searchParams;
  const callbackUrl = resolveSignInCallbackUrl(takeFirst(query.callbackUrl));
  const failed = takeFirst(query.authError).trim() !== "";

  return (
    <SignInScreen
      locale={locale}
      callbackUrl={callbackUrl}
      notice={failed ? resolveSignInFailedCopy(locale) : null}
      dictionary={getDictionary(locale)}
      appleOAuthEnabled={isAppleOAuthConfigured()}
      googleOAuthEnabled={isGoogleOAuthConfigured()}
    />
  );
}
