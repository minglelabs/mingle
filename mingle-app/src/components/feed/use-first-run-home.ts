"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { hasConfirmedLanguageOnboarding } from "@/components/LivePhoneDemo/language-onboarding.storage";
import { conversationsHref } from "@/lib/posting-feed-guard";
import { isFirstSpeakPending, shouldOpenConversationsInsteadOfFeed } from "@/lib/first-run";

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
 * where it is asked to say something. Decided on the client after mount, like
 * the posting guard, so the first paint matches the server render; the caller
 * shows blank chrome while "checking" and after "conversations".
 */
export function useFirstRunHome(locale: string): FirstRunHomeStatus {
  const router = useRouter();
  const [status, setStatus] = useState<FirstRunHomeStatus>(() => (launchJudged ? "feed" : "checking"));

  useEffect(() => {
    let cancelled = false;
    scheduleMicrotask(() => {
      if (cancelled) return;
      if (launchJudged) {
        setStatus("feed");
        return;
      }
      launchJudged = true;
      const params = new URLSearchParams(window.location.search);
      const moveToConversations = shouldOpenConversationsInsteadOfFeed({
        isNativeApp: isNativeAppRuntime(),
        onboardingConfirmed: hasConfirmedLanguageOnboarding(),
        firstSpeakPending: isFirstSpeakPending(),
        hasPostTarget: params.has("postId") || params.has("commentId"),
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
  }, [locale, router]);

  return status;
}
