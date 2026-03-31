"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { isNativeUiBridgeEnabledFromSearch } from "@/components/LivePhoneDemo/live-phone-demo.native-ui.logic";

type NativeAdBannerSceneMode = "visible" | "hidden";
type NativeAdBannerSceneState = "inactive" | "visible" | "hidden";
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

  const postSceneState = useCallback((state: NativeAdBannerSceneState) => {
    if (!nativeUiBridgeEnabled || !source) return;
    postToNativeBridge({
      type: "native_set_ad_banner_scene",
      payload: {
        source,
        state,
      },
    });
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
      postSceneState("inactive");
      return;
    }

    if (active) {
      if (mode === "hidden") {
        postSceneState("hidden");
        return;
      }

      postSceneState("hidden");
      if (showDelayMs <= 0 || typeof window === "undefined") {
        postSceneState("visible");
        return;
      }

      timerRef.current = window.setTimeout(() => {
        timerRef.current = null;
        postSceneState("visible");
      }, showDelayMs);
      return;
    }

    if (mode === "hidden" && releaseDelayMs > 0 && typeof window !== "undefined") {
      postSceneState("hidden");
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null;
        postSceneState("inactive");
      }, releaseDelayMs);
      return;
    }

    postSceneState("inactive");
  }, [
    active,
    clearTimer,
    mode,
    nativeUiBridgeEnabled,
    postSceneState,
    releaseDelayMs,
    showDelayMs,
    source,
  ]);

  useEffect(() => () => {
    clearTimer();
    postSceneState("inactive");
  }, [clearTimer, postSceneState]);

  return null;
}
