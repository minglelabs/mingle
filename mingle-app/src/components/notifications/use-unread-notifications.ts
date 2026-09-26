"use client";

/**
 * CONTRACT STUB — the notification center replaces the body; the signature is frozen.
 *
 * Drives the numberless red dot on the bell in both the feed and the
 * conversation-list headers. Unread state is per account (shared across
 * devices) and separate from conversation message read state.
 */
export type UnreadNotificationsState = {
  hasUnread: boolean;
  /** Re-read the unread state now (e.g. after returning to the screen). */
  refresh: () => void;
};

const NOOP = () => {};

export function useUnreadNotifications(viewerId: string | null): UnreadNotificationsState {
  void viewerId;
  return { hasUnread: false, refresh: NOOP };
}
