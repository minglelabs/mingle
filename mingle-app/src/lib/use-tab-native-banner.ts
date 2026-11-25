"use client";

import { useEffect, useState } from "react";
import {
  NATIVE_UI_EVENT,
  parseNativeUiBannerLayoutDetail,
  readCachedNativeUiBannerLayout,
} from "@/components/LivePhoneDemo/live-phone-demo.native-ui.logic";
import { requestNativeBannerZone } from "@/lib/native-banner-zone";

/**
 * The app draws its ad banner this far below the top safe area on a list
 * screen (rn/App.tsx, NATIVE_CONVERSATION_LIST_HEADER_HEIGHT_PX). A tab that
 * shows the banner keeps its top bar exactly this tall, so the banner sits
 * right under it.
 */
export const TAB_BANNER_TOP_BAR_HEIGHT_PX = 56;

const WEB_CANVAS_BASE_WIDTH_PX = 400;
const NATIVE_AD_BANNER_DEFAULT_HEIGHT_PX = 50;

/** The banner's height in page px when the app has not said yet (the page is scaled down on narrow phones). */
export function estimateTabBannerHeightPx(viewportWidthPx: number): number {
  const scale = viewportWidthPx > 0 ? Math.min(1, viewportWidthPx / WEB_CANVAS_BASE_WIDTH_PX) : 1;
  return Math.max(0, Math.round(NATIVE_AD_BANNER_DEFAULT_HEIGHT_PX / (scale > 0 ? scale : 1)));
}

function isNativeAppRuntime(): boolean {
  return typeof window !== "undefined"
    && typeof (window as Window & { ReactNativeWebView?: { postMessage?: unknown } }).ReactNativeWebView?.postMessage === "function";
}

/**
 * The ad banner pinned under the top bar of a tab (owner, 2026-11-25: the
 * voice-room tab and the explore tab, like the chat list). The banner is drawn
 * by the app above the page, so the tab only asks for it and leaves a strip of
 * this height under its top bar; the scrolling area starts below the strip.
 *
 * Returns the strip's height in px: 0 in a browser, and while `active` is
 * false (signed out, nothing to show yet).
 */
export function useTabNativeBanner(active: boolean): number {
  const [native, setNative] = useState(false);
  const [heightPx, setHeightPx] = useState(0);

  useEffect(() => {
    if (!isNativeAppRuntime()) return;
    const read = (detail: unknown) => {
      const layout = parseNativeUiBannerLayoutDetail(detail);
      if (layout?.position === "top" && layout.topInsetPx > 0) setHeightPx(layout.topInsetPx);
    };
    const timer = window.setTimeout(() => {
      setNative(true);
      const cached = readCachedNativeUiBannerLayout(window);
      if (cached) read(cached);
    }, 0);
    const onNativeUi = (event: Event) => read((event as CustomEvent<unknown>).detail);
    window.addEventListener(NATIVE_UI_EVENT, onNativeUi as EventListener);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener(NATIVE_UI_EVENT, onNativeUi as EventListener);
    };
  }, []);

  useEffect(() => {
    if (!native) return;
    requestNativeBannerZone(active ? "list" : "hidden");
    // Leaving the tab: the next screen asks for its own zone (or none).
    return () => requestNativeBannerZone("hidden");
  }, [active, native]);

  if (!native || !active) return 0;
  return heightPx > 0 ? heightPx : estimateTabBannerHeightPx(window.innerWidth);
}
