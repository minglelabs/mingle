"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { useEffect, useRef, type ReactNode } from "react";
import {
  captureMingleClientEvent,
  identifyMinglePostHogAccount,
  initializeMinglePostHog,
  isPostHogExcludedPath,
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
  const initializedRef = useRef(false);
  const lastScreenKeyRef = useRef("");

  // Admin screens never start PostHog; it starts on the first non-admin route instead.
  useEffect(() => {
    if (!projectToken || !host || initializedRef.current) return;
    if (!initializeMinglePostHog({ projectToken, host })) return;
    initializedRef.current = true;
    captureMingleClientEvent("mingle_app_opened", {
      screen: resolveMingleAnalyticsScreen(
        window.location.pathname,
        new URLSearchParams(window.location.search),
      ),
    });
  }, [host, pathname, projectToken]);

  useEffect(() => {
    if (!initializedRef.current || status === "loading") return;
    identifyMinglePostHogAccount(status === "authenticated");
  }, [status]);

  useEffect(() => {
    if (!initializedRef.current) return;
    syncMinglePostHogRoute(pathname);
    if (isPostHogExcludedPath(pathname)) return;
    const screen = resolveMingleAnalyticsScreen(pathname, searchParams);
    const screenKey = `${pathname}:${screen}:${searchParams.get("conversation") ?? ""}`;
    if (lastScreenKeyRef.current === screenKey) return;
    lastScreenKeyRef.current = screenKey;
    captureMingleClientEvent("mingle_screen_viewed", { screen });
  }, [pathname, searchParams]);

  return children;
}
