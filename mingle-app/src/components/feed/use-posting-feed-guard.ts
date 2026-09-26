"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { clientApiNamespace, namespaceSupportsPostingFeed } from "@/lib/api-contract";
import { conversationsHref } from "@/lib/posting-feed-guard";

export type PostingFeedGuardStatus = "checking" | "supported" | "unsupported";

// Defer a state write out of the synchronous effect body (matches
// use-unread-notifications) so React does not cascade-render and the
// react-hooks/set-state-in-effect lint stays clean.
const scheduleMicrotask: (callback: () => void) => void =
  typeof queueMicrotask === "function"
    ? queueMicrotask
    : (callback) => { void Promise.resolve().then(callback); };

/**
 * Client-side rollout gate for a posting screen entered directly (a deep link,
 * a bookmark, or a back gesture) rather than through an in-app link.
 *
 * The gate is client-only on purpose: `clientApiNamespace` reflects the app
 * shell's namespace only on the client (a server render sees build-time env),
 * so deciding during SSR would either be wrong for a specific app or trip a
 * hydration mismatch. It therefore returns "checking" for the first paint —
 * identical on server and client — and only after mount resolves to
 * "supported" / "unsupported", redirecting an unsupported client to the
 * conversation list. Callers render neutral (blank) chrome while "checking".
 */
export function usePostingFeedGuard(locale: string): PostingFeedGuardStatus {
  const router = useRouter();
  const [status, setStatus] = useState<PostingFeedGuardStatus>("checking");

  useEffect(() => {
    let cancelled = false;
    scheduleMicrotask(() => {
      if (cancelled) return;
      if (namespaceSupportsPostingFeed(clientApiNamespace)) {
        setStatus("supported");
        return;
      }
      setStatus("unsupported");
      router.replace(conversationsHref(locale));
    });
    return () => {
      cancelled = true;
    };
  }, [locale, router]);

  return status;
}

/**
 * Non-redirecting variant for chrome that must simply show or hide a posting
 * affordance (e.g. the feed tab, a profile post grid) without navigating away.
 *
 * Returns `null` until mounted so the first client paint matches the server
 * render (no hydration mismatch), then the real client answer. Callers treat
 * `null` as "not yet known" and should render the posting-enabled shape on the
 * first paint only when that also matches the server (which renders with the
 * build-time namespace), hiding it once `false` arrives.
 */
export function useIsPostingFeedSupported(): boolean | null {
  const [supported, setSupported] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    scheduleMicrotask(() => {
      if (cancelled) return;
      setSupported(namespaceSupportsPostingFeed(clientApiNamespace));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return supported;
}
