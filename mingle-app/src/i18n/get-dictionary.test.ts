import { describe, expect, it } from "vitest";
import { PRIMARY_UI_LANGUAGE_OPTIONS, SUPPORTED_LOCALES, getDictionary } from "@/i18n";

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
      expect(dictionary.conversations.searchPlaceholder).toBeTruthy();
      expect(dictionary.conversations.newConversationButtonLabel).toBeTruthy();
      expect(dictionary.conversations.switchLiveRoomToastLabel).toBeTruthy();
      expect(dictionary.livePhoneDemo.composer.sendMessageLabel).toBeTruthy();
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
      expect(dictionary.connect.searchPlaceholder).toBeTruthy();
      expect(dictionary.connect.clearSearchLabel).toBeTruthy();
    }
  });
});
