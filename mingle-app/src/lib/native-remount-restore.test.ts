import { describe, expect, it } from "vitest";

import { buildNativeRemountRestoreUrl } from "./native-remount-restore";

describe("native remount restore helpers", () => {
  it("adds the active conversation id to remount URLs", () => {
    expect(buildNativeRemountRestoreUrl(
      "https://mingle-app-devbox.photo-for-passport.com/en/conversations?nativeStt=1&qa=1",
      "conv_123",
    )).toBe(
      "https://mingle-app-devbox.photo-for-passport.com/en/conversations?nativeStt=1&qa=1&conversation=conv_123",
    );
  });

  it("replaces stale conversation ids on remount URLs", () => {
    expect(buildNativeRemountRestoreUrl(
      "https://mingle-app-devbox.photo-for-passport.com/en/conversations?conversation=old&nativeStt=1",
      "new",
    )).toBe(
      "https://mingle-app-devbox.photo-for-passport.com/en/conversations?conversation=new&nativeStt=1",
    );
  });

  it("leaves invalid or unscoped URLs unchanged", () => {
    expect(buildNativeRemountRestoreUrl("", "conv_123")).toBe("");
    expect(buildNativeRemountRestoreUrl("not a url", "conv_123")).toBe("not a url");
    expect(buildNativeRemountRestoreUrl(
      "https://mingle-app-devbox.photo-for-passport.com/en/conversations?nativeStt=1",
      "",
    )).toBe("https://mingle-app-devbox.photo-for-passport.com/en/conversations?nativeStt=1");
  });
});
