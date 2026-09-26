import { describe, expect, it } from "vitest";
import {
  resolveResultsRetention,
  shouldApplyResponse,
  shouldDispatchSearch,
  SEARCH_DEBOUNCE_MS,
} from "./unified-search-logic";

describe("shouldDispatchSearch", () => {
  it("fires from one character when not composing", () => {
    expect(shouldDispatchSearch({ query: "a", isComposing: false })).toBe(true);
  });
  it("never fires while composing Hangul", () => {
    expect(shouldDispatchSearch({ query: "ㅁ", isComposing: true })).toBe(false);
  });
  it("does not fire on a blank query", () => {
    expect(shouldDispatchSearch({ query: "   ", isComposing: false })).toBe(false);
  });
  it("uses a 300ms debounce", () => {
    expect(SEARCH_DEBOUNCE_MS).toBe(300);
  });
});

describe("shouldApplyResponse", () => {
  it("applies only the latest sequence for the active query", () => {
    expect(shouldApplyResponse({ responseSequence: 5, latestSequence: 5, responseQuery: "mina", activeQuery: "mina" })).toBe(true);
  });
  it("drops a stale (earlier-sequence) response", () => {
    expect(shouldApplyResponse({ responseSequence: 4, latestSequence: 5, responseQuery: "mina", activeQuery: "mina" })).toBe(false);
  });
  it("drops a response whose query no longer matches", () => {
    expect(shouldApplyResponse({ responseSequence: 5, latestSequence: 5, responseQuery: "min", activeQuery: "mina" })).toBe(false);
  });
});

describe("resolveResultsRetention", () => {
  it("keeps existing results with a small inline loader", () => {
    expect(resolveResultsRetention({ currentResultsQuery: "min", pendingQuery: "mina", hasCurrentResults: true }))
      .toEqual({ keepCurrentResults: true, showInlineLoading: true, clearResults: false });
  });
  it("empties the area (no skeleton) when there are no current results", () => {
    expect(resolveResultsRetention({ currentResultsQuery: "", pendingQuery: "mina", hasCurrentResults: false }))
      .toEqual({ keepCurrentResults: false, showInlineLoading: true, clearResults: true });
  });
});
