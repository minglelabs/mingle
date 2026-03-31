"use client";

import { useCallback, useEffect, useRef } from "react";

type NativeAdBannerSceneMode = "visible" | "hidden";
type NativeAdBannerSceneState = "visible" | "hidden" | "inactive";
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

function syncSceneStateToNative(
  source: string,
  state: NativeAdBannerSceneState,
): void {
  if (!source) return;
  postToNativeBridge({
    type: "native_set_ad_banner_scene",
    payload: {
      source,
      state,
    },
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
  const timerRef = useRef<number | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current === null || typeof window === "undefined") return;
    window.clearTimeout(timerRef.current);
    timerRef.current = null;
  }, []);

  const syncSceneState = useCallback((state: NativeAdBannerSceneState) => {
    if (!source) return;
    syncSceneStateToNative(source, state);
  }, [source]);

  const activateOverlaySource = useCallback(() => {
    if (!canPostToNativeBridge() || !source || typeof window === "undefined") return;
    const activeOverlaySources = getActiveOverlaySources();
    if (activeOverlaySources[source]) return;
    activeOverlaySources[source] = true;
    syncOverlayStateToNative();
  }, [source]);

  const deactivateOverlaySource = useCallback(() => {
    if (!canPostToNativeBridge() || !source || typeof window === "undefined") return;
    const activeOverlaySources = getActiveOverlaySources();
    if (!activeOverlaySources[source]) return;
    delete activeOverlaySources[source];
    syncOverlayStateToNative();
  }, [source]);

  useEffect(() => {
    if (!canPostToNativeBridge() || !active || mode !== "visible" || !position) return;
    postToNativeBridge({
      type: "native_set_ad_banner_position",
      payload: { position },
    });
  }, [active, mode, position]);

  useEffect(() => {
    clearTimer();

    if (!canPostToNativeBridge() || !source) {
      deactivateOverlaySource();
      syncSceneState("inactive");
      return;
    }

    if (active) {
      if (mode === "hidden") {
        activateOverlaySource();
        syncSceneState("hidden");
        return;
      }

      deactivateOverlaySource();
      if (showDelayMs <= 0 || typeof window === "undefined") {
        syncSceneState("visible");
        return;
      }

      syncSceneState("inactive");
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null;
        syncSceneState("visible");
      }, showDelayMs);
      return;
    }

    if (mode === "hidden" && releaseDelayMs > 0 && typeof window !== "undefined") {
      activateOverlaySource();
      syncSceneState("hidden");
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null;
        deactivateOverlaySource();
        syncSceneState("inactive");
      }, releaseDelayMs);
      return;
    }

    deactivateOverlaySource();
    syncSceneState("inactive");
  }, [
    active,
    activateOverlaySource,
    clearTimer,
    deactivateOverlaySource,
    mode,
    releaseDelayMs,
    showDelayMs,
    source,
    syncSceneState,
  ]);

  useEffect(() => () => {
    clearTimer();
    deactivateOverlaySource();
    syncSceneState("inactive");
  }, [clearTimer, deactivateOverlaySource, syncSceneState]);

  return null;
}
