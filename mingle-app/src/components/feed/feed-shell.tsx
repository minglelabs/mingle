"use client";

import AppTopHeader from "@/components/app-top-header";
import { BOTTOM_TAB_BAR_HEIGHT_PX } from "@/components/bottom-tab-bar";
import CommentSheet from "@/components/comments/comment-sheet";
import PublishStatusBanner from "@/components/compose/publish-status-banner";
import FeedPostCard from "@/components/feed/feed-post-card";
import FeedToast from "@/components/feed/feed-toast";
import ImageZoomOverlay from "@/components/feed/image-zoom-overlay";
import SwipeHintOverlay, { markSwipeHintDone } from "@/components/feed/swipe-hint-overlay";
import { usePostViewTracker } from "@/components/feed/use-post-view-tracker";
import { useReducedMotion } from "@/components/feed/use-reduced-motion";
import { useFeedSource } from "@/components/feed/use-feed-source";
import type { LikeState } from "@/components/feed/use-feed-like";
import { composeLoginHref, loginHref } from "@/components/feed/login-redirect";
import {
  createDeepLinkCommentLatch,
  createFeedRestoreSession,
  feedSourceCacheKey,
  planFeedStart,
  type FeedPostViewState,
} from "@/components/feed/feed-restore-state";
import PostActionSheet from "@/components/posts/post-action-sheet";
import { feedCopy } from "@/i18n/feed-copy";
import type { FeedSource } from "@/lib/feed-routes";
import { composeHref, feedHref, notificationsHref } from "@/lib/feed-routes";
import { postForegroundTone } from "@/lib/post-backgrounds";
import { useUnreadNotifications } from "@/components/notifications/use-unread-notifications";
import { useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type FeedShellProps = {
  locale: string;
  /** The list this shell renders. Defaults to the home feed. */
  source?: FeedSource;
  /** Viewer route: start on this post; back navigates with router.back(). */
  startPostId?: string | null;
  /** Viewer route uses history back instead of the compose/notification chrome. */
  isViewer?: boolean;
};

/** Stable default so the home feed does not get a fresh `source` every render. */
const HOME_SOURCE: FeedSource = { kind: "home" };

/** First-paint estimate only; replaced by the measured container height. */
const FALLBACK_CARD_HEIGHT = `calc(100dvh - ${BOTTOM_TAB_BAR_HEIGHT_PX}px - env(safe-area-inset-bottom, 0px))`;
const FALLBACK_VIEWER_CARD_HEIGHT = `100dvh`;

/** Bottom edge of the transparent `AppTopHeader` (its own height + top safe area). */
const HEADER_BOTTOM = "calc(56px + env(safe-area-inset-top, 44px))";

export default function FeedShell({ locale, source: sourceProp, startPostId = null, isViewer = false }: FeedShellProps) {
  const copy = useMemo(() => feedCopy(locale), [locale]);
  const reducedMotion = useReducedMotion();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session } = useSession();
  const viewerId = session?.user?.id ?? null;
  const viewerLanguage = locale;

  // Identity follows the source's value, not its object reference.
  const sourceCacheKey = feedSourceCacheKey(sourceProp ?? HOME_SOURCE);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const source = useMemo(() => sourceProp ?? HOME_SOURCE, [sourceCacheKey]);

  // Deep link (home feed only): ?postId=&commentId=
  const deepLinkPostId = !isViewer ? searchParams.get("postId") : null;
  const deepLinkCommentId = !isViewer ? searchParams.get("commentId") : null;

  // ── Restore state: read synchronously before any card mounts ──
  // Cards read `restoreExpanded` only at mount, so the saved state must exist
  // on the first render that shows them. Writes stay disabled until the list
  // is on screen, so the empty first render cannot wipe the saved position.
  const restoreSession = useMemo(() => createFeedRestoreSession(source), [source]);
  const restoredPosts = useMemo(() => restoreSession.initial?.posts ?? {}, [restoreSession]);
  const expandState = useMemo(
    () => new Map<string, FeedPostViewState>(Object.entries(restoredPosts)),
    [restoredPosts],
  );
  const startPlan = planFeedStart({
    deepLinkPostId,
    startPostId,
    saved: isViewer ? null : restoreSession.initial,
  });

  const {
    posts,
    entries,
    phase,
    loadingMore,
    loadMoreError,
    hasMore,
    deepLinkUnavailable,
    onVisibleIndexChange,
    loadMore,
    refresh,
    applyPatch,
    applyAuthorPatch,
    dropPost,
    dropAuthor,
    startIndex,
  } = useFeedSource({
    source,
    displayLanguage: viewerLanguage,
    deepLinkPostId,
    restorePostId: startPlan.restorePostId,
    startPostId,
  });

  const [scrollEl, setScrollEl] = useState<HTMLDivElement | null>(null);
  const [swipeHintVisible, setSwipeHintVisible] = useState(true);
  const hasScrolledRef = useRef(false);
  // Only a real gesture (touch / wheel / pointer / key) may complete the swipe
  // hint; programmatic restore scrolls must not.
  const userGestureRef = useRef(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const activeIndexRef = useRef(0);
  const [restoreReady, setRestoreReady] = useState(false);
  const [measuredHeight, setMeasuredHeight] = useState<number | null>(null);

  // Sheets + zoom — while any is open the feed must not swipe.
  const [commentPostId, setCommentPostId] = useState<string | null>(null);
  const [actionPostId, setActionPostId] = useState<string | null>(null);
  const [zoomSrc, setZoomSrc] = useState<string | null>(null);
  const [initialCommentId, setInitialCommentId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const anyOverlayOpen = Boolean(commentPostId || actionPostId || zoomSrc);

  const notifications = useUnreadNotifications(viewerId);

  const setActive = useCallback((idx: number) => {
    activeIndexRef.current = idx;
    setActiveIndex(idx);
  }, []);

  const cardPixelHeight = useCallback((): number => {
    if (measuredHeight && measuredHeight > 0) return measuredHeight;
    return scrollEl?.firstElementChild?.getBoundingClientRect().height || 1;
  }, [measuredHeight, scrollEl]);

  // ── Card height = the real scroll container height ──
  useEffect(() => {
    if (!scrollEl) return;
    const measure = () => {
      const h = scrollEl.clientHeight;
      if (h <= 0) return;
      setMeasuredHeight((prev) => (prev === h ? prev : h));
      // Keep the active card snapped when the container resizes (keyboard, rotation).
      const target = activeIndexRef.current * h;
      if (Math.abs(scrollEl.scrollTop - target) > 1) scrollEl.scrollTop = target;
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(scrollEl);
    return () => observer.disconnect();
  }, [scrollEl]);

  // ── Apply the start position once the list is on screen, then allow writes ──
  useEffect(() => {
    if (restoreReady || phase !== "ready" || posts.length === 0 || !scrollEl) return;
    // Deep link and restored post are placed first by the list (index 0); a
    // viewer opens at its selected post in grid order.
    const targetIndex = startPlan.kind === "viewer" ? startIndex : 0;
    const finish = () => {
      restoreSession.markReady();
      setRestoreReady(true);
    };
    if (targetIndex > 0) {
      const frame = requestAnimationFrame(() => {
        scrollEl.scrollTop = targetIndex * cardPixelHeight();
        setActive(targetIndex);
        finish();
      });
      return () => cancelAnimationFrame(frame);
    }
    finish();
    return undefined;
  }, [restoreReady, phase, posts.length, scrollEl, startPlan.kind, startIndex, restoreSession, cardPixelHeight, setActive]);

  // ── Persist the active post + per-post expand state ──
  const persistRestore = useCallback(() => {
    if (posts.length === 0) return;
    const idx = Math.min(activeIndexRef.current, posts.length - 1);
    restoreSession.persist({
      activePostId: posts[idx]?.id ?? null,
      posts: Object.fromEntries(expandState),
    });
  }, [posts, restoreSession, expandState]);

  useEffect(() => {
    if (!restoreReady) return;
    persistRestore();
  }, [restoreReady, activeIndex, persistRestore]);

  // ── Deep-linked comment: open its sheet exactly once ──
  const commentLatch = useMemo(
    () => createDeepLinkCommentLatch(deepLinkPostId, deepLinkCommentId),
    [deepLinkPostId, deepLinkCommentId],
  );
  useEffect(() => {
    const hit = commentLatch.take((id) => posts.some((p) => p.id === id));
    if (!hit) return;
    setCommentPostId(hit.postId);
    setInitialCommentId(hit.commentId);
    // Drop `commentId` from the URL so a later re-render / return cannot reopen it.
    router.replace(feedHref(locale, { postId: hit.postId }), { scroll: false });
  }, [commentLatch, posts, router, locale]);

  // Notify the linked-post-gone / remembered-post-gone case.
  useEffect(() => {
    if (deepLinkUnavailable) setToast(copy.postUnavailable);
  }, [deepLinkUnavailable, copy]);

  const markUserGesture = useCallback(() => {
    userGestureRef.current = true;
  }, []);

  // Track the active card by scroll position (index === posts.length is the
  // load-more status card).
  const handleScroll = useCallback(() => {
    if (!hasScrolledRef.current && userGestureRef.current) {
      hasScrolledRef.current = true;
      markSwipeHintDone();
      setSwipeHintVisible(false);
    }
    if (!scrollEl) return;
    const idx = Math.max(0, Math.min(posts.length, Math.round(scrollEl.scrollTop / cardPixelHeight())));
    if (idx !== activeIndexRef.current) {
      setActive(idx);
      onVisibleIndexChange(idx);
    }
  }, [scrollEl, posts.length, cardPixelHeight, setActive, onVisibleIndexChange]);

  const activePost = posts[activeIndex] ?? null;

  // The active post drives the "seen" view tracker (paused while an overlay is open).
  const trackedPostId = anyOverlayOpen ? null : activePost?.id ?? null;
  usePostViewTracker({ activePostId: trackedPostId, isSignedIn: Boolean(viewerId) });

  // Refresh unread dot on focus / visibility.
  useEffect(() => {
    const onFocus = () => notifications.refresh();
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [notifications]);

  // ── Handlers ──
  const goToLogin = useCallback(
    (postId?: string | null) => {
      router.push(loginHref(locale, postId ?? activePost?.id ?? null));
    },
    [router, locale, activePost],
  );

  const openCompose = useCallback(() => {
    router.push(viewerId ? composeHref(locale) : composeLoginHref(locale));
  }, [router, viewerId, locale]);

  const openNotifications = useCallback(() => router.push(notificationsHref(locale)), [router, locale]);

  const scrollToIndex = useCallback(
    (idx: number) => {
      if (!scrollEl) return;
      scrollEl.scrollTo({ top: idx * cardPixelHeight(), behavior: reducedMotion ? "auto" : "smooth" });
    },
    [scrollEl, cardPixelHeight, reducedMotion],
  );

  const handleExpandChange = useCallback(
    (postId: string, expanded: boolean, scrollTop: number) => {
      expandState.set(postId, { expanded, scrollTop });
      if (restoreReady) persistRestore();
    },
    [expandState, restoreReady, persistRestore],
  );

  const handleLikeChange = useCallback(
    (postId: string, state: LikeState) => {
      applyPatch(postId, { likedByMe: state.likedByMe, likeCount: state.likeCount });
    },
    [applyPatch],
  );

  // Every card by this author (all appearances) hides its follow button.
  const handleFollowed = useCallback(
    (authorId: string) => applyAuthorPatch(authorId, { followingAuthor: true }),
    [applyAuthorPatch],
  );

  const handleCommentCountChange = useCallback(
    (postId: string, commentCount: number) => applyPatch(postId, { commentCount }),
    [applyPatch],
  );

  const cardHeight = measuredHeight
    ? `${measuredHeight}px`
    : isViewer
      ? FALLBACK_VIEWER_CARD_HEIGHT
      : FALLBACK_CARD_HEIGHT;
  const commentPost = posts.find((p) => p.id === commentPostId) ?? null;
  const actionPost = posts.find((p) => p.id === actionPostId) ?? null;
  const glyphTone = activePost ? postForegroundTone(activePost.backgroundKey, Boolean(activePost.image)) : "light";

  // Background publish progress floats over the feed, below the transparent
  // header, in every state (loading / error / empty / list).
  const publishBanner = !isViewer ? (
    <div className="pointer-events-none absolute inset-x-0 z-[25]" style={{ top: HEADER_BOTTOM }}>
      <div className="pointer-events-auto">
        <PublishStatusBanner locale={locale} />
      </div>
    </div>
  ) : null;

  const header = !isViewer ? (
    <AppTopHeader
      variant="transparent"
      composeLabel={copy.compose}
      notificationsLabel={copy.notifications}
      hasUnread={notifications.hasUnread}
      onCompose={openCompose}
      onNotifications={openNotifications}
      glyphTone={glyphTone}
    />
  ) : null;

  // ── Render states ──
  if (phase === "loading") {
    return (
      <div className="relative flex h-full w-full items-center justify-center bg-black text-sm text-white/80">
        {copy.loading}
        {publishBanner}
      </div>
    );
  }

  if (phase === "error") {
    return (
      <div className="relative flex h-full w-full flex-col items-center justify-center gap-4 bg-black px-8 text-center">
        <p className="text-sm text-white/80">{copy.feedLoadFailed}</p>
        <button
          type="button"
          onClick={refresh}
          className="rounded-full bg-white/15 px-5 py-2 text-sm font-semibold text-white backdrop-blur-sm transition active:scale-95"
        >
          {copy.retry}
        </button>
        {publishBanner}
      </div>
    );
  }

  if (posts.length === 0) {
    return (
      <div className="relative flex h-full w-full flex-col bg-black">
        {header}
        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-8 text-center">
          <p className="text-base font-semibold text-white">{copy.emptyTitle}</p>
          <button
            type="button"
            onClick={openCompose}
            className="rounded-full bg-white/15 px-5 py-2 text-sm font-semibold text-white backdrop-blur-sm transition active:scale-95"
          >
            {copy.emptyAction}
          </button>
        </div>
        {publishBanner}
      </div>
    );
  }

  const showStatusCard = hasMore || loadingMore || loadMoreError;

  return (
    <div className="relative flex h-full min-h-0 w-full flex-col overflow-hidden bg-black">
      {header}

      <div
        ref={setScrollEl}
        className="min-h-0 flex-1 overflow-y-auto"
        onScroll={handleScroll}
        onTouchStart={markUserGesture}
        onWheel={markUserGesture}
        onPointerDown={markUserGesture}
        onKeyDown={markUserGesture}
        style={{
          scrollSnapType: "y mandatory",
          WebkitOverflowScrolling: "touch",
          overscrollBehavior: "contain",
          // Block vertical paging while a sheet / zoom is open.
          overflowY: anyOverlayOpen ? "hidden" : "auto",
          touchAction: anyOverlayOpen ? "none" : undefined,
        }}
      >
        {entries.map(({ key, post }, idx) => {
          const saved = expandState.get(post.id) ?? restoredPosts[post.id];
          return (
            <FeedPostCard
              key={key}
              post={post}
              cardHeight={cardHeight}
              locale={locale}
              copy={copy}
              viewerId={viewerId}
              viewerLanguage={viewerLanguage}
              reducedMotion={reducedMotion}
              restoreExpanded={saved?.expanded ?? false}
              restoreScrollTop={saved?.scrollTop ?? 0}
              onExpandStateChange={(exp, st) => handleExpandChange(post.id, exp, st)}
              onRequireLogin={goToLogin}
              onOpenComments={(id) => {
                setInitialCommentId(null);
                setCommentPostId(id);
              }}
              onOpenActions={(id) => setActionPostId(id)}
              onOpenAuthor={(authorId) => router.push(`/${locale}/users/${encodeURIComponent(authorId)}`)}
              onOpenImage={(src) => setZoomSrc(src)}
              onLikeChange={handleLikeChange}
              onFollowed={handleFollowed}
              onToast={setToast}
              onGoPrevious={idx > 0 ? () => scrollToIndex(idx - 1) : undefined}
              onGoNext={idx < posts.length - 1 ? () => scrollToIndex(idx + 1) : undefined}
            />
          );
        })}

        {/* Load-more status: a snap target of card height so it is visible and tappable. */}
        {showStatusCard ? (
          <div
            className="flex w-full shrink-0 snap-start snap-always flex-col items-center justify-center gap-4 px-8 text-center"
            style={{ height: cardHeight }}
            role="status"
            aria-live="polite"
          >
            {loadMoreError ? (
              <>
                <p className="text-sm text-white/80">{copy.loadMoreFailed}</p>
                <button
                  type="button"
                  onClick={loadMore}
                  className="min-h-11 rounded-full bg-white/15 px-5 py-2 text-sm font-semibold text-white backdrop-blur-sm transition active:scale-95"
                >
                  {copy.retry}
                </button>
              </>
            ) : (
              <p className="text-sm text-white/60">{copy.loadingMore}</p>
            )}
          </div>
        ) : null}
      </div>

      {publishBanner}

      {swipeHintVisible && !anyOverlayOpen ? (
        <SwipeHintOverlay
          hasNextPost={posts.length > 1}
          onDismiss={() => setSwipeHintVisible(false)}
          label={copy.nextPost}
        />
      ) : null}

      <FeedToast message={toast} onDismiss={() => setToast(null)} reducedMotion={reducedMotion} />

      {/* Stubs — bodies belong to other teams; we wire props + swipe blocking. */}
      <CommentSheet
        open={Boolean(commentPostId)}
        postId={commentPostId ?? ""}
        postAuthorId={commentPost?.author.id ?? ""}
        locale={locale}
        viewerId={viewerId}
        initialCommentId={initialCommentId}
        onClose={() => {
          setCommentPostId(null);
          setInitialCommentId(null);
        }}
        onCommentCountChange={(count) => {
          if (commentPostId) handleCommentCountChange(commentPostId, count);
        }}
        onRequireLogin={() => goToLogin(commentPostId)}
      />

      {actionPost ? (
        <PostActionSheet
          open={Boolean(actionPostId)}
          post={{
            id: actionPost.id,
            author: actionPost.author,
            isMine: actionPost.isMine,
            visibility: actionPost.visibility,
          }}
          locale={locale}
          viewerId={viewerId}
          onClose={() => setActionPostId(null)}
          onPostRemoved={(postId) => {
            dropPost(postId);
            setActionPostId(null);
          }}
          onAuthorBlocked={(authorId) => {
            dropAuthor(authorId);
            setActionPostId(null);
          }}
          onRequireLogin={() => goToLogin(actionPostId)}
        />
      ) : null}

      <ImageZoomOverlay
        open={Boolean(zoomSrc)}
        src={zoomSrc ?? ""}
        alt=""
        closeLabel={copy.closeImage}
        reducedMotion={reducedMotion}
        onClose={() => setZoomSrc(null)}
      />
    </div>
  );
}
