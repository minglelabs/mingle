"use client";

import type { FeedPostDto } from "@/lib/feed-post-dto";
import type { FeedCopy } from "@/i18n/feed-copy";
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
import { generatePreviewText } from "@/lib/post-preview-text";
import { resolveDisplayText } from "@/components/feed/feed-list";
import FeedPostView from "@/components/feed/feed-post-view";
import HeartBurst from "@/components/feed/heart-burst";
import { useFeedFollow } from "@/components/feed/use-feed-follow";
import { useFeedLike, type LikeError, type LikeState } from "@/components/feed/use-feed-like";
import { useFeedTranslate } from "@/components/feed/use-feed-translate";
import {
  Check,
  ChevronDown,
  ChevronUp,
  Globe,
  Heart,
  MessageCircle,
  MoreHorizontal,
  UserPlus,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export type FeedPostCardProps = {
  post: FeedPostDto;
  cardHeight: string;
  locale: string;
  copy: FeedCopy;
  viewerId: string | null;
  viewerLanguage: string;
  reducedMotion: boolean;
  restoreExpanded?: boolean;
  restoreScrollTop?: number;
  onExpandStateChange?: (expanded: boolean, scrollTop: number) => void;
  onRequireLogin: (postId: string) => void;
  onOpenComments: (postId: string) => void;
  onOpenActions: (postId: string) => void;
  onOpenAuthor: (authorId: string) => void;
  onOpenImage: (src: string) => void;
  onLikeChange: (postId: string, state: LikeState) => void;
  onFollowed: (authorId: string) => void;
  onToast: (message: string) => void;
  onGoNext?: () => void;
  onGoPrevious?: () => void;
};

export default function FeedPostCard({
  post,
  cardHeight,
  locale,
  copy,
  viewerId,
  viewerLanguage,
  reducedMotion,
  restoreExpanded = false,
  restoreScrollTop = 0,
  onExpandStateChange,
  onRequireLogin,
  onOpenComments,
  onOpenActions,
  onOpenAuthor,
  onOpenImage,
  onLikeChange,
  onFollowed,
  onToast,
  onGoNext,
  onGoPrevious,
}: FeedPostCardProps) {
  const isSignedIn = Boolean(viewerId);
  void locale;

  const preview = useMemo(() => generatePreviewText(post.sourceText), [post.sourceText]);
  const displayName = post.author.name?.trim() || `@${post.author.handle}`;

  const requireLogin = useCallback(() => onRequireLogin(post.id), [onRequireLogin, post.id]);

  // ── Like ──
  const handleLikeError = useCallback(
    (error: LikeError) => {
      if (error.kind === "rate_limited") {
        onToast(copy.rateLimited.replace("{seconds}", String(Math.max(1, Math.ceil(error.retryAfterSeconds)))));
      } else {
        onToast(copy.likeFailed);
      }
    },
    [copy, onToast],
  );
  const handleLikeChange = useCallback(
    (state: LikeState) => onLikeChange(post.id, state),
    [onLikeChange, post.id],
  );
  const { state: likeState, toggleLike, addLike, showBurst, clearBurst } = useFeedLike({
    postId: post.id,
    initial: { likedByMe: post.likedByMe, likeCount: post.likeCount },
    isSignedIn,
    onRequireLogin: requireLogin,
    onChange: handleLikeChange,
    onError: handleLikeError,
  });

  // ── Translation ──
  const translate = useFeedTranslate({
    post,
    viewerLanguage,
    isSignedIn,
    onRequireLogin: requireLogin,
  });
  useEffect(() => {
    if (translate.failed && translate.mode === "retry") {
      onToast(copy.translateFailed);
    }
    // Only when failed transitions.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [translate.failed]);

  const displayText = resolveDisplayText(
    { sourceText: post.sourceText, displayText: translate.translatedText, translationState: post.translationState },
    translate.showingTranslation,
  );
  const previewText = translate.showingTranslation && translate.translatedText
    ? generatePreviewText(translate.translatedText).text
    : preview.text;

  // ── Follow ──
  const handleFollowError = useCallback(() => onToast(copy.followFailed), [copy, onToast]);
  const { buttonState: followState, follow } = useFeedFollow({
    authorId: post.author.id,
    followingAuthor: post.followingAuthor,
    isMine: post.isMine,
    isSignedIn,
    onRequireLogin: requireLogin,
    onFollowed,
    onError: handleFollowError,
  });

  // ── Expand / collapse ──
  const [expanded, setExpanded] = useState(restoreExpanded);
  const bodyScrollRef = useRef<HTMLDivElement>(null);
  const [bodyNeedsScroll, setBodyNeedsScroll] = useState(false);

  useEffect(() => {
    if (!expanded) return;
    const el = bodyScrollRef.current;
    if (!el) return;
    requestAnimationFrame(() => {
      setBodyNeedsScroll(el.scrollHeight > el.clientHeight + 2);
    });
  }, [expanded]);

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

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (gestureOwnerRef.current !== "body-scroll") return;
    const el = bodyScrollRef.current;
    if (!el) return;
    const touch = e.touches[0];
    const startY = pointerStartRef.current?.y ?? touch.clientY;
    const deltaY = touch.clientY - startY;
    const bound = scrollBoundary(el.scrollTop, el.scrollHeight, el.clientHeight);
    if (shouldBlockOverscroll(-deltaY, bound)) {
      e.preventDefault();
      e.stopPropagation();
    }
  }, []);

  const handlePointerUpCleanup = useCallback(() => {
    gestureOwnerRef.current = "none";
    pointerStartRef.current = null;
  }, []);

  // ── Tap routing: single tap = image zoom, double tap = like ──
  const lastTapRef = useRef<TapRecord | null>(null);
  const singleTapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleContentTap = useCallback(
    (e: React.PointerEvent) => {
      const start = pointerStartRef.current;
      if (!start) return;
      if (!isTapGesture(start.x, start.y, e.clientX, e.clientY)) return;

      const zone = classifyHitZone(e.target as Element);
      if (zone === "action") return;

      const targetEl = e.target as Element;
      const onImage = Boolean(targetEl.closest("[data-feed-image]"));

      const now = Date.now();
      const current: TapRecord = { time: now, x: e.clientX, y: e.clientY };

      if (isDoubleTap(lastTapRef.current, current)) {
        if (singleTapTimerRef.current) {
          clearTimeout(singleTapTimerRef.current);
          singleTapTimerRef.current = null;
        }
        lastTapRef.current = null;
        addLike();
        return;
      }

      lastTapRef.current = current;
      if (singleTapTimerRef.current) clearTimeout(singleTapTimerRef.current);
      singleTapTimerRef.current = setTimeout(() => {
        lastTapRef.current = null;
        singleTapTimerRef.current = null;
        // Confirmed single tap: open image zoom if the tap landed on the image.
        if (onImage && post.image?.url) {
          onOpenImage(post.image.url);
        }
      }, 320);
    },
    [addLike, onOpenImage, post.image],
  );

  useEffect(() => {
    return () => {
      if (singleTapTimerRef.current) clearTimeout(singleTapTimerRef.current);
    };
  }, []);

  // ── Translate button label ──
  const translateLabel = (() => {
    switch (translate.mode) {
      case "loading":
        return copy.translating;
      case "showOriginal":
        return copy.translateHide;
      case "retry":
      case "show":
      default:
        return copy.translateShow;
    }
  })();

  const ariaLabel = `${displayName}: ${previewText}`;

  const authorSlot = (
    <div className="mb-2 flex items-center gap-2">
      <button
        type="button"
        data-feed-action
        onClick={() => onOpenAuthor(post.author.id)}
        className="flex items-center gap-2 rounded-full transition active:opacity-70"
        aria-label={displayName}
      >
        {post.author.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={post.author.imageUrl}
            alt=""
            className="h-9 w-9 shrink-0 rounded-full object-cover"
            draggable={false}
          />
        ) : (
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/20 text-sm font-bold text-white">
            {displayName.charAt(0).toUpperCase()}
          </span>
        )}
        <span className="max-w-[9rem] truncate text-sm font-semibold text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.4)]">
          {displayName}
        </span>
      </button>

      <time
        className="shrink-0 text-[11px] font-medium text-white/70"
        dateTime={post.publishedAt}
      >
        {relativeTimeShort(post.publishedAt)}
      </time>

      {followState === "idle" || followState === "pending" ? (
        <button
          type="button"
          data-feed-action
          onClick={follow}
          disabled={followState === "pending"}
          className="flex h-6 shrink-0 items-center gap-1 rounded-full bg-white/20 px-2 text-[11px] font-semibold text-white backdrop-blur-sm transition active:scale-95 disabled:opacity-60"
          aria-label={`${copy.follow} ${displayName}`}
        >
          <UserPlus size={12} strokeWidth={2.5} />
          <span>{copy.follow}</span>
        </button>
      ) : null}
      {followState === "success" ? (
        <span
          className="flex h-6 shrink-0 items-center gap-1 rounded-full bg-emerald-500/80 px-2 text-[11px] font-semibold text-white"
          aria-label={copy.followed}
        >
          <Check size={12} strokeWidth={3} />
        </span>
      ) : null}
    </div>
  );

  const controlSlot = (
    <>
      {preview.isTruncated && !expanded ? (
        <button
          type="button"
          data-feed-action
          onClick={handleExpand}
          className="mt-1 text-xs font-semibold text-white opacity-90 transition hover:opacity-100 drop-shadow-[0_1px_3px_rgba(0,0,0,0.4)]"
        >
          {copy.expand}
        </button>
      ) : null}

      {expanded ? (
        <button
          type="button"
          data-feed-action
          onClick={handleCollapse}
          className="mt-1 flex items-center gap-1 text-xs font-semibold text-white opacity-90 transition hover:opacity-100 drop-shadow-[0_1px_3px_rgba(0,0,0,0.4)]"
          aria-label={copy.collapse}
        >
          <ChevronDown size={12} strokeWidth={2.5} />
          <span>{copy.collapse}</span>
        </button>
      ) : null}

      {translate.mode !== "hidden" ? (
        <button
          type="button"
          data-feed-action
          onClick={translate.toggle}
          className="mt-1.5 flex items-center gap-1.5 rounded-sm py-1 text-xs font-medium text-white opacity-90 transition hover:opacity-100 drop-shadow-[0_1px_3px_rgba(0,0,0,0.4)]"
          style={{ minHeight: "32px", minWidth: "44px" }}
          aria-busy={translate.mode === "loading"}
        >
          <Globe size={13} strokeWidth={2} />
          <span>{translateLabel}</span>
        </button>
      ) : null}
    </>
  );

  const actionSlot = (
    <>
      <button
        type="button"
        data-feed-action
        onClick={toggleLike}
        aria-pressed={likeState.likedByMe}
        className="flex flex-col items-center gap-0.5 transition active:scale-95"
        aria-label={`${likeState.likedByMe ? copy.unlike : copy.like}${likeState.likeCount > 0 ? `, ${likeState.likeCount}` : ""}`}
      >
        <Heart
          size={26}
          fill={likeState.likedByMe ? "#ef4444" : "none"}
          stroke={likeState.likedByMe ? "#ef4444" : "#ffffff"}
          strokeWidth={1.8}
          style={{ filter: "drop-shadow(0 1px 3px rgba(0,0,0,0.5))" }}
        />
        {likeState.likeCount > 0 ? (
          <span className="text-[11px] font-semibold tabular-nums text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.5)]">
            {likeState.likeCount}
          </span>
        ) : null}
      </button>

      <button
        type="button"
        data-feed-action
        onClick={() => onOpenComments(post.id)}
        className="flex flex-col items-center gap-0.5 transition active:scale-95"
        aria-label={`${copy.comment}${post.commentCount > 0 ? `, ${post.commentCount}` : ""}`}
      >
        <MessageCircle
          size={26}
          stroke="#ffffff"
          strokeWidth={1.8}
          style={{ filter: "drop-shadow(0 1px 3px rgba(0,0,0,0.5))" }}
        />
        {post.commentCount > 0 ? (
          <span className="text-[11px] font-semibold tabular-nums text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.5)]">
            {post.commentCount}
          </span>
        ) : null}
      </button>

      <button
        type="button"
        data-feed-action
        onClick={() => onOpenActions(post.id)}
        className="transition active:scale-95"
        aria-label={copy.more}
      >
        <MoreHorizontal
          size={26}
          stroke="#ffffff"
          strokeWidth={1.8}
          style={{ filter: "drop-shadow(0 1px 3px rgba(0,0,0,0.5))" }}
        />
      </button>

      {/* Accessibility: explicit next / previous beyond the swipe gesture. */}
      {onGoPrevious ? (
        <button
          type="button"
          data-feed-action
          onClick={onGoPrevious}
          className="sr-only-focusable transition active:scale-95"
          aria-label={copy.previousPost}
        >
          <ChevronUp size={22} strokeWidth={2} className="text-white/80" />
        </button>
      ) : null}
      {onGoNext ? (
        <button
          type="button"
          data-feed-action
          onClick={onGoNext}
          className="sr-only-focusable transition active:scale-95"
          aria-label={copy.nextPost}
        >
          <ChevronDown size={22} strokeWidth={2} className="text-white/80" />
        </button>
      ) : null}
    </>
  );

  return (
    <div
      onPointerDown={handlePointerDown}
      onPointerUp={(e) => {
        handleContentTap(e);
        handlePointerUpCleanup();
      }}
      onPointerCancel={handlePointerUpCleanup}
      onTouchMove={handleTouchMove}
    >
      <FeedPostView
        cardHeight={cardHeight}
        backgroundKey={post.backgroundKey}
        imageUrl={post.image?.url ?? null}
        displayText={displayText}
        previewText={previewText}
        expanded={expanded}
        ariaLabel={ariaLabel}
        authorSlot={authorSlot}
        actionSlot={actionSlot}
        controlSlot={controlSlot}
        overlaySlot={<HeartBurst visible={showBurst && !reducedMotion} onDone={clearBurst} />}
        bodyScrollRef={bodyScrollRef}
        bodyTouchAction={bodyNeedsScroll ? "pan-y" : "none"}
        onBodyScroll={() => {
          if (bodyScrollRef.current) {
            onExpandStateChange?.(true, bodyScrollRef.current.scrollTop);
          }
        }}
      />
    </div>
  );
}

/** Compact relative time (m / h / d) with an absolute fallback. */
function relativeTimeShort(iso: string): string {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return "";
  const diffSec = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (diffSec < 60) return `${diffSec}s`;
  const min = Math.floor(diffSec / 60);
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d`;
  return new Date(then).toLocaleDateString();
}
