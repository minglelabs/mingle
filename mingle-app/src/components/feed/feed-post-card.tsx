"use client";

import type { FeedPost } from "@/lib/feed-data";
import type { PostBackgroundPreset } from "@/lib/post-backgrounds";
import {
  classifyHitZone,
  isDoubleTap,
  isTapGesture,
  resolveGestureOwner,
  scrollBoundary,
  shouldBlockOverscroll,
  type GestureOwner,
  type Rect,
  type TapRecord,
} from "@/lib/feed-gesture";
import { getBackgroundPreset } from "@/lib/post-backgrounds";
import { generatePreviewText } from "@/lib/post-preview-text";
import HeartBurst from "@/components/feed/heart-burst";
import { useFeedLike } from "@/components/feed/use-feed-like";
import { useFeedTranslate } from "@/components/feed/use-feed-translate";
import { Globe, Heart, MessageCircle, MoreHorizontal, UserPlus, ChevronDown } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type FeedPostCardProps = {
  post: FeedPost;
  cardHeight: string;
  labels: {
    likeLabel: string;
    commentLabel: string;
    moreLabel: string;
    followLabel: string;
    translateLabel: string;
    expandLabel: string;
    collapseLabel: string;
    translateShowLabel: string;
    translateHideLabel: string;
    translatingLabel: string;
  };
  /** Whether this card should restore expansion state (navigating back). */
  restoreExpanded?: boolean;
  restoreScrollTop?: number;
  onExpandStateChange?: (expanded: boolean, scrollTop: number) => void;
};

export default function FeedPostCard({
  post,
  cardHeight,
  labels,
  restoreExpanded = false,
  restoreScrollTop = 0,
  onExpandStateChange,
}: FeedPostCardProps) {
  // ── Background preset ──
  const preset: PostBackgroundPreset | undefined = useMemo(
    () => getBackgroundPreset(post.backgroundKey),
    [post.backgroundKey],
  );
  const fallbackBg: PostBackgroundPreset = {
    key: "fallback",
    background: "#1e293b",
    textColor: "#f8fafc",
    textShadow: "0 1px 4px rgba(0,0,0,0.4)",
  };
  const bg = preset ?? fallbackBg;

  const preview = useMemo(
    () => generatePreviewText(post.bodyText),
    [post.bodyText],
  );

  // ── Expand / collapse state ──
  const [expanded, setExpanded] = useState(restoreExpanded);
  const bodyScrollRef = useRef<HTMLDivElement>(null);
  const [bodyNeedsScroll, setBodyNeedsScroll] = useState(false);

  // Check whether the body is tall enough to need internal scrolling
  useEffect(() => {
    if (!expanded) return;
    const el = bodyScrollRef.current;
    if (!el) return;
    // Use requestAnimationFrame so DOM has been laid out
    requestAnimationFrame(() => {
      setBodyNeedsScroll(el.scrollHeight > el.clientHeight + 2);
    });
  }, [expanded]);

  // Restore scroll position when navigating back
  useEffect(() => {
    if (restoreExpanded && restoreScrollTop > 0 && bodyScrollRef.current) {
      bodyScrollRef.current.scrollTop = restoreScrollTop;
    }
  }, [restoreExpanded, restoreScrollTop]);

  const handleExpand = useCallback(() => {
    setExpanded(true);
    onExpandStateChange?.(true, 0);
  }, [onExpandStateChange]);

  const handleCollapse = useCallback(() => {
    setExpanded(false);
    setBodyNeedsScroll(false);
    onExpandStateChange?.(false, 0);
  }, [onExpandStateChange]);

  // ── Gesture routing ──
  const gestureOwnerRef = useRef<GestureOwner>("none");
  const pointerStartRef = useRef<{ x: number; y: number } | null>(null);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      pointerStartRef.current = { x: e.clientX, y: e.clientY };

      if (!expanded) {
        gestureOwnerRef.current = "feed-swipe";
        return;
      }

      const bodyEl = bodyScrollRef.current;
      let bodyRect: Rect | null = null;
      if (bodyEl) {
        const r = bodyEl.getBoundingClientRect();
        bodyRect = { top: r.top, left: r.left, bottom: r.bottom, right: r.right };
      }
      gestureOwnerRef.current = resolveGestureOwner(e.clientX, e.clientY, bodyRect);
    },
    [expanded],
  );

  // Block overscroll on body-scroll touch-move
  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (gestureOwnerRef.current !== "body-scroll") return;
      const el = bodyScrollRef.current;
      if (!el) return;

      const touch = e.touches[0];
      const startY = pointerStartRef.current?.y ?? touch.clientY;
      const deltaY = touch.clientY - startY;

      const bound = scrollBoundary(el.scrollTop, el.scrollHeight, el.clientHeight);

      if (shouldBlockOverscroll(-deltaY, bound)) {
        // Prevent the outer feed from receiving this drag
        e.preventDefault();
        e.stopPropagation();
      }
    },
    [],
  );

  const handlePointerUp = useCallback(() => {
    gestureOwnerRef.current = "none";
    pointerStartRef.current = null;
  }, []);

  // ── Double-tap like ──
  const lastTapRef = useRef<TapRecord | null>(null);
  const { state: likeState, toggleLike, addLike, showBurst, clearBurst } = useFeedLike(
    post.id,
    { likedByMe: post.likedByMe, likeCount: post.likeCount },
  );

  // Single-tap timer for distinguishing single vs double tap
  const singleTapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleContentTap = useCallback(
    (e: React.PointerEvent) => {
      // Only respond on pointerUp with no drag
      const start = pointerStartRef.current;
      if (!start) return;
      if (!isTapGesture(start.x, start.y, e.clientX, e.clientY)) return;

      // Ignore taps on interactive elements
      const zone = classifyHitZone(e.target as Element);
      if (zone === "action") return;

      const now = Date.now();
      const current: TapRecord = { time: now, x: e.clientX, y: e.clientY };

      if (isDoubleTap(lastTapRef.current, current)) {
        // Cancel the pending single-tap timer
        if (singleTapTimerRef.current) {
          clearTimeout(singleTapTimerRef.current);
          singleTapTimerRef.current = null;
        }
        lastTapRef.current = null;
        addLike();
        return;
      }

      // First tap — wait for potential second tap
      lastTapRef.current = current;

      // Single-tap timeout — clear lastTap so a very late second tap is not matched
      if (singleTapTimerRef.current) clearTimeout(singleTapTimerRef.current);
      singleTapTimerRef.current = setTimeout(() => {
        lastTapRef.current = null;
        singleTapTimerRef.current = null;
        // Future: single-tap action (e.g. image zoom) goes here
      }, 320);
    },
    [addLike],
  );

  // ── Translation ──
  const { phase: translatePhase, translatedText, showingTranslation, toggle: toggleTranslate } =
    useFeedTranslate(post.id, post.bodyLanguage);

  const translateButtonLabel = (() => {
    if (translatePhase === "loading") return labels.translatingLabel;
    if (showingTranslation) return labels.translateHideLabel;
    return labels.translateShowLabel;
  })();

  // ── Resolved display text ──
  const displayText = showingTranslation && translatedText ? translatedText : post.bodyText;

  // ── Colors ──
  const textBase = post.imageUrl ? "#ffffff" : bg.textColor;
  const shadowBase = post.imageUrl
    ? "0 1px 4px rgba(0,0,0,0.5)"
    : bg.textShadow !== "none"
      ? bg.textShadow
      : undefined;
  const actionIconColor = bg.textColor;
  const actionIconShadow = bg.textShadow !== "none"
    ? `drop-shadow(${bg.textShadow})`
    : undefined;

  return (
    <article
      className="relative flex w-full shrink-0 snap-start snap-always flex-col overflow-hidden"
      style={{ height: cardHeight, background: bg.background }}
      aria-label={`${post.authorName}: ${preview.text}`}
      data-feed-content
      onPointerDown={handlePointerDown}
      onPointerUp={(e) => {
        handleContentTap(e);
        handlePointerUp();
      }}
      onPointerCancel={handlePointerUp}
      onTouchMove={handleTouchMove}
    >
      {/* ── Heart burst effect ── */}
      <HeartBurst visible={showBurst} onDone={clearBurst} />

      {/* ── Image overlay (if present) ── */}
      {post.imageUrl ? (
        <div className="absolute inset-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={post.imageUrl}
            alt=""
            className="h-full w-full object-cover"
            draggable={false}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/30" />
        </div>
      ) : null}

      {/* ── Centre preview text (collapsed, no image) ── */}
      {!post.imageUrl && !expanded ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-8">
          <p
            className="max-w-full break-words text-center text-[1.5rem] font-bold leading-[1.45]"
            style={{
              color: bg.textColor,
              textShadow: bg.textShadow !== "none" ? bg.textShadow : undefined,
              wordBreak: "break-word",
              overflowWrap: "anywhere",
            }}
          >
            {showingTranslation && translatedText ? translatedText : preview.text}
          </p>
        </div>
      ) : null}

      {/* ── Expanded body (text-only posts) ── */}
      {!post.imageUrl && expanded ? (
        <div
          className="relative z-10 flex flex-1 flex-col overflow-hidden"
          style={{
            // Leave space for bottom bar (author + actions ≈ 140px)
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
              touchAction: bodyNeedsScroll ? "pan-y" : "none",
            }}
            onScroll={() => {
              if (bodyScrollRef.current) {
                onExpandStateChange?.(true, bodyScrollRef.current.scrollTop);
              }
            }}
          >
            <p
              className="whitespace-pre-wrap text-base leading-relaxed"
              style={{
                color: bg.textColor,
                textShadow: bg.textShadow !== "none" ? bg.textShadow : undefined,
                wordBreak: "break-word",
                overflowWrap: "anywhere",
              }}
            >
              {displayText}
            </p>
          </div>

          {/* Fixed collapse button */}
          <button
            type="button"
            onClick={handleCollapse}
            data-feed-action
            className="absolute bottom-[148px] right-4 z-20 flex items-center gap-1 rounded-full bg-black/20 px-3 py-1.5 text-xs font-semibold backdrop-blur-sm transition active:scale-95"
            style={{ color: bg.textColor }}
            aria-label={labels.collapseLabel}
          >
            <ChevronDown size={14} strokeWidth={2.5} />
            <span>{labels.collapseLabel}</span>
          </button>
        </div>
      ) : null}

      {/* ── Bottom section: author + text (image posts) + actions ── */}
      <div className="relative z-10 mt-auto flex items-end gap-3 px-4 pb-5">
        {/* Left: author + body text */}
        <div className="min-w-0 flex-1" style={{ maxWidth: "calc(100% - 56px)" }}>
          {/* Author row */}
          <div className="mb-2 flex items-center gap-2">
            <span
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/20 text-sm font-bold"
              style={{ color: bg.textColor }}
            >
              {post.authorName.charAt(0)}
            </span>
            <span
              className="truncate text-sm font-semibold"
              style={{
                color: textBase,
                textShadow: shadowBase,
              }}
            >
              {post.authorName}
            </span>
            {!post.isFollowingAuthor ? (
              <button
                type="button"
                data-feed-action
                className="flex h-6 shrink-0 items-center gap-1 rounded-full bg-white/20 px-2 text-[11px] font-semibold backdrop-blur-sm transition active:scale-95"
                style={{ color: textBase }}
                aria-label={`${labels.followLabel} ${post.authorName}`}
              >
                <UserPlus size={12} strokeWidth={2.5} />
                <span>{labels.followLabel}</span>
              </button>
            ) : null}
          </div>

          {/* Body text for image posts (collapsed view) */}
          {post.imageUrl && !expanded ? (
            <p
              className="line-clamp-3 text-sm leading-relaxed"
              style={{
                color: "#ffffff",
                textShadow: "0 1px 4px rgba(0,0,0,0.5)",
                wordBreak: "break-word",
                overflowWrap: "anywhere",
              }}
            >
              {showingTranslation && translatedText ? translatedText : preview.text}
              {preview.isTruncated ? (
                <span className="ml-1 opacity-70">…</span>
              ) : null}
            </p>
          ) : null}

          {/* Image post expanded body */}
          {post.imageUrl && expanded ? (
            <div
              ref={bodyScrollRef}
              className="mb-2 max-h-[40vh] overflow-y-auto"
              style={{
                overscrollBehavior: "contain",
                WebkitOverflowScrolling: "touch",
              }}
            >
              <p
                className="whitespace-pre-wrap text-sm leading-relaxed"
                style={{
                  color: "#ffffff",
                  textShadow: "0 1px 4px rgba(0,0,0,0.5)",
                  wordBreak: "break-word",
                  overflowWrap: "anywhere",
                }}
              >
                {displayText}
              </p>
            </div>
          ) : null}

          {/* Expand button — only when truncated and collapsed */}
          {preview.isTruncated && !expanded ? (
            <button
              type="button"
              onClick={handleExpand}
              data-feed-action
              className="mt-1 text-xs font-semibold opacity-80 transition hover:opacity-100"
              style={{ color: textBase }}
            >
              {labels.expandLabel}
            </button>
          ) : null}

          {/* Collapse button for image posts when expanded */}
          {post.imageUrl && expanded ? (
            <button
              type="button"
              onClick={handleCollapse}
              data-feed-action
              className="mt-1 flex items-center gap-1 text-xs font-semibold opacity-80 transition hover:opacity-100"
              style={{ color: "#ffffff" }}
            >
              <ChevronDown size={12} strokeWidth={2.5} />
              <span>{labels.collapseLabel}</span>
            </button>
          ) : null}

          {/* Translate button */}
          {!post.isTranslated ? (
            <button
              type="button"
              onClick={toggleTranslate}
              data-feed-action
              className="mt-1.5 flex items-center gap-1.5 rounded-sm py-1 text-xs font-medium opacity-80 transition hover:opacity-100"
              style={{
                color: textBase,
                // Generous tap target while looking small
                minHeight: "32px",
                minWidth: "44px",
              }}
            >
              <Globe size={13} strokeWidth={2} />
              <span>{translateButtonLabel}</span>
            </button>
          ) : null}
        </div>

        {/* Right: action column */}
        <div className="flex shrink-0 flex-col items-center gap-4 pb-1">
          <button
            type="button"
            data-feed-action
            onClick={toggleLike}
            className="flex flex-col items-center gap-0.5 transition active:scale-95"
            aria-label={`${labels.likeLabel} ${likeState.likeCount}`}
          >
            <Heart
              size={26}
              fill={likeState.likedByMe ? "#ef4444" : "none"}
              stroke={likeState.likedByMe ? "#ef4444" : (post.imageUrl ? "#ffffff" : actionIconColor)}
              strokeWidth={1.8}
              style={{ filter: post.imageUrl ? "drop-shadow(0 1px 3px rgba(0,0,0,0.5))" : actionIconShadow }}
            />
            {likeState.likeCount > 0 ? (
              <span
                className="text-[11px] font-semibold tabular-nums"
                style={{
                  color: post.imageUrl ? "#ffffff" : actionIconColor,
                  textShadow: post.imageUrl ? "0 1px 3px rgba(0,0,0,0.5)" : undefined,
                }}
              >
                {likeState.likeCount}
              </span>
            ) : null}
          </button>

          <button
            type="button"
            data-feed-action
            className="flex flex-col items-center gap-0.5 transition active:scale-95"
            aria-label={`${labels.commentLabel} ${post.commentCount}`}
          >
            <MessageCircle
              size={26}
              stroke={post.imageUrl ? "#ffffff" : actionIconColor}
              strokeWidth={1.8}
              style={{ filter: post.imageUrl ? "drop-shadow(0 1px 3px rgba(0,0,0,0.5))" : actionIconShadow }}
            />
            {post.commentCount > 0 ? (
              <span
                className="text-[11px] font-semibold tabular-nums"
                style={{
                  color: post.imageUrl ? "#ffffff" : actionIconColor,
                  textShadow: post.imageUrl ? "0 1px 3px rgba(0,0,0,0.5)" : undefined,
                }}
              >
                {post.commentCount}
              </span>
            ) : null}
          </button>

          <button
            type="button"
            data-feed-action
            className="transition active:scale-95"
            aria-label={labels.moreLabel}
          >
            <MoreHorizontal
              size={26}
              stroke={post.imageUrl ? "#ffffff" : actionIconColor}
              strokeWidth={1.8}
              style={{ filter: post.imageUrl ? "drop-shadow(0 1px 3px rgba(0,0,0,0.5))" : actionIconShadow }}
            />
          </button>
        </div>
      </div>
    </article>
  );
}
