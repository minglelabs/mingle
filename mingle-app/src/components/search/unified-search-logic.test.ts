import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createRecentSearchRecorder,
  createSearchInputController,
  shouldShowNoResults,
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

describe("createSearchInputController (people + posts share one dispatch)", () => {
  function setup() {
    vi.useFakeTimers();
    const dispatched: string[] = [];
    const controller = createSearchInputController({ onDispatch: (q) => dispatched.push(q) });
    return { controller, dispatched };
  }
  afterEach(() => {
    vi.useRealTimers();
  });

  it("debounces typing by 300ms and dispatches only the last value", () => {
    const { controller, dispatched } = setup();
    controller.setValue("m");
    controller.setValue("mi");
    vi.advanceTimersByTime(299);
    expect(dispatched).toEqual([]);
    controller.setValue("min");
    vi.advanceTimersByTime(300);
    expect(dispatched).toEqual(["min"]);
  });

  it("never dispatches while composing Hangul, even after the debounce", () => {
    const { controller, dispatched } = setup();
    controller.compositionStart();
    controller.setValue("ㅁ");
    controller.setValue("미");
    controller.setValue("민");
    vi.advanceTimersByTime(2000);
    expect(dispatched).toEqual([]);
  });

  it("dispatches after compositionend even when the committed value equals the last input", () => {
    const { controller, dispatched } = setup();
    controller.compositionStart();
    controller.setValue("민지");
    // compositionend with the SAME value (React would not re-render for it).
    controller.compositionEnd("민지");
    vi.advanceTimersByTime(300);
    expect(dispatched).toEqual(["민지"]);
  });

  it("does not re-dispatch a value that was already searched", () => {
    const { controller, dispatched } = setup();
    controller.setValue("mina");
    vi.advanceTimersByTime(300);
    controller.compositionStart();
    controller.compositionEnd("mina");
    vi.advanceTimersByTime(300);
    expect(dispatched).toEqual(["mina"]);
  });

  it("clears immediately and submits without waiting", () => {
    const { controller, dispatched } = setup();
    controller.setValue("mina");
    controller.flush();
    expect(dispatched).toEqual(["mina"]);
    controller.setValue("");
    expect(dispatched).toEqual(["mina", ""]);
  });

  it("a primed (restored) query is not searched again", () => {
    const { controller, dispatched } = setup();
    controller.prime("mina");
    controller.setValue("mina");
    vi.advanceTimersByTime(300);
    expect(dispatched).toEqual([]);
  });
});

describe("createRecentSearchRecorder", () => {
  function setup(enabled = true) {
    const recorded: string[] = [];
    const recorder = createRecentSearchRecorder({ enabled: () => enabled, record: (q) => recorded.push(q) });
    return { recorder, recorded };
  }

  it("does not record intermediate debounced queries", () => {
    const { recorder, recorded } = setup();
    recorder.setShownResults("m", true);
    recorder.setShownResults("mi", true);
    recorder.setShownResults("mina", true);
    expect(recorded).toEqual([]);
  });

  it("records on result tap / submit, once per term", () => {
    const { recorder, recorded } = setup();
    recorder.commit(" mina ");
    recorder.commit("mina");
    expect(recorded).toEqual(["mina"]);
  });

  it("records on leave only when results are shown", () => {
    const { recorder, recorded } = setup();
    recorder.setShownResults("zzz", false);
    recorder.commitOnLeave();
    expect(recorded).toEqual([]);
    recorder.setShownResults("mina", true);
    recorder.commitOnLeave();
    expect(recorded).toEqual(["mina"]);
  });

  it("records nothing when recent searches are unavailable", () => {
    const { recorder, recorded } = setup(false);
    recorder.commit("mina");
    expect(recorded).toEqual([]);
  });
});

describe("shouldShowNoResults", () => {
  const base = { query: "mina", dispatchedQuery: "mina", peopleSettledQuery: "mina", peopleCount: 0, postsSettledEmpty: true };
  it("shows when people are empty and the post search failed/empty", () => {
    expect(shouldShowNoResults(base)).toBe(true);
  });
  it("waits for the people search of the same query to settle", () => {
    expect(shouldShowNoResults({ ...base, peopleSettledQuery: "min" })).toBe(false);
  });
  it("waits while the typed query has not been dispatched yet", () => {
    expect(shouldShowNoResults({ ...base, query: "minaa" })).toBe(false);
  });
  it("hides when people or posts exist", () => {
    expect(shouldShowNoResults({ ...base, peopleCount: 1 })).toBe(false);
    expect(shouldShowNoResults({ ...base, postsSettledEmpty: false })).toBe(false);
  });
});
