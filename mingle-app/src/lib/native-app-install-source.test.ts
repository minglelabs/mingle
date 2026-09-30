import { describe, expect, it } from "vitest";
import {
  NATIVE_APP_INSTALL_SOURCES,
  normalizeInstallSource,
} from "./native-app-install-source";

describe("native-app-install-source", () => {
  it("pins the exact install-source list shared with the RN shell", () => {
    expect([...NATIVE_APP_INSTALL_SOURCES]).toEqual([
      "app_store",
      "testflight",
      "play_store",
      "local",
      "other",
    ]);
  });

  it("accepts every known value, tolerating whitespace and case", () => {
    for (const source of NATIVE_APP_INSTALL_SOURCES) {
      expect(normalizeInstallSource(source)).toBe(source);
    }
    expect(normalizeInstallSource(" TestFlight ")).toBe("testflight");
    expect(normalizeInstallSource("PLAY_STORE")).toBe("play_store");
  });

  it("treats unknown values as unknown", () => {
    expect(normalizeInstallSource("appstore")).toBeUndefined();
    expect(normalizeInstallSource("com.android.vending")).toBeUndefined();
    expect(normalizeInstallSource("devbox")).toBeUndefined();
    expect(normalizeInstallSource("")).toBeUndefined();
    expect(normalizeInstallSource("   ")).toBeUndefined();
  });

  it("treats missing and non-string values as unknown", () => {
    expect(normalizeInstallSource(undefined)).toBeUndefined();
    expect(normalizeInstallSource(null)).toBeUndefined();
    expect(normalizeInstallSource(1)).toBeUndefined();
    expect(normalizeInstallSource(true)).toBeUndefined();
    expect(normalizeInstallSource({ installSource: "local" })).toBeUndefined();
    expect(normalizeInstallSource(["local"])).toBeUndefined();
  });
});
