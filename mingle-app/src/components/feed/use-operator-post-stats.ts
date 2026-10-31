"use client";

import { useEffect, useState } from "react";
import type { OperatorPostStats } from "@/lib/operator-post-stats";

/**
 * Data for the staff-only stats row on app feed cards.
 *
 * Every card asks; the server (`/admin/api/post-stats`) decides who gets an
 * answer and only ever answers for operator posts. For anyone without access
 * the first request is refused (403) and no further request is made for that
 * signed-in account in this page, so a normal user sends one request per page
 * load and learns nothing, not even which posts are operator posts. Requests
 * of the cards mounted together are batched into one.
 */

const ENDPOINT = "/admin/api/post-stats";
const BATCH_DELAY_MS = 50;
/** Same cap as the endpoint's. */
const MAX_IDS_PER_REQUEST = 20;
/** A card shown again after this long asks again (the stats keep moving). */
const FRESH_MS = 60_000;

type Waiter = (stats: OperatorPostStats | null) => void;

type ClientState = {
  viewerId: string | null;
  denied: boolean;
  cache: Map<string, { stats: OperatorPostStats | null; at: number }>;
  waiting: Map<string, Waiter[]>;
  timer: ReturnType<typeof setTimeout> | null;
};

const state: ClientState = {
  viewerId: null,
  denied: false,
  cache: new Map(),
  waiting: new Map(),
  timer: null,
};

function settleWaiting(value: OperatorPostStats | null): void {
  for (const waiters of state.waiting.values()) for (const resolve of waiters) resolve(value);
  state.waiting.clear();
}

/** A different signed-in account (or none) starts from scratch. */
function bindViewer(viewerId: string): void {
  if (state.viewerId === viewerId) return;
  state.viewerId = viewerId;
  state.denied = false;
  state.cache.clear();
  settleWaiting(null);
}

function schedule(): void {
  if (state.timer === null) state.timer = setTimeout(() => void flush(), BATCH_DELAY_MS);
}

async function flush(): Promise<void> {
  state.timer = null;
  if (state.denied) {
    settleWaiting(null);
    return;
  }
  const batch = [...state.waiting.entries()].slice(0, MAX_IDS_PER_REQUEST);
  for (const [postId] of batch) state.waiting.delete(postId);
  if (state.waiting.size > 0) schedule();

  const viewerId = state.viewerId;
  let stats: Record<string, OperatorPostStats> | null = null;
  try {
    const ids = batch.map(([postId]) => encodeURIComponent(postId)).join(",");
    const response = await fetch(`${ENDPOINT}?ids=${ids}`, { cache: "no-store", credentials: "same-origin" });
    if (response.status === 401 || response.status === 403) {
      if (state.viewerId === viewerId) {
        state.denied = true;
        settleWaiting(null);
      }
    } else if (response.ok) {
      const body = (await response.json()) as { stats?: Record<string, OperatorPostStats> };
      stats = body.stats ?? {};
    }
  } catch {
    // Offline or aborted: no row this time; the next mount asks again.
  }

  const now = Date.now();
  for (const [postId, waiters] of batch) {
    const value = stats?.[postId] ?? null;
    if (stats && state.viewerId === viewerId) state.cache.set(postId, { stats: value, at: now });
    for (const resolve of waiters) resolve(value);
  }
}

/** The stats of `postId` for this viewer, or null (no access, not an operator post, or failed). */
export function requestOperatorPostStats(viewerId: string, postId: string): Promise<OperatorPostStats | null> {
  bindViewer(viewerId);
  if (state.denied) return Promise.resolve(null);
  const cached = state.cache.get(postId);
  if (cached && Date.now() - cached.at < FRESH_MS) return Promise.resolve(cached.stats);
  return new Promise((resolve) => {
    const waiters = state.waiting.get(postId) ?? [];
    waiters.push(resolve);
    state.waiting.set(postId, waiters);
    schedule();
  });
}

/** The last stats known for `postId` (possibly stale), for a remounted card's first paint. */
function cachedOperatorPostStats(viewerId: string | null, postId: string): OperatorPostStats | null {
  if (!viewerId || state.viewerId !== viewerId || state.denied) return null;
  return state.cache.get(postId)?.stats ?? null;
}

/** The stats row data of one card; null for signed-out viewers and everyone without access. */
export function useOperatorPostStats(postId: string, viewerId: string | null): OperatorPostStats | null {
  const key = `${viewerId ?? ""}\u0000${postId}`;
  const [current, setCurrent] = useState(() => ({ key, stats: cachedOperatorPostStats(viewerId, postId) }));
  // Another post or account: drop the previous answer at once.
  if (current.key !== key) setCurrent({ key, stats: cachedOperatorPostStats(viewerId, postId) });
  useEffect(() => {
    if (!viewerId) return;
    let cancelled = false;
    void requestOperatorPostStats(viewerId, postId).then((stats) => {
      if (!cancelled) setCurrent({ key: `${viewerId}\u0000${postId}`, stats });
    });
    return () => {
      cancelled = true;
    };
  }, [postId, viewerId]);
  return viewerId && current.key === key ? current.stats : null;
}

/** Test-only: forget the access answer, cache and pending batch. */
export function __resetOperatorPostStatsClient(): void {
  if (state.timer !== null) clearTimeout(state.timer);
  state.timer = null;
  state.viewerId = null;
  state.denied = false;
  state.cache.clear();
  state.waiting.clear();
}
