"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import * as api from "./comment-api";
import type { CommentNode } from "./comment-types";
import {
  applyDelete,
  applyEdit,
  applyLikeToggle,
  confirmNode,
  findNode,
  insertOptimistic,
  makeOptimisticNode,
  markFailed,
  removeNode,
  rootIdOf,
  setTranslation,
  toNodes,
} from "./comment-state";

export type LoadPhase = "idle" | "loading" | "ready" | "error";

export type Notice =
  | { kind: "rate_limited"; retryAfterSeconds: number }
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

  const reportCount = useCallback(
    (count: number) => {
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
        if (api.isRateLimited(res)) handleRateLimited(res.retryAfterSeconds);
        else setNotice({ kind: "error", message: res.error });
      }
    },
    [nodes, viewerId, onRequireLogin, handleRateLimited],
  );

  // ─── Create (optimistic) ─────────────────────────────────────────────────
  const submit = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || sending) return;
      if (viewerId === null || !viewer) {
        onRequireLogin();
        return;
      }
      setNotice(null);
      setSending(true);

      const target = replyTarget;
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
        parentId: target?.parentId ?? null,
        replyToUserId: target?.replyToUserId ?? null,
        replyToUser: target?.replyToUser ?? null,
      });
      setNodes((n) => insertOptimistic(n, optimistic));
      // A direct reply should reveal the thread it lands in.
      if (target?.parentId) {
        setExpanded((prev) => new Set(prev).add(target.parentId));
      }

      const res = await api.createComment(postId, {
        sourceText: text,
        // Server detects the body language; do not send the display language.
        sourceLanguage: null,
        parentId: target?.parentId ?? null,
        replyToUserId: target?.replyToUserId ?? null,
      });
      setSending(false);

      if (!res.ok) {
        setNodes((n) => markFailed(n, tempId));
        if (api.isRateLimited(res)) handleRateLimited(res.retryAfterSeconds);
        else setNotice({ kind: "error", message: res.error });
        return;
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
      setReplyTarget(null);
      reportCount(commentCount + 1);
    },
    [
      sending,
      viewerId,
      viewer,
      replyTarget,
      postId,
      commentCount,
      reportCount,
      onRequireLogin,
      handleRateLimited,
    ],
  );

  /** Retry a failed optimistic row using its preserved text. */
  const retryFailed = useCallback(
    async (id: string) => {
      const node = findNode(nodes, id);
      if (!node || !node.failed || !node.sourceText) return;
      // Remove the failed placeholder and re-submit the same text/target.
      setNodes((n) => removeNode(n, id));
      setReplyTarget(
        node.parentId
          ? {
              parentId: node.parentId,
              replyToUserId: node.replyToUserId,
              replyToUser: node.replyToUser,
              label: node.replyToUser?.name ?? node.replyToUser?.handle ?? "",
            }
          : null,
      );
      await submit(node.sourceText);
    },
    [nodes, submit],
  );

  const discardFailed = useCallback((id: string) => {
    setNodes((n) => removeNode(n, id));
  }, []);

  // ─── Edit ────────────────────────────────────────────────────────────────
  const edit = useCallback(
    async (id: string, text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      const before = findNode(nodes, id);
      if (!before) return;
      // As with create, the edited text is in the viewer's own language; send
      // null so the server re-detects the body language and re-translates.
      setNodes((n) => applyEdit(n, id, text, null));
      const res = await api.updateComment(id, { sourceText: text, sourceLanguage: null });
      if (!res.ok) {
        // Roll back to the previous body.
        setNodes((n) =>
          applyEdit(n, id, before.sourceText ?? "", before.sourceLanguage).map((node) =>
            node.id === id ? { ...node, bodyVersion: before.bodyVersion, edited: before.edited } : node,
          ),
        );
        if (api.isRateLimited(res)) handleRateLimited(res.retryAfterSeconds);
        else setNotice({ kind: "error", message: res.error });
      }
    },
    [nodes, handleRateLimited],
  );

  // ─── Delete ──────────────────────────────────────────────────────────────
  const remove = useCallback(
    async (id: string) => {
      const res = await api.deleteComment(id);
      if (!res.ok) {
        if (api.isRateLimited(res)) handleRateLimited(res.retryAfterSeconds);
        else setNotice({ kind: "error", message: res.error });
        return;
      }
      setNodes((n) => applyDelete(n, id, res.hadReplies));
      reportCount(Math.max(0, commentCount - 1));
    },
    [commentCount, reportCount, handleRateLimited],
  );

  // ─── Translate (on demand, toggle) ─────────────────────────────────────────
  const toggleTranslation = useCallback(
    async (id: string) => {
      const node = findNode(nodes, id);
      if (!node || node.isDeleted) return;

      // Already have a translation: just flip showing.
      if (node.translation && node.translation.state === "ready") {
        setNodes((n) =>
          setTranslation(n, id, { ...node.translation!, showing: !node.translation!.showing }),
        );
        return;
      }
      if (node.translation && node.translation.state === "pending") return;
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
