import { type NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { getAuthOptions } from '@/lib/auth-options'
import { prisma } from '@/lib/prisma'
import { visibleSinglePostWhere, ownPostWhere } from '@/server/posts/post-visibility'
import { isKnownBackgroundKey } from '@/lib/post-backgrounds'
import { nextBackgroundKey } from '@/components/compose/compose-background'
import { detectSourceLanguage } from '@/server/translation/detect-source-language'
import {
  resolveEditTargetLanguages,
  translatePostBodySettled,
} from '@/server/translation/post-translation-service'
import { serializePostsPage } from '@/server/feed/feed-post-loader'
import { accountRestrictionGuard } from '@/server/reports/account-restriction'
import { parseImageKeyInput } from '@/server/posts/post-image-keys'
import { imageDimensionColumns, parseImageDimensions } from '@/server/posts/post-image-dimensions'
import { rateLimitGuard } from '@/server/rate-limit/rate-limit'

export const runtime = 'nodejs'

const MAX_BODY_LENGTH = 1000

function json(payload: object, init?: ResponseInit): NextResponse {
  return NextResponse.json(payload, {
    ...init,
    headers: { 'Cache-Control': 'private, no-store', ...init?.headers },
  })
}

type RouteContext = { params: Promise<{ postId: string }> }

/**
 * Who may read one post: anyone the visibility rule allows, plus its author
 * for their own archived or trashed post (the archive / trash screens open it
 * full-screen and the edit screen loads it). Operator-hidden posts stay hidden.
 */
function readablePostWhere(postId: string, viewerId: string | null) {
  if (!viewerId) return visibleSinglePostWhere(postId, null)
  return {
    OR: [
      visibleSinglePostWhere(postId, viewerId),
      { id: postId, authorId: viewerId, moderationHiddenAt: null },
    ],
  }
}

/** Thrown inside the edit transaction when another edit committed first. */
class EditConflictError extends Error {}

export async function GET(request: NextRequest, context: RouteContext) {
  const { postId } = await context.params
  const session = await getServerSession(getAuthOptions())
  const viewerId = typeof session?.user?.id === 'string' ? session.user.id.trim() || null : null

  const post = await prisma.post.findFirst({
    where: readablePostWhere(postId, viewerId),
    select: {
      id: true,
      authorId: true,
      bodyVersion: true,
      sourceText: true,
      sourceLanguage: true,
      backgroundKey: true,
      imageObjectKey: true,
      imageWidth: true,
      imageHeight: true,
      visibility: true,
      deletedAt: true,
      likeCount: true,
      commentCount: true,
      publishedAt: true,
      author: { select: { id: true, handle: true, name: true, image: true, isOfficial: true } },
    },
  })
  if (!post) return json({ error: 'not_found' }, { status: 404 })

  const displayLanguage = request.nextUrl.searchParams.get('displayLanguage') || null
  const [serialized] = await serializePostsPage([post], { viewerId, rawDisplayLanguage: displayLanguage })

  return json({ post: serialized })
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const { postId } = await context.params
  const session = await getServerSession(getAuthOptions())
  const userId = typeof session?.user?.id === 'string' ? session.user.id.trim() : ''
  if (!userId) return json({ error: 'unauthorized' }, { status: 401 })
  const restricted = await accountRestrictionGuard(userId)
  if (restricted) return restricted
  // Every body edit re-translates (LLM cost), so edits are rate limited.
  const limited = rateLimitGuard('update_post', userId)
  if (limited) return limited

  let body: unknown
  try { body = await request.json() } catch { return json({ error: 'invalid_body' }, { status: 400 }) }
  if (!body || typeof body !== 'object') return json({ error: 'invalid_body' }, { status: 400 })

  const existing = await prisma.post.findFirst({
    where: ownPostWhere(postId, userId),
  })
  if (!existing) return json({ error: 'not_found' }, { status: 404 })

  const input = body as Record<string, unknown>

  // The edit screen sends the bodyVersion it loaded; a different current
  // version means the post was edited elsewhere in the meantime.
  if (typeof input.bodyVersion === 'number' && input.bodyVersion !== existing.bodyVersion) {
    return json({ error: 'conflict', bodyVersion: existing.bodyVersion }, { status: 409 })
  }

  // A new image is attached through POST /posts/{id}/image; here only a key
  // this author was issued (or null to remove) is accepted.
  const imageInput = parseImageKeyInput(input, userId)
  if (imageInput.kind === 'invalid') return json({ error: 'invalid_image_key' }, { status: 400 })

  // Detect whether the body text is actually changing.
  const hasNewText = 'sourceText' in input
  const newText = hasNewText ? (typeof input.sourceText === 'string' ? input.sourceText : null) : undefined
  if (newText != null && newText.length > MAX_BODY_LENGTH) {
    return json({ error: 'text_too_long' }, { status: 400 })
  }

  // The post must keep text or an image AFTER this edit — judged on the new
  // state, not on what the row held before.
  const nextText = hasNewText ? (newText ?? null) : existing.sourceText
  const nextImageKey = imageInput.kind === 'set'
    ? imageInput.key
    : imageInput.kind === 'clear'
      ? null
      : existing.imageObjectKey
  if (!(nextText && nextText.trim().length > 0) && !nextImageKey) {
    return json({ error: 'text_or_image_required' }, { status: 400 })
  }

  const bodyChanged = hasNewText && (newText ?? null) !== (existing.sourceText ?? null)

  // Non-body fields (image, background). These never trigger re-translation.
  const sideData: Record<string, unknown> = {}
  if (imageInput.kind === 'set' && imageInput.key !== existing.imageObjectKey) {
    sideData.imageObjectKey = imageInput.key
    Object.assign(sideData, imageDimensionColumns(parseImageDimensions(input)))
  }
  if (imageInput.kind === 'clear' && existing.imageObjectKey !== null) {
    sideData.imageObjectKey = null
    Object.assign(sideData, imageDimensionColumns(null))
  }
  if ('backgroundKey' in input) {
    // "Change background" saves exactly the key the author saw on screen.
    const key = input.backgroundKey
    if (typeof key !== 'string' || !isKnownBackgroundKey(key) || key === existing.backgroundKey) {
      return json({ error: 'invalid_background_key' }, { status: 400 })
    }
    sideData.backgroundKey = key
  } else if (input.changeBackground === true) {
    // Legacy shape: the server picks, but never the current background.
    sideData.backgroundKey = nextBackgroundKey(existing.backgroundKey ?? '')
  }

  // Optimistic lock: only the version this request read may be replaced, so a
  // slower earlier edit (still settling translations) can never overwrite a
  // newer one. Zero rows means someone else won — 409.
  const lockedWhere = { id: postId, bodyVersion: existing.bodyVersion }

  // ── Body changed: detect → settle translations → atomic swap. ──
  // Until the transaction commits, the previous body + translations stay
  // visible. The new bodyVersion namespaces the new translation rows, so a
  // late result from an earlier version can never overwrite the new ones.
  if (bodyChanged) {
    const newBodyVersion = existing.bodyVersion + 1

    let detected: string | null = null
    let settledRows: Awaited<ReturnType<typeof translatePostBodySettled>> = []

    if (nextText !== null && nextText.trim().length > 0) {
      const clientHint = typeof input.sourceLanguage === 'string' && input.sourceLanguage.trim()
        ? input.sourceLanguage.trim()
        : null
      detected = await detectSourceLanguage({ text: nextText, clientHint })

      if (detected) {
        // Default 4 + every language this post already had a translation for.
        const priorLanguages = (
          await prisma.postTranslation.findMany({
            where: { postId },
            select: { language: true },
          })
        ).map((r) => r.language)
        const targets = resolveEditTargetLanguages(detected, priorLanguages)
        if (targets.length > 0) {
          settledRows = await translatePostBodySettled({
            sourceText: nextText,
            sourceLanguage: detected,
            targetLanguages: targets,
          })
        }
      }
    }

    let updated
    try {
      updated = await prisma.$transaction(async (tx) => {
        const result = await tx.post.updateMany({
          where: lockedWhere,
          data: {
            sourceText: nextText,
            sourceLanguage: detected,
            bodyVersion: newBodyVersion,
            ...sideData,
          },
        })
        if (result.count === 0) throw new EditConflictError()
        // Replace this version's translations (idempotent on retry).
        await tx.postTranslation.deleteMany({ where: { postId, bodyVersion: newBodyVersion } })
        if (settledRows.length > 0) {
          await tx.postTranslation.createMany({
            data: settledRows.map((r) => ({
              postId,
              bodyVersion: newBodyVersion,
              language: r.language,
              status: r.status,
              text: r.text,
            })),
          })
        }
        return tx.post.findUnique({ where: { id: postId } })
      })
    } catch (err) {
      if (err instanceof EditConflictError) return json({ error: 'conflict' }, { status: 409 })
      throw err
    }
    if (!updated) return json({ error: 'not_found' }, { status: 404 })

    return json({
      id: updated.id,
      bodyVersion: updated.bodyVersion,
      backgroundKey: updated.backgroundKey,
      updatedAt: updated.updatedAt,
    })
  }

  // ── No body change: apply source-language / image / background edits only. ──
  const data: Record<string, unknown> = { ...sideData }
  if ('sourceLanguage' in input && typeof input.sourceLanguage === 'string') {
    const nextLanguage = input.sourceLanguage.trim() || null
    if (nextLanguage !== existing.sourceLanguage) data.sourceLanguage = nextLanguage
  }

  // Nothing to change (e.g. only the image was replaced through
  // POST /posts/{id}/image beforehand) is a successful no-op, not an error.
  if (Object.keys(data).length === 0) {
    return json({
      id: existing.id,
      bodyVersion: existing.bodyVersion,
      backgroundKey: existing.backgroundKey,
      updatedAt: existing.updatedAt,
      unchanged: true,
    })
  }

  const result = await prisma.post.updateMany({ where: lockedWhere, data })
  if (result.count === 0) return json({ error: 'conflict' }, { status: 409 })
  const updated = await prisma.post.findUnique({ where: { id: postId } })
  if (!updated) return json({ error: 'not_found' }, { status: 404 })

  return json({
    id: updated.id,
    bodyVersion: updated.bodyVersion,
    backgroundKey: updated.backgroundKey,
    updatedAt: updated.updatedAt,
  })
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  const { postId } = await context.params
  const session = await getServerSession(getAuthOptions())
  const userId = typeof session?.user?.id === 'string' ? session.user.id.trim() : ''
  if (!userId) return json({ error: 'unauthorized' }, { status: 401 })

  const existing = await prisma.post.findFirst({
    where: ownPostWhere(postId, userId),
  })
  if (!existing) return json({ error: 'not_found' }, { status: 404 })

  await prisma.post.update({
    where: { id: postId },
    data: { isDeleted: true, deletedAt: new Date() },
  })

  return json({ deleted: true })
}
