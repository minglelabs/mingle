"use client";

import { DEFAULT_LOCALE, getDictionary, resolveSupportedLocaleTag, type AppLocale } from "@/i18n";
import PublicUserProfileScreen from "@/components/public-user-profile-screen";
import { postNativeBannerZone } from "@/lib/native-banner-zone";
import {
  NATIVE_PROFILE_LINK_EVENT,
  NATIVE_PROFILE_LINK_WINDOW_KEY,
  parseNativeProfileLinkOverlayRequest,
  type NativeProfileLinkOverlayRequest,
} from "@/lib/native-profile-link-overlay";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const NATIVE_PROFILE_HISTORY_STATE_KEY = "__MINGLE_NATIVE_PROFILE_OVERLAY__";

type NativeProfileOverlayWindow = Window & {
  [NATIVE_PROFILE_LINK_WINDOW_KEY]?: unknown;
};

type ProfileOverlayState = NativeProfileLinkOverlayRequest & {
  requestId: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function resolveLocale(pathname: string): AppLocale {
  const firstSegment = pathname.split("/").filter(Boolean)[0] ?? "";
  return resolveSupportedLocaleTag(firstSegment) ?? DEFAULT_LOCALE;
}

function isConversationRoute(pathname: string): boolean {
  const segments = pathname.split("/").filter(Boolean);
  return segments[1] === "conversations" || segments[1] === undefined && segments.length === 1;
}

function hasNativeProfileHistoryEntry(): boolean {
  if (typeof window === "undefined" || !isRecord(window.history.state)) return false;
  return Boolean(window.history.state[NATIVE_PROFILE_HISTORY_STATE_KEY]);
}

function restoreNativeBannerZone(): void {
  if (typeof window === "undefined") return;
  postNativeBannerZone(isConversationRoute(window.location.pathname) ? "list" : "hidden");
}

export default function NativeProfileLinkOverlay() {
  const pathname = usePathname() || "";
  const locale = resolveLocale(pathname);
  const dictionary = useMemo(() => getDictionary(locale), [locale]);
  const [profileOverlay, setProfileOverlay] = useState<ProfileOverlayState | null>(null);
  const profileOverlayRef = useRef<ProfileOverlayState | null>(null);
  const requestIdRef = useRef(0);

  const openProfile = useCallback((rawRequest: unknown) => {
    const request = parseNativeProfileLinkOverlayRequest(rawRequest);
    if (!request || typeof window === "undefined") return;

    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    const nextState = {
      ...(isRecord(window.history.state) ? window.history.state : {}),
      [NATIVE_PROFILE_HISTORY_STATE_KEY]: {
        userId: request.userId,
        requestId,
      },
    };

    if (hasNativeProfileHistoryEntry()) {
      window.history.replaceState(nextState, "", window.location.href);
    } else {
      window.history.pushState(nextState, "", window.location.href);
    }

    const nextOverlay = { ...request, requestId };
    profileOverlayRef.current = nextOverlay;
    setProfileOverlay(nextOverlay);
    postNativeBannerZone("hidden");

    const nativeWindow = window as NativeProfileOverlayWindow;
    delete nativeWindow[NATIVE_PROFILE_LINK_WINDOW_KEY];
  }, []);

  const closeProfile = useCallback(() => {
    if (typeof window !== "undefined" && hasNativeProfileHistoryEntry()) {
      window.history.back();
      return;
    }

    profileOverlayRef.current = null;
    setProfileOverlay(null);
    restoreNativeBannerZone();
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleProfileLinkEvent = (event: Event) => {
      openProfile((event as CustomEvent<unknown>).detail);
    };

    window.addEventListener(NATIVE_PROFILE_LINK_EVENT, handleProfileLinkEvent);

    const nativeWindow = window as NativeProfileOverlayWindow;
    const pendingRequest = nativeWindow[NATIVE_PROFILE_LINK_WINDOW_KEY];
    if (pendingRequest) {
      openProfile(pendingRequest);
    }

    return () => {
      window.removeEventListener(NATIVE_PROFILE_LINK_EVENT, handleProfileLinkEvent);
    };
  }, [openProfile]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const handlePopState = () => {
      if (!profileOverlayRef.current || hasNativeProfileHistoryEntry()) return;
      profileOverlayRef.current = null;
      setProfileOverlay(null);
      restoreNativeBannerZone();
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  return (
    <PublicUserProfileScreen
      dictionary={dictionary}
      locale={locale}
      userId={profileOverlay?.userId ?? ""}
      open={Boolean(profileOverlay)}
      onClose={closeProfile}
    />
  );
}
