import { NextResponse } from 'next/server'
import { requireAdminApi } from '@/server/admin/guard'
import { getConversationImage } from '@/server/conversation-image-storage'
import { resolveInboxPhotoObjectKey } from '@/server/operator-inbox/inbox'
import { inboxError } from '../../_lib/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ messageId: string }> }

/**
 * A chat photo for the admin inbox. The app's photo route needs a member
 * session, which staff never have; this proxy is gated by the admin session
 * and only serves photos from rooms with an active operator member.
 */
export async function GET(_request: Request, context: RouteContext) {
  const auth = await requireAdminApi()
  if (!auth.ok) return auth.response

  const { messageId } = await context.params
  const objectKey = await resolveInboxPhotoObjectKey(messageId)
  if (!objectKey) return inboxError('not_found', 404)

  try {
    const bytes = await getConversationImage(objectKey)
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        'Content-Type': 'image/jpeg',
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch {
    return inboxError('image_unavailable', 503)
  }
}
