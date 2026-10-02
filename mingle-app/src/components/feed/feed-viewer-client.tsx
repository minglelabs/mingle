"use client";

import FeedShell from "@/components/feed/feed-shell";
import type { FeedSource } from "@/lib/feed-routes";

type FeedViewerClientProps = {
  locale: string;
  source: Exclude<FeedSource, { kind: "home" }>;
  startPostId: string;
};

/**
 * Full-screen host for the author / search viewer. No bottom tab bar and no
 * feed header — it fills the screen and relies on `router.back()` (native back
 * gesture / hardware back) to return to the profile grid or search results the
 * viewer opened it from.
 */
export default function FeedViewerClient({ locale, source, startPostId }: FeedViewerClientProps) {
  return (
    <main className="relative flex h-full min-h-0 w-full flex-col overflow-hidden bg-black">
      <FeedShell locale={locale} source={source} startPostId={startPostId} isViewer />
    </main>
  );
}
