import { NextResponse } from 'next/server'
import { requireAdminApi } from '@/server/admin/guard'
import { OPERATOR_POST_PHOTO_MAX_BYTES } from '@/server/operator-post-edit/edit'
import { parseRedrawFace, parseRedrawText, redrawReviewPostPhoto } from '@/server/operator-post-edit/redraw'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
// The pool may take up to 8 minutes per try, with one retry.
export const maxDuration = 900

const NO_STORE = { 'cache-control': 'no-store' }

/**
 * POST /admin/operators/api/review/photos/redraw — multipart `{ id, reference?,
 * face, text, note }`: draws a photo for a post in review (in its author's
 * folder) and returns it like an upload; nothing changes on the post until
 * the photo editor saves.
 */
export async function POST(request: Request) {
  const auth = await requireAdminApi()
  if (!auth.ok) return auth.response
  if (Number(request.headers.get('content-length')) > OPERATOR_POST_PHOTO_MAX_BYTES + 65_536) {
    return NextResponse.json({ error: 'image_too_large' }, { status: 413, headers: NO_STORE })
  }
  const form = await request.formData().catch(() => null)
  const id = form?.get('id')
  if (!form || typeof id !== 'string' || !/^[\w-]{1,64}$/.test(id)) return NextResponse.json({ error: 'invalid_request' }, { status: 400, headers: NO_STORE })
  const result = await redrawReviewPostPhoto(auth.ctx, id, {
    reference: form.get('reference'),
    face: parseRedrawFace(form.get('face')),
    text: parseRedrawText(form.get('text')),
    note: form.get('note'),
  })
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status, headers: NO_STORE })
  return NextResponse.json({ photo: { objectKey: result.objectKey, width: result.width, height: result.height } }, { headers: NO_STORE })
}
