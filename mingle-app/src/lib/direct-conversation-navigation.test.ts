import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  type DirectConversationNavigationRouter,
  replaceWithConversationListThenPush,
} from "@/lib/direct-conversation-navigation";

describe("replaceWithConversationListThenPush", () => {
  let router: DirectConversationNavigationRouter & { replace: ReturnType<typeof vi.fn>; push: ReturnType<typeof vi.fn> };
  let replaceState: ReturnType<typeof vi.fn>;
  let historyState: unknown;

  beforeEach(() => {
    router = { replace: vi.fn(), push: vi.fn() };
    historyState = { unrelated: "preserved" };
    replaceState = vi.fn((state: unknown) => {
      historyState = state;
    });
    vi.stubGlobal("window", {
      location: { href: "http://example.com/pt/users/some-profile" },
      history: {
        get state() {
          return historyState;
        },
        replaceState,
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("never calls router.replace — the list entry is rewritten silently instead", () => {
    replaceWithConversationListThenPush(
      router,
      "/pt/conversations?nativeTabRoot=1&nativeSkipConversationRestore=1",
      "conversation-1",
    );

    expect(router.replace).not.toHaveBeenCalled();
  });

  it("rewrites the current history entry to the list URL, preserving history.state and dropping the conversation param", () => {
    replaceWithConversationListThenPush(
      router,
      "/pt/conversations?nativeTabRoot=1&conversation=stale-id",
      "conversation-1",
    );

    expect(replaceState).toHaveBeenCalledTimes(1);
    const [statePassed, , hrefPassed] = replaceState.mock.calls[0];
    expect(statePassed).toBe(historyState);
    expect(hrefPassed).toBe("/pt/conversations?nativeTabRoot=1");
  });

  it("pushes the room URL with the new conversation id and without native tab-root/restore markers", () => {
    replaceWithConversationListThenPush(
      router,
      "/pt/conversations?nativeTabRoot=1&nativeSkipConversationRestore=1",
      "conversation-1",
    );

    expect(router.push).toHaveBeenCalledTimes(1);
    const [hrefPushed] = router.push.mock.calls[0];
    const pushedUrl = new URL(hrefPushed, "http://example.com");
    expect(pushedUrl.searchParams.get("conversation")).toBe("conversation-1");
    expect(pushedUrl.searchParams.has("nativeTabRoot")).toBe(false);
    expect(pushedUrl.searchParams.has("nativeSkipConversationRestore")).toBe(false);
  });

  it("does nothing when window is unavailable (SSR guard)", () => {
    vi.unstubAllGlobals();
    replaceWithConversationListThenPush(router, "/pt/conversations", "conversation-1");
    expect(router.push).not.toHaveBeenCalled();
    expect(router.replace).not.toHaveBeenCalled();
  });
});
