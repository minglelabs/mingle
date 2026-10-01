import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  isNativeBannerAllowedPathname,
  requestNativeBannerZone,
  resetNativeBannerZoneStateForTests,
  resolveConversationListNativeBannerZone,
  resolveEffectiveNativeBannerZone,
  shouldReassertNativeAuthBannerZone,
  suppressNativeBanner,
  syncNativeBannerZone,
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

describe("isNativeBannerAllowedPathname", () => {
  it("allows only the conversation list route", () => {
    expect(isNativeBannerAllowedPathname("/ko/conversations")).toBe(true);
    expect(isNativeBannerAllowedPathname("/en/conversations/")).toBe(true);
  });

  it("keeps every other screen banner-free by default", () => {
    for (const pathname of [
      "",
      "/",
      "/ko",
      "/ko/mypage",
      "/ko/mypage/share",
      "/ko/notifications",
      "/ko/connect",
      "/ko/translator",
      "/ko/users/user-1",
      "/ko/auth/signin",
      "/ko/conversations/new-group",
      "/ko/conversations/add-members",
      "/s/share-token",
      "/ko/some-screen-added-later",
    ]) {
      expect(isNativeBannerAllowedPathname(pathname), pathname).toBe(false);
    }
  });
});

describe("resolveEffectiveNativeBannerZone", () => {
  it("passes the requested zone through only on the conversation route with no overlay open", () => {
    expect(resolveEffectiveNativeBannerZone({
      requestedZone: "list",
      pathname: "/ko/conversations",
      suppressionCount: 0,
    })).toBe("list");
    expect(resolveEffectiveNativeBannerZone({
      requestedZone: "conversation",
      pathname: "/ko/conversations",
      suppressionCount: 0,
    })).toBe("conversation");
  });

  it("hides the banner while any overlay holds a suppression", () => {
    expect(resolveEffectiveNativeBannerZone({
      requestedZone: "conversation",
      pathname: "/ko/conversations",
      suppressionCount: 1,
    })).toBe("hidden");
  });

  it("ignores a list or conversation request made from any other route", () => {
    expect(resolveEffectiveNativeBannerZone({
      requestedZone: "list",
      pathname: "/ko/mypage",
      suppressionCount: 0,
    })).toBe("hidden");
    expect(resolveEffectiveNativeBannerZone({
      requestedZone: "conversation",
      pathname: "/ko/conversations/new-group",
      suppressionCount: 0,
    })).toBe("hidden");
  });
});

describe("native banner zone arbiter", () => {
  const postMessage = vi.fn<(message: string) => void>();
  const location = { pathname: "/ko/conversations" };

  function postedZones(): string[] {
    return postMessage.mock.calls.map(([message]) => {
      const command = JSON.parse(message) as { type: string; payload: { zone: string } };
      expect(command.type).toBe("native_set_banner_zone");
      return command.payload.zone;
    });
  }

  beforeEach(() => {
    postMessage.mockClear();
    location.pathname = "/ko/conversations";
    resetNativeBannerZoneStateForTests();
    vi.stubGlobal("window", { location, ReactNativeWebView: { postMessage } });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows the zone a surface requests", () => {
    requestNativeBannerZone("list");
    requestNativeBannerZone("hidden");
    requestNativeBannerZone("conversation");

    expect(postedZones()).toEqual(["list", "hidden", "conversation"]);
  });

  it("hides the banner for an overlay and restores the requested zone on release", () => {
    requestNativeBannerZone("conversation");
    const release = suppressNativeBanner();
    release();

    expect(postedZones()).toEqual(["conversation", "hidden", "conversation"]);
  });

  it("restores the room zone, not the list zone, when an overlay closes over a room", () => {
    requestNativeBannerZone("list");
    requestNativeBannerZone("conversation");
    const release = suppressNativeBanner();
    postMessage.mockClear();

    release();

    expect(postedZones()).toEqual(["conversation"]);
  });

  it("keeps the banner hidden until every stacked overlay is released", () => {
    requestNativeBannerZone("conversation");
    const releaseViewer = suppressNativeBanner();
    const releaseSheet = suppressNativeBanner();
    postMessage.mockClear();

    releaseViewer();
    releaseViewer();
    expect(postedZones()).toEqual(["hidden"]);

    postMessage.mockClear();
    releaseSheet();
    expect(postedZones()).toEqual(["conversation"]);
  });

  it("keeps the banner hidden when a surface asks for it during an overlay", () => {
    const release = suppressNativeBanner();
    requestNativeBannerZone("list");
    release();

    expect(postedZones()).toEqual(["hidden", "hidden", "list"]);
  });

  it("hides on a non-conversation route and restores the request when returning", () => {
    requestNativeBannerZone("list");
    location.pathname = "/ko/mypage";
    syncNativeBannerZone();
    location.pathname = "/ko/conversations";
    syncNativeBannerZone();

    expect(postedZones()).toEqual(["list", "hidden", "list"]);
  });

  it("starts hidden before any surface has requested a zone", () => {
    syncNativeBannerZone();

    expect(postedZones()).toEqual(["hidden"]);
  });

  it("does nothing outside the native app", () => {
    vi.stubGlobal("window", { location });

    expect(() => requestNativeBannerZone("list")).not.toThrow();
    expect(postMessage).not.toHaveBeenCalled();
  });
});
