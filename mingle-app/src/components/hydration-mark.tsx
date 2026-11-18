"use client";

import { useEffect } from "react";
import { HYDRATION_MARK_KEY, SCRIPT_RECOVERY_STORAGE_KEY } from "@/lib/script-load-recovery";

/** Tells the script-load recovery script that React hydrated this page. */
export default function HydrationMark() {
  useEffect(() => {
    (window as unknown as Record<string, unknown>)[HYDRATION_MARK_KEY] = true;
    try {
      window.sessionStorage.removeItem(SCRIPT_RECOVERY_STORAGE_KEY);
    } catch {
      // Storage may be unavailable; the reload cap then simply stays.
    }
  }, []);
  return null;
}
