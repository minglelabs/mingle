/**
 * Pure state transitions for the comment sheet.
 *
 * Kept side-effect-free so the optimistic update / rollback logic is unit
 * tested without React or the network. The hook (`use-comment-sheet.ts`) owns
 * the effects and calls these to fold server and optimistic events into the
 * thread list.
 *
 * Invariant preserved everywhere: top-level comments and their replies stay in
 * oldest-first order, independent of likes.
 */

import type { CommentDto, CommentNode, CommentThreadDto } from './comment-types'

export const MAX_COMMENT_LENGTH = 500

/** Normalise a server thread list into mutable client nodes. */
export function toNodes(threads: CommentThreadDto[]): CommentNode[] {
  return threads.map((t) => ({
    ...t,
    replies: (t.replies ?? []).map((r) => ({ ...r })),
  }))
}

/** Map over every comment and reply, replacing the one whose id matches. */
export function mapNode(nodes: CommentNode[], id: string, fn: (n: CommentNode) => CommentNode): CommentNode[] {
  return nodes.map((node) => {
    let next = node.id === id ? fn(node) : node
    if (next.replies && next.replies.length > 0) {
      const replies = next.replies.map((r) => (r.id === id ? fn(r) : r))
      if (replies.some((r, i) => r !== next.replies![i])) {
        next = { ...next, replies }
      }
    }
    return next
  })
}

/** Find a comment or reply by id anywhere in the tree. */
export function findNode(nodes: CommentNode[], id: string): CommentNode | null {
  for (const node of nodes) {
    if (node.id === id) return node
    for (const reply of node.replies ?? []) {
      if (reply.id === id) return reply
    }
  }
  return null
}

/** The root (top-level) comment id for any id — itself if it is top-level. */
export function rootIdOf(nodes: CommentNode[], id: string): string | null {
  for (const node of nodes) {
    if (node.id === id) return node.id
    for (const reply of node.replies ?? []) {
      if (reply.id === id) return node.id
    }
  }
  return null
}

// ─── Optimistic like ─────────────────────────────────────────────────────────

/** Toggle like optimistically. Returns the new tree; caller reconciles/rolls back. */
export function applyLikeToggle(nodes: CommentNode[], id: string, liked: boolean): CommentNode[] {
  return mapNode(nodes, id, (n) => ({
    ...n,
    liked,
    likeCount: Math.max(0, n.likeCount + (liked ? 1 : -1)),
  }))
}

// ─── Optimistic create ───────────────────────────────────────────────────────

export function makeOptimisticNode(args: {
  tempId: string
  postId: string
  authorId: string
  author: CommentNode['author']
  sourceText: string
  sourceLanguage: string | null
  parentId: string | null
  replyToUserId: string | null
  replyToUser: CommentNode['replyToUser']
}): CommentNode {
  const now = new Date().toISOString()
  return {
    id: args.tempId,
    postId: args.postId,
    authorId: args.authorId,
    parentId: args.parentId,
    replyToUserId: args.replyToUserId,
    bodyVersion: 1,
    sourceText: args.sourceText,
    sourceLanguage: args.sourceLanguage,
    displayText: args.sourceText,
    displayLanguage: args.sourceLanguage,
    translationState: 'none',
    likeCount: 0,
    isDeleted: false,
    edited: false,
    createdAt: now,
    updatedAt: now,
    author: args.author,
    replyToUser: args.replyToUser,
    replyCount: 0,
    liked: false,
    pending: true,
  }
}

/** Insert an optimistic node oldest-last, under its parent when it is a reply. */
export function insertOptimistic(nodes: CommentNode[], node: CommentNode): CommentNode[] {
  if (!node.parentId) {
    return [...nodes, { ...node, replies: [] }]
  }
  return nodes.map((n) => {
    if (n.id !== node.parentId) return n
    return { ...n, replies: [...(n.replies ?? []), node], replyCount: n.replyCount + 1 }
  })
}

/** Replace a temp node with the confirmed server row (keeps position). */
export function confirmNode(nodes: CommentNode[], tempId: string, confirmed: Partial<CommentNode> & { id: string }): CommentNode[] {
  const patch = (n: CommentNode): CommentNode =>
    n.id === tempId ? { ...n, ...confirmed, pending: false, failed: false } : n
  return nodes.map((n) => {
    const self = patch(n)
    if (self.replies && self.replies.length > 0) {
      return { ...self, replies: self.replies.map(patch) }
    }
    return self
  })
}

/** Mark a temp node failed (keep it visible with its text for retry). */
export function markFailed(nodes: CommentNode[], tempId: string): CommentNode[] {
  return confirmNode(nodes, tempId, { id: tempId } as CommentNode).map(function tag(n): CommentNode {
    const self = n.id === tempId ? { ...n, pending: false, failed: true } : n
    if (self.replies && self.replies.length > 0) return { ...self, replies: self.replies.map(tag) }
    return self
  })
}

/** Remove a node entirely (used to roll back a failed create the user discards). */
export function removeNode(nodes: CommentNode[], id: string): CommentNode[] {
  return nodes
    .filter((n) => n.id !== id)
    .map((n) => {
      if (!n.replies || n.replies.length === 0) return n
      const replies = n.replies.filter((r) => r.id !== id)
      if (replies.length === n.replies.length) return n
      return { ...n, replies, replyCount: Math.max(0, n.replyCount - 1) }
    })
}

// ─── Delete (soft) ───────────────────────────────────────────────────────────

/**
 * Apply the server's soft-delete result to the tree, mirroring the read rules:
 * - a top-level comment WITH live replies stays, body redacted (isDeleted);
 * - a top-level comment with NO live replies is removed;
 * - a reply is always removed (nothing hangs off it).
 */
export function applyDelete(nodes: CommentNode[], id: string, hadReplies: boolean): CommentNode[] {
  const isTopLevel = nodes.some((n) => n.id === id)
  if (isTopLevel) {
    if (hadReplies) {
      return mapNode(nodes, id, (n) => ({
        ...n,
        isDeleted: true,
        sourceText: null,
        displayText: null,
        translationState: 'none',
        translation: undefined,
      }))
    }
    return nodes.filter((n) => n.id !== id)
  }
  // A reply: drop it and, if its now-empty deleted parent has no other replies,
  // drop that parent too.
  return nodes
    .map((n) => {
      if (!n.replies) return n
      const replies = n.replies.filter((r) => r.id !== id)
      if (replies.length === n.replies.length) return n
      return { ...n, replies, replyCount: Math.max(0, n.replyCount - 1) }
    })
    .filter((n) => !(n.isDeleted && (n.replies?.length ?? 0) === 0))
}

// ─── Edit ────────────────────────────────────────────────────────────────────

export function applyEdit(nodes: CommentNode[], id: string, text: string, sourceLanguage: string | null): CommentNode[] {
  return mapNode(nodes, id, (n) => ({
    ...n,
    sourceText: text,
    sourceLanguage,
    displayText: text,
    displayLanguage: sourceLanguage,
    // Re-translation is async; drop any stale overlay and show the new source.
    translationState: 'none',
    translation: undefined,
    edited: true,
    bodyVersion: n.bodyVersion + 1,
  }))
}

// ─── Translation overlay ─────────────────────────────────────────────────────

export function setTranslation(
  nodes: CommentNode[],
  id: string,
  translation: NonNullable<CommentNode['translation']>,
): CommentNode[] {
  return mapNode(nodes, id, (n) => ({ ...n, translation }))
}

// ─── Permissions ─────────────────────────────────────────────────────────────

export function canEdit(comment: CommentDto, viewerId: string | null): boolean {
  return !comment.isDeleted && viewerId !== null && comment.authorId === viewerId
}

/** Author of the comment, or the post author, may delete. */
export function canDelete(comment: CommentDto, viewerId: string | null, postAuthorId: string): boolean {
  if (comment.isDeleted || viewerId === null) return false
  return comment.authorId === viewerId || postAuthorId === viewerId
}

export function canReport(comment: CommentDto, viewerId: string | null): boolean {
  return !comment.isDeleted && viewerId !== null && comment.authorId !== viewerId
}
