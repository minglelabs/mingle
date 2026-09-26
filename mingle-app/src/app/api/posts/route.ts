import { type NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { getAuthOptions } from '@/lib/auth-options'
import { prisma } from '@/lib/prisma'
import { randomBackgroundKey } from '@/lib/post-backgrounds'
import { detectSourceLanguage } from '@/server/translation/detect-source-language'
import {
  resolveDefaultPostTranslationLanguages,
  translatePostBodySettled,
} from '@/server/translation/post-translation-service'
import { rateLimitGuard } from '@/server/rate-limit/rate-limit'
import { parseImageKeyInput } from '@/server/posts/post-image-keys'

export const runtime = 'nodejs'

const MAX_BODY_LENGTH = 1000

function json(payload: object, init?: ResponseInit): NextResponse {
  return NextResponse.json(payload, {
    ...init,
    headers: { 'Cache-Control': 'private, no-store', ...init?.headers },
  })
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(getAuthOptions())
  const userId = typeof session?.user?.id === 'string' ? session.user.id.trim() : ''
  if (!userId) return json({ error: 'unauthorized' }, { status: 401 })

  const limited = rateLimitGuard('create_post', userId)
  if (limited) return limited

  let body: unknown
  try { body = await request.json() } catch { return json({ error: 'invalid_body' }, { status: 400 }) }
  if (!body || typeof body !== 'object') return json({ error: 'invalid_body' }, { status: 400 })

  const input = body as Record<string, unknown>
  const { sourceText, sourceLanguage, clientPostId } = input

  // Only a key the server issued to this user (POST /posts/images) may be
  // attached; a foreign key (another user's, a conversation image) is refused.
  const imageInput = parseImageKeyInput(input, userId)
  if (imageInput.kind === 'invalid') return json({ error: 'invalid_image_key' }, { status: 400 })
  const imageObjectKey = imageInput.kind === 'set' ? imageInput.key : null

  // Validate sourceText
  const text = typeof sourceText === 'string' ? sourceText : null
  const hasText = text !== null && text.trim().length > 0
  const hasImage = imageObjectKey !== null

  if (!hasText && !hasImage) return json({ error: 'text_or_image_required' }, { status: 400 })
  if (text !== null && text.length > MAX_BODY_LENGTH) return json({ error: 'text_too_long' }, { status: 400 })

  // Client-supplied language is only a fallback hint; the server detects.
  const clientHint = typeof sourceLanguage === 'string' && sourceLanguage.trim() ? sourceLanguage.trim() : null

  // Idempotency via clientPostId — a retry of the same request must not create
  // a second post or a second set of translations.
  const idempotentId = typeof clientPostId === 'string' && /^[\w-]{12,128}$/.test(clientPostId)
    ? clientPostId
    : undefined
  if (typeof clientPostId === 'string' && clientPostId.trim()) {
    const existing = await prisma.post.findFirst({
      where: { authorId: userId, id: clientPostId },
      select: { id: true, backgroundKey: true, publishedAt: true },
    })
    if (existing) {
      return json(
        { postId: existing.id, backgroundKey: existing.backgroundKey, publishedAt: existing.publishedAt, duplicate: true },
        { status: 200 },
      )
    }
  }

  const backgroundKey = randomBackgroundKey()
  const postId = idempotentId

  // ── Image-only post: nothing to translate, publish immediately. ──
  if (!hasText) {
    const post = await prisma.post.create({
      data: {
        ...(postId ? { id: postId } : {}),
        authorId: userId,
        sourceText: null,
        sourceLanguage: null,
        backgroundKey,
        imageObjectKey,
        visibility: 'public',
        bodyVersion: 1,
      },
    })
    return json(
      { postId: post.id, backgroundKey: post.backgroundKey, publishedAt: post.publishedAt },
      { status: 201 },
    )
  }

  // ── Text post: detect → translate (settle within budget) → publish. ──
  // Server detection is authoritative; the client value is only a fallback.
  const detected = await detectSourceLanguage({ text: text!, clientHint })

  const targetLanguages = detected ? resolveDefaultPostTranslationLanguages(detected) : []
  const settledRows =
    detected && targetLanguages.length > 0
      ? await translatePostBodySettled({
          sourceText: text!,
          sourceLanguage: detected,
          targetLanguages,
        })
      : []

  // Atomic publish: the post row and its settled translations become visible
  // together — the post does not exist (and so is invisible) until now.
  const post = await prisma.$transaction(async (tx) => {
    const created = await tx.post.create({
      data: {
        ...(postId ? { id: postId } : {}),
        authorId: userId,
        sourceText: text,
        sourceLanguage: detected,
        backgroundKey,
        imageObjectKey,
        visibility: 'public',
        bodyVersion: 1,
      },
    })

    if (settledRows.length > 0) {
      await tx.postTranslation.createMany({
        data: settledRows.map((r) => ({
          postId: created.id,
          bodyVersion: 1,
          language: r.language,
          status: r.status,
          text: r.text,
        })),
      })
    }

    return created
  })

  return json(
    { postId: post.id, backgroundKey: post.backgroundKey, publishedAt: post.publishedAt },
    { status: 201 },
  )
}
