import { describe, expect, it } from "vitest";
import { PRIMARY_UI_LOCALES } from "@/i18n/mingle-locales";
import { NATIVE_APP_INSTALL_SOURCES } from "@/lib/native-app-install-source";
import {
  DEFAULT_NATIVE_APP_UPDATE_DETAIL,
  parseNativeAppUpdateDetail,
  readRequestedApiNamespaceFromSearch,
  resolveNativeAppInstallSourceText,
  resolveNativeAppTrackingContext,
  resolveNativeAppUpdateCopy,
} from "./live-phone-demo.app-update.logic";

describe("live-phone-demo.app-update.logic", () => {
  it("parses a valid native app update payload", () => {
    expect(
      parseNativeAppUpdateDetail({
        status: "available",
        clientVersion: "1.0.5",
        latestVersion: "1.0.6",
        updateUrl: "https://apps.apple.com/app/id123",
        updateAvailable: true,
      })
    ).toEqual({
      status: "available",
      clientVersion: "1.0.5",
      latestVersion: "1.0.6",
      updateUrl: "https://apps.apple.com/app/id123",
      updateAvailable: true,
    });
  });

  it("rejects an invalid payload status", () => {
    expect(
      parseNativeAppUpdateDetail({
        ...DEFAULT_NATIVE_APP_UPDATE_DETAIL,
        status: "invalid",
      })
    ).toBeNull();
  });

  it("reads a versioned namespace from the location search", () => {
    expect(readRequestedApiNamespaceFromSearch("?apiNamespace=ios%2Fv1.0.6")).toBe(
      "ios/v1.0.6"
    );
    expect(readRequestedApiNamespaceFromSearch("?apiNs=android%2Fv1.0.4")).toBe(
      "android/v1.0.4"
    );
  });

  it("resolves tracking context from namespace alone", () => {
    expect(
      resolveNativeAppTrackingContext({
        apiNamespace: "ios/v1.0.1",
        isNativeAppRuntime: true,
      })
    ).toEqual({
      appVersion: "1.0.1",
      apiNamespace: "ios/v1.0.1",
      clientPlatform: "ios",
    });
  });

  it("prefers the native payload version when both payload and namespace exist", () => {
    expect(
      resolveNativeAppTrackingContext({
        apiNamespace: "android/v1.0.5",
        isNativeAppRuntime: true,
        detail: {
          status: "current",
          clientVersion: "1.0.6",
          latestVersion: "1.0.6",
          updateUrl: "",
          updateAvailable: false,
        },
      })
    ).toEqual({
      appVersion: "1.0.6",
      apiNamespace: "android/v1.0.5",
      clientPlatform: "android",
    });
  });

  it("does not derive native tracking context outside the native runtime", () => {
    expect(
      resolveNativeAppTrackingContext({
        apiNamespace: "android/v1.0.11",
        detail: {
          status: "current",
          clientVersion: "1.0.6",
          latestVersion: "1.0.6",
          updateUrl: "",
          updateAvailable: false,
        },
        isNativeAppRuntime: false,
      })
    ).toEqual({
      appVersion: null,
      apiNamespace: null,
      clientPlatform: null,
    });
  });

  it("resolves Korean copy from a regional locale tag", () => {
    expect(resolveNativeAppUpdateCopy("ko-KR").updateButtonLabel).toBe(
      "업데이트"
    );
  });

  it("falls back to English copy for unsupported locales", () => {
    expect(resolveNativeAppUpdateCopy("sv-SE").sectionLabel).toBe("App Update");
  });

  it("preserves accented French copy", () => {
    const copy = resolveNativeAppUpdateCopy("fr-FR");
    expect(copy.sectionLabel).toBe("Mise à jour de l'app");
    expect(copy.checkingMessage).toBe("Vérification des mises à jour.");
  });

  it("uses native Russian script copy", () => {
    const copy = resolveNativeAppUpdateCopy("ru-RU");
    expect(copy.sectionLabel).toBe("Обновление приложения");
    expect(copy.updateButtonLabel).toBe("Обновить");
  });

  describe("install source", () => {
    const basePayload = {
      status: "current",
      clientVersion: "2.2.0",
      latestVersion: "2.2.0",
      updateUrl: "",
      updateAvailable: false,
    };

    it("keeps every known install source from the native payload", () => {
      for (const installSource of NATIVE_APP_INSTALL_SOURCES) {
        expect(
          parseNativeAppUpdateDetail({ ...basePayload, installSource })?.installSource
        ).toBe(installSource);
      }
    });

    it("drops an unknown or malformed install source", () => {
      for (const installSource of ["appstore", "", "com.android.vending", 3, null, {}]) {
        const detail = parseNativeAppUpdateDetail({ ...basePayload, installSource });
        expect(detail).not.toBeNull();
        expect(detail).not.toHaveProperty("installSource");
      }
    });

    it("parses builds that never send an install source exactly as before", () => {
      expect(parseNativeAppUpdateDetail(basePayload)).toStrictEqual({
        status: "current",
        clientVersion: "2.2.0",
        latestVersion: "2.2.0",
        updateUrl: "",
        updateAvailable: false,
      });
    });

    it("ignores fields outside the whitelist", () => {
      expect(
        parseNativeAppUpdateDetail({
          ...basePayload,
          installSource: "testflight",
          installerPackage: "com.android.vending",
        })
      ).toStrictEqual({
        status: "current",
        clientVersion: "2.2.0",
        latestVersion: "2.2.0",
        updateUrl: "",
        updateAvailable: false,
        installSource: "testflight",
      });
    });

    it("defines the install-source copy for every supported locale", () => {
      const english = resolveNativeAppUpdateCopy("en");

      for (const locale of PRIMARY_UI_LOCALES) {
        const copy = resolveNativeAppUpdateCopy(locale);
        expect(copy.installSourceLabel, locale).toBeTruthy();
        for (const installSource of NATIVE_APP_INSTALL_SOURCES) {
          expect(copy.installSourceValues[installSource], `${locale} ${installSource}`).toBeTruthy();
        }
        // Store names are brand names and stay English everywhere.
        expect(copy.installSourceValues.app_store).toBe("App Store");
        expect(copy.installSourceValues.testflight).toBe("TestFlight");
        expect(copy.installSourceValues.play_store).toBe("Google Play");
        expect(copy.installSourceValues.local, locale).toContain("(devbox)");
        if (locale !== "en") {
          // Its own translation, not the English fallback.
          expect(copy.installSourceLabel, locale).not.toBe(english.installSourceLabel);
          expect(copy.installSourceValues.other, locale).not.toBe(english.installSourceValues.other);
        }
      }
    });

    it("uses the agreed Korean and English copy", () => {
      expect(resolveNativeAppUpdateCopy("ko").installSourceLabel).toBe("설치 경로");
      expect(resolveNativeAppUpdateCopy("ko").installSourceValues).toEqual({
        app_store: "App Store",
        testflight: "TestFlight",
        play_store: "Google Play",
        local: "로컬 빌드 (devbox)",
        other: "기타 경로",
      });
      expect(resolveNativeAppUpdateCopy("en").installSourceLabel).toBe("Installed from");
      expect(resolveNativeAppUpdateCopy("en").installSourceValues).toEqual({
        app_store: "App Store",
        testflight: "TestFlight",
        play_store: "Google Play",
        local: "Local build (devbox)",
        other: "Other source",
      });
    });

    it("resolves the line text for a known source", () => {
      const copy = resolveNativeAppUpdateCopy("en");
      expect(resolveNativeAppInstallSourceText(copy, "play_store")).toBe("Google Play");
      expect(resolveNativeAppInstallSourceText(copy, "local")).toBe("Local build (devbox)");
    });

    it("hides the line when the source is unknown, whatever the update status is", () => {
      const copy = resolveNativeAppUpdateCopy("ko");
      for (const status of ["checking", "available", "current", "unknown"]) {
        const detail = parseNativeAppUpdateDetail({ ...basePayload, status });
        expect(detail?.status).toBe(status);
        expect(resolveNativeAppInstallSourceText(copy, detail?.installSource)).toBe("");
      }
      expect(resolveNativeAppInstallSourceText(copy, DEFAULT_NATIVE_APP_UPDATE_DETAIL.installSource)).toBe("");
    });
  });
});
