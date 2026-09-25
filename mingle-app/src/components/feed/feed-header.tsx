"use client";

import MingleWordmark from "@/components/mingle-wordmark";
import { Bell, PencilLine } from "lucide-react";

type FeedHeaderProps = {
  composeLabel: string;
  notificationsLabel: string;
  onCompose?: () => void;
  onNotifications?: () => void;
  unreadNotificationCount?: number;
};

/**
 * Transparent floating header for the feed screen.
 * Mirrors the conversations header dimensions:
 *   height = calc(56px + env(safe-area-inset-top, 44px))
 *   paddingTop = env(safe-area-inset-top, 44px)
 *   icon buttons: min-h-11, min-w-11, p-3, gap-1
 *   icon size: 22px, strokeWidth 2
 */
export default function FeedHeader({
  composeLabel,
  notificationsLabel,
  onCompose,
  onNotifications,
  unreadNotificationCount = 0,
}: FeedHeaderProps) {
  return (
    <header
      className="pointer-events-auto absolute inset-x-0 top-0 z-20 flex shrink-0 items-center justify-between px-4"
      style={{
        paddingTop: "env(safe-area-inset-top, 44px)",
        height: "calc(56px + env(safe-area-inset-top, 44px))",
      }}
    >
      {/* Mingle wordmark with light outline/shadow for readability */}
      <MingleWordmark
        className="drop-shadow-[0_1px_3px_rgba(0,0,0,0.35)]"
      />

      <div className="flex items-center gap-1">
        {/* Compose / write button */}
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

        {/* Notifications */}
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
          {unreadNotificationCount > 0 ? (
            <span
              className="absolute right-1.5 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold leading-none text-white"
              aria-hidden="true"
            >
              {unreadNotificationCount > 99 ? "99+" : unreadNotificationCount}
            </span>
          ) : null}
        </button>
      </div>
    </header>
  );
}
