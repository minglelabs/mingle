import { resolveLivePhoneDemoCopyActionCopy } from "@/components/LivePhoneDemo/live-phone-demo.copy-actions";
import { resolveLivePhoneDemoFeedbackCopy } from "@/components/LivePhoneDemo/live-phone-demo.feedback-copy";
import { resolveNativeAppUpdateCopy } from "@/components/LivePhoneDemo/live-phone-demo.app-update.logic";
import { resolveLivePhoneDemoTtsActionCopy } from "@/components/LivePhoneDemo/live-phone-demo.tts-actions";
import { type AppLocale } from "@/i18n/config";
import { getConversationCopy } from "@/i18n/conversations";
import { getVersionPolicyCopy } from "@/i18n/get-version-policy-copy";
import { resolveLivePhoneDemoComposerCopy } from "@/i18n/live-phone-demo-composer-copy";
import { getSilenceSliderUpgradeCopy } from "@/i18n/silence-slider-upgrade-copy";
import { getPrimaryUiCopy } from "@/i18n/primary-ui-copy";
import type { AppDictionary, DeepPartial } from "@/i18n/types";

export function getSupplementalDictionary(
  locale: AppLocale,
): DeepPartial<AppDictionary> {
  const primaryUiCopy = getPrimaryUiCopy(locale);

  return {
    connect: primaryUiCopy.connect,
    conversations: getConversationCopy(locale),
    livePhoneDemo: {
      composer: resolveLivePhoneDemoComposerCopy(locale),
      copyActions: resolveLivePhoneDemoCopyActionCopy(locale),
      feedback: resolveLivePhoneDemoFeedbackCopy(locale),
      ttsAction: resolveLivePhoneDemoTtsActionCopy(locale),
      nativeAppUpdate: resolveNativeAppUpdateCopy(locale),
      silenceSliderUpgrade: getSilenceSliderUpgradeCopy(locale),
    },
    profile: primaryUiCopy.profile,
    versionPolicy: getVersionPolicyCopy(locale),
  };
}
