import { type NextRequest, NextResponse } from 'next/server'
import { after } from 'next/server'
import { getServerSession } from 'next-auth'
import { getAuthOptions } from '@/lib/auth-options'
import { prisma } from '@/lib/prisma'
import { visibleSinglePostWhere } from '@/server/posts/post-visibility'
import { visibleCommentsWhere } from '@/server/posts/comment-visibility'
import { createComment } from '@/server/posts/comment-service'
import { translateCommentOnDemand } from '@/server/translation/post-translation-service'
import { prismaTranslationDeps } from '@/server/posts/post-translation-repository'
import { resolveDefaultPostTranslationLanguages } from '@/server/translation/post-translation-service'
import { rateLimitGuard } from '@/server/rate-limit/rate-limit'
import { canonicalizeTranslationLanguageCode } from '@/lib/translation-languages'

export const runtime = 'nodejs'

const MAX_COMMENT_LENGTH = 500

function json(payload: object, init?: ResponseInit): NextResponse {
  return NextResponse.json(payload, {
    ...init,
    headers: { 'Cache-Control': 'private, no-store', ...init?.headers },
  })
}

type Ctx = { params: Promise<{ postId: string }> }

/**
 * GET — list comments on a post.
 * Oldest-first, replies grouped under their parent in chronological order.
 *
 * A signed-out viewer (no session) may read the list of a visible post: the
 * feed is public-readable, so the comment sheet is too. Writing and liking
 * still require a session (enforced by POST / like / translate handlers).
 * For a signed-out viewer no block filtering applies and nothing is "liked".
 *
 * Each comment carries the same translation display fields as a feed post
 * (`displayText` / `displayLanguage` / `translationState`) so the sheet can
 * show the viewer's default display language by default and offer a
 * "See translation" / "See original" toggle with identical semantics.
 */
export async function GET(request: NextRequest, context: Ctx) {
  const session = await getServerSession(getAuthOptions())
  const rawUserId = typeof session?.user?.id === 'string' ? session.user.id.trim() : ''
  const userId = rawUserId || null

  const { postId } = await context.params

  // Verify post is visible (null viewerId => public visibility rules apply).
  const post = await prisma.post.findFirst({
    where: visibleSinglePostWhere(postId, userId),
    select: { id: true, commentCount: true },
  })
  if (!post) return json({ error: 'not_found' }, { status: 404 })

  // Fetch all comments (including soft-deleted parents with replies).
  // `translations` (ready only) lets us resolve the display language per comment.
  const comments = await prisma.postComment.findMany({
    where: visibleCommentsWhere(postId, userId),
    orderBy: { createdAt: 'asc' },
    include: {
      author: { select: { id: true, handle: true, name: true, image: true } },
      replyToUser: { select: { id: true, handle: true, name: true } },
      _count: { select: { replies: true } },
      translations: {
        where: { status: 'ready' },
        select: { language: true, bodyVersion: true, text: true },
      },
    },
  })

  // Check which comments the viewer has liked (none when signed out).
  const commentIds = comments.map((c) => c.id)
  const likedSet = new Set<string>(
    userId
      ? (
          await prisma.postCommentLike.findMany({
            where: { commentId: { in: commentIds }, userId },
            select: { commentId: true },
          })
        ).map((l) => l.commentId)
      : [],
  )

  // Resolve the viewer's default display language (drives translationState).
  const displayLanguage = userId
    ? (
        await prisma.user.findUnique({
          where: { id: userId },
          select: { defaultDisplayLanguage: true },
        })
      )?.defaultDisplayLanguage ?? null
    : null
  const canonicalDisplay = displayLanguage ? canonicalizeTranslationLanguageCode(displayLanguage) : ''

  // Build threaded response: top-level first, replies grouped under parent.
  //
  // A soft-deleted comment survives the query only to keep a reply thread
  // readable. Two cases follow from that:
  //   - a deleted REPLY is dropped, since nothing hangs off it;
  //   - a deleted top-level comment is dropped once its last live reply is
  //     gone, and kept (body redacted) while replies remain.
  const liveReplyMap = new Map<string, typeof comments>()
  for (const c of comments) {
    if (!c.parentId) continue
    if (c.isDeleted === true) continue
    const group = liveReplyMap.get(c.parentId) ?? []
    group.push(c)
    liveReplyMap.set(c.parentId, group)
  }

  const topLevel = comments.filter((c) => {
    if (c.parentId) return false
    if (c.isDeleted !== true) return true
    return (liveReplyMap.get(c.id) ?? []).length > 0
  })

  function formatComment(c: (typeof comments)[number]) {
    const isDeleted = c.isDeleted === true

    // Translation display, mirroring feed posts:
    // - deleted body: no translation, state 'none'
    // - no display language, or same language as source: 'same_language'
    // - a ready translation for the current body version exists: 'ready'
    // - otherwise: 'none' (the client requests it on demand; 'pending'/'failed'
    //   are surfaced by the on-demand translate response, not the list read)
    let displayText: string | null = null
    let displayLang: string | null = null
    let translationState: 'same_language' | 'ready' | 'none' = 'none'

    if (!isDeleted) {
      const canonicalSource = c.sourceLanguage ? canonicalizeTranslationLanguageCode(c.sourceLanguage) : ''
      if (!canonicalDisplay || (canonicalSource && canonicalSource === canonicalDisplay)) {
        translationState = 'same_language'
        displayText = c.sourceText
        displayLang = c.sourceLanguage
      } else {
        const ready = c.translations.find(
          (t) => t.bodyVersion === c.bodyVersion && canonicalizeTranslationLanguageCode(t.language) === canonicalDisplay,
        )
        if (ready?.text) {
          translationState = 'ready'
          displayText = ready.text
          displayLang = displayLanguage
        } else {
          translationState = 'none'
          displayText = c.sourceText
          displayLang = c.sourceLanguage
        }
      }
    }

    return {
      id: c.id,
      postId: c.postId,
      authorId: c.authorId,
      parentId: c.parentId,
      replyToUserId: c.replyToUserId,
      bodyVersion: c.bodyVersion,
      sourceText: isDeleted ? null : c.sourceText,
      sourceLanguage: isDeleted ? null : c.sourceLanguage,
      // Body in the viewer's display language when a ready translation exists,
      // else the original. Null only for a deleted (redacted) comment.
      displayText,
      displayLanguage: displayLang,
      translationState,
      likeCount: c.likeCount,
      isDeleted,
      // Whether this comment's body was edited after creation (bodyVersion > 1).
      edited: !isDeleted && c.bodyVersion > 1,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
      author: { id: c.author.id, handle: c.author.handle, name: c.author.name, image: c.author.image },
      replyToUser: c.replyToUser ? { id: c.replyToUser.id, handle: c.replyToUser.handle, name: c.replyToUser.name } : null,
      // Live replies only: this drives the "N replies" affordance, so counting
      // deleted rows would promise replies the client never receives.
      replyCount: (liveReplyMap.get(c.id) ?? []).length,
      liked: likedSet.has(c.id),
    }
  }

  const result = topLevel.map((parent) => ({
    ...formatComment(parent),
    replies: (liveReplyMap.get(parent.id) ?? []).map(formatComment),
  }))

  // `commentCount` is the post's own counter, so the sheet can report the
  // authoritative count to the feed card (onCommentCountChange) even when a
  // create/delete response does not carry it.
  return json({ comments: result, commentCount: post.commentCount })
}

/**
 * POST — create a comment or reply.
 * Body: { sourceText, sourceLanguage?, parentId?, replyToUserId? }
 */
export async function POST(request: NextRequest, context: Ctx) {
  const session = await getServerSession(getAuthOptions())
  const userId = typeof session?.user?.id === 'string' ? session.user.id.trim() : ''
  if (!userId) return json({ error: 'unauthorized' }, { status: 401 })

  const limited = rateLimitGuard('create_comment', userId)
  if (limited) return limited

  const { postId } = await context.params

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return json({ error: 'invalid_body' }, { status: 400 })
  }
  if (!body || typeof body !== 'object') return json({ error: 'invalid_body' }, { status: 400 })

  const { sourceText, sourceLanguage, parentId, replyToUserId } = body as Record<string, unknown>

  // Validate sourceText
  const text = typeof sourceText === 'string' ? sourceText : null
  if (!text || text.trim().length === 0) return json({ error: 'text_required' }, { status: 400 })
  if (text.length > MAX_COMMENT_LENGTH) return json({ error: 'text_too_long' }, { status: 400 })

  // Verify post is visible and not deleted
  const post = await prisma.post.findFirst({
    where: visibleSinglePostWhere(postId, userId),
    select: { id: true },
  })
  if (!post) return json({ error: 'not_found' }, { status: 404 })

  const lang = typeof sourceLanguage === 'string' && sourceLanguage.trim() ? sourceLanguage.trim() : null
  const pId = typeof parentId === 'string' && parentId.trim() ? parentId.trim() : null
  const rUserId = typeof replyToUserId === 'string' && replyToUserId.trim() ? replyToUserId.trim() : null

  let comment
  try {
    comment = await createComment({
      postId,
      authorId: userId,
      sourceText: text,
      sourceLanguage: lang,
      parentId: pId,
      replyToUserId: rUserId,
    })
  } catch (err: unknown) {
    if (err instanceof Error && err.message === 'parent_not_found') {
      return json({ error: 'parent_not_found' }, { status: 400 })
    }
    throw err
  }

  // Fire-and-forget translation for default languages (like post creation)
  if (lang) {
    after(async () => {
      try {
        const targets = resolveDefaultPostTranslationLanguages(lang)
        await Promise.allSettled(
          targets.map((targetLang) =>
            translateCommentOnDemand(prismaTranslationDeps, {
              commentId: comment.id,
              bodyVersion: comment.bodyVersion,
              sourceText: text,
              sourceLanguage: lang,
              language: targetLang,
            }),
          ),
        )
      } catch (err) {
        console.error('[comment-create] translation failed', err instanceof Error ? err.message : 'unknown')
      }
    })
  }

  return json(
    {
      id: comment.id,
      postId: comment.postId,
      parentId: comment.parentId,
      replyToUserId: comment.replyToUserId,
      bodyVersion: comment.bodyVersion,
      createdAt: comment.createdAt,
    },
    { status: 201 },
  )
}
