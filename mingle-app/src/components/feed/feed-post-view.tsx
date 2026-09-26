"use client";

import { resolveBackgroundPreset } from "@/lib/post-backgrounds";
import type { ReactNode } from "react";
import { useMemo } from "react";

export type FeedPostViewColors = {
  background: string;
  textColor: string;
  textShadow?: string;
  /** Text/icon color when an image backdrop forces white-on-dark. */
  onImageColor: string;
  onImageShadow: string;
};

/** Resolve background preset → concrete colors, accounting for an image backdrop. */
export function resolveViewColors(backgroundKey: string, hasImage: boolean): FeedPostViewColors {
  const preset = resolveBackgroundPreset(backgroundKey);
  return {
    background: preset.background,
    textColor: hasImage ? "#ffffff" : preset.textColor,
    textShadow: hasImage
      ? "0 1px 4px rgba(0,0,0,0.5)"
      : preset.textShadow !== "none"
        ? preset.textShadow
        : undefined,
    onImageColor: hasImage ? "#ffffff" : preset.textColor,
    onImageShadow: hasImage
      ? "drop-shadow(0 1px 3px rgba(0,0,0,0.5))"
      : preset.textShadow !== "none"
        ? `drop-shadow(${preset.textShadow})`
        : "",
  };
}

export type FeedPostViewProps = {
  cardHeight: string;
  backgroundKey: string;
  /** Rendered image src, or null for a text-only card. */
  imageUrl: string | null;
  /** The visible body text (already resolved for translation state). */
  displayText: string;
  /** Collapsed centre-preview text (text-only cards). */
  previewText: string;
  expanded: boolean;
  /** Author row content — author identity + follow button (interactive layer). */
  authorSlot: ReactNode;
  /** Right-hand action column (like / comment / more). Null in preview. */
  actionSlot?: ReactNode;
  /** Expand / collapse / translate controls under the body. Null in preview. */
  controlSlot?: ReactNode;
  /** aria-label describing the card for screen readers. */
  ariaLabel: string;
  /** Overlays (heart burst). */
  overlaySlot?: ReactNode;
  onImageError?: () => void;
  imageFailed?: boolean;
  imageFailedLabel?: string;
  /** Whether the body scroll region is interactive (real card) or static (preview). */
  bodyScrollRef?: React.Ref<HTMLDivElement>;
  onBodyScroll?: React.UIEventHandler<HTMLDivElement>;
  bodyTouchAction?: "pan-y" | "none";
};

/**
 * Presentational, layout-only rendering of a post card. Both the interactive
 * feed card and the compose preview render THROUGH this so what an author sees
 * while composing cannot drift from what gets published. It owns no gesture,
 * fetch or state — the interactive wrapper injects behaviour via the slots.
 */
export default function FeedPostView({
  cardHeight,
  backgroundKey,
  imageUrl,
  displayText,
  previewText,
  expanded,
  authorSlot,
  actionSlot,
  controlSlot,
  ariaLabel,
  overlaySlot,
  onImageError,
  imageFailed = false,
  imageFailedLabel,
  bodyScrollRef,
  onBodyScroll,
  bodyTouchAction = "pan-y",
}: FeedPostViewProps) {
  const colors = useMemo(
    () => resolveViewColors(backgroundKey, Boolean(imageUrl)),
    [backgroundKey, imageUrl],
  );

  return (
    <article
      className="relative flex w-full shrink-0 snap-start snap-always flex-col overflow-hidden"
      style={{ height: cardHeight, background: colors.background }}
      aria-label={ariaLabel}
      data-feed-content
    >
      {overlaySlot}

      {/* Image backdrop */}
      {imageUrl ? (
        <div className="absolute inset-0" data-feed-image>
          {imageFailed ? (
            <div
              className="flex h-full w-full items-center justify-center px-8 text-center text-sm"
              style={{ color: "#e2e8f0" }}
            >
              {imageFailedLabel}
            </div>
          ) : (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={imageUrl}
                alt=""
                className="h-full w-full object-cover"
                draggable={false}
                onError={onImageError}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/30" />
            </>
          )}
        </div>
      ) : null}

      {/* Centre preview (text-only, collapsed) */}
      {!imageUrl && !expanded ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-8">
          <p
            className="max-w-full break-words text-center text-[1.5rem] font-bold leading-[1.45]"
            style={{
              color: colors.textColor,
              textShadow: colors.textShadow,
              wordBreak: "break-word",
              overflowWrap: "anywhere",
            }}
          >
            {previewText}
          </p>
        </div>
      ) : null}

      {/* Expanded body (text-only) */}
      {!imageUrl && expanded ? (
        <div
          className="relative z-10 flex flex-1 flex-col overflow-hidden"
          style={{
            paddingBottom: "140px",
            paddingTop: "calc(56px + env(safe-area-inset-top, 44px) + 8px)",
          }}
        >
          <div
            ref={bodyScrollRef}
            className="flex-1 overflow-y-auto px-6"
            style={{
              overscrollBehavior: "contain",
              WebkitOverflowScrolling: "touch",
              touchAction: bodyTouchAction,
            }}
            onScroll={onBodyScroll}
          >
            <p
              className="whitespace-pre-wrap text-base leading-relaxed"
              style={{
                color: colors.textColor,
                textShadow: colors.textShadow,
                wordBreak: "break-word",
                overflowWrap: "anywhere",
              }}
            >
              {displayText}
            </p>
          </div>
        </div>
      ) : null}

      {/* Bottom section: author + (image body) + actions */}
      <div className="relative z-10 mt-auto flex items-end gap-3 px-4 pb-5">
        <div className="min-w-0 flex-1" style={{ maxWidth: "calc(100% - 56px)" }}>
          {authorSlot}

          {/* Body text for image posts */}
          {imageUrl && !expanded ? (
            <p
              className="line-clamp-3 text-sm leading-relaxed"
              style={{
                color: colors.onImageColor,
                textShadow: colors.textShadow,
                wordBreak: "break-word",
                overflowWrap: "anywhere",
              }}
            >
              {displayText}
            </p>
          ) : null}

          {imageUrl && expanded ? (
            <div
              ref={bodyScrollRef}
              className="mb-2 max-h-[40vh] overflow-y-auto"
              style={{ overscrollBehavior: "contain", WebkitOverflowScrolling: "touch" }}
              onScroll={onBodyScroll}
            >
              <p
                className="whitespace-pre-wrap text-sm leading-relaxed"
                style={{
                  color: colors.onImageColor,
                  textShadow: colors.textShadow,
                  wordBreak: "break-word",
                  overflowWrap: "anywhere",
                }}
              >
                {displayText}
              </p>
            </div>
          ) : null}

          {controlSlot}
        </div>

        {actionSlot ? (
          <div className="flex shrink-0 flex-col items-center gap-4 pb-1">{actionSlot}</div>
        ) : null}
      </div>
    </article>
  );
}
