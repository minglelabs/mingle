"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { hasConfirmedLanguageOnboarding } from "@/components/LivePhoneDemo/language-onboarding.storage";
import { conversationsHref } from "@/lib/posting-feed-guard";
import { isFirstSpeakPending, shouldOpenConversationsInsteadOfFeed, speakTrialNeedsSessionCheck } from "@/lib/first-run";
import { readLastSignInMethod } from "@/lib/last-sign-in-method";
import { isSpeakTrialDone } from "@/lib/speak-trial";

export type FirstRunHomeStatus = "checking" | "feed" | "conversations";

function scheduleMicrotask(callback: () => void): void {
  if (typeof queueMicrotask === "function") queueMicrotask(callback);
  else void Promise.resolve().then(callback);
}

/** The app launch is judged once per page load; later visits to the feed tab stay on the feed. */
let launchJudged = false;

function isNativeAppRuntime(): boolean {
  const bridge = (window as { ReactNativeWebView?: { postMessage?: unknown } }).ReactNativeWebView;
  return typeof bridge?.postMessage === "function";
}

/**
 * The app shell opens the feed as its first screen. A device still in its
 * first run (see `@/lib/first-run`) starts on the conversation list instead,
 * where it is asked to say something: signed in, by the "say something" card;
 * signed out on a device that never signed in, by the ten-second speak trial
 * in front of the sign-in screen. Decided on the client after mount, like
 * the posting guard, so the first paint matches the server render; the caller
 * shows blank chrome while "checking" and after "conversations".
 */
export function useFirstRunHome(locale: string): FirstRunHomeStatus {
  const router = useRouter();
  const { status: sessionStatus } = useSession();
  const [status, setStatus] = useState<FirstRunHomeStatus>(() => (launchJudged ? "feed" : "checking"));

  useEffect(() => {
    let cancelled = false;
    scheduleMicrotask(() => {
      if (cancelled) return;
      if (launchJudged) {
        setStatus("feed");
        return;
      }
      const params = new URLSearchParams(window.location.search);
      const base = {
        isNativeApp: isNativeAppRuntime(),
        onboardingConfirmed: hasConfirmedLanguageOnboarding(),
        firstSpeakPending: isFirstSpeakPending(),
        hasPostTarget: params.has("postId") || params.has("commentId"),
      };
      // Only a device that may owe the speak trial waits for the session; the
      // rest is judged at once, as before.
      const mayOweSpeakTrial = base.isNativeApp
        && !base.hasPostTarget
        && !shouldOpenConversationsInsteadOfFeed(base)
        && speakTrialNeedsSessionCheck({
          speakTrialDone: isSpeakTrialDone(),
          hasSignedInBefore: readLastSignInMethod() !== null,
        });
      if (mayOweSpeakTrial && sessionStatus === "loading") return;
      launchJudged = true;
      const moveToConversations = shouldOpenConversationsInsteadOfFeed({
        ...base,
        speakTrialDue: mayOweSpeakTrial && sessionStatus === "unauthenticated",
      });
      if (!moveToConversations) {
        setStatus("feed");
        return;
      }
      setStatus("conversations");
      router.replace(`${conversationsHref(locale)}${window.location.search}`);
    });
    return () => {
      cancelled = true;
    };
  }, [locale, router, sessionStatus]);

  return status;
}
