"use client";

import { useSyncExternalStore } from "react";

/** Tailwind's `lg` breakpoint: the width from which admin screens use two panes. */
const DESKTOP_QUERY = "(min-width: 1024px)";

function subscribe(listener: () => void): () => void {
  const query = window.matchMedia(DESKTOP_QUERY);
  query.addEventListener("change", listener);
  return () => query.removeEventListener("change", listener);
}

/** True from `lg` up. False on the server and until hydration. */
export function useIsDesktop(): boolean {
  return useSyncExternalStore(subscribe, () => window.matchMedia(DESKTOP_QUERY).matches, () => false);
}
