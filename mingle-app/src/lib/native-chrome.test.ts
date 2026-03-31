import { describe, expect, it } from "vitest";
import {
  resolveForcedNativeBannerPositionForUrl,
  shouldRequireNativeBannerSceneForUrl,
  shouldHideNativeBannerForUrl,
} from "../../rn/src/nativeChrome";

describe("shouldHideNativeBannerForUrl", () => {
  it("hides the native banner on non-banner routes", () => {
    expect(shouldHideNativeBannerForUrl("https://mingle.local/")).toBe(true);
    expect(shouldHideNativeBannerForUrl("https://mingle.local/ko")).toBe(true);
    expect(shouldHideNativeBannerForUrl("https://mingle.local/ko/auth/native")).toBe(true);
    expect(shouldHideNativeBannerForUrl("https://mingle.local/auth/signin")).toBe(true);
    expect(shouldHideNativeBannerForUrl("https://mingle.local/ko/account")).toBe(true);
  });

  it("keeps the native banner on translator and bottom-tab routes", () => {
    expect(shouldHideNativeBannerForUrl("https://mingle.local/ko/translator")).toBe(false);
    expect(shouldHideNativeBannerForUrl("https://mingle.local/ko/conversations")).toBe(false);
    expect(shouldHideNativeBannerForUrl("https://mingle.local/ko/conversations?conversation=abc123")).toBe(false);
    expect(shouldHideNativeBannerForUrl("https://mingle.local/ko/mypage")).toBe(false);
  });
});

describe("resolveForcedNativeBannerPositionForUrl", () => {
  it("forces the bottom position on bottom-tab routes only", () => {
    expect(resolveForcedNativeBannerPositionForUrl("https://mingle.local/ko/conversations")).toBe("bottom");
    expect(resolveForcedNativeBannerPositionForUrl("https://mingle.local/ko/conversations?conversation=abc123")).toBeNull();
    expect(resolveForcedNativeBannerPositionForUrl("https://mingle.local/ko/mypage")).toBe("bottom");
    expect(resolveForcedNativeBannerPositionForUrl("https://mingle.local/ko/translator")).toBeNull();
    expect(resolveForcedNativeBannerPositionForUrl("https://mingle.local/ko/auth/native")).toBeNull();
  });
});

describe("shouldRequireNativeBannerSceneForUrl", () => {
  it("requires scene-driven banner control for bottom-tab and conversation overlay routes", () => {
    expect(shouldRequireNativeBannerSceneForUrl("https://mingle.local/ko/conversations")).toBe(true);
    expect(shouldRequireNativeBannerSceneForUrl("https://mingle.local/ko/conversations?conversation=abc123")).toBe(true);
    expect(shouldRequireNativeBannerSceneForUrl("https://mingle.local/ko/mypage")).toBe(true);
  });

  it("does not require scene-driven banner control on unrelated routes", () => {
    expect(shouldRequireNativeBannerSceneForUrl("https://mingle.local/ko/translator")).toBe(false);
    expect(shouldRequireNativeBannerSceneForUrl("https://mingle.local/ko/auth/native")).toBe(false);
    expect(shouldRequireNativeBannerSceneForUrl("https://mingle.local/")).toBe(false);
  });
});
