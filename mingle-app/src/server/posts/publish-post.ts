/**
 * Shared post publish pipeline.
 *
 * Used by POST /api/posts and by the launch seed script
 * (`scripts/seed-feed-content.ts`) so both publish a post the same way:
 *
 *   idempotent clientPostId lookup → background (catalog key or random) →
 *   image dimension columns → server language detection → default settled
 *   translations → atomic post + translations insert.
 *
 * Authentication, rate limiting, the account-restriction gate, request-body
 * parsing/validation and the HTTP response stay in the caller.
 */
import { prisma } from '@/lib/prisma'
import { isKnownBackgroundKey, randomBackgroundKey } from '@/lib/post-backgrounds'
import { detectSourceLanguage } from '@/server/translation/detect-source-language'
import {
  resolveDefaultPostTranslationLanguages,
  translatePostBodySettled,
  type PostTranslationStatus,
} from '@/server/translation/post-translation-service'
import { imageDimensionColumns, type ImageDimensions } from '@/server/posts/post-image-dimensions'

/** Longest accepted post body (characters, `String.length`). */
export const POST_BODY_MAX_LENGTH = 1000

/**
 * Accepted idempotency-key format. The key doubles as the post id, so the
 * lookup and the create must apply the SAME rule: a malformed key is ignored
 * for both (the post then gets a server id and no dedupe), never looked up
 * under one rule and dropped under another.
 */
export const CLIENT_POST_ID_PATTERN = /^[\w-]{12,128}$/

export function parseClientPostId(value: unknown): string | null {
  return typeof value === 'string' && CLIENT_POST_ID_PATTERN.test(value) ? value : null
}

/** The background the author saw in the preview when it is a catalog key, else a random one. */
export function resolvePublishBackgroundKey(value: unknown): string {
  return typeof value === 'string' && isKnownBackgroundKey(value) ? value : randomBackgroundKey()
}

function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: unknown }).code === 'P2002'
}

export type PublishPostInput = {
  authorId: string
  /** Post body. Null or whitespace-only means an image-only post. */
  text: string | null
  /** Already-authorized image object key (see `parseImageKeyInput`), or null. */
  imageObjectKey: string | null
  /** Parsed image size hint; only stored when an image is attached. */
  imageDimensions?: ImageDimensions | null
  /** Client language hint; the server detection is authoritative. */
  clientHint?: string | null
  /** Raw idempotency key; a malformed value is ignored (server id, no dedupe). */
  clientPostId?: unknown
  /** Raw requested background; a non-catalog value falls back to random. */
  backgroundKey?: unknown
}

export type PublishedPost = { id: string; backgroundKey: string | null; publishedAt: Date }

export type PublishPostResult =
  | {
      kind: 'created'
      post: PublishedPost
      /** Detected source language (null for image-only or undetectable text). */
      sourceLanguage: string | null
      /** Settled default translations written with the post. */
      translations: Array<{ language: string; status: PostTranslationStatus }>
    }
  /** The same author already published this clientPostId (a retry). */
  | { kind: 'duplicate'; post: PublishedPost }
  /** The clientPostId is taken by another author's post. */
  | { kind: 'conflict' }

export async function publishPost(input: PublishPostInput): Promise<PublishPostResult> {
  const { authorId, imageObjectKey } = input
  const text = typeof input.text === 'string' && input.text.trim().length > 0 ? input.text : null
  const hasImage = imageObjectKey !== null
  if (text === null && !hasImage) throw new Error('publishPost: text or image is required')

  // Idempotency via clientPostId — a retry of the same request must not create
  // a second post or a second set of translations.
  const postId = parseClientPostId(input.clientPostId) ?? undefined
  const findDuplicate = async (): Promise<PublishedPost | null> => {
    if (!postId) return null
    return prisma.post.findFirst({
      where: { authorId, id: postId },
      select: { id: true, backgroundKey: true, publishedAt: true },
    })
  }
  const earlier = await findDuplicate()
  if (earlier) return { kind: 'duplicate', post: earlier }

  /**
   * Two requests with the same clientPostId can both pass the lookup (a retry
   * sent while the first is still settling translations). The loser's create
   * hits the primary-key unique index; answer it with the winner's post.
   */
  const createOrDuplicate = async (
    create: () => Promise<PublishedPost>,
    sourceLanguage: string | null,
    translations: Array<{ language: string; status: PostTranslationStatus }>,
  ): Promise<PublishPostResult> => {
    try {
      const post = await create()
      return { kind: 'created', post, sourceLanguage, translations }
    } catch (err) {
      if (!isUniqueViolation(err)) throw err
      const winner = await findDuplicate()
      if (winner) return { kind: 'duplicate', post: winner }
      return { kind: 'conflict' }
    }
  }

  // The preview showed this background; keep it when it is a catalog key.
  const backgroundKey = resolvePublishBackgroundKey(input.backgroundKey)
  const imageColumns = hasImage ? imageDimensionColumns(input.imageDimensions ?? null) : {}

  // ── Image-only post: nothing to translate, publish immediately. ──
  if (text === null) {
    return createOrDuplicate(
      () =>
        prisma.post.create({
          data: {
            ...(postId ? { id: postId } : {}),
            authorId,
            sourceText: null,
            sourceLanguage: null,
            backgroundKey,
            imageObjectKey,
            ...imageColumns,
            visibility: 'public',
            bodyVersion: 1,
          },
        }),
      null,
      [],
    )
  }

  // ── Text post: detect → translate (settle within budget) → publish. ──
  // Server detection is authoritative; the client value is only a fallback.
  const detected = await detectSourceLanguage({ text, clientHint: input.clientHint ?? null })

  const targetLanguages = detected ? resolveDefaultPostTranslationLanguages(detected) : []
  const settledRows =
    detected && targetLanguages.length > 0
      ? await translatePostBodySettled({
          sourceText: text,
          sourceLanguage: detected,
          targetLanguages,
        })
      : []

  // Atomic publish: the post row and its settled translations become visible
  // together — the post does not exist (and so is invisible) until now.
  return createOrDuplicate(
    () =>
      prisma.$transaction(async (tx) => {
        const created = await tx.post.create({
          data: {
            ...(postId ? { id: postId } : {}),
            authorId,
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
      }),
    detected,
    settledRows.map((r) => ({ language: r.language, status: r.status })),
  )
}
