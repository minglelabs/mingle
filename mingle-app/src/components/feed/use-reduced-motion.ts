"use client";

import { useEffect, useState } from "react";

function readReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Tracks the OS "reduce motion" accessibility setting. The feed uses it to
 * skip the heart burst and snap animations for users who asked for less motion.
 * SSR-safe: the client reads the initial value lazily and then subscribes to
 * changes, so no synchronous setState is needed inside the effect.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState<boolean>(readReducedMotion);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches);
    if (typeof query.addEventListener === "function") {
      query.addEventListener("change", onChange);
      return () => query.removeEventListener("change", onChange);
    }
    // Safari < 14 fallback.
    query.addListener(onChange);
    return () => query.removeListener(onChange);
  }, []);

  return reduced;
}
