"use client";

import { Mic } from "lucide-react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { BOTTOM_TAB_BAR_HEIGHT_PX } from "@/components/bottom-tab-bar";
import { useAppAccess } from "@/components/onboarding/invite-gate";
import { useNativeBannerSuppression } from "@/lib/use-native-banner-suppression";
import { resolveFirstRunCopy } from "@/i18n/first-run-copy";
import { clearSignedOutHere, isFirstSpeakPending } from "@/lib/first-run";
import { conversationsHref } from "@/lib/posting-feed-guard";
import { buildNativeAwareTabPath } from "@/lib/tab-navigation";

const InviteGate = lazy(() => import("@/components/onboarding/invite-gate"));
const PhoneGate = lazy(() => import("@/components/onboarding/phone-gate"));
const BannedGate = lazy(() => import("@/components/onboarding/banned-gate"));

/**
 * What the home tab adds over the feed (home is the feed again, 2026-11-23):
 * the required phone number, the invite gate and a permanent ban stop it as
 * they stop the chat list, and a new account gets its "say something" card
 * here, above the tab bar. Being on screen also finishes the "go Home after
 * sign-in" move (see shouldGoHomeAfterSignIn).
 */
export default function HomeFeedLayer({ locale }: { locale: string }) {
  const router = useRouter();
  const { status: sessionStatus } = useSession();
  const { access: appAccess, setAccess: setAppAccess } = useAppAccess(sessionStatus === "authenticated", locale);
  const gated = sessionStatus === "authenticated" && appAccess && !appAccess.allowed;
  const firstRunCopy = useMemo(() => resolveFirstRunCopy(locale), [locale]);
  // Read after mount so the first paint matches the server (see @/lib/first-run).
  const [firstSpeakPending, setFirstSpeakPending] = useState(false);
  useEffect(() => {
    clearSignedOutHere();
    const timer = window.setTimeout(() => setFirstSpeakPending(isFirstSpeakPending()), 0);
    return () => window.clearTimeout(timer);
  }, []);
  const showFirstSpeakCard = firstSpeakPending && sessionStatus === "authenticated" && !gated;
  useNativeBannerSuppression(showFirstSpeakCard);
  const handleFirstSpeak = useCallback(() => {
    // buildNativeAwareTabPath keeps only the app shell's own params, so `firstSpeak` is added after it.
    const path = buildNativeAwareTabPath(conversationsHref(locale), new URLSearchParams(window.location.search), { skipConversationRestore: true, tabRoot: true });
    router.push(`${path}${path.includes("?") ? "&" : "?"}firstSpeak=1`);
  }, [locale, router]);

  return (
    <>
      {showFirstSpeakCard ? (
        <div
          data-qa="home-first-speak-card"
          className="pointer-events-none absolute inset-x-0 z-40 px-4 pb-3"
          style={{ bottom: `calc(${BOTTOM_TAB_BAR_HEIGHT_PX}px + env(safe-area-inset-bottom, 0px))` }}
        >
          <div className="pointer-events-auto rounded-[1.6rem] border border-amber-200 bg-amber-50 px-5 pb-4 pt-4 text-center shadow-[0_16px_36px_rgba(245,158,11,0.18)]">
            <p className="text-[1.05rem] font-extrabold leading-snug tracking-[-0.02em] text-slate-950">{firstRunCopy.speakTitle}</p>
            <button
              type="button"
              data-qa="home-first-speak"
              onClick={handleFirstSpeak}
              className="mt-3 flex h-12 w-full items-center justify-center gap-2.5 rounded-full text-[1rem] font-bold text-white shadow-[0_12px_26px_rgba(245,158,11,0.3)] active:scale-[0.99]"
              style={{ backgroundImage: "linear-gradient(90deg, #f59e0b 0%, #f97316 100%)" }}
            >
              <Mic size={19} strokeWidth={2.4} aria-hidden />
              <span>{firstRunCopy.speakButton}</span>
            </button>
          </div>
        </div>
      ) : null}
      {gated ? (
        <Suspense fallback={null}>
          {appAccess.reason === "banned"
            ? <BannedGate locale={locale} />
            : appAccess.reason === "needs_phone" || appAccess.reason === "needs_phone_in_korea"
              ? <PhoneGate locale={locale} onAccess={setAppAccess} inKorea={appAccess.reason === "needs_phone_in_korea"} />
              : <InviteGate locale={locale} onAccess={setAppAccess} />}
        </Suspense>
      ) : null}
    </>
  );
}
