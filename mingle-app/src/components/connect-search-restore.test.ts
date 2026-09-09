import { describe, expect, it } from "vitest";
import { resolveConnectSearchRestore } from "@/components/connect-search-restore";

describe("resolveConnectSearchRestore", () => {
  it("skips the initial empty-query effect without consuming the restored query", () => {
    expect(resolveConnectSearchRestore({
      normalizedQuery: "",
      pendingQuery: "mingle",
      skipInitialEffect: true,
    })).toEqual({
      shouldRunSearch: false,
      nextPendingQuery: "mingle",
      nextSkipInitialEffect: false,
      activeQuery: "mingle",
    });
  });

  it("keeps the restore marker through a repeated mount effect", () => {
    const firstPass = resolveConnectSearchRestore({
      normalizedQuery: "",
      pendingQuery: "mingle",
      skipInitialEffect: true,
    });
    const secondPass = resolveConnectSearchRestore({
      normalizedQuery: "",
      pendingQuery: firstPass.nextPendingQuery,
      skipInitialEffect: true,
    });

    expect(secondPass).toEqual(firstPass);
    expect(resolveConnectSearchRestore({
      normalizedQuery: "mingle",
      pendingQuery: secondPass.nextPendingQuery,
      skipInitialEffect: false,
    })).toMatchObject({
      shouldRunSearch: false,
      nextPendingQuery: null,
      activeQuery: "mingle",
    });
  });

  it("preserves restored pages when the restored query state arrives", () => {
    expect(resolveConnectSearchRestore({
      normalizedQuery: "mingle",
      pendingQuery: "mingle",
      skipInitialEffect: false,
    })).toEqual({
      shouldRunSearch: false,
      nextPendingQuery: null,
      nextSkipInitialEffect: false,
      activeQuery: "mingle",
    });
  });

  it("runs a new search when the user changes the restored query", () => {
    expect(resolveConnectSearchRestore({
      normalizedQuery: "friend",
      pendingQuery: "mingle",
      skipInitialEffect: false,
    })).toEqual({
      shouldRunSearch: true,
      nextPendingQuery: null,
      nextSkipInitialEffect: false,
      activeQuery: null,
    });
  });
});
