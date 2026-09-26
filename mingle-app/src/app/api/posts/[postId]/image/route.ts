import { type NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { getAuthOptions } from '@/lib/auth-options'
import { prisma } from '@/lib/prisma'
import { ownPostWhere, visibleSinglePostWhere } from '@/server/posts/post-visibility'
import { deletePostImage, getPostImage } from '@/server/posts/post-image-storage'
import { isOwnedPostImageKey } from '@/server/posts/post-image-keys'
import { contentLengthTooLarge, storeUploadedPostImage } from '@/server/posts/post-image-upload'
import { accountRestrictionGuard } from '@/server/reports/account-restriction'

export const runtime = 'nodejs'

function json(payload: object, init?: ResponseInit): NextResponse {
  return NextResponse.json(payload, {
    ...init,
    headers: { 'Cache-Control': 'private, no-store', ...init?.headers },
  })
}

type RouteContext = { params: Promise<{ postId: string }> }

/**
 * Delete a replaced image only when it is this author's own post-image key and
 * nothing else (another post, a draft) still points at it.
 */
async function deleteReplacedImage(key: string, authorId: string, postId: string) {
  if (!isOwnedPostImageKey(key, authorId)) return
  const [posts, drafts] = await Promise.all([
    prisma.post.count({ where: { imageObjectKey: key, NOT: { id: postId } } }),
    prisma.postDraft.count({ where: { imageObjectKey: key } }),
  ])
  if (posts > 0 || drafts > 0) return
  await deletePostImage(key)
}

export async function POST(request: NextRequest, context: RouteContext) {
  const { postId } = await context.params
  const session = await getServerSession(getAuthOptions())
  const userId = typeof session?.user?.id === 'string' ? session.user.id.trim() : ''
  if (!userId) return json({ error: 'unauthorized' }, { status: 401 })
  const restricted = await accountRestrictionGuard(userId)
  if (restricted) return restricted

  if (contentLengthTooLarge(request.headers)) {
    return json({ error: 'image_too_large' }, { status: 413 })
  }

  const post = await prisma.post.findFirst({ where: ownPostWhere(postId, userId) })
  if (!post) return json({ error: 'not_found' }, { status: 404 })

  let form: FormData
  try { form = await request.formData() } catch { return json({ error: 'invalid_form_data' }, { status: 400 }) }

  const stored = await storeUploadedPostImage(form, userId)
  if (!stored.ok) return json({ error: stored.error }, { status: stored.status })
  const { objectKey, width, height } = stored.image

  const previousKey = post.imageObjectKey
  try {
    await prisma.post.update({
      where: { id: postId },
      data: { imageObjectKey: objectKey },
    })
  } catch (err) {
    await deletePostImage(objectKey).catch(() => {})
    console.error('[post-image] persist failed', err instanceof Error ? err.name : 'unknown')
    return json({ error: 'image_save_failed' }, { status: 500 })
  }

  if (previousKey && previousKey !== objectKey) {
    deleteReplacedImage(previousKey, userId, postId).catch(() => {})
  }

  return json({ imageObjectKey: objectKey, width, height }, { status: 201 })
}

export async function GET(_request: NextRequest, context: RouteContext) {
  const { postId } = await context.params
  const session = await getServerSession(getAuthOptions())
  const viewerId = typeof session?.user?.id === 'string' ? session.user.id.trim() : ''

  // The feed is readable signed out, so a public post's image is too; the
  // visibility rule (blocks, hides, archive, trash, moderation) still decides.
  const post = await prisma.post.findFirst({
    where: visibleSinglePostWhere(postId, viewerId || null),
    select: { authorId: true, imageObjectKey: true },
  })
  // Only ever read a key the post's author was issued, never an arbitrary
  // object (e.g. a private conversation image) in the shared bucket.
  if (!post?.imageObjectKey || !isOwnedPostImageKey(post.imageObjectKey, post.authorId)) {
    return json({ error: 'not_found' }, { status: 404 })
  }

  try {
    const bytes = await getPostImage(post.imageObjectKey)
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        'Content-Type': 'image/jpeg',
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch {
    return json({ error: 'image_unavailable' }, { status: 503 })
  }
}
