"use client";

import { useEffect } from "react";
import NativeAdBannerSceneController from "@/components/native-ad-banner-scene-controller";

const NATIVE_BOTTOM_TAB_BANNER_SLOT_HEIGHT_PX = 50;
const NATIVE_BOTTOM_TAB_BANNER_SHOW_DELAY_MS = 300;

type NativeBottomTabBannerSlotProps = {
  source: string;
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
  source,
  hidden = false,
  nativeBannerHidden = hidden,
}: NativeBottomTabBannerSlotProps) {
  useEffect(() => {
    if (!canPostToNativeBridge()) return;
    postToNativeBridge({
      type: "native_set_ad_banner_position",
      payload: { position: "bottom" },
    });
  }, []);

  if (!canPostToNativeBridge()) return null;

  return (
    <>
      <NativeAdBannerSceneController
        source={source}
        mode={nativeBannerHidden ? "hidden" : "visible"}
        active={nativeBannerHidden ? true : !hidden}
        showDelayMs={NATIVE_BOTTOM_TAB_BANNER_SHOW_DELAY_MS}
        position="bottom"
      />
      {!hidden ? (
        <section
          aria-hidden="true"
          data-native-bottom-tab-banner-slot=""
          className="w-full shrink-0 bg-white"
          style={{ height: `${NATIVE_BOTTOM_TAB_BANNER_SLOT_HEIGHT_PX}px` }}
        />
      ) : null}
    </>
  );
}
