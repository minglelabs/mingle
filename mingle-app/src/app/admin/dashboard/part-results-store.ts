import { useSyncExternalStore } from "react";
import type { UsageMetricPart, UsageMetricPartResult } from "@/lib/admin-dashboard-usage";

/** The settled result of each part, in the parts' order; undefined while a part runs. */
export type PartResults = readonly (UsageMetricPartResult | undefined)[];

export type PartResultsStore = {
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => PartResults;
  getServerSnapshot: () => PartResults;
};

const FAILED: UsageMetricPartResult = { ok: false };

/**
 * Follows the parts the server streams. Each card shows the merge of many parts that
 * settle in any order, so the view reads them through this store rather than `use()`,
 * which would suspend a whole card until one part arrives. The promises are subscribed to
 * once, on the first subscriber (the browser only: the server and hydration render the
 * initial snapshot, so the markup matches).
 */
export function createPartResultsStore(parts: readonly UsageMetricPart[]): PartResultsStore {
  const initial: PartResults = parts.map(() => undefined);
  let snapshot = initial;
  let following = false;
  const listeners = new Set<() => void>();

  const settle = (index: number, result: UsageMetricPartResult) => {
    if (snapshot[index] !== undefined) return;
    const next = [...snapshot];
    next[index] = result;
    snapshot = next;
    for (const listener of listeners) listener();
  };

  return {
    subscribe(listener) {
      listeners.add(listener);
      if (!following) {
        following = true;
        parts.forEach((part, index) => {
          part.result.then(
            (result) => settle(index, result),
            // A failed query already resolves to { ok: false }: a rejection means the
            // response was cut off before this part arrived.
            () => settle(index, FAILED),
          );
        });
      }
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot: () => snapshot,
    getServerSnapshot: () => initial,
  };
}

const stores = new WeakMap<readonly UsageMetricPart[], PartResultsStore>();

/** One store per parts array, so every card of a load shares one subscription to each promise. */
export function getPartResultsStore(parts: readonly UsageMetricPart[]): PartResultsStore {
  let store = stores.get(parts);
  if (!store) {
    store = createPartResultsStore(parts);
    stores.set(parts, store);
  }
  return store;
}

/** A new load (another range, or a refresh after the cache was cleared) brings new parts and starts over. */
export function usePartResults(parts: readonly UsageMetricPart[]): PartResults {
  const store = getPartResultsStore(parts);
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);
}
