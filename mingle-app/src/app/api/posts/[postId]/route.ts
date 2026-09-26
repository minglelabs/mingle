import { type NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { getAuthOptions } from '@/lib/auth-options'
import { prisma } from '@/lib/prisma'
import { visibleSinglePostWhere, ownPostWhere } from '@/server/posts/post-visibility'
import { randomBackgroundKey } from '@/lib/post-backgrounds'
import { detectSourceLanguage } from '@/server/translation/detect-source-language'
import {
  resolveEditTargetLanguages,
  translatePostBodySettled,
} from '@/server/translation/post-translation-service'
import { serializePostsPage } from '@/server/feed/feed-post-loader'

export const runtime = 'nodejs'

const MAX_BODY_LENGTH = 1000

function json(payload: object, init?: ResponseInit): NextResponse {
  return NextResponse.json(payload, {
    ...init,
    headers: { 'Cache-Control': 'private, no-store', ...init?.headers },
  })
}

type RouteContext = { params: Promise<{ postId: string }> }

export async function GET(request: NextRequest, context: RouteContext) {
  const { postId } = await context.params
  const session = await getServerSession(getAuthOptions())
  const viewerId = typeof session?.user?.id === 'string' ? session.user.id.trim() || null : null

  const post = await prisma.post.findFirst({
    where: visibleSinglePostWhere(postId, viewerId),
    select: {
      id: true,
      authorId: true,
      bodyVersion: true,
      sourceText: true,
      sourceLanguage: true,
      backgroundKey: true,
      imageObjectKey: true,
      visibility: true,
      deletedAt: true,
      likeCount: true,
      commentCount: true,
      publishedAt: true,
      author: { select: { id: true, handle: true, name: true, image: true } },
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

  let body: unknown
  try { body = await request.json() } catch { return json({ error: 'invalid_body' }, { status: 400 }) }
  if (!body || typeof body !== 'object') return json({ error: 'invalid_body' }, { status: 400 })

  const existing = await prisma.post.findFirst({
    where: ownPostWhere(postId, userId),
  })
  if (!existing) return json({ error: 'not_found' }, { status: 404 })

  const input = body as Record<string, unknown>

  // Detect whether the body text is actually changing.
  const hasNewText = 'sourceText' in input
  const newText = hasNewText ? (typeof input.sourceText === 'string' ? input.sourceText : null) : undefined
  if (hasNewText) {
    if (newText !== null && newText!.length > MAX_BODY_LENGTH) {
      return json({ error: 'text_too_long' }, { status: 400 })
    }
    if (newText !== null && newText!.trim().length === 0 && !existing.imageObjectKey) {
      return json({ error: 'text_or_image_required' }, { status: 400 })
    }
  }
  const bodyChanged = hasNewText && (newText ?? null) !== (existing.sourceText ?? null)

  // Non-body fields (image, background). These never trigger re-translation.
  const sideData: Record<string, unknown> = {}
  if ('imageObjectKey' in input) {
    sideData.imageObjectKey = typeof input.imageObjectKey === 'string' && input.imageObjectKey ? input.imageObjectKey : null
  }
  if (input.changeBackground === true) {
    sideData.backgroundKey = randomBackgroundKey()
  }

  // ── Body changed: detect → settle translations → atomic swap. ──
  // Until the transaction commits, the previous body + translations stay
  // visible. The new bodyVersion namespaces the new translation rows, so a
  // late result from an earlier version can never overwrite the new ones.
  if (bodyChanged) {
    const nextText = newText ?? null
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

    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.post.update({
        where: { id: postId },
        data: {
          sourceText: nextText,
          sourceLanguage: detected,
          bodyVersion: newBodyVersion,
          ...sideData,
        },
      })
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
      return row
    })

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
    data.sourceLanguage = input.sourceLanguage.trim() || null
  }

  if (Object.keys(data).length === 0) return json({ error: 'no_changes' }, { status: 400 })

  const updated = await prisma.post.update({
    where: { id: postId },
    data,
  })

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
