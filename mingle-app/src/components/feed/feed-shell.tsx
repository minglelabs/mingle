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

export default function FeedShell({ dictionary, locale }: FeedShellProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [swipeHintVisible, setSwipeHintVisible] = useState(true);
  const hasScrolledRef = useRef(false);

  const feedLabels = {
    likeLabel: dictionary.moments.likesLabel,
    commentLabel: dictionary.moments.commentsLabel,
    moreLabel: dictionary.profile.menuLabel,
    followLabel: dictionary.connect?.followAction ?? "Follow",
    translateLabel: dictionary.feed?.translateButton ?? "Translate",
  };

  const handleScroll = useCallback(() => {
    if (hasScrolledRef.current) return;
    hasScrolledRef.current = true;
    markSwipeHintDone();
    setSwipeHintVisible(false);
  }, []);

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
        onScroll={handleScroll}
        style={{
          scrollSnapType: "y mandatory",
          WebkitOverflowScrolling: "touch",
          overscrollBehavior: "contain",
        }}
      >
        {MOCK_FEED_POSTS.map((post) => (
          <FeedPostCard
            key={post.id}
            post={post}
            cardHeight={CARD_HEIGHT}
            labels={feedLabels}
          />
        ))}
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
