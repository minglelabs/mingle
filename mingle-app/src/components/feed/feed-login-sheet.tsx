"use client";

import SlideSurface from "@/components/slide-surface";
import type { AppDictionary, AppLocale } from "@/i18n";
import { Loader2, X } from "lucide-react";
import { lazy, Suspense } from "react";

const MingleHome = lazy(() => import("@/components/mingle-home"));

type FeedLoginSheetProps = {
  /** The return path while open (post, viewer or compose); null when closed. */
  returnTo: string | null;
  locale: string;
  dictionary: AppDictionary;
  appleOAuthEnabled: boolean;
  googleOAuthEnabled: boolean;
  closeLabel: string;
  onClose: () => void;
};

/**
 * The app's own sign-in gate over the feed: the exact screen the conversation
 * tab shows when signed out (terms sheet, native Apple / Google sign-in in the
 * app, Google / email on the web). A completed sign-in returns to `returnTo`,
 * so a like, comment or compose that needed an account resumes where it began.
 * Unlike the conversation tab, the feed is readable signed out, so this gate
 * can be closed.
 */
export default function FeedLoginSheet({
  returnTo,
  locale,
  dictionary,
  appleOAuthEnabled,
  googleOAuthEnabled,
  closeLabel,
  onClose,
}: FeedLoginSheetProps) {
  const open = returnTo !== null;
  return (
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
  );
}
