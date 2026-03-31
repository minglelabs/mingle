"use client";

import { useEffect, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { isNativeUiBridgeEnabledFromSearch } from "@/components/LivePhoneDemo/live-phone-demo.native-ui.logic";

const NATIVE_BOTTOM_TAB_BANNER_SLOT_HEIGHT_PX = 50;

type NativeBottomTabBannerSlotProps = {
  hidden?: boolean;
  nativeBannerHidden?: boolean;
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
  nativeBannerHidden = hidden,
}: NativeBottomTabBannerSlotProps) {
  const searchParams = useSearchParams();
  const nativeUiBridgeEnabled = useMemo(() => {
    const search = searchParams.toString();
    return isNativeUiBridgeEnabledFromSearch(search ? `?${search}` : "");
  }, [searchParams]);

  useEffect(() => {
    if (!nativeUiBridgeEnabled) return;
    postToNativeBridge({
      type: "native_set_ad_banner_position",
      payload: { position: "bottom" },
    });
  }, [nativeUiBridgeEnabled]);

  useEffect(() => {
    if (!nativeUiBridgeEnabled) return;
    postToNativeBridge({
      type: "native_ui_overlay_state",
      payload: { pageOverlayOpen: nativeBannerHidden },
    });

    return () => {
      postToNativeBridge({
        type: "native_ui_overlay_state",
        payload: { pageOverlayOpen: false },
      });
    };
  }, [nativeBannerHidden, nativeUiBridgeEnabled]);

  if (!nativeUiBridgeEnabled || hidden) return null;

  return (
    <section
      aria-hidden="true"
      data-native-bottom-tab-banner-slot=""
      className="w-full shrink-0 bg-white"
      style={{ height: `${NATIVE_BOTTOM_TAB_BANNER_SLOT_HEIGHT_PX}px` }}
    />
  );
}
