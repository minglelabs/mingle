import { type NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { getAuthOptions } from '@/lib/auth-options'
import { prisma } from '@/lib/prisma'
import { getPostImage } from '@/server/posts/post-image-storage'
import { isOwnedPostImageKey } from '@/server/posts/post-image-keys'
import { contentLengthTooLarge, storeUploadedPostImage } from '@/server/posts/post-image-upload'
import { rateLimitGuard } from '@/server/rate-limit/rate-limit'
import { accountRestrictionGuard } from '@/server/reports/account-restriction'

export const runtime = 'nodejs'

function json(payload: object, init?: ResponseInit): NextResponse {
  return NextResponse.json(payload, {
    ...init,
    headers: { 'Cache-Control': 'private, no-store', ...init?.headers },
  })
}

function viewerId(session: { user?: { id?: unknown } } | null): string {
  return typeof session?.user?.id === 'string' ? session.user.id.trim() : ''
}

/**
 * POST — upload an image for a post that does not exist yet (compose, drafts).
 * Returns a server-issued key scoped to the uploader; POST /posts and the
 * draft routes accept only such keys.
 */
export async function POST(request: NextRequest) {
  const userId = viewerId(await getServerSession(getAuthOptions()))
  if (!userId) return json({ error: 'unauthorized' }, { status: 401 })

  const restricted = await accountRestrictionGuard(userId)
  if (restricted) return restricted
  const limited = rateLimitGuard('upload_post_image', userId)
  if (limited) return limited

  if (contentLengthTooLarge(request.headers)) {
    return json({ error: 'image_too_large' }, { status: 413 })
  }

  let form: FormData
  try { form = await request.formData() } catch { return json({ error: 'invalid_form_data' }, { status: 400 }) }

  const stored = await storeUploadedPostImage(form, userId)
  if (!stored.ok) return json({ error: stored.error }, { status: stored.status })

  return json(
    { imageObjectKey: stored.image.objectKey, width: stored.image.width, height: stored.image.height },
    { status: 201 },
  )
}

/** GET ?draftId= — the author's own draft image (drafts are private). */
export async function GET(request: NextRequest) {
  const userId = viewerId(await getServerSession(getAuthOptions()))
  if (!userId) return json({ error: 'unauthorized' }, { status: 401 })

  const draftId = request.nextUrl.searchParams.get('draftId')?.trim()
  if (!draftId) return json({ error: 'draft_id_required' }, { status: 400 })

  const draft = await prisma.postDraft.findFirst({
    where: { id: draftId, authorId: userId },
    select: { imageObjectKey: true },
  })
  if (!draft?.imageObjectKey || !isOwnedPostImageKey(draft.imageObjectKey, userId)) {
    return json({ error: 'not_found' }, { status: 404 })
  }

  try {
    const bytes = await getPostImage(draft.imageObjectKey)
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
