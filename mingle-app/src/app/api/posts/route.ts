import { type NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { getAuthOptions } from '@/lib/auth-options'
import { rateLimitGuard } from '@/server/rate-limit/rate-limit'
import { accountRestrictionGuard } from '@/server/reports/account-restriction'
import { parseImageKeyInput, parseImageListInput } from '@/server/posts/post-image-keys'
import { parseImageDimensions } from '@/server/posts/post-image-dimensions'
import { POST_BODY_MAX_LENGTH, publishPost } from '@/server/posts/publish-post'
import { queueOperatorAppPostForReview } from '@/server/operator-post-reserve/queue-app-post'
import { parsePostCategory, postIntroProblem, sanitizePostCallTitle, sanitizePostHobbies, sanitizePostIntroExtras } from '@/lib/post-category'
import { applyPostCategory } from '@/server/posts/post-category'

export const runtime = 'nodejs'

function json(payload: object, init?: ResponseInit): NextResponse {
  return NextResponse.json(payload, {
    ...init,
    headers: { 'Cache-Control': 'private, no-store', ...init?.headers },
  })
}

/**
 * Create a post. This route owns auth, the restriction gate, rate limiting,
 * body parsing/validation and the HTTP response; the publish pipeline itself
 * (idempotency, background, detection, translations, atomic insert) lives in
 * `publishPost`, shared with the launch seed script.
 */
function widthHeight(dimensions: { imageWidth: number; imageHeight: number } | null): { width: number | null; height: number | null } {
  return dimensions ? { width: dimensions.imageWidth, height: dimensions.imageHeight } : { width: null, height: null }
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
  // `images` (1-10 photos in order) supersedes the single `imageObjectKey`.
  const imageList = parseImageListInput(input, userId)
  if (imageList.kind === 'invalid') return json({ error: 'invalid_image_key' }, { status: 400 })
  const imageInput = imageList.kind === 'set' ? null : parseImageKeyInput(input, userId)
  if (imageInput?.kind === 'invalid') return json({ error: 'invalid_image_key' }, { status: 400 })
  const imageObjectKey = imageList.kind === 'set' ? imageList.images[0].key : imageInput?.kind === 'set' ? imageInput.key : null
  const dimensionsOf = (image: { width: number | null; height: number | null }) =>
    image.width && image.height ? { imageWidth: image.width, imageHeight: image.height } : null

  // Validate sourceText
  const text = typeof sourceText === 'string' ? sourceText : null
  const hasText = text !== null && text.trim().length > 0
  const hasImage = imageObjectKey !== null

  // A voice talk post may go up with its title alone (owner, 2026-11-28).
  if (!hasText && !hasImage && parsePostCategory(input.category) !== 'call') return json({ error: 'text_or_image_required' }, { status: 400 })
  if (text !== null && text.length > POST_BODY_MAX_LENGTH) return json({ error: 'text_too_long' }, { status: 400 })

  // The post's kind (see @/lib/post-category). A self-introduction needs a hobby and some text.
  const category = parsePostCategory(input.category)
  const hobbies = sanitizePostHobbies(input.hobbies)
  const introExtras = sanitizePostIntroExtras(input.introExtras)
  const callTitle = category === 'call' ? sanitizePostCallTitle(input.callTitle) : null
  if (category === 'intro') {
    const problem = postIntroProblem({ text, hobbies })
    if (problem) return json({ error: problem === 'hobbies' ? 'intro_hobbies_required' : 'intro_text_required' }, { status: 400 })
  }

  // Client-supplied language is only a fallback hint; the server detects.
  const clientHint = typeof sourceLanguage === 'string' && sourceLanguage.trim() ? sourceLanguage.trim() : null

  // An operator account never posts straight from the app: what staff write
  // there goes to the admin review queue like every other operator post, and
  // only the review release publishes it. `postId: null` keeps older clients
  // on their success path (they only use it for a "view post" link).
  const queued = await queueOperatorAppPostForReview({
    authorId: userId,
    text: hasText ? text : null,
    images: imageList.kind === 'set'
      ? imageList.images.map((image) => ({ objectKey: image.key, width: image.width, height: image.height }))
      : imageObjectKey
        ? [{ objectKey: imageObjectKey, ...widthHeight(parseImageDimensions(input)) }]
        : [],
  })
  if (queued) return json({ postId: null, queuedForReview: true, reserveId: queued.reserveId }, { status: 202 })

  const result = await publishPost({
    authorId: userId,
    text: hasText ? text : null,
    imageObjectKey,
    imageDimensions: !hasImage ? null : imageList.kind === 'set' ? dimensionsOf(imageList.images[0]) : parseImageDimensions(input),
    extraImages: imageList.kind === 'set' ? imageList.images.slice(1).map((image) => ({ objectKey: image.key, dimensions: dimensionsOf(image) })) : [],
    clientHint,
    clientPostId,
    backgroundKey: input.backgroundKey,
  })

  // The kind is written right after the post exists (the publish pipeline is
  // shared with the seed script and knows nothing about kinds).
  if (result.kind === 'created' && category !== 'free') {
    await applyPostCategory({ postId: result.post.id, authorId: userId, category, hobbies, introExtras, callTitle, publishedAt: result.post.publishedAt })
      .catch((error) => console.error('[posts] category_failed', error instanceof Error ? error.name : 'unknown'))
  }

  switch (result.kind) {
    case 'created':
      return json(
        { postId: result.post.id, backgroundKey: result.post.backgroundKey, publishedAt: result.post.publishedAt },
        { status: 201 },
      )
    case 'duplicate':
      return json(
        {
          postId: result.post.id,
          backgroundKey: result.post.backgroundKey,
          publishedAt: result.post.publishedAt,
          duplicate: true,
        },
        { status: 200 },
      )
    case 'conflict':
      return json({ error: 'client_post_id_conflict' }, { status: 409 })
  }
}
