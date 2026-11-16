"use client";

import { useRouter } from "next/navigation";
import { useCallback } from "react";
import FeedLoginSheet from "@/components/feed/feed-login-sheet";
import type { AppDictionary } from "@/i18n";
import { feedCopy } from "@/i18n/feed-copy";

type SignInScreenProps = {
  locale: string;
  callbackUrl: string;
  notice: string | null;
  dictionary: AppDictionary;
  appleOAuthEnabled: boolean;
  googleOAuthEnabled: boolean;
};

/**
 * The app's own sign-in screen as a page. NextAuth's built-in sign-in and
 * error pages are never shown (see the NextAuth route); every visit to them
 * lands here instead, with the failure in `notice` when there was one.
 * Closing goes back to where the sign-in was meant to return.
 */
export default function SignInScreen({
  locale,
  callbackUrl,
  notice,
  dictionary,
  appleOAuthEnabled,
  googleOAuthEnabled,
}: SignInScreenProps) {
  const router = useRouter();
  const handleClose = useCallback(() => {
    router.replace(callbackUrl === "/" ? `/${locale}` : callbackUrl);
  }, [callbackUrl, locale, router]);

  return (
    <main className="h-full min-h-0 w-full bg-white">
      <FeedLoginSheet
        returnTo={callbackUrl}
        locale={locale}
        dictionary={dictionary}
        appleOAuthEnabled={appleOAuthEnabled}
        googleOAuthEnabled={googleOAuthEnabled}
        closeLabel={feedCopy(locale).closeImage}
        notice={notice}
        onClose={handleClose}
      />
    </main>
  );
}
