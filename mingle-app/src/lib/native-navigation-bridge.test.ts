import { describe, expect, it } from "vitest";

import {
  buildNativeNavigationBridgeScript,
  NATIVE_NAV_INDEX_KEY,
  NATIVE_NAV_RAW_STATE_KEY,
  readNativeNavigationHistoryIndex,
  resolveNativeNavigationCanGoBack,
  resolveNextNativeNavigationHistoryIndex,
  stampNativeNavigationHistoryState,
} from "../../rn/src/nativeNavigationBridge";

describe("native navigation bridge helpers", () => {
  it("stamps mergeable history state with a per-entry index", () => {
    expect(stampNativeNavigationHistoryState({
      foo: "bar",
      [NATIVE_NAV_INDEX_KEY]: 99,
    }, 2)).toEqual({
      foo: "bar",
      [NATIVE_NAV_INDEX_KEY]: 2,
    });
  });

  it("wraps primitive history state without losing the original value", () => {
    expect(stampNativeNavigationHistoryState("search-open", 1)).toEqual({
      [NATIVE_NAV_INDEX_KEY]: 1,
      [NATIVE_NAV_RAW_STATE_KEY]: "search-open",
    });
  });

  it("reads only finite stamped indices and derives canGoBack from the current entry", () => {
    expect(readNativeNavigationHistoryIndex({
      [NATIVE_NAV_INDEX_KEY]: 3.9,
    })).toBe(3);
    expect(readNativeNavigationHistoryIndex({
      [NATIVE_NAV_INDEX_KEY]: Number.NaN,
    })).toBeNull();

    expect(resolveNativeNavigationCanGoBack(0)).toBe(false);
    expect(resolveNativeNavigationCanGoBack(1)).toBe(true);
  });

  it("increments only pushState while replaceState preserves the current index", () => {
    expect(resolveNextNativeNavigationHistoryIndex(0, "pushState")).toBe(1);
    expect(resolveNextNativeNavigationHistoryIndex(4, "replaceState")).toBe(4);
  });

  it("keeps the injected bridge script on the stamped-history semantics", () => {
    const script = buildNativeNavigationBridgeScript();

    expect(script).toContain(NATIVE_NAV_INDEX_KEY);
    expect(script).toContain("canGoBack: currentHistoryIndex > 0");
    expect(script).toContain("wrapHistoryMethod('pushState')");
    expect(script).toContain("wrapHistoryMethod('replaceState')");
  });
});
