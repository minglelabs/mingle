import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  STARTUP_CONTENT_WAIT_MS,
  STARTUP_HARD_CAP_MS,
  __resetStartupContentReady,
  markStartupContentReady,
  resolveStartupGateDelayMs,
  runAfterStartup,
} from "./after-startup";

describe("resolveStartupGateDelayMs", () => {
  it("waits for the load event before anything else", () => {
    expect(resolveStartupGateDelayMs({ nowMs: 300, loaded: false, contentReady: true })).toBe(STARTUP_HARD_CAP_MS - 300);
  });

  it("opens once loaded and the first screen reported its content", () => {
    expect(resolveStartupGateDelayMs({ nowMs: 400, loaded: true, contentReady: true })).toBe(0);
  });

  it("opens for screens that never report once the content wait has passed", () => {
    expect(resolveStartupGateDelayMs({ nowMs: 900, loaded: true, contentReady: false })).toBe(STARTUP_CONTENT_WAIT_MS - 900);
    expect(resolveStartupGateDelayMs({ nowMs: STARTUP_CONTENT_WAIT_MS, loaded: true, contentReady: false })).toBe(0);
  });

  it("always opens by the hard cap, even without a load event", () => {
    expect(resolveStartupGateDelayMs({ nowMs: STARTUP_HARD_CAP_MS, loaded: false, contentReady: false })).toBe(0);
    expect(resolveStartupGateDelayMs({ nowMs: Number.NaN, loaded: false, contentReady: false })).toBe(0);
  });
});

describe("runAfterStartup", () => {
  let nowMs = 0;
  let readyState = "interactive";
  const loadListeners = new Set<() => void>();

  function fireLoad() {
    readyState = "complete";
    loadListeners.forEach((listener) => listener());
  }

  beforeEach(() => {
    vi.useFakeTimers();
    __resetStartupContentReady();
    nowMs = 0;
    readyState = "interactive";
    loadListeners.clear();
    vi.stubGlobal("performance", { now: () => nowMs });
    vi.stubGlobal("document", {
      get readyState() {
        return readyState;
      },
    });
    vi.stubGlobal("window", {
      addEventListener: (type: string, listener: () => void) => {
        if (type === "load") loadListeners.add(listener);
      },
      removeEventListener: (type: string, listener: () => void) => {
        if (type === "load") loadListeners.delete(listener);
      },
      setTimeout: (callback: () => void, ms: number) => setTimeout(() => {
        nowMs += ms;
        callback();
      }, ms),
      clearTimeout: (id: ReturnType<typeof setTimeout>) => clearTimeout(id),
      requestAnimationFrame: (callback: () => void) => setTimeout(callback, 16),
      cancelAnimationFrame: (id: ReturnType<typeof setTimeout>) => clearTimeout(id),
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("runs after load once the first screen reports its content", () => {
    const task = vi.fn();
    runAfterStartup(task);

    nowMs = 200;
    markStartupContentReady();
    vi.advanceTimersByTime(100);
    expect(task).not.toHaveBeenCalled();

    nowMs = 300;
    fireLoad();
    vi.advanceTimersByTime(20);
    expect(task).toHaveBeenCalledOnce();
  });

  it("runs after the content wait for a screen that never reports", () => {
    const task = vi.fn();
    nowMs = 100;
    fireLoad();
    runAfterStartup(task);
    vi.advanceTimersByTime(STARTUP_CONTENT_WAIT_MS - 200);
    expect(task).not.toHaveBeenCalled();
    vi.advanceTimersByTime(200 + 20);
    expect(task).toHaveBeenCalledOnce();
  });

  it("runs on the next frame once startup is over", () => {
    const task = vi.fn();
    nowMs = STARTUP_HARD_CAP_MS + 1;
    fireLoad();
    runAfterStartup(task);
    expect(task).not.toHaveBeenCalled();
    vi.advanceTimersByTime(20);
    expect(task).toHaveBeenCalledOnce();
  });

  it("never runs a cancelled task", () => {
    const task = vi.fn();
    const cancel = runAfterStartup(task);
    fireLoad();
    markStartupContentReady();
    cancel();
    vi.advanceTimersByTime(STARTUP_HARD_CAP_MS);
    expect(task).not.toHaveBeenCalled();
  });
});
