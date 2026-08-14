import { describe, expect, it } from "vitest";
import { resolveConversationListNativeBannerZone } from "@/lib/native-banner-zone";

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
  });
});
