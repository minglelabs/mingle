import { describe, expect, it } from "vitest";
import { isScrolledToEnd, READ_DWELL_MS, readClockRunning, readVerdict } from "./feed-read";

describe("feed read rule", () => {
  it("scrollable body: read only when scrolled to the end", () => {
    const base = { expanded: true, bodyNeedsScroll: true, expandedDwellMs: 60_000 };
    expect(readVerdict({ ...base, scrolledToEnd: false })).toBeNull();
    expect(readVerdict({ ...base, scrolledToEnd: true })).toBe("scrolled_to_end");
  });

  it("short body: read after 3s expanded", () => {
    const base = { expanded: true, bodyNeedsScroll: false, scrolledToEnd: false };
    expect(readVerdict({ ...base, expandedDwellMs: READ_DWELL_MS - 1 })).toBeNull();
    expect(readVerdict({ ...base, expandedDwellMs: READ_DWELL_MS })).toBe("dwell");
  });

  it("never read while collapsed", () => {
    expect(readVerdict({ expanded: false, bodyNeedsScroll: false, scrolledToEnd: true, expandedDwellMs: 99_999 })).toBeNull();
  });

  it("the dwell clock runs only on the active, foreground, expanded short body", () => {
    const on = { expanded: true, bodyNeedsScroll: false, active: true, hidden: false };
    expect(readClockRunning(on)).toBe(true);
    expect(readClockRunning({ ...on, hidden: true })).toBe(false);
    expect(readClockRunning({ ...on, active: false })).toBe(false);
    expect(readClockRunning({ ...on, bodyNeedsScroll: true })).toBe(false);
    expect(readClockRunning({ ...on, expanded: false })).toBe(false);
  });

  it("detects the scroll end with sub-pixel slack", () => {
    expect(isScrolledToEnd({ scrollTop: 499, clientHeight: 300, scrollHeight: 800 })).toBe(true);
    expect(isScrolledToEnd({ scrollTop: 400, clientHeight: 300, scrollHeight: 800 })).toBe(false);
  });
});
