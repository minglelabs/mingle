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

/**
 * Fold a failed create into the tree. A restricted account's failure is
 * permanent, so its optimistic row is removed (no failed row, no retry — the
 * composer keeps the text instead); any other failure keeps the row with a
 * retry.
 */
export function applyCreateFailure(nodes: CommentNode[], tempId: string, accountRestricted: boolean): CommentNode[] {
  return accountRestricted ? removeNode(nodes, tempId) : markFailed(nodes, tempId)
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

/**
 * What the body currently shows and which translation label the toggle carries.
 *
 * Two sources of a translation exist and both follow ONE rule — the
 * translation is shown first and the toggle reads "See original":
 * - the list read already returned the translation as `displayText`
 *   (`translationState: 'ready'`, auto-translated by the server);
 * - the viewer requested one on demand (the `translation` overlay).
 * "See original" always shows `sourceText`, never `displayText`.
 */
export type CommentBodyView = {
  text: string
  showingTranslation: boolean
  label: 'seeTranslation' | 'seeOriginal' | 'translating' | 'translationFailed'
}

export function resolveCommentBodyView(comment: CommentNode): CommentBodyView {
  const source = comment.sourceText ?? comment.displayText ?? ''
  const overlay = comment.translation
  if (overlay?.state === 'pending') return { text: source, showingTranslation: false, label: 'translating' }
  if (overlay?.state === 'failed') return { text: source, showingTranslation: false, label: 'translationFailed' }
  if (overlay?.state === 'ready' && overlay.text) {
    return overlay.showing
      ? { text: overlay.text, showingTranslation: true, label: 'seeOriginal' }
      : { text: source, showingTranslation: false, label: 'seeTranslation' }
  }
  if (comment.translationState === 'ready' && comment.displayText) {
    return { text: comment.displayText, showingTranslation: true, label: 'seeOriginal' }
  }
  return { text: source, showingTranslation: false, label: 'seeTranslation' }
}

/**
 * The next step when the viewer taps the translation toggle:
 * - `flip`: a translation is already known (server-provided or fetched) —
 *   apply `translation` as the new overlay, no network.
 * - `fetch`: request an on-demand translation.
 * - `noop`: a request is already in flight, or the comment is deleted.
 */
export type TranslationToggleStep =
  | { kind: 'flip'; translation: NonNullable<CommentNode['translation']> }
  | { kind: 'fetch' }
  | { kind: 'noop' }

export function nextTranslationToggle(comment: CommentNode): TranslationToggleStep {
  if (comment.isDeleted) return { kind: 'noop' }
  const overlay = comment.translation
  if (overlay?.state === 'pending') return { kind: 'noop' }
  if (overlay?.state === 'ready' && overlay.text) {
    return { kind: 'flip', translation: { ...overlay, showing: !overlay.showing } }
  }
  if (!overlay && comment.translationState === 'ready' && comment.displayText) {
    // The server showed the translation first; the first tap reveals the original.
    return { kind: 'flip', translation: { state: 'ready', text: comment.displayText, showing: false } }
  }
  return { kind: 'fetch' }
}

/**
 * The thread a failed optimistic row must be re-sent to. It is read from the
 * failed row itself (which kept its original parent and reply target), never
 * from whatever the composer targets now.
 */
export function failedRetryTarget(node: CommentNode): {
  parentId: string | null
  replyToUserId: string | null
  replyToUser: CommentNode['replyToUser']
} {
  return {
    parentId: node.parentId ?? null,
    replyToUserId: node.parentId ? node.replyToUserId ?? null : null,
    replyToUser: node.parentId ? node.replyToUser ?? null : null,
  }
}

/**
 * What Enter does in the comment composer.
 * - While an IME composition is active (Korean/Japanese/Chinese input), Enter
 *   commits the composition: ignore it (`none`), never send.
 * - On a touch keyboard there is no Shift key, so Enter inserts a newline and
 *   sending is done with the button.
 * - On a hardware keyboard Enter sends and Shift+Enter inserts a newline.
 */
export function composerEnterAction(event: {
  key: string
  shiftKey: boolean
  isComposing?: boolean
  keyCode?: number
  touchInput: boolean
}): 'send' | 'newline' | 'none' {
  if (event.key !== 'Enter') return 'none'
  // keyCode 229 is what browsers report for keys consumed by an IME.
  if (event.isComposing || event.keyCode === 229) return 'none'
  if (event.touchInput) return 'newline'
  return event.shiftKey ? 'newline' : 'send'
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
