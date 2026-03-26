import { describe, expect, it } from "vitest";
import {
  DEFAULT_NATIVE_APP_UPDATE_DETAIL,
  parseNativeAppUpdateDetail,
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

  it("resolves Korean copy from a regional locale tag", () => {
    expect(resolveNativeAppUpdateCopy("ko-KR").updateButtonLabel).toBe(
      "업데이트"
    );
  });

  it("falls back to English copy for unsupported locales", () => {
    expect(resolveNativeAppUpdateCopy("sv-SE").sectionLabel).toBe("App Update");
  });
});
