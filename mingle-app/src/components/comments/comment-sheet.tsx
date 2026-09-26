"use client";

/**
 * CommentSheet (C3) — bottom sheet listing a post's comments and one-level
 * replies. The feed card (C1) opens it with these frozen props. While it is
 * open the feed behind must not swipe; C1 also freezes feed scroll on `open`.
 *
 * The props type below is the frozen contract — do not change its shape.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useSession } from "next-auth/react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { commentsCopy, formatCommentsCopy } from "@/i18n/comments-copy";
import { registerNativeBackHandler } from "@/lib/native-back-handler";
import ReportSheet, { type ReportTarget } from "@/components/reports/report-sheet";
import type { CommentNode } from "./comment-types";
import { useCommentSheet, type ReplyTarget } from "./use-comment-sheet";
import CommentItem, { type CommentItemHandlers } from "./comment-item";
import CommentComposer from "./comment-composer";

export type CommentSheetProps = {
  open: boolean;
  postId: string;
  postAuthorId: string;
  locale: string;
  /** null when signed out: the list is readable, writing and liking call onRequireLogin. */
  viewerId: string | null;
  /** Scroll to this comment or reply; a reply's collapsed thread is expanded first. */
  initialCommentId?: string | null;
  onClose: () => void;
  /** The post's comment count as the API reports it after a create or delete. */
  onCommentCountChange?: (commentCount: number) => void;
  onRequireLogin: () => void;
};

/**
 * The signed-in viewer's identity for optimistic rows (name, avatar, handle)
 * comes from next-auth `useSession` — the same source the feed and compose
 * screens use — not a bespoke global. `viewerId` still arrives as a frozen
 * prop (the caller already resolved it); the session only supplies the display
 * fields. The viewer's DISPLAY language is the route `locale`, matching
 * FeedShell (`viewerLanguage = locale`); it drives translation only, never the
 * body's source language.
 */

export default function CommentSheet(props: CommentSheetProps) {
  const { open, postId, postAuthorId, locale, viewerId, initialCommentId, onClose, onCommentCountChange, onRequireLogin } = props;
  const copy = commentsCopy(locale);

  const { data: session } = useSession();
  const viewer = useMemo(() => {
    if (!viewerId) return null;
    const user = session?.user as
      | { id?: string; name?: string | null; image?: string | null; handle?: string }
      | undefined;
    return {
      id: viewerId,
      handle: user?.handle ?? "",
      name: user?.name ?? null,
      image: user?.image ?? null,
    };
  }, [viewerId, session]);

  // Display language = route locale (same as FeedShell). Drives translation
  // requests and the translate affordance; it is NOT the comment body language.
  const viewerLanguage = locale;

  const [mounted, setMounted] = useState(false);
  const [reportTarget, setReportTarget] = useState<ReportTarget | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const id = window.requestAnimationFrame(() => setMounted(true));
    return () => window.cancelAnimationFrame(id);
  }, []);

  const sheet = useCommentSheet({
    open,
    postId,
    postAuthorId,
    viewerId,
    viewer: viewer ? { id: viewer.id, handle: viewer.handle, name: viewer.name, image: viewer.image } : null,
    viewerLanguage,
    initialCommentId,
    onCommentCountChange,
    onRequireLogin,
  });

  // ── Back / Escape closes the sheet ──────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    const unregister = registerNativeBackHandler(() => {
      onClose();
      return true;
    }, 10);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      unregister();
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  // ── Lock the background from scrolling / swiping while open ──────────────
  useEffect(() => {
    if (!open) return;
    const { body } = document;
    const prevOverflow = body.style.overflow;
    const prevOverscroll = body.style.overscrollBehavior;
    body.style.overflow = "hidden";
    body.style.overscrollBehavior = "contain";
    return () => {
      body.style.overflow = prevOverflow;
      body.style.overscrollBehavior = prevOverscroll;
    };
  }, [open]);

  // ── Keep the composer above the keyboard using visualViewport ────────────
  const [keyboardInset, setKeyboardInset] = useState(0);
  useEffect(() => {
    if (!open || typeof window === "undefined" || !window.visualViewport) return;
    const vv = window.visualViewport;
    const onResize = () => {
      // How much of the layout viewport the keyboard covers at the bottom.
      const inset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      setKeyboardInset(inset);
    };
    const initial = window.requestAnimationFrame(onResize);
    vv.addEventListener("resize", onResize);
    vv.addEventListener("scroll", onResize);
    return () => {
      window.cancelAnimationFrame(initial);
      vv.removeEventListener("resize", onResize);
      vv.removeEventListener("scroll", onResize);
    };
  }, [open]);

  // ── Scroll to initialCommentId once its thread is expanded ───────────────
  useEffect(() => {
    if (sheet.phase !== "ready" || !initialCommentId) return;
    const container = scrollRef.current;
    if (!container) return;
    const id = window.requestAnimationFrame(() => {
      const target = container.querySelector<HTMLElement>(`[data-comment-id="${CSS.escape(initialCommentId)}"]`);
      if (target) target.scrollIntoView({ block: "center" });
    });
    return () => window.cancelAnimationFrame(id);
  }, [sheet.phase, initialCommentId, sheet.expanded, sheet.nodes]);

  const handlers: CommentItemHandlers = {
    onToggleLike: sheet.toggleLike,
    onStartReply: (comment: CommentNode) => {
      const target: NonNullable<ReplyTarget> = {
        parentId: comment.parentId ?? comment.id,
        replyToUserId: comment.authorId,
        replyToUser: { id: comment.author.id, handle: comment.author.handle, name: comment.author.name },
        label: comment.author.name ?? comment.author.handle,
      };
      sheet.startReply(target);
    },
    onEdit: sheet.edit,
    onDelete: sheet.remove,
    onReport: (comment: CommentNode) => {
      setReportTarget({ type: "comment", commentId: comment.id, authorId: comment.authorId });
    },
    onToggleTranslation: sheet.toggleTranslation,
    onRetryFailed: sheet.retryFailed,
    onDiscardFailed: sheet.discardFailed,
  };

  const noticeText = useMemo(() => {
    const n = sheet.notice;
    if (!n) return null;
    if (n.kind === "rate_limited") return formatCommentsCopy(copy.rateLimited, { n: n.retryAfterSeconds });
    return copy.actionFailed;
  }, [sheet.notice, copy]);

  if (!open || !mounted) return null;

  const body = (
    <div
      className="fixed inset-0 z-50 flex flex-col justify-end"
      role="dialog"
      aria-modal="true"
      aria-label={copy.title}
    >
      {/* Backdrop — tap to close, swallows background touches. */}
      <button
        type="button"
        aria-label={copy.close}
        onClick={onClose}
        className="absolute inset-0 bg-black/40"
        tabIndex={-1}
      />

      <div
        ref={panelRef}
        className={cn(
          "relative flex max-h-[85vh] min-h-[50vh] flex-col overflow-hidden rounded-t-2xl bg-background shadow-2xl",
          "motion-safe:animate-in motion-safe:slide-in-from-bottom motion-safe:duration-200",
        )}
        style={{ paddingBottom: keyboardInset ? keyboardInset : undefined }}
        // Keep touches inside the sheet from reaching the feed behind it.
        onTouchMove={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="text-[15px] font-semibold">
            {copy.title}
            {sheet.commentCount > 0 && (
              <span className="ml-1.5 text-muted-foreground">{sheet.commentCount}</span>
            )}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={copy.close}
            className="rounded-full p-1.5 text-muted-foreground hover:bg-muted"
          >
            <X className="size-5" aria-hidden />
          </button>
        </div>

        {/* List */}
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto overscroll-contain px-2 py-2"
        >
          {sheet.phase === "loading" && (
            <p className="py-8 text-center text-[14px] text-muted-foreground">{copy.loading}</p>
          )}
          {sheet.phase === "error" && (
            <div className="py-8 text-center">
              <p className="text-[14px] text-muted-foreground">{copy.loadError}</p>
              <button
                type="button"
                onClick={() => void sheet.reload()}
                className="mt-2 rounded-md bg-muted px-3 py-1.5 text-[13px] font-medium"
              >
                {copy.retry}
              </button>
            </div>
          )}
          {sheet.phase === "ready" && sheet.nodes.length === 0 && (
            <p className="py-8 text-center text-[14px] text-muted-foreground">{copy.empty}</p>
          )}

          {sheet.phase === "ready" &&
            sheet.nodes.map((comment) => {
              const replies = comment.replies ?? [];
              const isExpanded = sheet.expanded.has(comment.id);
              return (
                <div key={comment.id} className="border-b border-border/60 last:border-b-0">
                  <CommentItem
                    comment={comment}
                    isReply={false}
                    locale={locale}
                    viewerId={viewerId}
                    postAuthorId={postAuthorId}
                    viewerLanguage={viewerLanguage}
                    handlers={handlers}
                  />

                  {replies.length > 0 && (
                    <div className="ml-10">
                      <button
                        type="button"
                        onClick={() => sheet.toggleReplies(comment.id)}
                        aria-expanded={isExpanded}
                        className="px-2 py-1 text-[13px] font-medium text-muted-foreground"
                      >
                        {isExpanded
                          ? copy.hideReplies
                          : formatCommentsCopy(copy.viewReplies, { n: replies.length })}
                      </button>

                      {isExpanded &&
                        replies.map((reply) => (
                          <CommentItem
                            key={reply.id}
                            comment={reply}
                            isReply
                            locale={locale}
                            viewerId={viewerId}
                            postAuthorId={postAuthorId}
                            viewerLanguage={viewerLanguage}
                            handlers={handlers}
                          />
                        ))}
                    </div>
                  )}
                </div>
              );
            })}
        </div>

        {/* Notice (rate limit / error) */}
        {noticeText && (
          <div
            role="status"
            className="flex items-center justify-between gap-2 bg-muted px-4 py-2 text-[13px] text-foreground"
          >
            <span>{noticeText}</span>
            <button type="button" onClick={sheet.dismissNotice} aria-label={copy.close}>
              <X className="size-4" aria-hidden />
            </button>
          </div>
        )}

        {/* Composer or signed-out hint */}
        {viewerId === null ? (
          <div className="border-t border-border px-4 py-3 text-center text-[14px] text-muted-foreground">
            <button type="button" onClick={onRequireLogin} className="font-medium text-primary">
              {copy.signedOutHint}
            </button>
          </div>
        ) : (
          <CommentComposer
            locale={locale}
            sending={sheet.sending}
            disabled={false}
            replyTarget={sheet.replyTarget}
            onCancelReply={sheet.cancelReply}
            onSubmit={sheet.submit}
          />
        )}
      </div>

      {/* Report flow for others' comments (R team owns the sheet body). */}
      {reportTarget && (
        <ReportSheet
          open={reportTarget !== null}
          target={reportTarget}
          locale={locale}
          onClose={() => setReportTarget(null)}
        />
      )}
    </div>
  );

  return createPortal(body, document.body);
}
