import { describe, expect, it, vi } from "vitest";
import type { UsageMetricPart, UsageMetricPartResult } from "@/lib/admin-dashboard-usage";
import { createPartResultsStore, getPartResultsStore } from "./part-results-store";

function deferredPart(dayKeys: string[]) {
  let resolve: (result: UsageMetricPartResult) => void = () => {};
  let reject: (reason: unknown) => void = () => {};
  const result = new Promise<UsageMetricPartResult>((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  const part: UsageMetricPart = { metric: "signups", dayKeys, result };
  return { part, resolve, reject };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("part results store", () => {
  it("follows the parts only once subscribed, and settles each part on its own", async () => {
    const first = deferredPart(["2026-10-30"]);
    const second = deferredPart(["2026-10-31"]);
    const then = vi.spyOn(first.part.result, "then");
    const store = createPartResultsStore([first.part, second.part]);

    const initial = store.getSnapshot();
    expect(initial).toEqual([undefined, undefined]);
    expect(then).not.toHaveBeenCalled();

    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    store.subscribe(vi.fn());
    expect(then).toHaveBeenCalledTimes(1);

    second.resolve({ ok: true, days: { "2026-10-31": { value: 4, secondary: null } } });
    await flush();
    expect(store.getSnapshot()).toEqual([undefined, { ok: true, days: { "2026-10-31": { value: 4, secondary: null } } }]);
    expect(listener).toHaveBeenCalledTimes(1);
    // The server and hydration keep rendering the first snapshot, so their markup matches.
    expect(store.getServerSnapshot()).toBe(initial);

    const settled = store.getSnapshot();
    unsubscribe();
    first.resolve({ ok: false });
    await flush();
    expect(store.getSnapshot()).toEqual([{ ok: false }, settled[1]]);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("marks a part that never arrives, because the response was cut off, as failed", async () => {
    const cut = deferredPart(["2026-10-31"]);
    const store = createPartResultsStore([cut.part]);
    store.subscribe(() => {});

    cut.reject(new Error("Connection closed."));
    await flush();

    expect(store.getSnapshot()).toEqual([{ ok: false }]);
  });

  it("keeps one store per load, shared by every card", () => {
    const parts = [deferredPart(["2026-10-31"]).part];

    expect(getPartResultsStore(parts)).toBe(getPartResultsStore(parts));
    expect(getPartResultsStore([...parts])).not.toBe(getPartResultsStore(parts));
  });
});
