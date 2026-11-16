import { describe, expect, it } from "vitest";

import {
  buildNativeAwareTabPath,
  clearTopLevelTabSwitch,
  isNativeTabRootHref,
  isNativeTabRootSearch,
  isTopLevelTabSwitchPending,
  markTopLevelTabSwitch,
  NATIVE_SKIP_CONVERSATION_RESTORE_QUERY_KEY,
  NATIVE_TAB_ROOT_QUERY_KEY,
} from "@/lib/tab-navigation";

describe("tab navigation", () => {
  it("builds a tab-root URL without carrying a conversation route", () => {
    const searchParams = new URLSearchParams(
      "nativeUi=1&nativeStt=1&conversation=conv-1&nativeSkipConversationRestore=1",
    );

    expect(buildNativeAwareTabPath("/ko/mypage", searchParams, { tabRoot: true })).toBe(
      `/ko/mypage?nativeStt=1&nativeUi=1&${NATIVE_TAB_ROOT_QUERY_KEY}=1`,
    );
  });

  it("marks the conversations tab as an explicit list restore target", () => {
    const searchParams = new URLSearchParams("nativeUi=1&nativeStt=1");

    const nextPath = buildNativeAwareTabPath("/ko/conversations", searchParams, {
      skipConversationRestore: true,
      tabRoot: true,
    });
    const nextUrl = new URL(nextPath, "https://mingle.example");

    expect(nextUrl.searchParams.get(NATIVE_SKIP_CONVERSATION_RESTORE_QUERY_KEY)).toBe("1");
    expect(nextUrl.searchParams.get(NATIVE_TAB_ROOT_QUERY_KEY)).toBe("1");
    expect(nextUrl.searchParams.get("conversation")).toBeNull();
  });

  it("preserves the active conversation for a nested profile route", () => {
    const searchParams = new URLSearchParams(
      "nativeUi=1&nativeStt=1&conversation=conv-1",
    );

    const nextPath = buildNativeAwareTabPath("/ko/users/user-1", searchParams, {
      preserveConversation: true,
    });
    const nextUrl = new URL(nextPath, "https://mingle.example");

    expect(nextUrl.searchParams.get("conversation")).toBe("conv-1");
    expect(nextUrl.searchParams.get("nativeUi")).toBe("1");
    expect(nextUrl.searchParams.get("nativeStt")).toBe("1");
  });

  it("treats native tab-bar URLs as tab roots", () => {
    const searchParams = new URLSearchParams("nativeUi=1&nativeStt=1");

    expect(isNativeTabRootHref(
      buildNativeAwareTabPath("/ko/mypage", searchParams, { tabRoot: true }),
    )).toBe(true);
    expect(isNativeTabRootHref(
      buildNativeAwareTabPath("/ko/conversations", searchParams, {
        skipConversationRestore: true,
        tabRoot: true,
      }),
    )).toBe(true);
  });

  it("does not treat web or in-room URLs as native tab roots", () => {
    // A browser tab bar builds the same tab-root marker without the native UI flag.
    expect(isNativeTabRootHref(
      buildNativeAwareTabPath("/ko/mypage", new URLSearchParams(""), { tabRoot: true }),
    )).toBe(false);
    expect(isNativeTabRootHref("/ko/mypage")).toBe(false);
    expect(isNativeTabRootHref("/ko/conversations?nativeUi=1")).toBe(false);

    const inRoom = new URLSearchParams("nativeUi=1&nativeTabRoot=1&conversation=conv-1");
    expect(isNativeTabRootSearch((key) => inRoom.get(key))).toBe(false);
  });

  describe("top-level tab switch marker", () => {
    it("is pending right after a tab switch so the room unmount keeps native STT", () => {
      clearTopLevelTabSwitch();
      expect(isTopLevelTabSwitchPending(1_000)).toBe(false);

      markTopLevelTabSwitch(1_000);
      expect(isTopLevelTabSwitchPending(1_500)).toBe(true);
    });

    it("expires, so a later room unmount stops native STT again", () => {
      markTopLevelTabSwitch(1_000);
      expect(isTopLevelTabSwitchPending(31_000)).toBe(false);
    });

    it("is cleared when the conversation list mounts again", () => {
      markTopLevelTabSwitch(1_000);
      clearTopLevelTabSwitch();
      expect(isTopLevelTabSwitchPending(1_500)).toBe(false);
    });
  });
});
