"use client";

import MingleWordmark from "@/components/mingle-wordmark";
import type { PostForegroundTone } from "@/lib/post-backgrounds";
import { Bell, PencilLine } from "lucide-react";

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
  variant = "transparent",
  glyphTone = "light",
}: AppTopHeaderProps) {
  const isTransparent = variant === "transparent";
  // Visual treatment for glyphTone="dark" is implemented by the feed-card fix
  // (W2); until then the prop is accepted and exposed for styling hooks.
  const toneAttr = isTransparent ? glyphTone : undefined;

  const headerClassName = isTransparent
    ? "pointer-events-auto absolute inset-x-0 top-0 z-20 flex shrink-0 items-center justify-between px-4"
    : "relative flex shrink-0 items-center justify-between border-b border-gray-100 bg-white px-4";

  const buttonClassName = isTransparent
    ? "flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-full p-3 transition active:bg-white/10"
    : "flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-full p-3 transition active:bg-gray-100";

  const glyphClassName = isTransparent
    ? "text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.5)]"
    : "text-slate-900";

  const wordmarkClassName = isTransparent
    ? "drop-shadow-[0_1px_3px_rgba(0,0,0,0.35)]"
    : undefined;

  const dotClassName = isTransparent
    ? "absolute right-2.5 top-2.5 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-black/30"
    : "absolute right-2.5 top-2.5 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-white";

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
          <PencilLine size={22} strokeWidth={2} className={glyphClassName} />
        </button>

        <button
          type="button"
          onClick={onNotifications}
          className={`relative ${buttonClassName}`}
          aria-label={notificationsLabel}
        >
          <Bell size={22} strokeWidth={2} className={glyphClassName} />
          {hasUnread ? <span className={dotClassName} aria-hidden="true" /> : null}
        </button>
      </div>
    </header>
  );
}
