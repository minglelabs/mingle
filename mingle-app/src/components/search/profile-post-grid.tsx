"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import type { AppLocale } from "@/i18n";
import { feedSourceEndpoint, postViewerHref } from "@/lib/feed-routes";
import PostGrid from "./post-grid";

/**
 * The public post grid for a profile — used identically by my page and another
 * user's profile (Instagram-style 3 columns). Selecting a tile opens the
 * full-screen viewer scoped to that author's posts; returning restores the
 * grid's scroll position (handled by PostGrid via its scroll scope).
 *
 * A thin wrapper so the large profile screens integrate with one element and
 * the routing/endpoint wiring lives here, not inline in those files.
 */
export type ProfilePostGridProps = {
  locale: AppLocale;
  authorId: string;
  displayLanguage?: string | null;
  /** The scrollable ancestor of the grid, for scroll restoration. */
  scrollContainerRef?: React.RefObject<HTMLElement | null>;
  /** Optional empty-state label override. */
  emptyLabel?: string;
};

export default function ProfilePostGrid({
  locale,
  authorId,
  displayLanguage,
  scrollContainerRef,
  emptyLabel,
}: ProfilePostGridProps) {
  const router = useRouter();
  const openPost = useCallback((postId: string) => {
    router.push(postViewerHref(locale, { kind: "author", authorId }, postId));
  }, [locale, authorId, router]);

  if (!authorId) return null;

  return (
    <PostGrid
      locale={locale}
      endpoint={feedSourceEndpoint({ kind: "author", authorId }, { limit: 18, displayLanguage })}
      displayLanguage={displayLanguage}
      scrollScope={`profile:${authorId}`}
      onSelectPost={openPost}
      scrollContainerRef={scrollContainerRef}
      emptyLabel={emptyLabel}
    />
  );
}
