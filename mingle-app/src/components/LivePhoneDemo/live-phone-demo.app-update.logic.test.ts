import { describe, expect, it } from "vitest";
import {
  DEFAULT_NATIVE_APP_UPDATE_DETAIL,
  parseNativeAppUpdateDetail,
  readRequestedApiNamespaceFromSearch,
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
        apiNamespace: "android/v1.0.8",
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
});
