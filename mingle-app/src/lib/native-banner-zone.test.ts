import { describe, expect, it } from "vitest";
import {
  resolveConversationListNativeBannerZone,
  shouldReassertNativeAuthBannerZone,
} from "@/lib/native-banner-zone";

describe("resolveConversationListNativeBannerZone", () => {
  it("hides the native banner while the authentication gate is visible", () => {
    expect(resolveConversationListNativeBannerZone({
      isAuthenticated: false,
      hasActiveConversation: false,
      isSearchOpen: false,
    })).toBe("hidden");
  });

  it("restores the list banner after authentication succeeds", () => {
    expect(resolveConversationListNativeBannerZone({
      isAuthenticated: true,
      hasActiveConversation: false,
      isSearchOpen: false,
    })).toBe("list");
  });

  it("keeps overlays and conversation rooms banner-free", () => {
    expect(resolveConversationListNativeBannerZone({
      isAuthenticated: true,
      hasActiveConversation: true,
      isSearchOpen: false,
    })).toBe("hidden");
    expect(resolveConversationListNativeBannerZone({
      isAuthenticated: true,
      hasActiveConversation: false,
      isSearchOpen: true,
    })).toBe("hidden");
    expect(resolveConversationListNativeBannerZone({
      isAuthenticated: true,
      hasActiveConversation: false,
      isSearchOpen: false,
      isListOverlayOpen: true,
    })).toBe("hidden");
  });

  it("reasserts authentication hiding only for native clients before build 68", () => {
    expect(shouldReassertNativeAuthBannerZone("67")).toBe(true);
    expect(shouldReassertNativeAuthBannerZone(null)).toBe(true);
    expect(shouldReassertNativeAuthBannerZone("68")).toBe(false);
    expect(shouldReassertNativeAuthBannerZone("69")).toBe(false);
  });
});
