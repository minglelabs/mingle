"use client";

import AppTopHeader from "@/components/app-top-header";

type FeedHeaderProps = {
  composeLabel: string;
  notificationsLabel: string;
  onCompose?: () => void;
  onNotifications?: () => void;
  /** Numberless red dot from useUnreadNotifications(viewerId).hasUnread. */
  hasUnread?: boolean;
};

/**
 * Transparent floating header for the feed screen. Thin wrapper over the shared
 * {@link AppTopHeader} so the feed and the conversation list render the exact
 * same header code (height, safe-area padding, wordmark, icon sizing/order);
 * the feed uses the fully transparent variant so posts show through behind it.
 * Props are frozen (contract): left Mingle wordmark, right compose then bell.
 */
export default function FeedHeader({
  composeLabel,
  notificationsLabel,
  onCompose,
  onNotifications,
  hasUnread = false,
}: FeedHeaderProps) {
  return (
    <AppTopHeader
      variant="transparent"
      composeLabel={composeLabel}
      notificationsLabel={notificationsLabel}
      onCompose={onCompose}
      onNotifications={onNotifications}
      hasUnread={hasUnread}
    />
  );
}
