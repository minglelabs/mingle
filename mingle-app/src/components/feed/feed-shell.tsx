"use client";

import type { AppDictionary } from "@/i18n/types";
import { BOTTOM_TAB_BAR_HEIGHT_PX } from "@/components/bottom-tab-bar";
import FeedHeader from "@/components/feed/feed-header";
import FeedPostCard from "@/components/feed/feed-post-card";
import SwipeHintOverlay, { markSwipeHintDone } from "@/components/feed/swipe-hint-overlay";
import { MOCK_FEED_POSTS } from "@/lib/feed-data";
import { useCallback, useRef, useState } from "react";

type FeedShellProps = {
  dictionary: AppDictionary;
  locale: string;
};

/**
 * card height = 100dvh − bottom tab − safe area bottom
 * The transparent header overlaps the top of the card.
 */
const CARD_HEIGHT = `calc(100dvh - ${BOTTOM_TAB_BAR_HEIGHT_PX}px - env(safe-area-inset-bottom, 0px))`;

type ExpandState = {
  expanded: boolean;
  scrollTop: number;
};

export default function FeedShell({ dictionary, locale }: FeedShellProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [swipeHintVisible, setSwipeHintVisible] = useState(true);
  const hasScrolledRef = useRef(false);

  // Per-post expand state keyed by post id
  const expandStateRef = useRef<Map<string, ExpandState>>(new Map());

  const feedLabels = {
    likeLabel: dictionary.moments.likesLabel,
    commentLabel: dictionary.moments.commentsLabel,
    moreLabel: dictionary.profile.menuLabel,
    followLabel: dictionary.connect?.followAction ?? "Follow",
    translateLabel: dictionary.feed?.translateButton ?? "Translate",
    expandLabel: dictionary.feed?.expandButton ?? "See more",
    collapseLabel: dictionary.feed?.collapseButton ?? "Show less",
    translateShowLabel: dictionary.feed?.translateShow ?? "See translation",
    translateHideLabel: dictionary.feed?.translateHide ?? "Show original",
    translatingLabel: dictionary.feed?.translating ?? "Translating...",
  };

  const handleScroll = useCallback(() => {
    if (hasScrolledRef.current) return;
    hasScrolledRef.current = true;
    markSwipeHintDone();
    setSwipeHintVisible(false);
  }, []);

  // When the feed snaps to a new post, reset the new card's expand state.
  // The scroll snap position tells us which post index is visible.
  const prevIndexRef = useRef(0);
  const handleSnapChange = useCallback(() => {
    const container = scrollRef.current;
    if (!container) return;
    const cardH = container.firstElementChild?.getBoundingClientRect().height ?? 1;
    const idx = Math.round(container.scrollTop / cardH);
    if (idx !== prevIndexRef.current) {
      // Navigated to a new post — it starts collapsed (no restore)
      prevIndexRef.current = idx;
    }
  }, []);

  const handleExpandChange = useCallback(
    (postId: string, expanded: boolean, scrollTop: number) => {
      expandStateRef.current.set(postId, { expanded, scrollTop });
    },
    [],
  );

  return (
    <div className="relative flex h-full min-h-0 w-full flex-col overflow-hidden bg-black">
      {/* Transparent floating header */}
      <FeedHeader
        composeLabel={dictionary.feed?.composeButton ?? "Write"}
        notificationsLabel={
          dictionary.conversations?.notificationsButtonLabel ?? "Notifications"
        }
      />

      {/* Vertical snap scroll container */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto"
        onScroll={() => {
          handleScroll();
          handleSnapChange();
        }}
        style={{
          scrollSnapType: "y mandatory",
          WebkitOverflowScrolling: "touch",
          overscrollBehavior: "contain",
        }}
      >
        {MOCK_FEED_POSTS.map((post) => {
          const saved = expandStateRef.current.get(post.id);
          return (
            <FeedPostCard
              key={post.id}
              post={post}
              cardHeight={CARD_HEIGHT}
              labels={feedLabels}
              restoreExpanded={saved?.expanded ?? false}
              restoreScrollTop={saved?.scrollTop ?? 0}
              onExpandStateChange={(exp, st) => handleExpandChange(post.id, exp, st)}
            />
          );
        })}
      </div>

      {/* First-time swipe hint */}
      {swipeHintVisible ? (
        <SwipeHintOverlay
          hasNextPost={MOCK_FEED_POSTS.length > 1}
          onDismiss={() => setSwipeHintVisible(false)}
          label={dictionary.feed?.swipeHint ?? "Swipe up to see more"}
        />
      ) : null}
    </div>
  );
}
