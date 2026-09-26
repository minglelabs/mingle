"use client";

import MingleWordmark from "@/components/mingle-wordmark";
import type { PostForegroundTone } from "@/lib/post-backgrounds";
import { Bell, SquarePen } from "lucide-react";

export type AppTopHeaderVariant = "transparent" | "surface";

type AppTopHeaderProps = {
  /** Accessible name for the compose (memo + pencil) button. */
  composeLabel: string;
  /** Accessible name for the bell (notifications) button. */
  notificationsLabel: string;
  onCompose?: () => void;
  onNotifications?: () => void;
  /** Numberless red dot from useUnreadNotifications(viewerId).hasUnread. */
  hasUnread?: boolean;
  /**
   * Accessible name for the bell while `hasUnread` is true, so the unread state
   * is announced, not only drawn (`feedCopy(locale).notificationsUnread`).
   * Falls back to `notificationsLabel`.
   */
  unreadNotificationsLabel?: string;
  /**
   * "transparent": floating over feed content, no bar/blur, white glyphs with a
   * drop shadow (used on the feed). "surface": a solid white bar with the
   * bottom border, dark glyphs (used on the conversation list).
   */
  variant?: AppTopHeaderVariant;
  /**
   * Transparent variant only: glyph tone over the ACTIVE post, from
   * `postForegroundTone(activePost.backgroundKey, Boolean(activePost.image))`
   * in `@/lib/post-backgrounds`. `light` (default) = white glyphs, `dark` =
   * dark glyphs for light text-post backgrounds.
   */
  glyphTone?: PostForegroundTone;
};

/**
 * The single top header shared by the feed and the conversation list so the two
 * tabs line up exactly (height, safe-area padding, wordmark, icon size and
 * order). Left: Mingle wordmark. Right: compose (memo + pencil) then the bell
 * with its unread dot. Only the color/positioning treatment differs between the
 * two screens, expressed through `variant`.
 */
export default function AppTopHeader({
  composeLabel,
  notificationsLabel,
  onCompose,
  onNotifications,
  hasUnread = false,
  unreadNotificationsLabel,
  variant = "transparent",
  glyphTone = "light",
}: AppTopHeaderProps) {
  const isTransparent = variant === "transparent";
  const toneAttr = isTransparent ? glyphTone : undefined;
  const darkGlyphs = isTransparent && glyphTone === "dark";

  const headerClassName = isTransparent
    ? "pointer-events-auto absolute inset-x-0 top-0 z-20 flex shrink-0 items-center justify-between px-4"
    : "relative flex shrink-0 items-center justify-between border-b border-gray-100 bg-white px-4";

  // Transparent header over the active post follows that post's glyph tone
  // (`postForegroundTone`): white + shadow over photos / dark backgrounds,
  // dark ink over light text-post backgrounds.
  const buttonClassName = !isTransparent
    ? "flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-full p-3 transition active:bg-gray-100"
    : darkGlyphs
      ? "flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-full p-3 transition active:bg-black/5"
      : "flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-full p-3 transition active:bg-white/10";

  const glyphClassName = !isTransparent || darkGlyphs
    ? "text-slate-900"
    : "text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.5)]";

  // The wordmark keeps its amber gradient; on light posts a thin dark halo
  // (instead of the soft photo shadow) keeps its edge readable.
  const wordmarkClassName = !isTransparent
    ? undefined
    : darkGlyphs
      ? "drop-shadow-[0_0_1px_rgba(67,20,7,0.55)]"
      : "drop-shadow-[0_1px_3px_rgba(0,0,0,0.35)]";

  const dotClassName = !isTransparent || darkGlyphs
    ? "absolute right-2.5 top-2.5 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-white"
    : "absolute right-2.5 top-2.5 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-black/30";

  const bellLabel = hasUnread && unreadNotificationsLabel ? unreadNotificationsLabel : notificationsLabel;

  return (
    <header
      className={headerClassName}
      data-glyph-tone={toneAttr}
      style={{
        paddingTop: "env(safe-area-inset-top, 44px)",
        height: "calc(56px + env(safe-area-inset-top, 44px))",
      }}
    >
      <MingleWordmark className={wordmarkClassName} />

      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={onCompose}
          className={buttonClassName}
          aria-label={composeLabel}
        >
          <SquarePen size={22} strokeWidth={2} className={glyphClassName} />
        </button>

        <button
          type="button"
          onClick={onNotifications}
          className={`relative ${buttonClassName}`}
          aria-label={bellLabel}
        >
          <Bell size={22} strokeWidth={2} className={glyphClassName} />
          {hasUnread ? <span className={dotClassName} aria-hidden="true" /> : null}
        </button>
      </div>
    </header>
  );
}
