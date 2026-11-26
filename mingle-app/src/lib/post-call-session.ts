import { useSyncExternalStore } from "react";
import type { PostCallView } from "@/lib/post-call";

/**
 * The 1:1 voice talk this app is in (owner, 2026-11-26), held above every tab
 * by src/components/post-call/post-call-host.tsx: the call screen opens over
 * whatever is on screen (no tab change, no room to load), and the back
 * gesture folds it into a small bubble instead of ending it.
 */
export type ActivePostCall = { call: PostCallView; minimized: boolean };

let active: ActivePostCall | null = null;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getActivePostCall(): ActivePostCall | null {
  return active;
}

/** Opens the call screen for a call just asked for (ringing) or just answered. */
export function openPostCall(call: PostCallView): void {
  active = { call, minimized: false };
  emit();
}

export function minimizePostCall(): void {
  if (!active || active.minimized) return;
  active = { ...active, minimized: true };
  emit();
}

export function expandPostCall(): void {
  if (!active || !active.minimized) return;
  active = { ...active, minimized: false };
  emit();
}

export function closePostCall(): void {
  if (!active) return;
  active = null;
  emit();
}

export function useActivePostCall(): ActivePostCall | null {
  return useSyncExternalStore(subscribe, getActivePostCall, () => null);
}

export function resetPostCallSessionForTests(): void {
  active = null;
  listeners.clear();
}
