import { randomUUID } from 'node:crypto'
import sharp from 'sharp'
import { type NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { getAuthOptions } from '@/lib/auth-options'
import { visibleSinglePostWhere } from '@/server/posts/post-visibility'
import { getPostImage } from '@/server/posts/post-image-storage'
import { prisma } from '@/lib/prisma'
import { ownPostWhere } from '@/server/posts/post-visibility'
import { POST_IMAGE_MAX_BYTES, putPostImage, deletePostImage } from '@/server/posts/post-image-storage'
import { accountRestrictionGuard } from '@/server/reports/account-restriction'

export const runtime = 'nodejs'

function json(payload: object, init?: ResponseInit): NextResponse {
  return NextResponse.json(payload, {
    ...init,
    headers: { 'Cache-Control': 'private, no-store', ...init?.headers },
  })
}

type RouteContext = { params: Promise<{ postId: string }> }

export async function POST(request: NextRequest, context: RouteContext) {
  const { postId } = await context.params
  const session = await getServerSession(getAuthOptions())
  const userId = typeof session?.user?.id === 'string' ? session.user.id.trim() : ''
  if (!userId) return json({ error: 'unauthorized' }, { status: 401 })
  const restricted = await accountRestrictionGuard(userId)
  if (restricted) return restricted

  // Size pre-check from header
  if (Number(request.headers.get('content-length')) > POST_IMAGE_MAX_BYTES + 65536) {
    return json({ error: 'image_too_large' }, { status: 413 })
  }

  const post = await prisma.post.findFirst({ where: ownPostWhere(postId, userId) })
  if (!post) return json({ error: 'not_found' }, { status: 404 })

  let form: FormData
  try { form = await request.formData() } catch { return json({ error: 'invalid_form_data' }, { status: 400 }) }

  const file = form.get('file')
  if (!(file instanceof File)
    || !['image/jpeg', 'image/png', 'image/webp'].includes(file.type)
    || !file.size
    || file.size > POST_IMAGE_MAX_BYTES) {
    return json({ error: 'invalid_image' }, { status: 400 })
  }

  const bytes = Buffer.from(await file.arrayBuffer())

  // sharp pipeline: EXIF strip + resize, preserve aspect ratio
  let image: { data: Buffer; info: sharp.OutputInfo }
  try {
    const input = sharp(bytes, { limitInputPixels: 80_000_000, animated: false })
    const info = await input.metadata()
    if (!['jpeg', 'png', 'webp'].includes(info.format ?? '')) throw new Error('unsupported_image')
    image = await input
      .rotate() // auto-orient from EXIF
      .resize({ width: 2048, height: 2048, fit: 'inside', withoutEnlargement: true })
      .flatten({ background: '#ffffff' })
      .jpeg({ quality: 85 })
      .toBuffer({ resolveWithObject: true })
  } catch {
    return json({ error: 'invalid_image' }, { status: 400 })
  }

  const objectKey = `post-images/${randomUUID()}.jpg`

  try {
    await putPostImage(objectKey, image.data)
  } catch {
    return json({ error: 'image_upload_failed' }, { status: 503 })
  }

  // Delete previous image if one existed
  const previousKey = post.imageObjectKey
  try {
    await prisma.post.update({
      where: { id: postId },
      data: {
        imageObjectKey: objectKey,
      },
    })
  } catch (err) {
    await deletePostImage(objectKey).catch(() => {})
    console.error('[post-image] persist failed', err instanceof Error ? err.name : 'unknown')
    return json({ error: 'image_save_failed' }, { status: 500 })
  }

  if (previousKey) {
    deletePostImage(previousKey).catch(() => {})
  }

  return json({
    imageObjectKey: objectKey,
    width: image.info.width,
    height: image.info.height,
  }, { status: 201 })
}

export async function GET(_request: NextRequest, context: RouteContext) {
  const { postId } = await context.params
  const session = await getServerSession(getAuthOptions())
  const viewerId = typeof session?.user?.id === 'string' ? session.user.id.trim() : ''

  // The feed is readable signed out, so a public post's image is too; the
  // visibility rule (blocks, hides, archive, trash, moderation) still decides.
  const post = await prisma.post.findFirst({
    where: visibleSinglePostWhere(postId, viewerId || null),
    select: { imageObjectKey: true },
  })
  if (!post?.imageObjectKey) return json({ error: 'not_found' }, { status: 404 })

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