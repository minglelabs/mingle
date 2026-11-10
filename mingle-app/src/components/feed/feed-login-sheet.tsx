"use client";

import { storeAppLocale } from "@/components/app-locale-preference-sync";
import type { LanguageOnboardingConfirmPayload } from "@/components/LivePhoneDemo/LanguageOnboardingModal";
import {
  resolveOnboardingDefaultLanguage,
  resolveUiLocaleForLanguage,
} from "@/components/LivePhoneDemo/language-onboarding.logic";
import {
  hasConfirmedLanguageOnboarding,
  markLanguageOnboardingConfirmed,
  persistLanguageOnboardingChoice,
} from "@/components/LivePhoneDemo/language-onboarding.storage";
import { readPersistedLivePhoneDemoPreferences } from "@/components/LivePhoneDemo/live-phone-demo.preferences";
import SlideSurface from "@/components/slide-surface";
import type { AppDictionary, AppLocale } from "@/i18n";
import { deriveDefaultSttLanguagesForLocale } from "@/lib/stt-languages";
import { Loader2, X } from "lucide-react";
import { lazy, Suspense, useCallback, useMemo, useState } from "react";

const MingleHome = lazy(() => import("@/components/mingle-home"));
// Only a first-time visitor who opens the gate ever needs the onboarding screens.
const LanguageOnboardingModal = lazy(() => import("@/components/LivePhoneDemo/LanguageOnboardingModal"));

type FeedLoginSheetProps = {
  /** The return path while open (post, viewer or compose); null when closed. */
  returnTo: string | null;
  locale: string;
  dictionary: AppDictionary;
  appleOAuthEnabled: boolean;
  googleOAuthEnabled: boolean;
  closeLabel: string;
  /** Shown under the logo, e.g. why the gate opened. */
  notice?: string | null;
  onClose: () => void;
};

/**
 * The app's own sign-in gate over the feed: the exact screen the conversation
 * tab shows when signed out (terms sheet, native Apple / Google sign-in in the
 * app, Google / email on the web). A completed sign-in returns to `returnTo`,
 * so a like, comment or compose that needed an account resumes where it began.
 * Unlike the conversation tab, the feed is readable signed out, so this gate
 * can be closed.
 *
 * The feed is the app's first screen and needs no onboarding to read, so a
 * visitor can reach this gate before ever seeing the onboarding screens the
 * conversation tab opens with. They run here first (and can be closed, which
 * closes the gate), so an account is never created without them.
 */
export default function FeedLoginSheet({
  returnTo,
  locale,
  dictionary,
  appleOAuthEnabled,
  googleOAuthEnabled,
  closeLabel,
  notice = null,
  onClose,
}: FeedLoginSheetProps) {
  const gateOpen = returnTo !== null;
  // Bumped when onboarding finishes here; the storage read below is the source of truth.
  const [onboardingRevision, setOnboardingRevision] = useState(0);
  const needsOnboarding = useMemo(
    () => gateOpen && !hasConfirmedLanguageOnboarding(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [gateOpen, onboardingRevision],
  );
  const onboardingDefaultLanguage = useMemo(() => {
    if (!needsOnboarding) return "";
    const persisted = readPersistedLivePhoneDemoPreferences(deriveDefaultSttLanguagesForLocale(locale));
    return resolveOnboardingDefaultLanguage(persisted.selectedLanguages, locale);
  }, [locale, needsOnboarding]);
  const handleOnboardingConfirm = useCallback((payload: LanguageOnboardingConfirmPayload) => {
    const choice = persistLanguageOnboardingChoice(payload);
    markLanguageOnboardingConfirmed();
    // The sign-in screen stays in the current language; the stored choice takes
    // over on the navigation that follows sign-in (AppLocalePreferenceSync).
    storeAppLocale(resolveUiLocaleForLanguage(choice.defaultConversationLanguages[0] ?? choice.languageCode));
    setOnboardingRevision((revision) => revision + 1);
  }, []);
  const open = gateOpen && !needsOnboarding;
  return (
    <>
    {needsOnboarding ? (
      <Suspense fallback={null}>
        <LanguageOnboardingModal
          dismissible
          onClose={onClose}
          initialLanguage={onboardingDefaultLanguage}
          uiLocale={locale}
          onConfirm={handleOnboardingConfirm}
        />
      </Suspense>
    ) : null}
    <SlideSurface
      open={open}
      onClose={onClose}
      ariaLabel={dictionary.profile.authTitle}
      className="fixed inset-0 z-[130] flex min-h-0 w-full flex-col overflow-hidden bg-white shadow-2xl"
    >
      {open ? (
        <>
          <Suspense
            fallback={(
              <div className="flex h-full min-h-0 w-full items-center justify-center bg-white text-slate-400">
                <Loader2 size={24} className="animate-spin" aria-hidden />
              </div>
            )}
          >
            <MingleHome
              authOnly
              authNotice={notice}
              authCallbackUrl={returnTo}
              dictionary={dictionary}
              appleOAuthEnabled={appleOAuthEnabled}
              googleOAuthEnabled={googleOAuthEnabled}
              locale={locale as AppLocale}
            />
          </Suspense>
          <button
            type="button"
            onClick={onClose}
            aria-label={closeLabel}
            className="absolute left-3 z-10 flex h-11 w-11 items-center justify-center rounded-full text-slate-700 transition active:bg-black/5"
            style={{ top: "calc(env(safe-area-inset-top, 0px) + 6px)" }}
          >
            <X size={24} strokeWidth={2.2} aria-hidden="true" />
          </button>
        </>
      ) : null}
    </SlideSurface>
    </>
  );
}
