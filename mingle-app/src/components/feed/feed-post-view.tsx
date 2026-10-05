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
  /**
   * Text-only cards: the "See more" control shown right under the centre
   * preview, so the body opens where the reader is looking.
   */
  centerExpandSlot?: ReactNode;
  /** Text-only cards: the "Collapse" control shown right under the expanded body. */
  centerCollapseSlot?: ReactNode;
  /** aria-label describing the card for screen readers. */
  ariaLabel: string;
  /** Overlays (heart burst). */
  overlaySlot?: ReactNode;
  onImageError?: () => void;
  imageFailed?: boolean;
  imageFailedLabel?: string;
  /** Retry after a failed image load (button shown with the failure notice). */
  onImageRetry?: () => void;
  imageRetryLabel?: string;
  /** Changes on retry so a fresh `<img>` is mounted. */
  imageAttempt?: number;
  /** CSS aspect-ratio ("w / h") from the DTO or measured after load. */
  imageAspect?: string | null;
  onImageLoad?: React.ReactEventHandler<HTMLImageElement>;
  /** Off-screen cards load lazily; the active and next card pass "eager". */
  imageLoading?: "eager" | "lazy";
  /** The collapsed 3-line snippet of an image post, measured for overflow. */
  previewClampRef?: React.Ref<HTMLParagraphElement>;
  /** Whether the body scroll region is interactive (real card) or static (preview). */
  bodyScrollRef?: React.Ref<HTMLDivElement>;
  onBodyScroll?: React.UIEventHandler<HTMLDivElement>;
  bodyTouchAction?: "pan-y" | "none";
};

/** Top and bottom inset of the expanded text body: clears the header and the author row. */
const EXPANDED_BODY_EDGE_PADDING = "calc(56px + env(safe-area-inset-top, 44px) + 40px)";

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
  centerExpandSlot,
  centerCollapseSlot,
  ariaLabel,
  overlaySlot,
  onImageError,
  imageFailed = false,
  imageFailedLabel,
  onImageRetry,
  imageRetryLabel,
  imageAttempt = 0,
  imageAspect = null,
  onImageLoad,
  imageLoading = "lazy",
  previewClampRef,
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

      {/* Image backdrop: whole photo (object-contain, never cropped); the
          letterbox shows the post background. */}
      {imageUrl ? (
        imageFailed ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-slate-800 px-8 text-center">
            <p className="text-sm" style={{ color: "#e2e8f0" }} role="status">
              {imageFailedLabel}
            </p>
            {onImageRetry ? (
              <button
                type="button"
                data-feed-action
                onClick={onImageRetry}
                className="min-h-11 rounded-full bg-white/15 px-4 text-sm font-semibold text-white transition active:scale-95"
              >
                {imageRetryLabel}
              </button>
            ) : null}
          </div>
        ) : (
          <>
            <div className="absolute inset-0 flex items-center justify-center [container-type:size]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                key={imageAttempt}
                src={imageUrl}
                alt=""
                data-feed-image
                className="h-full w-full object-contain"
                style={
                  imageAspect
                    ? {
                        aspectRatio: imageAspect,
                        width: `min(100cqw, calc(100cqh * (${imageAspect})))`,
                        height: "auto",
                        maxHeight: "100%",
                      }
                    : undefined
                }
                draggable={false}
                loading={imageLoading}
                decoding="async"
                onError={onImageError}
                onLoad={onImageLoad}
              />
            </div>
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/30" />
          </>
        )
      ) : null}

      {/* Centre preview (text-only, collapsed) */}
      {!imageUrl && !expanded ? (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-8">
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
          {centerExpandSlot ? <div className="pointer-events-auto mt-3">{centerExpandSlot}</div> : null}
        </div>
      ) : null}

      {/* Expanded body (text-only): opens in place, in the same large centred
          type as the preview. A short body stays centred; a long one scrolls.
          The equal top/bottom padding keeps the centre where the preview was
          and clears the header and the author row at the scroll ends. */}
      {!imageUrl && expanded ? (
        <div
          ref={bodyScrollRef}
          className="absolute inset-0 overflow-y-auto"
          style={{
            overscrollBehavior: "contain",
            WebkitOverflowScrolling: "touch",
            touchAction: bodyTouchAction,
          }}
          onScroll={onBodyScroll}
        >
          <div
            className="flex min-h-full flex-col items-center justify-center px-8"
            style={{
              paddingTop: EXPANDED_BODY_EDGE_PADDING,
              paddingBottom: EXPANDED_BODY_EDGE_PADDING,
            }}
          >
            <p
              className="max-w-full whitespace-pre-wrap text-center text-[1.5rem] font-bold leading-[1.45]"
              style={{
                color: colors.textColor,
                textShadow: colors.textShadow,
                wordBreak: "break-word",
                overflowWrap: "anywhere",
              }}
            >
              {displayText}
            </p>
            {centerCollapseSlot ? <div className="mt-3">{centerCollapseSlot}</div> : null}
          </div>
        </div>
      ) : null}

      {/* Bottom section: author + (image body) + actions */}
      <div
        className="relative z-10 mt-auto flex items-end gap-3 px-4"
        // Clears whatever floats over the card's bottom (the glass tab bar).
        style={{ paddingBottom: "calc(20px + var(--feed-bottom-inset, 0px))" }}
      >
        <div className="min-w-0 flex-1" style={{ maxWidth: "calc(100% - 60px)" }}>
          {/* Expanded body for image posts opens UPWARD from the author row,
              so the author row and controls stay exactly where they were. */}
          {imageUrl && expanded ? (
            <div
              ref={bodyScrollRef}
              className="absolute bottom-full left-4 right-4 mb-1 max-h-[40vh] overflow-y-auto rounded-xl bg-black/35 px-3 py-2 backdrop-blur-[2px]"
              style={{
                overscrollBehavior: "contain",
                WebkitOverflowScrolling: "touch",
                touchAction: bodyTouchAction,
              }}
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

          {authorSlot}

          {/* Body text for image posts (collapsed snippet). Kept, invisible,
              while expanded so the row below does not shift. */}
          {imageUrl && displayText ? (
            <p
              ref={expanded ? undefined : previewClampRef}
              className={`line-clamp-3 text-sm leading-relaxed${expanded ? " invisible" : ""}`}
              aria-hidden={expanded ? true : undefined}
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

          {controlSlot}
        </div>

        {actionSlot ? (
          <div className="flex shrink-0 flex-col items-center gap-6 pb-1">{actionSlot}</div>
        ) : null}
      </div>
    </article>
  );
}
