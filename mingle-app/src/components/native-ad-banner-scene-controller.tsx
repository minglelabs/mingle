"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { isNativeUiBridgeEnabledFromSearch } from "@/components/LivePhoneDemo/live-phone-demo.native-ui.logic";

type NativeAdBannerSceneMode = "visible" | "hidden";
type NativeBannerPosition = "top" | "bottom";

type NativeAdBannerSceneControllerProps = {
  source: string;
  mode: NativeAdBannerSceneMode;
  active?: boolean;
  showDelayMs?: number;
  releaseDelayMs?: number;
  position?: NativeBannerPosition;
};

type NativeBridgeWindow = Window & {
  ReactNativeWebView?: {
    postMessage?: (message: string) => void;
  };
  __MINGLE_NATIVE_BANNER_OVERLAY_SOURCES__?: Record<string, true>;
};

function canPostToNativeBridge(): boolean {
  if (typeof window === "undefined") return false;
  const bridgeWindow = window as NativeBridgeWindow;
  return typeof bridgeWindow.ReactNativeWebView?.postMessage === "function";
}

function postToNativeBridge(command: unknown): void {
  if (!canPostToNativeBridge()) return;

  try {
    const bridgeWindow = window as NativeBridgeWindow;
    bridgeWindow.ReactNativeWebView?.postMessage?.(JSON.stringify(command));
  } catch {
    // Ignore bridge serialization failures.
  }
}

function getActiveOverlaySources(): Record<string, true> {
  if (typeof window === "undefined") return {};
  const bridgeWindow = window as NativeBridgeWindow;
  if (!bridgeWindow.__MINGLE_NATIVE_BANNER_OVERLAY_SOURCES__) {
    bridgeWindow.__MINGLE_NATIVE_BANNER_OVERLAY_SOURCES__ = {};
  }
  return bridgeWindow.__MINGLE_NATIVE_BANNER_OVERLAY_SOURCES__;
}

function syncOverlayStateToNative(): void {
  const activeOverlaySources = getActiveOverlaySources();
  postToNativeBridge({
    type: "native_ui_overlay_state",
    payload: { pageOverlayOpen: Object.keys(activeOverlaySources).length > 0 },
  });
}

export default function NativeAdBannerSceneController({
  source,
  mode,
  active = true,
  showDelayMs = 0,
  releaseDelayMs = 0,
  position,
}: NativeAdBannerSceneControllerProps) {
  const searchParams = useSearchParams();
  const timerRef = useRef<number | null>(null);
  const nativeUiBridgeEnabled = useMemo(() => {
    const search = searchParams.toString();
    return isNativeUiBridgeEnabledFromSearch(search ? `?${search}` : "");
  }, [searchParams]);

  const clearTimer = useCallback(() => {
    if (timerRef.current === null || typeof window === "undefined") return;
    window.clearTimeout(timerRef.current);
    timerRef.current = null;
  }, []);

  const activateOverlaySource = useCallback(() => {
    if (!nativeUiBridgeEnabled || !source || typeof window === "undefined") return;
    const activeOverlaySources = getActiveOverlaySources();
    if (activeOverlaySources[source]) return;
    activeOverlaySources[source] = true;
    syncOverlayStateToNative();
  }, [nativeUiBridgeEnabled, source]);

  const deactivateOverlaySource = useCallback(() => {
    if (!nativeUiBridgeEnabled || !source || typeof window === "undefined") return;
    const activeOverlaySources = getActiveOverlaySources();
    if (!activeOverlaySources[source]) return;
    delete activeOverlaySources[source];
    syncOverlayStateToNative();
  }, [nativeUiBridgeEnabled, source]);

  useEffect(() => {
    if (!nativeUiBridgeEnabled || !active || mode !== "visible" || !position) return;
    postToNativeBridge({
      type: "native_set_ad_banner_position",
      payload: { position },
    });
  }, [active, mode, nativeUiBridgeEnabled, position]);

  useEffect(() => {
    clearTimer();

    if (!nativeUiBridgeEnabled || !source) {
      deactivateOverlaySource();
      return;
    }

    if (active) {
      if (mode === "hidden") {
        activateOverlaySource();
        return;
      }

      activateOverlaySource();
      if (showDelayMs <= 0 || typeof window === "undefined") {
        deactivateOverlaySource();
        return;
      }

      timerRef.current = window.setTimeout(() => {
        timerRef.current = null;
        deactivateOverlaySource();
      }, showDelayMs);
      return;
    }

    if (mode === "hidden" && releaseDelayMs > 0 && typeof window !== "undefined") {
      activateOverlaySource();
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null;
        deactivateOverlaySource();
      }, releaseDelayMs);
      return;
    }

    deactivateOverlaySource();
  }, [
    active,
    activateOverlaySource,
    clearTimer,
    deactivateOverlaySource,
    mode,
    nativeUiBridgeEnabled,
    releaseDelayMs,
    showDelayMs,
    source,
  ]);

  useEffect(() => () => {
    clearTimer();
    deactivateOverlaySource();
  }, [clearTimer, deactivateOverlaySource]);

  return null;
}
