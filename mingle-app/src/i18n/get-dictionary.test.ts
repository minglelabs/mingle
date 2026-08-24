import { describe, expect, it } from "vitest";
import { PRIMARY_UI_LANGUAGE_OPTIONS, SUPPORTED_LOCALES, getDictionary } from "@/i18n";
import { localeDictionaries } from "@/i18n/dictionaries/catalog";
import { PRIMARY_UI_LOCALES } from "@/i18n/mingle-locales";

const LIVE_DEMO_PREFERENCE_LABEL_KEYS = [
  "silenceFinalizeLabel",
  "endpointTuningLabel",
  "endpointTuningShortLabel",
  "endpointTuningLongLabel",
  "adBannerPositionLabel",
  "adBannerPositionTopLabel",
  "adBannerPositionBottomLabel",
  "sttSegmentationModeLabel",
  "sttSegmentationModeEndLabel",
  "sttSegmentationModeFinLabel",
] as const;

describe("getDictionary", () => {
  it("returns dedicated dictionaries for the expanded locale catalog", () => {
    expect(getDictionary("pl").account.title).toBe("Konto");
    expect(getDictionary("he").account.title).toBe("חשבון");
    expect(getDictionary("zh-TW").account.title).toBe("帳戶");
  });

  it("hydrates supplemental i18n sections for every supported locale", () => {
    for (const locale of SUPPORTED_LOCALES) {
      const dictionary = getDictionary(locale);

      expect(dictionary.demo.textSizeLabel).toBeTruthy();
      expect(dictionary.demo.translationModelLabel).toBeTruthy();
      expect(dictionary.demo.adBannerPositionBottomLabel).toBeTruthy();
      expect(dictionary.conversations?.searchPlaceholder).toBeTruthy();
      expect(dictionary.conversations?.newConversationButtonLabel).toBeTruthy();
      expect(dictionary.conversations?.switchLiveRoomToastLabel).toBeTruthy();
      expect(dictionary.conversations?.inviteFriendsPageTitle).toBeTruthy();
      expect(dictionary.livePhoneDemo.composer.sendMessageLabel).toBeTruthy();
      expect(dictionary.livePhoneDemo.composer.blockedComposerMessage).toBeTruthy();
      expect(dictionary.livePhoneDemo.copyActions.copiedToastLabel).toBeTruthy();
      expect(dictionary.livePhoneDemo.feedback.categoryLabels.feedback).toBeTruthy();
      expect(dictionary.livePhoneDemo.ttsAction.playPronunciationLabel).toBeTruthy();
      expect(dictionary.livePhoneDemo.nativeAppUpdate.updateButtonLabel).toBeTruthy();
      expect(dictionary.livePhoneDemo.silenceSliderUpgrade.buttonLabel).toBeTruthy();
      expect(dictionary.versionPolicy.checkingTitle).toBeTruthy();
      expect(dictionary.versionPolicy.updateButtonLabel).toBeTruthy();
      expect(dictionary.versionPolicy.unknownVersionLabel).toBeTruthy();
    }
  });

  it("defines live-demo preference labels for every primary UI locale", () => {
    for (const locale of PRIMARY_UI_LOCALES) {
      const demo = localeDictionaries[locale].demo;

      for (const key of LIVE_DEMO_PREFERENCE_LABEL_KEYS) {
        expect(Object.prototype.hasOwnProperty.call(demo, key), `${locale}.${key}`).toBe(true);
        expect(demo[key], `${locale}.${key}`).toBeTruthy();
      }
    }
  });

  it("merges generated version policy labels on top of the primary-ui fallback", () => {
    const polishDictionary = getDictionary("pl");

    expect(polishDictionary.versionPolicy.checkingTitle).toBe("Checking version");
    expect(polishDictionary.versionPolicy.updateButtonLabel).toBe("Aktualizacja");
    expect(polishDictionary.livePhoneDemo.composer.sendMessageLabel).toBe("Send message");
  });

  it("provides localized copy for the app language and social profile surfaces", () => {
    expect(PRIMARY_UI_LANGUAGE_OPTIONS).toHaveLength(15);

    for (const option of PRIMARY_UI_LANGUAGE_OPTIONS) {
      const dictionary = getDictionary(option.code);

      expect(dictionary.profile.appLanguageTitle).toBeTruthy();
      expect(dictionary.profile.appLanguageDescription).toBeTruthy();
      expect(dictionary.profile.profileShareCopyLinkLabel).toBeTruthy();
      expect(dictionary.profile.settingsLoadError).toBeTruthy();
      expect(dictionary.profile.messageAction).toBeTruthy();
      expect(dictionary.profile.messageError).toBeTruthy();
      expect(dictionary.profile.noFollowersLabel).toBeTruthy();
      expect(dictionary.profile.noFollowingLabel).toBeTruthy();
      expect(dictionary.profile.profileShareQrInstruction).toBeTruthy();
      expect(dictionary.connect.searchPlaceholder).toBeTruthy();
      expect(dictionary.connect.clearSearchLabel).toBeTruthy();
    }
  });

  it("uses English for new supplemental copy outside the 15 primary UI locales", () => {
    const dictionary = getDictionary("pl");

    expect(dictionary.conversations?.startAloneOptionLabel).toBe("Start alone");
    expect(dictionary.livePhoneDemo.composer.blockedComposerMessage).toBe("This user is blocked.");
    expect(dictionary.profile.messageAction).toBe("Message");
    expect(dictionary.profile.profileShareQrInstruction).toBe("Place the profile QR code inside the frame.");
  });
});
