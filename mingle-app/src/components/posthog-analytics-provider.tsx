"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { runAfterStartup } from "@/lib/after-startup";
import {
  captureMingleClientEvent,
  flushMinglePostHogPendingEvents,
  identifyMinglePostHogAccount,
  initializeMinglePostHog,
  isPostHogExcludedPath,
  markMinglePostHogStartPending,
  syncMinglePostHogRoute,
} from "@/lib/posthog-client";
import { resolveMingleAnalyticsScreen } from "@/lib/posthog-client.logic";

type PostHogAnalyticsProviderProps = {
  children: ReactNode;
  projectToken: string | null;
  host: string | null;
};

export default function PostHogAnalyticsProvider({
  children,
  projectToken,
  host,
}: PostHogAnalyticsProviderProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { status } = useSession();
  const [started, setStarted] = useState(false);
  const startingRef = useRef(false);
  const statusRef = useRef(status);
  statusRef.current = status;
  const identifiedStatusRef = useRef<string | null>(null);
  const lastScreenKeyRef = useRef("");

  // PostHog starts after the first screen: its SDK, remote config, replay
  // recorder and web-vitals scripts would otherwise load and run while that
  // screen is still loading. Events captured meanwhile are kept and sent once
  // it starts. Admin screens never start PostHog; it starts on the first
  // non-admin route instead.
  useEffect(() => {
    if (!projectToken || !host || started || startingRef.current) return;
    if (isPostHogExcludedPath(window.location.pathname)) return;
    startingRef.current = true;
    markMinglePostHogStartPending();
    let cancelled = false;
    const cancelStartup = runAfterStartup(() => {
      void import("posthog-js")
        .then(({ default: posthog }) => {
          if (cancelled) return;
          if (!initializeMinglePostHog({ projectToken, host }, posthog)) {
            startingRef.current = false;
            return;
          }
          const currentStatus = statusRef.current;
          if (currentStatus !== "loading") {
            identifyMinglePostHogAccount(currentStatus === "authenticated");
            identifiedStatusRef.current = currentStatus;
          }
          captureMingleClientEvent("mingle_app_opened", {
            screen: resolveMingleAnalyticsScreen(
              window.location.pathname,
              new URLSearchParams(window.location.search),
            ),
          });
          flushMinglePostHogPendingEvents();
          setStarted(true);
        })
        .catch(() => {
          // Retried on the next route change.
          startingRef.current = false;
        });
    });
    return () => {
      cancelled = true;
      cancelStartup();
      startingRef.current = false;
    };
  }, [host, pathname, projectToken, started]);

  useEffect(() => {
    if (!started || status === "loading" || identifiedStatusRef.current === status) return;
    identifiedStatusRef.current = status;
    identifyMinglePostHogAccount(status === "authenticated");
  }, [started, status]);

  useEffect(() => {
    if (!started) return;
    syncMinglePostHogRoute(pathname);
    if (isPostHogExcludedPath(pathname)) return;
    const screen = resolveMingleAnalyticsScreen(pathname, searchParams);
    const screenKey = `${pathname}:${screen}:${searchParams.get("conversation") ?? ""}`;
    if (lastScreenKeyRef.current === screenKey) return;
    lastScreenKeyRef.current = screenKey;
    captureMingleClientEvent("mingle_screen_viewed", { screen });
  }, [pathname, searchParams, started]);

  return children;
}
