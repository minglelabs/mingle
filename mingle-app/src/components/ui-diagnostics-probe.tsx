"use client";

import { useEffect } from "react";
import { installFullScreenTapDetector } from "@/lib/ui-diagnostics";

/** Temporary: see `src/lib/ui-diagnostics.ts`. */
export default function UiDiagnosticsProbe() {
  useEffect(() => installFullScreenTapDetector(), []);
  return null;
}
