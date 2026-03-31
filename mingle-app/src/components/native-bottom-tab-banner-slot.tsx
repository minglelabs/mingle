"use client";

import { useEffect, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { isNativeUiBridgeEnabledFromSearch } from "@/components/LivePhoneDemo/live-phone-demo.native-ui.logic";

const NATIVE_BOTTOM_TAB_BANNER_SLOT_HEIGHT_PX = 78;

type NativeBottomTabBannerSlotProps = {
  hidden?: boolean;
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

export default function NativeBottomTabBannerSlot({
  hidden = false,
}: NativeBottomTabBannerSlotProps) {
  const searchParams = useSearchParams();
  const nativeBridgeEnabled = useMemo(() => {
    const search = searchParams.toString();
    if (canPostToNativeBridge()) return true;
    return isNativeUiBridgeEnabledFromSearch(search ? `?${search}` : "");
  }, [searchParams]);

  useEffect(() => {
    if (!nativeBridgeEnabled) return;
    postToNativeBridge({
      type: "native_set_ad_banner_position",
      payload: { position: "bottom" },
    });
  }, [nativeBridgeEnabled]);

  useEffect(() => {
    if (!nativeBridgeEnabled) return;
    postToNativeBridge({
      type: "native_ui_overlay_state",
      payload: { menuOpen: hidden },
    });

    return () => {
      postToNativeBridge({
        type: "native_ui_overlay_state",
        payload: { menuOpen: false },
      });
    };
  }, [hidden, nativeBridgeEnabled]);

  if (!nativeBridgeEnabled || hidden) return null;

  return (
    <section
      aria-hidden="true"
      data-native-bottom-tab-banner-slot=""
      className="w-full shrink-0 bg-white"
      style={{ height: `${NATIVE_BOTTOM_TAB_BANNER_SLOT_HEIGHT_PX}px` }}
    />
  );
}
