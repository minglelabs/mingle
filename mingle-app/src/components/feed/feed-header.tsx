"use client";

import MingleWordmark from "@/components/mingle-wordmark";
import { Bell, PencilLine } from "lucide-react";

type FeedHeaderProps = {
  composeLabel: string;
  notificationsLabel: string;
  onCompose?: () => void;
  onNotifications?: () => void;
  /** Numberless red dot from useUnreadNotifications(viewerId).hasUnread. */
  hasUnread?: boolean;
};

/**
 * Transparent floating header for the feed screen. Mirrors the conversations
 * header dimensions (height, safe-area padding, icon sizing) so the two tabs
 * line up. Left: Mingle wordmark. Right: compose (memo + pencil) then the bell.
 * Fully transparent — no bar/blur — so posts show through behind it.
 */
export default function FeedHeader({
  composeLabel,
  notificationsLabel,
  onCompose,
  onNotifications,
  hasUnread = false,
}: FeedHeaderProps) {
  return (
    <header
      className="pointer-events-auto absolute inset-x-0 top-0 z-20 flex shrink-0 items-center justify-between px-4"
      style={{
        paddingTop: "env(safe-area-inset-top, 44px)",
        height: "calc(56px + env(safe-area-inset-top, 44px))",
      }}
    >
      <MingleWordmark className="drop-shadow-[0_1px_3px_rgba(0,0,0,0.35)]" />

      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={onCompose}
          className="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-full p-3 transition active:bg-white/10"
          aria-label={composeLabel}
        >
          <PencilLine
            size={22}
            strokeWidth={2}
            className="text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.5)]"
          />
        </button>

        <button
          type="button"
          onClick={onNotifications}
          className="relative flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-full p-3 transition active:bg-white/10"
          aria-label={notificationsLabel}
        >
          <Bell
            size={22}
            strokeWidth={2}
            className="text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.5)]"
          />
          {hasUnread ? (
            <span
              className="absolute right-2.5 top-2.5 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-black/30"
              aria-hidden="true"
            />
          ) : null}
        </button>
      </div>
    </header>
  );
}
