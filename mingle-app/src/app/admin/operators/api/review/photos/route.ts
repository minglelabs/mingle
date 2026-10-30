import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdminApi } from '@/server/admin/guard'
import { storeReservePostImage } from '@/server/operator-post-reserve/post-image'
import { setReviewPostPhotos } from '@/server/operator-review/review'
import type { ReserveExtraImage } from '@/server/operator-post-reserve/extra-images'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MAX_UPLOAD_BYTES = 15 * 1024 * 1024

function json(payload: object, status = 200): NextResponse {
  return NextResponse.json(payload, { status, headers: { 'Cache-Control': 'no-store' } })
}

/**
 * POST /admin/operators/api/review/photos — multipart `{ id, file }`: stores a
 * photo staff picked for a post in review (in its author's folder) and
 * returns it; nothing changes on the post until PUT.
 */
export async function POST(request: Request) {
  const auth = await requireAdminApi()
  if (!auth.ok) return auth.response

  const form = await request.formData().catch(() => null)
  const id = form?.get('id')
  const file = form?.get('file')
  if (typeof id !== 'string' || !/^[\w-]{1,64}$/.test(id) || !(file instanceof File)) return json({ error: 'invalid_request' }, 400)
  if (file.size === 0 || file.size > MAX_UPLOAD_BYTES) return json({ error: 'file_too_large' }, 400)
  const row = await prisma.operatorPostReserve.findUnique({ where: { id }, select: { operatorUserId: true } })
  if (!row) return json({ error: 'not_found' }, 404)
  try {
    const stored = await storeReservePostImage(row.operatorUserId, Buffer.from(await file.arrayBuffer()))
    return json({ photo: { objectKey: stored.objectKey, width: stored.width, height: stored.height } })
  } catch {
    return json({ error: 'invalid_image' }, 400)
  }
}

/**
 * PUT /admin/operators/api/review/photos — `{ id, photos }`: the post's
 * photos in order (empty: a text post). Returns the updated post.
 */
export async function PUT(request: Request) {
  const auth = await requireAdminApi()
  if (!auth.ok) return auth.response

  const body = await request.json().catch(() => null) as Record<string, unknown> | null
  const id = typeof body?.id === 'string' ? body.id.trim() : ''
  if (!/^[\w-]{1,64}$/.test(id) || !Array.isArray(body?.photos)) return json({ error: 'invalid_request' }, 400)
  const result = await setReviewPostPhotos(auth.ctx, id, body.photos as ReserveExtraImage[])
  if (!result.ok) return json({ error: result.error }, result.error === 'not_found' ? 404 : 400)
  return json(result)
}
