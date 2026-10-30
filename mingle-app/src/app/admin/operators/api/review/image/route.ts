import { NextResponse } from 'next/server'
import { requireAdminApi } from '@/server/admin/guard'
import { getPostImage } from '@/server/posts/post-image-storage'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET /admin/operators/api/review/image?key=post-images/... — a photo drawn
 * for a post in review. It sits in the private bucket and has no post yet, so
 * the app's own image route cannot serve it.
 */
export async function GET(request: Request) {
  const auth = await requireAdminApi()
  if (!auth.ok) return auth.response

  const key = new URL(request.url).searchParams.get('key') ?? ''
  if (!/^post-images\/[\w-]+\/[\w-]+\.jpg$/.test(key)) return NextResponse.json({ error: 'invalid_key' }, { status: 400 })
  try {
    const bytes = await getPostImage(key)
    return new NextResponse(Buffer.from(bytes), {
      headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'private, max-age=3600' },
    })
  } catch {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }
}
