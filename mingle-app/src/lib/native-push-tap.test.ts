import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  createNativePushTapHandler,
  isSafeRelativeAppPath,
  NATIVE_PUSH_TAP_EVENT,
  NATIVE_PUSH_TAP_WINDOW_KEY,
  parseNativePushTapRequest,
  resolveNativePushTapNavigation,
} from "@/lib/native-push-tap";

const NATIVE_SEARCH = "?apiNamespace=ios%2Fv2.2.0&nativePlatform=ios&nativeClientVersion=2.2.0&nativeUi=1";

function resolve(pathValue: string, supportsPostingFeed = true, search = NATIVE_SEARCH) {
  return resolveNativePushTapNavigation(pathValue, {
    currentSearchParams: new URLSearchParams(search),
    supportsPostingFeed,
  });
}

describe("native push tap contract", () => {
  it("matches the event and window key the RN shell dispatches", () => {
    const rnSource = readFileSync(
      path.join(process.cwd(), "rn/src/pushNavigation.ts"),
      "utf8",
    );
    expect(rnSource).toContain(`NATIVE_PUSH_TAP_EVENT = "${NATIVE_PUSH_TAP_EVENT}"`);
    expect(rnSource).toContain(`NATIVE_PUSH_TAP_WINDOW_KEY = "${NATIVE_PUSH_TAP_WINDOW_KEY}"`);
  });
});

describe("parseNativePushTapRequest", () => {
  it("accepts a same-origin path with its sequence", () => {
    expect(parseNativePushTapRequest({ path: "/ko/feed?postId=p1", sequence: 3 })).toEqual({
      path: "/ko/feed?postId=p1",
      sequence: 3,
    });
    expect(parseNativePushTapRequest({ path: "/ko/feed" })).toEqual({ path: "/ko/feed", sequence: 0 });
  });

  it("rejects non-objects and unsafe paths", () => {
    expect(parseNativePushTapRequest(null)).toBeNull();
    expect(parseNativePushTapRequest("/ko/feed")).toBeNull();
    expect(parseNativePushTapRequest({ path: "https://evil.example.com/ko/feed" })).toBeNull();
    expect(parseNativePushTapRequest({ path: "//evil.example.com" })).toBeNull();
    expect(parseNativePushTapRequest({ path: "javascript:alert(1)" })).toBeNull();
    expect(parseNativePushTapRequest({ path: "/ko/../../x" })).toBeNull();
    expect(parseNativePushTapRequest({ path: "/\\evil.example.com" })).toBeNull();
    expect(isSafeRelativeAppPath("/ko/feed\n")).toBe(false);
  });
});

describe("resolveNativePushTapNavigation", () => {
  it("opens a conversation room on top of the list and keeps the native shell query", () => {
    const navigation = resolve("/ko/conversations?conversation=chan_1");
    expect(navigation?.kind).toBe("conversation");
    if (navigation?.kind !== "conversation") return;
    expect(navigation.conversationId).toBe("chan_1");
    const listUrl = new URL(navigation.conversationListHref, "https://x.invalid");
    expect(listUrl.pathname).toBe("/ko/conversations");
    expect(listUrl.searchParams.get("apiNamespace")).toBe("ios/v2.2.0");
    expect(listUrl.searchParams.get("nativeUi")).toBe("1");
    expect(listUrl.searchParams.get("nativeTabRoot")).toBe("1");
    expect(listUrl.searchParams.has("conversation")).toBe(false);
  });

  it("opens conversation rooms even for pre-posting clients", () => {
    expect(resolve("/ko/conversations?conversation=chan_1", false)?.kind).toBe("conversation");
  });

  it("rejects a malformed room id", () => {
    expect(resolve("/ko/conversations?conversation=has%20space")).toBeNull();
  });

  it("opens the post and its comment sheet with the native query preserved", () => {
    const navigation = resolve("/ko/feed?postId=p1&commentId=c9");
    expect(navigation?.kind).toBe("route");
    if (navigation?.kind !== "route") return;
    const url = new URL(navigation.href, "https://x.invalid");
    expect(url.pathname).toBe("/ko/feed");
    expect(url.searchParams.get("postId")).toBe("p1");
    expect(url.searchParams.get("commentId")).toBe("c9");
    expect(url.searchParams.get("apiNamespace")).toBe("ios/v2.2.0");
    expect(url.searchParams.get("nativePlatform")).toBe("ios");
  });

  it("sends a pre-posting client to the conversation list instead of a posting route", () => {
    for (const target of ["/ko/feed?postId=p1&commentId=c9", "/ko/posts/viewer?postId=p1", "/ko/notifications", "/ko/mypage/posts/trash"]) {
      const navigation = resolve(target, false);
      expect(navigation?.kind).toBe("route");
      if (navigation?.kind !== "route") continue;
      const url = new URL(navigation.href, "https://x.invalid");
      expect(url.pathname).toBe("/ko/conversations");
      expect(url.searchParams.has("postId")).toBe(false);
    }
  });

  it("opens a follower profile route with the native query preserved", () => {
    const navigation = resolve("/en/users/u_42", false);
    expect(navigation?.kind).toBe("route");
    if (navigation?.kind !== "route") return;
    const url = new URL(navigation.href, "https://x.invalid");
    expect(url.pathname).toBe("/en/users/u_42");
    expect(url.searchParams.get("apiNamespace")).toBe("ios/v2.2.0");
  });

  it("rejects paths without a supported locale", () => {
    expect(resolve("/feed?postId=p1")).toBeNull();
    expect(resolve("/zz/feed?postId=p1")).toBeNull();
  });

  it("works for a plain web page without native query", () => {
    const navigation = resolve("/ko/feed?postId=p1", true, "");
    expect(navigation).toEqual({ kind: "route", href: "/ko/feed?postId=p1" });
  });
});

describe("createNativePushTapHandler", () => {
  function setup(supportsPostingFeed = true) {
    const deps = {
      readCurrentSearch: () => "",
      supportsPostingFeed: () => supportsPostingFeed,
      clearPendingRequest: vi.fn(),
      pushRoute: vi.fn(),
      openConversation: vi.fn(),
    };
    return { deps, handle: createNativePushTapHandler(deps) };
  }

  it("routes a feed tap and clears the pending slot", () => {
    const { deps, handle } = setup();
    handle({ path: "/ko/feed?postId=p1&commentId=c9", sequence: 1 });
    expect(deps.clearPendingRequest).toHaveBeenCalledTimes(1);
    expect(deps.pushRoute).toHaveBeenCalledWith("/ko/feed?postId=p1&commentId=c9");
    expect(deps.openConversation).not.toHaveBeenCalled();
  });

  it("routes a message tap into the conversation room", () => {
    const { deps, handle } = setup();
    handle({ path: "/ja/conversations?conversation=chan_9", sequence: 1 });
    expect(deps.openConversation).toHaveBeenCalledWith(
      expect.stringMatching(/^\/ja\/conversations\?/),
      "chan_9",
    );
    expect(deps.pushRoute).not.toHaveBeenCalled();
  });

  it("routes the same request once when it arrives via event and window slot", () => {
    const { deps, handle } = setup();
    const request = { path: "/ko/feed?postId=p1", sequence: 4 };
    handle(request);
    handle(request);
    expect(deps.pushRoute).toHaveBeenCalledTimes(1);
    handle({ path: "/ko/feed?postId=p2", sequence: 5 });
    expect(deps.pushRoute).toHaveBeenCalledTimes(2);
  });

  it("ignores unsafe requests but still clears the slot", () => {
    const { deps, handle } = setup();
    handle({ path: "https://evil.example.com/ko/feed", sequence: 1 });
    expect(deps.clearPendingRequest).toHaveBeenCalledTimes(1);
    expect(deps.pushRoute).not.toHaveBeenCalled();
    expect(deps.openConversation).not.toHaveBeenCalled();
  });

  it("gates posting destinations for a pre-posting client", () => {
    const { deps, handle } = setup(false);
    handle({ path: "/ko/feed?postId=p1", sequence: 1 });
    expect(deps.pushRoute).toHaveBeenCalledWith("/ko/conversations?nativeTabRoot=1");
  });
});
