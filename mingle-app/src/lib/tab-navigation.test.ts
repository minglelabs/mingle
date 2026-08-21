import { describe, expect, it } from "vitest";

import {
  buildNativeAwareTabPath,
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
});
