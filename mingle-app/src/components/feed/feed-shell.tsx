"use client";

import { BOTTOM_TAB_BAR_HEIGHT_PX } from "@/components/bottom-tab-bar";
import CommentSheet from "@/components/comments/comment-sheet";
import PublishStatusBanner from "@/components/compose/publish-status-banner";
import FeedHeader from "@/components/feed/feed-header";
import FeedPostCard from "@/components/feed/feed-post-card";
import FeedToast from "@/components/feed/feed-toast";
import ImageZoomOverlay from "@/components/feed/image-zoom-overlay";
import SwipeHintOverlay, { markSwipeHintDone } from "@/components/feed/swipe-hint-overlay";
import { usePostViewTracker } from "@/components/feed/use-post-view-tracker";
import { useReducedMotion } from "@/components/feed/use-reduced-motion";
import { useFeedSource } from "@/components/feed/use-feed-source";
import type { LikeState } from "@/components/feed/use-feed-like";
import { loginHref } from "@/components/feed/login-redirect";
import {
  readFeedRestoreState,
  writeFeedRestoreState,
  type FeedPostViewState,
} from "@/components/feed/feed-restore-state";
import PostActionSheet from "@/components/posts/post-action-sheet";
import { feedCopy } from "@/i18n/feed-copy";
import type { FeedSource } from "@/lib/feed-routes";
import { composeHref, notificationsHref } from "@/lib/feed-routes";
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

const CARD_HEIGHT = `calc(100dvh - ${BOTTOM_TAB_BAR_HEIGHT_PX}px - env(safe-area-inset-bottom, 0px))`;
const VIEWER_CARD_HEIGHT = `100dvh`;

export default function FeedShell({ locale, source = { kind: "home" }, startPostId = null, isViewer = false }: FeedShellProps) {
  const copy = useMemo(() => feedCopy(locale), [locale]);
  const reducedMotion = useReducedMotion();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session } = useSession();
  const viewerId = session?.user?.id ?? null;
  const viewerLanguage = locale;

  // Deep link (home feed only): ?postId=&commentId=
  const deepLinkPostId = !isViewer ? searchParams.get("postId") : null;
  const deepLinkCommentId = !isViewer ? searchParams.get("commentId") : null;

  const {
    posts,
    phase,
    loadingMore,
    loadMoreError,
    deepLinkUnavailable,
    onVisibleIndexChange,
    loadMore,
    refresh,
    applyPatch,
    dropPost,
    dropAuthor,
  } = useFeedSource({
    source,
    displayLanguage: viewerLanguage,
    deepLinkPostId,
    startPostId,
  });

  const scrollRef = useRef<HTMLDivElement>(null);
  const [swipeHintVisible, setSwipeHintVisible] = useState(true);
  const hasScrolledRef = useRef(false);
  const [activeIndex, setActiveIndex] = useState(0);

  // Sheets + zoom — while any is open the feed must not swipe.
  const [commentPostId, setCommentPostId] = useState<string | null>(null);
  const [actionPostId, setActionPostId] = useState<string | null>(null);
  const [zoomSrc, setZoomSrc] = useState<string | null>(null);
  const [initialCommentId, setInitialCommentId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const anyOverlayOpen = Boolean(commentPostId || actionPostId || zoomSrc);

  const notifications = useUnreadNotifications(viewerId);

  // ── Per-post restore state ──
  const expandStateRef = useRef<Map<string, FeedPostViewState>>(new Map());
  const restoreAppliedRef = useRef(false);
  const [restoreForPost, setRestoreForPost] = useState<Record<string, FeedPostViewState>>({});

  // Load restore state once posts arrive; scroll to the remembered post.
  useEffect(() => {
    if (restoreAppliedRef.current || posts.length === 0) return;
    restoreAppliedRef.current = true;
    const saved = readFeedRestoreState(source);
    if (!saved) return;
    setRestoreForPost(saved.posts);
    for (const [id, st] of Object.entries(saved.posts)) {
      expandStateRef.current.set(id, st);
    }
    if (saved.activePostId) {
      const idx = posts.findIndex((p) => p.id === saved.activePostId);
      if (idx > 0 && scrollRef.current) {
        const container = scrollRef.current;
        requestAnimationFrame(() => {
          const cardH = container.firstElementChild?.getBoundingClientRect().height ?? 1;
          container.scrollTop = idx * cardH;
          setActiveIndex(idx);
        });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [posts.length]);

  // Persist restore state as the active post / expand changes.
  const persistRestore = useCallback(() => {
    const activePostId = posts[activeIndex]?.id ?? null;
    writeFeedRestoreState(source, {
      activePostId,
      posts: Object.fromEntries(expandStateRef.current),
    });
  }, [posts, activeIndex, source]);

  useEffect(() => {
    persistRestore();
  }, [persistRestore]);

  // Open the comment sheet for a deep-linked comment once its post is present.
  useEffect(() => {
    if (!deepLinkCommentId || !deepLinkPostId) return;
    if (posts.some((p) => p.id === deepLinkPostId)) {
      setCommentPostId(deepLinkPostId);
      setInitialCommentId(deepLinkCommentId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [posts.length, deepLinkCommentId, deepLinkPostId]);

  // Notify the deep-linked-post-gone case.
  useEffect(() => {
    if (deepLinkUnavailable) setToast(copy.postUnavailable);
  }, [deepLinkUnavailable, copy]);

  // Track the active card by scroll position.
  const handleScroll = useCallback(() => {
    if (!hasScrolledRef.current) {
      hasScrolledRef.current = true;
      markSwipeHintDone();
      setSwipeHintVisible(false);
    }
    const container = scrollRef.current;
    if (!container) return;
    const cardH = container.firstElementChild?.getBoundingClientRect().height ?? 1;
    const idx = Math.round(container.scrollTop / cardH);
    if (idx !== activeIndex) {
      setActiveIndex(idx);
      onVisibleIndexChange(idx);
    }
  }, [activeIndex, onVisibleIndexChange]);

  // The active post drives the "seen" view tracker (paused while an overlay is open).
  const activePostId = anyOverlayOpen ? null : posts[activeIndex]?.id ?? null;
  usePostViewTracker({ activePostId, isSignedIn: Boolean(viewerId) });

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
      router.push(loginHref(locale, postId ?? posts[activeIndex]?.id ?? null));
    },
    [router, locale, posts, activeIndex],
  );

  const scrollToIndex = useCallback((idx: number) => {
    const container = scrollRef.current;
    if (!container) return;
    const cardH = container.firstElementChild?.getBoundingClientRect().height ?? 1;
    container.scrollTo({ top: idx * cardH, behavior: "smooth" });
  }, []);

  const handleExpandChange = useCallback(
    (postId: string, expanded: boolean, scrollTop: number) => {
      expandStateRef.current.set(postId, { expanded, scrollTop });
    },
    [],
  );

  const handleLikeChange = useCallback(
    (postId: string, state: LikeState) => {
      applyPatch(postId, { likedByMe: state.likedByMe, likeCount: state.likeCount });
    },
    [applyPatch],
  );

  const handleFollowed = useCallback(
    (authorId: string) => {
      posts.forEach((p) => {
        if (p.author.id === authorId) applyPatch(p.id, { followingAuthor: true });
      });
    },
    [posts, applyPatch],
  );

  const handleCommentCountChange = useCallback(
    (postId: string, commentCount: number) => applyPatch(postId, { commentCount }),
    [applyPatch],
  );

  const cardHeight = isViewer ? VIEWER_CARD_HEIGHT : CARD_HEIGHT;
  const commentPost = posts.find((p) => p.id === commentPostId) ?? null;
  const actionPost = posts.find((p) => p.id === actionPostId) ?? null;

  // ── Render states ──
  if (phase === "loading") {
    return (
      <div className="flex h-full w-full items-center justify-center bg-black text-sm text-white/80">
        {copy.loading}
      </div>
    );
  }

  if (phase === "error") {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-4 bg-black px-8 text-center">
        <p className="text-sm text-white/80">{copy.feedLoadFailed}</p>
        <button
          type="button"
          onClick={refresh}
          className="rounded-full bg-white/15 px-5 py-2 text-sm font-semibold text-white backdrop-blur-sm transition active:scale-95"
        >
          {copy.retry}
        </button>
      </div>
    );
  }

  if (posts.length === 0) {
    return (
      <div className="relative flex h-full w-full flex-col bg-black">
        {!isViewer ? (
          <FeedHeader
            composeLabel={copy.compose}
            notificationsLabel={copy.notifications}
            hasUnread={notifications.hasUnread}
            onCompose={() => (viewerId ? router.push(composeHref(locale)) : goToLogin())}
            onNotifications={() => router.push(notificationsHref(locale))}
          />
        ) : null}
        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-8 text-center">
          <p className="text-base font-semibold text-white">{copy.emptyTitle}</p>
          <button
            type="button"
            onClick={() => (viewerId ? router.push(composeHref(locale)) : goToLogin())}
            className="rounded-full bg-white/15 px-5 py-2 text-sm font-semibold text-white backdrop-blur-sm transition active:scale-95"
          >
            {copy.emptyAction}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex h-full min-h-0 w-full flex-col overflow-hidden bg-black">
      {!isViewer ? (
        <>
          <FeedHeader
            composeLabel={copy.compose}
            notificationsLabel={copy.notifications}
            hasUnread={notifications.hasUnread}
            onCompose={() => (viewerId ? router.push(composeHref(locale)) : goToLogin())}
            onNotifications={() => router.push(notificationsHref(locale))}
          />
          <PublishStatusBanner locale={locale} />
        </>
      ) : null}

      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto"
        onScroll={handleScroll}
        style={{
          scrollSnapType: "y mandatory",
          WebkitOverflowScrolling: "touch",
          overscrollBehavior: "contain",
          // Block vertical paging while a sheet / zoom is open.
          overflowY: anyOverlayOpen ? "hidden" : "auto",
          touchAction: anyOverlayOpen ? "none" : undefined,
        }}
      >
        {posts.map((post, idx) => {
          const saved = restoreForPost[post.id] ?? expandStateRef.current.get(post.id);
          return (
            <FeedPostCard
              key={post.id}
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

        {/* Load-more affordance / error */}
        {loadMoreError ? (
          <div className="flex items-center justify-center gap-3 py-4">
            <span className="text-xs text-white/70">{copy.loadMoreFailed}</span>
            <button
              type="button"
              onClick={loadMore}
              className="rounded-full bg-white/15 px-3 py-1 text-xs font-semibold text-white transition active:scale-95"
            >
              {copy.retry}
            </button>
          </div>
        ) : loadingMore ? (
          <div className="flex items-center justify-center py-4 text-xs text-white/60">
            {copy.loadingMore}
          </div>
        ) : null}
      </div>

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
