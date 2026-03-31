"use client";

import NativeAdBannerSceneController from "@/components/native-ad-banner-scene-controller";

const CONVERSATION_AD_BANNER_SHOW_DELAY_MS = 280;

type NativeConversationAdBannerSceneProps = {
  active?: boolean;
};

export default function NativeConversationAdBannerScene({
  active = true,
}: NativeConversationAdBannerSceneProps) {
  return (
    <NativeAdBannerSceneController
      source="conversation-screen"
      mode="visible"
      active={active}
      showDelayMs={CONVERSATION_AD_BANNER_SHOW_DELAY_MS}
    />
  );
}
