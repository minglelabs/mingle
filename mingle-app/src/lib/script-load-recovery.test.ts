import { runInNewContext } from "node:vm";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  HYDRATION_MARK_KEY,
  SCRIPT_RECOVERY_STORAGE_KEY,
  buildScriptLoadRecoveryScript,
} from "@/lib/script-load-recovery";

type Listener = (event?: unknown) => void;

function setup(options: { readyState?: string; storage?: Map<string, string> | null; now?: number } = {}) {
  vi.useFakeTimers();
  const listeners = new Map<string, Listener[]>();
  const storage = options.storage === undefined ? new Map<string, string>() : options.storage;
  const reload = vi.fn();
  const document = { readyState: options.readyState ?? "loading" };
  const runtimeWindow: Record<string, unknown> = {
    addEventListener(type: string, listener: Listener) {
      listeners.set(type, [...(listeners.get(type) ?? []), listener]);
    },
    sessionStorage: storage
      ? {
          getItem: (key: string) => storage.get(key) ?? null,
          setItem: (key: string, value: string) => storage.set(key, value),
        }
      : {
          getItem: () => {
            throw new Error("blocked");
          },
          setItem: () => {
            throw new Error("blocked");
          },
        },
    location: { reload },
  };
  const fire = (type: string, event?: unknown) => listeners.get(type)?.forEach((l) => l(event));
  const run = () =>
    runInNewContext(buildScriptLoadRecoveryScript({ hydrationGraceMs: 1000 }), {
      window: runtimeWindow,
      document,
      console: { warn: () => {} },
      setTimeout,
      Date: { now: () => options.now ?? 1_000_000 },
      JSON,
      String,
    });
  return { runtimeWindow, document, storage, reload, fire, run };
}

describe("script load recovery", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("does nothing when the page hydrates after load", () => {
    const t = setup();
    t.run();
    t.document.readyState = "complete";
    t.fire("load");
    t.runtimeWindow[HYDRATION_MARK_KEY] = true;
    vi.advanceTimersByTime(5000);
    expect(t.reload).not.toHaveBeenCalled();
  });

  it("reloads when the page loaded but never hydrated", () => {
    const t = setup();
    t.run();
    t.document.readyState = "complete";
    t.fire("load");
    vi.advanceTimersByTime(999);
    expect(t.reload).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(t.reload).toHaveBeenCalledTimes(1);
  });

  it("reloads right after load when a Next script failed", () => {
    const t = setup();
    t.run();
    t.fire("error", { target: { tagName: "SCRIPT", src: "https://x/_next/static/chunks/a.js" } });
    expect(t.reload).not.toHaveBeenCalled();
    t.document.readyState = "complete";
    t.fire("load");
    expect(t.reload).toHaveBeenCalledTimes(1);
  });

  it("ignores failed scripts from other origins", () => {
    const t = setup();
    t.run();
    t.fire("error", { target: { tagName: "SCRIPT", src: "https://ads.example/tag.js" } });
    t.document.readyState = "complete";
    t.fire("load");
    t.runtimeWindow[HYDRATION_MARK_KEY] = true;
    vi.advanceTimersByTime(5000);
    expect(t.reload).not.toHaveBeenCalled();
  });

  it("reloads on a ChunkLoadError", () => {
    const t = setup({ readyState: "complete" });
    t.run();
    t.fire("unhandledrejection", { reason: { name: "ChunkLoadError", message: "x" } });
    expect(t.reload).toHaveBeenCalledTimes(1);
  });

  it("stops after the reload cap", () => {
    const storage = new Map([[SCRIPT_RECOVERY_STORAGE_KEY, JSON.stringify({ count: 2, at: 999_000 })]]);
    const t = setup({ readyState: "complete", storage });
    t.run();
    vi.advanceTimersByTime(5000);
    expect(t.reload).not.toHaveBeenCalled();
  });

  it("allows reloads again once the window has passed", () => {
    const storage = new Map([[SCRIPT_RECOVERY_STORAGE_KEY, JSON.stringify({ count: 2, at: 0 })]]);
    const t = setup({ readyState: "complete", storage });
    t.run();
    vi.advanceTimersByTime(1000);
    expect(t.reload).toHaveBeenCalledTimes(1);
  });

  it("never reloads without storage, so it cannot loop", () => {
    const t = setup({ readyState: "complete", storage: null });
    t.run();
    vi.advanceTimersByTime(5000);
    expect(t.reload).not.toHaveBeenCalled();
  });
});
