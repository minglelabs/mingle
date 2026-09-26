"use client";

import type { FeedPostDto } from "@/lib/feed-post-dto";
import type { FeedCopy } from "@/i18n/feed-copy";
import { moderationCopy } from "@/i18n/moderation-copy";
import {
  classifyHitZone,
  isDoubleTap,
  isTapGesture,
  shouldBlockBodyTouchMove,
  type TapRecord,
} from "@/lib/feed-gesture";
import { postForegroundTone } from "@/lib/post-backgrounds";
import {
  foregroundTokens,
  formatPostTime,
  imageAspectRatio,
  resolveCardTexts,
  shouldShowExpand,
} from "@/components/feed/feed-card-format";
import FeedPostView from "@/components/feed/feed-post-view";
import HeartBurst from "@/components/feed/heart-burst";
import { useFeedFollow } from "@/components/feed/use-feed-follow";
import { useFeedLike, type LikeError, type LikeState } from "@/components/feed/use-feed-like";
import { shouldToastTranslateFailure, useFeedTranslate } from "@/components/feed/use-feed-translate";
import {
  Check,
  ChevronDown,
  ChevronUp,
  Globe,
  Heart,
  MessageCircle,
  MoreHorizontal,
  Plus,
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
  /** Read at mount only (initial expanded state for a restored card). */
  restoreExpanded?: boolean;
  restoreScrollTop?: number;
  /**
   * Load the image eagerly (the active card and the one after it). Every
   * other card loads lazily. Defaults to lazy.
   */
  eagerImage?: boolean;
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

/**
 * Enlarges a small control's hit area to >= 44px without changing its layout
 * (an invisible ::before box around the visible label/icon).
 */
const HIT_44 = "relative before:absolute before:left-1/2 before:top-1/2 before:h-11 before:min-w-11 before:w-[calc(100%+12px)] before:-translate-x-1/2 before:-translate-y-1/2 before:content-['']";

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
  eagerImage = false,
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
  const hasImage = Boolean(post.image?.url);
  const displayName = post.author.name?.trim() || `@${post.author.handle}`;

  const tone = postForegroundTone(post.backgroundKey, hasImage);
  const fg = foregroundTokens(tone);

  const requireLogin = useCallback(() => onRequireLogin(post.id), [onRequireLogin, post.id]);

  // ── Like ──
  const handleLikeError = useCallback(
    (error: LikeError) => {
      if (error.kind === "rate_limited") {
        onToast(copy.rateLimited.replace("{seconds}", String(Math.max(1, Math.ceil(error.retryAfterSeconds)))));
      } else if (error.kind === "account_restricted") {
        onToast(moderationCopy(locale).accountRestricted);
      } else {
        onToast(copy.likeFailed);
      }
    },
    [copy, locale, onToast],
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
  // Toast only when a request the viewer made fails — never because the DTO
  // arrived with `failed`.
  const toastedFailuresRef = useRef(translate.requestFailureCount);
  useEffect(() => {
    if (shouldToastTranslateFailure(toastedFailuresRef.current, translate.requestFailureCount)) {
      onToast(copy.translateFailed);
    }
    toastedFailuresRef.current = translate.requestFailureCount;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [translate.requestFailureCount]);

  // One shown text drives the centre preview, the image snippet and the
  // expanded body, so all three switch language together.
  const { displayText, previewText, previewTruncated } = useMemo(
    () => resolveCardTexts(post.sourceText, translate.translatedText, translate.showingTranslation),
    [post.sourceText, translate.translatedText, translate.showingTranslation],
  );

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

  // ── Image ──
  const [imageFailed, setImageFailed] = useState(false);
  const [imageAttempt, setImageAttempt] = useState(0);
  const [measuredImage, setMeasuredImage] = useState<{ width: number; height: number } | null>(null);
  const imageAspect = imageAspectRatio(post.image, measuredImage);
  const handleImageLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    if (img.naturalWidth > 0 && img.naturalHeight > 0) {
      setMeasuredImage((prev) =>
        prev && prev.width === img.naturalWidth && prev.height === img.naturalHeight
          ? prev
          : { width: img.naturalWidth, height: img.naturalHeight },
      );
    }
  }, []);
  const handleImageError = useCallback(() => setImageFailed(true), []);
  const handleImageRetry = useCallback(() => {
    setImageFailed(false);
    setImageAttempt((n) => n + 1);
  }, []);

  // ── Expand / collapse ──
  // `restoreExpanded` is read once, at mount.
  const [expanded, setExpanded] = useState(restoreExpanded);
  const bodyScrollRef = useRef<HTMLDivElement>(null);
  const previewClampRef = useRef<HTMLParagraphElement>(null);
  const [bodyNeedsScroll, setBodyNeedsScroll] = useState(false);
  const [clampOverflows, setClampOverflows] = useState(false);

  // Re-measure whenever the shown text changes (translate ↔ original) or the
  // box resizes, so a longer translation never leaves the body unscrollable.
  useEffect(() => {
    if (!expanded) return;
    const el = bodyScrollRef.current;
    if (!el) return;
    const measure = () => setBodyNeedsScroll(el.scrollHeight > el.clientHeight + 2);
    const raf = requestAnimationFrame(measure);
    const ro = typeof ResizeObserver === "function" ? new ResizeObserver(measure) : null;
    ro?.observe(el);
    return () => {
      cancelAnimationFrame(raf);
      ro?.disconnect();
    };
  }, [expanded, displayText]);

  // Image posts: "See more" only when the 3-line snippet really overflows.
  useEffect(() => {
    if (!hasImage || expanded) return;
    const el = previewClampRef.current;
    if (!el) {
      setClampOverflows(false);
      return;
    }
    const measure = () => setClampOverflows(el.scrollHeight > el.clientHeight + 1);
    const raf = requestAnimationFrame(measure);
    const ro = typeof ResizeObserver === "function" ? new ResizeObserver(measure) : null;
    ro?.observe(el);
    return () => {
      cancelAnimationFrame(raf);
      ro?.disconnect();
    };
  }, [hasImage, expanded, displayText]);

  useEffect(() => {
    if (restoreExpanded && restoreScrollTop > 0 && bodyScrollRef.current) {
      bodyScrollRef.current.scrollTop = restoreScrollTop;
    }
  }, [restoreExpanded, restoreScrollTop]);

  const showExpand = shouldShowExpand({
    hasImage,
    expanded,
    previewTruncated,
    clampOverflows,
  });

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
  // A drag that starts in the expanded body scrolls the body only. At the
  // body's top/bottom edge, the browser would chain the scroll into the feed
  // and page to the next post; React's touch listeners are passive, so the
  // guard is a native non-passive listener on the body scroller itself
  // (`overscroll-behavior: contain` stays as the first line of defence).
  useEffect(() => {
    if (!expanded) return;
    const el = bodyScrollRef.current;
    if (!el) return;
    let lastY: number | null = null;
    const onStart = (e: TouchEvent) => {
      lastY = e.touches[0]?.clientY ?? null;
    };
    const onMove = (e: TouchEvent) => {
      const touch = e.touches[0];
      if (!touch) return;
      const prevY = lastY ?? touch.clientY;
      lastY = touch.clientY;
      if (shouldBlockBodyTouchMove(prevY, touch.clientY, el) && e.cancelable) {
        e.preventDefault();
      }
    };
    const onEnd = () => {
      lastY = null;
    };
    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchmove", onMove, { passive: false });
    el.addEventListener("touchend", onEnd, { passive: true });
    el.addEventListener("touchcancel", onEnd, { passive: true });
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
      el.removeEventListener("touchcancel", onEnd);
    };
  }, [expanded, displayText]);

  const pointerStartRef = useRef<{ x: number; y: number } | null>(null);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    pointerStartRef.current = { x: e.clientX, y: e.clientY };
  }, []);

  const handlePointerUpCleanup = useCallback(() => {
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
        if (onImage && !imageFailed && post.image?.url) {
          onOpenImage(post.image.url);
        }
      }, 320);
    },
    [addLike, imageFailed, onOpenImage, post.image],
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

  const iconStyle = fg.iconFilter ? { filter: fg.iconFilter } : undefined;

  const authorSlot = (
    <div className="mb-2 flex items-center gap-2">
      <button
        type="button"
        data-feed-action
        onClick={() => onOpenAuthor(post.author.id)}
        className="flex min-w-0 items-center gap-2 rounded-full transition active:opacity-70"
        aria-label={displayName}
      >
        {post.author.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={post.author.imageUrl}
            alt=""
            className="h-9 w-9 shrink-0 rounded-full object-cover"
            draggable={false}
            loading={eagerImage ? "eager" : "lazy"}
            decoding="async"
          />
        ) : (
          <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold ${fg.chipClass}`}>
            {displayName.charAt(0).toUpperCase()}
          </span>
        )}
        <span className={`max-w-[9rem] truncate text-sm font-semibold ${fg.textClass}`}>
          {displayName}
        </span>
      </button>

      <time className={`shrink-0 text-[11px] font-medium ${fg.mutedTextClass}`} dateTime={post.publishedAt}>
        {formatPostTime(post.publishedAt, locale)}
      </time>

      {followState === "idle" || followState === "pending" ? (
        <button
          type="button"
          data-feed-action
          onClick={follow}
          disabled={followState === "pending"}
          className={`${HIT_44} flex h-5 w-5 shrink-0 items-center justify-center rounded-full transition active:scale-90 disabled:opacity-60 ${fg.chipClass}`}
          aria-label={copy.follow}
        >
          <Plus size={13} strokeWidth={3} aria-hidden="true" />
        </button>
      ) : null}
      {followState === "success" ? (
        <span
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white"
          role="status"
          aria-label={copy.followed}
        >
          <Check size={12} strokeWidth={3} aria-hidden="true" />
        </span>
      ) : null}
    </div>
  );

  const controlSlot =
    showExpand || expanded || translate.mode !== "hidden" ? (
      <div className="mt-1 flex items-center gap-4">
        {showExpand ? (
          <button
            type="button"
            data-feed-action
            onClick={handleExpand}
            className={`${HIT_44} text-xs font-semibold transition ${fg.textClass}`}
          >
            {copy.expand}
          </button>
        ) : null}

        {expanded ? (
          <button
            type="button"
            data-feed-action
            onClick={handleCollapse}
            className={`${HIT_44} flex items-center gap-1 text-xs font-semibold transition ${fg.textClass}`}
          >
            <ChevronDown size={12} strokeWidth={2.5} aria-hidden="true" />
            <span>{copy.collapse}</span>
          </button>
        ) : null}

        {translate.mode !== "hidden" ? (
          <button
            type="button"
            data-feed-action
            onClick={translate.toggle}
            className={`${HIT_44} flex items-center gap-1.5 text-xs font-medium transition ${fg.textClass}`}
            aria-busy={translate.mode === "loading"}
          >
            <Globe size={13} strokeWidth={2} aria-hidden="true" />
            <span>{translateLabel}</span>
          </button>
        ) : null}
      </div>
    ) : null;

  const actionSlot = (
    <>
      <button
        type="button"
        data-feed-action
        onClick={toggleLike}
        aria-pressed={likeState.likedByMe}
        className="flex flex-col items-center gap-0.5 transition active:scale-95"
        // Fixed name; the pressed state alone announces liked/unliked.
        aria-label={`${copy.like}${likeState.likeCount > 0 ? `, ${likeState.likeCount}` : ""}`}
      >
        <Heart
          size={26}
          fill={likeState.likedByMe ? "#ef4444" : "none"}
          stroke={likeState.likedByMe ? "#ef4444" : fg.iconColor}
          strokeWidth={1.8}
          style={iconStyle}
          aria-hidden="true"
        />
        {likeState.likeCount > 0 ? (
          <span className={`text-[11px] font-semibold tabular-nums ${fg.textClass}`} aria-hidden="true">
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
        <MessageCircle size={26} stroke={fg.iconColor} strokeWidth={1.8} style={iconStyle} aria-hidden="true" />
        {post.commentCount > 0 ? (
          <span className={`text-[11px] font-semibold tabular-nums ${fg.textClass}`} aria-hidden="true">
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
        <MoreHorizontal size={26} stroke={fg.iconColor} strokeWidth={1.8} style={iconStyle} aria-hidden="true" />
      </button>

      {/* Accessibility: explicit next / previous beyond the swipe gesture.
          Hidden until focused (keyboard / switch access). */}
      {onGoPrevious ? (
        <button
          type="button"
          data-feed-action
          onClick={onGoPrevious}
          className="sr-only-focusable transition active:scale-95"
          aria-label={copy.previousPost}
        >
          <ChevronUp size={22} strokeWidth={2} stroke={fg.iconColor} style={iconStyle} aria-hidden="true" />
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
          <ChevronDown size={22} strokeWidth={2} stroke={fg.iconColor} style={iconStyle} aria-hidden="true" />
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
      data-foreground-tone={tone}
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
        onImageError={handleImageError}
        imageFailed={imageFailed}
        imageFailedLabel={copy.imageFailed}
        onImageRetry={handleImageRetry}
        imageRetryLabel={copy.retry}
        imageAttempt={imageAttempt}
        imageAspect={imageAspect}
        onImageLoad={handleImageLoad}
        imageLoading={eagerImage ? "eager" : "lazy"}
        previewClampRef={previewClampRef}
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
