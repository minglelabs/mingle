"use client";

import { useLinkStatus } from "next/link";

/**
 * Spinner inside a `<Link>` while its navigation is pending: the admin check and the new
 * tab's first payload. The tab's cards then stream in under their own loading states.
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
