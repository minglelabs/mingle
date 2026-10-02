"use client";

import { feedEvents, trackFeedEvent } from "@/lib/feed-analytics";
import { useCallback, useEffect, useRef, useState } from "react";

import * as api from "./comment-api";
import type { CommentNode } from "./comment-types";
import {
  applyDelete,
  applyEdit,
  applyCreateFailure,
  applyLikeToggle,
  confirmNode,
  failedRetryTarget,
  findNode,
  insertOptimistic,
  makeOptimisticNode,
  mapNode,
  nextTranslationToggle,
  removeNode,
  rootIdOf,
  setTranslation,
  toNodes,
} from "./comment-state";

export type LoadPhase = "idle" | "loading" | "ready" | "error";

export type Notice =
  | { kind: "rate_limited"; retryAfterSeconds: number }
  /** The account is restricted by an operator: permanent, no retry offered. */
  | { kind: "account_restricted" }
  | { kind: "error"; message: string }
  | null;

export type ReplyTarget = {
  /** Root comment the reply is threaded under. */
  parentId: string;
  /** User being replied to (for the @name affordance). */
  replyToUserId: string | null;
  replyToUser: CommentNode["replyToUser"];
  /** Display name to show in the composer banner. */
  label: string;
} | null;

type Author = NonNullable<CommentNode["author"]>;

/** Where a new comment goes: a top-level comment (null) or a reply in a thread. */
type SendTarget = {
  parentId: string | null;
  replyToUserId: string | null;
  replyToUser: CommentNode["replyToUser"];
} | null;

/**
 * Result of a create or edit. `restricted` means the account is restricted:
 * the caller keeps what the viewer typed (composer text / edit draft) because
 * no failed row with a retry is created for it.
 */
export type WriteOutcome = "sent" | "failed" | "restricted" | "skipped";

export type UseCommentSheetArgs = {
  open: boolean;
  postId: string;
  postAuthorId: string;
  viewerId: string | null;
  viewer: Author | null;
  viewerLanguage: string | null;
  initialCommentId?: string | null;
  onCommentCountChange?: (commentCount: number) => void;
  onRequireLogin: () => void;
};

let tempCounter = 0;
function nextTempId(): string {
  tempCounter += 1;
  return `tmp-${Date.now()}-${tempCounter}`;
}

/**
 * All comment-sheet data + interaction state. Optimistic for likes, creates,
 * edits and deletes; rolls back on failure and surfaces 429 as a notice.
 * The pure folds live in comment-state.ts and are unit tested there.
 */
export function useCommentSheet(args: UseCommentSheetArgs) {
  const {
    open,
    postId,
    viewerId,
    viewer,
    viewerLanguage,
    initialCommentId,
    onCommentCountChange,
    onRequireLogin,
  } = args;

  const [phase, setPhase] = useState<LoadPhase>("idle");
  const [nodes, setNodes] = useState<CommentNode[]>([]);
  const [commentCount, setCommentCount] = useState<number>(0);
  // The language the server displays comments in (the viewer's saved default,
  // else the UI locale). "See translation" requests exactly this language.
  const [serverDisplayLanguage, setServerDisplayLanguage] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [notice, setNotice] = useState<Notice>(null);
  const [sending, setSending] = useState(false);
  const [replyTarget, setReplyTarget] = useState<ReplyTarget>(null);

  // Guards against double-fire (rapid taps) per comment id.
  const likeInFlight = useRef<Set<string>>(new Set());

  // Latest count, so a create/delete resolving after another one counts from
  // the current value rather than the one its closure captured.
  const commentCountRef = useRef(0);
  const reportCount = useCallback(
    (count: number) => {
      commentCountRef.current = count;
      setCommentCount(count);
      onCommentCountChange?.(count);
    },
    [onCommentCountChange],
  );

  const load = useCallback(async () => {
    setPhase("loading");
    const res = await api.fetchComments(postId, { displayLanguage: viewerLanguage });
    if (!res.ok) {
      setPhase("error");
      return;
    }
    setNodes(toNodes(res.comments));
    commentCountRef.current = res.commentCount;
    setCommentCount(res.commentCount);
    setServerDisplayLanguage(res.displayLanguage ?? null);
    setPhase("ready");
  }, [postId, viewerLanguage]);

  // Load when opened; reset when closed.
  useEffect(() => {
    let alive = true;
    void (async () => {
      if (!open) {
        if (!alive) return;
        setPhase("idle");
        setNodes([]);
        setNotice(null);
        setReplyTarget(null);
        setExpanded(new Set());
        return;
      }
      await load();
    })();
    return () => {
      alive = false;
    };
  }, [open, load]);

  // Analytics: one event per opening of the sheet (post id only, no content).
  useEffect(() => {
    if (open && postId) trackFeedEvent(feedEvents.commentsOpened(postId));
  }, [open, postId]);

  // Expand the thread for initialCommentId once loaded, so a reply deep-link
  // shows its root thread. Scrolling is handled by the view via data attributes.
  useEffect(() => {
    if (phase !== "ready" || !initialCommentId) return;
    let alive = true;
    void (async () => {
      const root = rootIdOf(nodes, initialCommentId);
      if (!root || !alive) return;
      setExpanded((prev) => {
        if (prev.has(root)) return prev;
        const next = new Set(prev);
        next.add(root);
        return next;
      });
    })();
    return () => {
      alive = false;
    };
  }, [phase, initialCommentId, nodes]);

  const toggleReplies = useCallback((rootId: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(rootId)) next.delete(rootId);
      else next.add(rootId);
      return next;
    });
  }, []);

  const handleRateLimited = useCallback((retryAfterSeconds: number) => {
    setNotice({ kind: "rate_limited", retryAfterSeconds });
  }, []);

  /** Surface a failed write: restricted account, rate limit, or generic. */
  const reportFailure = useCallback((res: { ok: false; error: string; retryAfterSeconds?: number; accountRestricted?: boolean }) => {
    if (api.isAccountRestricted(res)) setNotice({ kind: "account_restricted" });
    else if (api.isRateLimited(res)) handleRateLimited(res.retryAfterSeconds);
    else setNotice({ kind: "error", message: res.error });
  }, [handleRateLimited]);

  // ─── Like (optimistic, double-tap guarded) ──────────────────────────────
  const toggleLike = useCallback(
    async (id: string) => {
      if (viewerId === null) {
        onRequireLogin();
        return;
      }
      if (likeInFlight.current.has(id)) return;
      const current = findNode(nodes, id);
      if (!current) return;
      const nextLiked = !current.liked;

      likeInFlight.current.add(id);
      setNodes((n) => applyLikeToggle(n, id, nextLiked));

      const res = nextLiked ? await api.likeComment(id) : await api.unlikeComment(id);
      likeInFlight.current.delete(id);

      if (!res.ok) {
        // Roll back.
        setNodes((n) => applyLikeToggle(n, id, !nextLiked));
        reportFailure(res);
      }
    },
    [nodes, viewerId, onRequireLogin, reportFailure],
  );

  // ─── Create (optimistic) ─────────────────────────────────────────────────
  /**
   * Send one comment to an EXPLICIT target. The composer passes its current
   * reply target; a retry passes the target the failed row was written for,
   * so a retry never lands in whatever thread the composer points at now.
   */
  const send = useCallback(
    async (text: string, target: SendTarget, fromComposer: boolean): Promise<WriteOutcome> => {
      const trimmed = text.trim();
      if (!trimmed || sending) return "skipped";
      if (viewerId === null || !viewer) {
        onRequireLogin();
        return "skipped";
      }
      setNotice(null);
      setSending(true);

      const parentId = target?.parentId ?? null;
      const tempId = nextTempId();
      const optimistic = makeOptimisticNode({
        tempId,
        postId,
        authorId: viewerId,
        author: viewer,
        sourceText: text,
        // The composed text is written in the viewer's OWN language, which is
        // not the display language. Leave it null: the server detects the body
        // language on create. The optimistic row just shows the original text.
        sourceLanguage: null,
        parentId,
        replyToUserId: parentId ? target?.replyToUserId ?? null : null,
        replyToUser: parentId ? target?.replyToUser ?? null : null,
      });
      setNodes((n) => insertOptimistic(n, optimistic));
      // A direct reply should reveal the thread it lands in.
      if (parentId) {
        setExpanded((prev) => new Set(prev).add(parentId));
      }

      const res = await api.createComment(postId, {
        sourceText: text,
        // Server detects the body language; do not send the display language.
        sourceLanguage: null,
        parentId,
        replyToUserId: parentId ? target?.replyToUserId ?? null : null,
      });
      setSending(false);

      if (!res.ok) {
        // Restricted: permanent, so no failed row + retry; the composer keeps the text.
        const restricted = api.isAccountRestricted(res);
        setNodes((n) => applyCreateFailure(n, tempId, restricted));
        reportFailure(res);
        return restricted ? "restricted" : "failed";
      }

      setNodes((n) =>
        confirmNode(n, tempId, {
          id: res.id,
          parentId: res.parentId,
          replyToUserId: res.replyToUserId,
          bodyVersion: res.bodyVersion,
          createdAt: res.createdAt,
        }),
      );
      if (fromComposer) setReplyTarget(null);
      reportCount(commentCountRef.current + 1);
      trackFeedEvent(feedEvents.commentCreated(postId, parentId !== null));
      return "sent";
    },
    [sending, viewerId, viewer, postId, reportCount, onRequireLogin, reportFailure],
  );

  /** Composer submit: goes to the composer's current reply target. */
  const submit = useCallback(
    (text: string): Promise<WriteOutcome> =>
      send(
        text,
        replyTarget
          ? { parentId: replyTarget.parentId, replyToUserId: replyTarget.replyToUserId, replyToUser: replyTarget.replyToUser }
          : null,
        true,
      ),
    [send, replyTarget],
  );

  /** Retry a failed optimistic row using its preserved text AND its own target. */
  const retryFailed = useCallback(
    async (id: string) => {
      const node = findNode(nodes, id);
      if (!node || !node.failed || !node.sourceText) return;
      // Remove the failed placeholder and re-send to the thread it was written for.
      setNodes((n) => removeNode(n, id));
      await send(node.sourceText, failedRetryTarget(node), false);
    },
    [nodes, send],
  );

  const discardFailed = useCallback((id: string) => {
    setNodes((n) => removeNode(n, id));
  }, []);

  // ─── Edit ────────────────────────────────────────────────────────────────
  const edit = useCallback(
    async (id: string, text: string): Promise<WriteOutcome> => {
      const trimmed = text.trim();
      if (!trimmed) return "skipped";
      const before = findNode(nodes, id);
      if (!before) return "skipped";
      // As with create, the edited text is in the viewer's own language; send
      // null so the server re-detects the body language and re-translates.
      setNodes((n) => applyEdit(n, id, text, null));
      const res = await api.updateComment(id, { sourceText: text, sourceLanguage: null });
      if (!res.ok) {
        // Roll back to the previous body.
        setNodes((n) =>
          mapNode(n, id, (node) => ({
            ...node,
            sourceText: before.sourceText,
            sourceLanguage: before.sourceLanguage,
            displayText: before.displayText,
            displayLanguage: before.displayLanguage,
            translationState: before.translationState,
            translation: before.translation,
            bodyVersion: before.bodyVersion,
            edited: before.edited,
          })),
        );
        reportFailure(res);
        return api.isAccountRestricted(res) ? "restricted" : "failed";
      }
      return "sent";
    },
    [nodes, reportFailure],
  );

  // ─── Delete ──────────────────────────────────────────────────────────────
  const remove = useCallback(
    async (id: string) => {
      const res = await api.deleteComment(id);
      if (!res.ok) {
        reportFailure(res);
        return;
      }
      setNodes((n) => applyDelete(n, id, res.hadReplies));
      reportCount(Math.max(0, commentCountRef.current - 1));
    },
    [reportCount, reportFailure],
  );

  // ─── Translate (on demand, toggle) ─────────────────────────────────────────
  const toggleTranslation = useCallback(
    async (id: string) => {
      const node = findNode(nodes, id);
      if (!node) return;

      // A known translation (server-provided or fetched) only flips; no network.
      const step = nextTranslationToggle(node);
      if (step.kind === "noop") return;
      if (step.kind === "flip") {
        setNodes((n) => setTranslation(n, id, step.translation));
        return;
      }
      const targetLanguage = serverDisplayLanguage || viewerLanguage;
      if (!targetLanguage) return;

      setNodes((n) => setTranslation(n, id, { state: "pending", text: null, showing: false }));
      const res = await api.translateComment(id, targetLanguage);
      if (!res.ok || res.status === "failed" || !res.text) {
        setNodes((n) => setTranslation(n, id, { state: "failed", text: null, showing: false }));
        return;
      }
      setNodes((n) => setTranslation(n, id, { state: "ready", text: res.text, showing: true }));
    },
    [nodes, serverDisplayLanguage, viewerLanguage],
  );

  const startReply = useCallback((target: NonNullable<ReplyTarget>) => {
    if (viewerId === null) {
      onRequireLogin();
      return;
    }
    setReplyTarget(target);
  }, [viewerId, onRequireLogin]);

  const cancelReply = useCallback(() => setReplyTarget(null), []);
  const dismissNotice = useCallback(() => setNotice(null), []);

  return {
    phase,
    nodes,
    commentCount,
    expanded,
    notice,
    sending,
    replyTarget,
    // actions
    reload: load,
    toggleReplies,
    toggleLike,
    submit,
    retryFailed,
    discardFailed,
    edit,
    remove,
    toggleTranslation,
    startReply,
    cancelReply,
    dismissNotice,
  };
}
