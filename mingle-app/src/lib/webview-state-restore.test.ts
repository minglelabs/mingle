import { describe, expect, it, vi } from "vitest";
import {
  WEBVIEW_STATE_RESTORE_TTL_MS,
  applySavedScrollPosition,
  isScrolledToEnd,
  parseWebViewStateSnapshot,
  resolveWebViewStateScreenKey,
  shouldRestoreScrollPosition,
} from "./webview-state-restore";

type FakeContainer = HTMLElement & { scrollTop: number };

function createContainer(params: {
  scrollTop?: number;
  scrollHeight: number;
  clientHeight: number;
  anchorAttribute?: string;
  items?: Record<string, number>;
}): FakeContainer {
  const container = {
    scrollTop: params.scrollTop ?? 0,
    scrollHeight: params.scrollHeight,
    clientHeight: params.clientHeight,
    dispatchEvent: vi.fn(),
    getAttribute: (name: string) => (name === "data-restore-anchor" ? params.anchorAttribute ?? null : null),
    getBoundingClientRect: () => ({ top: 100 }),
    querySelector: (selector: string) => {
      const match = /="(.*)"\]$/.exec(selector);
      const offset = match ? params.items?.[match[1]] : undefined;
      if (offset === undefined) return null;
      // Items sit at a fixed content offset; their viewport top moves with scrollTop.
      return { getBoundingClientRect: () => ({ top: 100 + offset - container.scrollTop }) };
    },
  };
  return container as unknown as FakeContainer;
}

describe("webview state restore", () => {
  it("keys screens by path and page-owned params only", () => {
    expect(resolveWebViewStateScreenKey(
      "https://mingle.example/ko/conversations?nativeUi=1&conversation=c1&nativeListTopInsetPx=50",
    )).toBe("/ko/conversations?conversation=c1");
    expect(resolveWebViewStateScreenKey("https://mingle.example/ko/mypage/?nativeTabRoot=1"))
      .toBe("/ko/mypage");
    expect(resolveWebViewStateScreenKey("not a url")).toBe("");
  });

  it("only accepts a fresh snapshot of the same account and screen", () => {
    const raw = JSON.stringify({
      version: 1,
      savedAtMs: 1000,
      accountKey: "user_1",
      screenKey: "/ko/connect",
      scroll: { "connect-results": { top: 640, atEnd: false }, broken: { top: -1 } },
    });
    const expected = { nowMs: 2000, accountKey: "user_1", screenKey: "/ko/connect" };

    expect(parseWebViewStateSnapshot(raw, expected)?.scroll).toEqual({
      "connect-results": { top: 640, atEnd: false },
    });
    expect(parseWebViewStateSnapshot(raw, { ...expected, accountKey: "user_2" })).toBeNull();
    expect(parseWebViewStateSnapshot(raw, { ...expected, accountKey: "" })).toBeNull();
    expect(parseWebViewStateSnapshot(raw, { ...expected, screenKey: "/ko/mypage" })).toBeNull();
    expect(parseWebViewStateSnapshot(raw, { ...expected, nowMs: 1001 + WEBVIEW_STATE_RESTORE_TTL_MS })).toBeNull();
    expect(parseWebViewStateSnapshot("{", expected)).toBeNull();
  });

  it("leaves positions the screen opens at anyway", () => {
    expect(shouldRestoreScrollPosition({ top: 0, atEnd: false }, false)).toBe(false);
    expect(shouldRestoreScrollPosition({ top: 300, atEnd: false }, false)).toBe(true);
    expect(shouldRestoreScrollPosition({ top: 900, atEnd: true }, true)).toBe(false);
    expect(shouldRestoreScrollPosition({ top: 200, atEnd: false }, true)).toBe(true);
    expect(isScrolledToEnd({ scrollTop: 980, scrollHeight: 1600, clientHeight: 600 })).toBe(true);
    expect(isScrolledToEnd({ scrollTop: 900, scrollHeight: 1600, clientHeight: 600 })).toBe(false);
  });

  it("restores an offset once enough content has loaded", () => {
    const container = createContainer({ scrollHeight: 900, clientHeight: 600 });
    expect(applySavedScrollPosition(container, { top: 1200, atEnd: false })).toBe("pending");
    // Pushes to the end so the list fetches its next page.
    expect(container.scrollTop).toBe(300);

    Object.assign(container, { scrollHeight: 2400 });
    expect(applySavedScrollPosition(container, { top: 1200, atEnd: false })).toBe("applied");
    expect(container.scrollTop).toBe(1200);
  });

  it("restores an anchored list relative to its first visible item", () => {
    vi.stubGlobal("CSS", { escape: (value: string) => value });
    const container = createContainer({
      scrollTop: 2000,
      scrollHeight: 3000,
      clientHeight: 600,
      anchorAttribute: "data-utterance-id",
      items: { u_42: 1500 },
    });

    expect(applySavedScrollPosition(container, { top: 0, atEnd: false, anchorId: "u_42", anchorOffset: -20 }))
      .toBe("applied");
    expect(container.scrollTop).toBe(1520);
    expect(applySavedScrollPosition(container, { top: 0, atEnd: false, anchorId: "u_missing", anchorOffset: 0 }))
      .toBe("pending");
    expect(applySavedScrollPosition(container, { top: 400, atEnd: false })).toBe("skip");
    vi.unstubAllGlobals();
  });
});
