"use client";

import { useLinkStatus } from "next/link";

/**
 * Spinner inside a `<Link>` while its navigation is pending. The 사용량·성능 tab waits for its
 * metrics before the new page renders, so without it a tab click shows nothing until then.
 */
export function LinkPendingSpinner() {
  const { pending } = useLinkStatus();
  if (!pending) return null;
  return (
    <span
      aria-hidden="true"
      className="h-3 w-3 animate-spin rounded-full border-2 border-slate-200 border-t-sky-600"
    />
  );
}
