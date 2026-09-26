import { type NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { getAuthOptions } from '@/lib/auth-options'
import { rateLimitGuard } from '@/server/rate-limit/rate-limit'
import { accountRestrictionGuard } from '@/server/reports/account-restriction'
import { parseImageKeyInput } from '@/server/posts/post-image-keys'
import { parseImageDimensions } from '@/server/posts/post-image-dimensions'
import { POST_BODY_MAX_LENGTH, publishPost } from '@/server/posts/publish-post'

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
  if (text !== null && text.length > POST_BODY_MAX_LENGTH) return json({ error: 'text_too_long' }, { status: 400 })

  // Client-supplied language is only a fallback hint; the server detects.
  const clientHint = typeof sourceLanguage === 'string' && sourceLanguage.trim() ? sourceLanguage.trim() : null

  const result = await publishPost({
    authorId: userId,
    text: hasText ? text : null,
    imageObjectKey,
    imageDimensions: hasImage ? parseImageDimensions(input) : null,
    clientHint,
    clientPostId,
    backgroundKey: input.backgroundKey,
  })

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
