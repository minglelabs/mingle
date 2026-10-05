"use client";

import FeedShell from "@/components/feed/feed-shell";
import type { FeedSource } from "@/lib/feed-routes";
import type { ReactNode } from "react";

type FeedViewerClientProps = {
  locale: string;
  source: Exclude<FeedSource, { kind: "home" }>;
  startPostId: string;
  /** The glass tab bar, floating over the bottom of the cards. */
  tabBar?: ReactNode;
  menuLabel?: string;
};

/**
 * Host for the author / search viewer: the same cards and the same glass tab
 * bar as the home feed, without the feed header. `router.back()` (the back
 * chevron, native back gesture / hardware back) returns to the profile grid or
 * search results the viewer was opened from.
 */
export default function FeedViewerClient({ locale, source, startPostId, tabBar, menuLabel }: FeedViewerClientProps) {
  return (
    <main className="relative flex h-full min-h-0 w-full flex-col overflow-hidden bg-black">
      <FeedShell
        locale={locale}
        source={source}
        startPostId={startPostId}
        isViewer
        tabBar={tabBar}
        menuLabel={menuLabel}
      />
    </main>
  );
}
