import { type NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { getAuthOptions } from '@/lib/auth-options'
import { prisma } from '@/lib/prisma'
import { isKnownBackgroundKey, randomBackgroundKey } from '@/lib/post-backgrounds'
import { detectSourceLanguage } from '@/server/translation/detect-source-language'
import {
  resolveDefaultPostTranslationLanguages,
  translatePostBodySettled,
} from '@/server/translation/post-translation-service'
import { rateLimitGuard } from '@/server/rate-limit/rate-limit'
import { accountRestrictionGuard } from '@/server/reports/account-restriction'
import { parseImageKeyInput } from '@/server/posts/post-image-keys'
import { imageDimensionColumns, parseImageDimensions } from '@/server/posts/post-image-dimensions'

export const runtime = 'nodejs'

const MAX_BODY_LENGTH = 1000

/**
 * Accepted idempotency-key format. The key doubles as the post id, so the
 * lookup and the create must apply the SAME rule: a malformed key is ignored
 * for both (the post then gets a server id and no dedupe), never looked up
 * under one rule and dropped under another.
 */
const CLIENT_POST_ID = /^[\w-]{12,128}$/

function parseClientPostId(value: unknown): string | null {
  return typeof value === 'string' && CLIENT_POST_ID.test(value) ? value : null
}

/** The background the author saw in the preview when it is a catalog key, else a random one. */
function resolveCreateBackgroundKey(value: unknown): string {
  return typeof value === 'string' && isKnownBackgroundKey(value) ? value : randomBackgroundKey()
}

function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: unknown }).code === 'P2002'
}

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
  const restricted = await accountRestrictionGuard(userId)
  if (restricted) return restricted

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
  const postId = parseClientPostId(clientPostId) ?? undefined
  const duplicateResponse = async () => {
    if (!postId) return null
    const existing = await prisma.post.findFirst({
      where: { authorId: userId, id: postId },
      select: { id: true, backgroundKey: true, publishedAt: true },
    })
    return existing
      ? json(
          { postId: existing.id, backgroundKey: existing.backgroundKey, publishedAt: existing.publishedAt, duplicate: true },
          { status: 200 },
        )
      : null
  }
  const earlier = await duplicateResponse()
  if (earlier) return earlier

  /**
   * Two requests with the same clientPostId can both pass the lookup (a retry
   * sent while the first is still settling translations). The loser's create
   * hits the primary-key unique index; answer it with the winner's post.
   */
  const createOrDuplicate = async (create: () => Promise<{ id: string; backgroundKey: string | null; publishedAt: Date }>) => {
    try {
      const post = await create()
      return json(
        { postId: post.id, backgroundKey: post.backgroundKey, publishedAt: post.publishedAt },
        { status: 201 },
      )
    } catch (err) {
      if (!isUniqueViolation(err)) throw err
      const winner = await duplicateResponse()
      if (winner) return winner
      return json({ error: 'client_post_id_conflict' }, { status: 409 })
    }
  }

  // The preview showed this background; keep it when it is a catalog key.
  const backgroundKey = resolveCreateBackgroundKey(input.backgroundKey)
  const dimensions = hasImage ? parseImageDimensions(input) : null
  const imageColumns = hasImage ? imageDimensionColumns(dimensions) : {}

  // ── Image-only post: nothing to translate, publish immediately. ──
  if (!hasText) {
    return createOrDuplicate(() => prisma.post.create({
      data: {
        ...(postId ? { id: postId } : {}),
        authorId: userId,
        sourceText: null,
        sourceLanguage: null,
        backgroundKey,
        imageObjectKey,
        ...imageColumns,
        visibility: 'public',
        bodyVersion: 1,
      },
    }))
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
  return createOrDuplicate(() => prisma.$transaction(async (tx) => {
    const created = await tx.post.create({
      data: {
        ...(postId ? { id: postId } : {}),
        authorId: userId,
        sourceText: text,
        sourceLanguage: detected,
        backgroundKey,
        imageObjectKey,
        ...imageColumns,
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
  }))
}
