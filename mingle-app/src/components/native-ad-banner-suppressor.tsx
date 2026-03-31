"use client";

import NativeAdBannerSceneController from "@/components/native-ad-banner-scene-controller";

const AD_BANNER_SUPPRESSOR_RELEASE_DELAY_MS = 300;

type NativeAdBannerSuppressorProps = {
  active?: boolean;
  source: string;
};

export default function NativeAdBannerSuppressor({
  active = true,
  source,
}: NativeAdBannerSuppressorProps) {
  return (
    <NativeAdBannerSceneController
      source={source}
      mode="hidden"
      active={active}
      releaseDelayMs={AD_BANNER_SUPPRESSOR_RELEASE_DELAY_MS}
    />
  );
}
