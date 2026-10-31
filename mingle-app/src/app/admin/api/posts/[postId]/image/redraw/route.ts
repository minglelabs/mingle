import { NextResponse } from 'next/server'
import { requireAdminApi } from '@/server/admin/guard'
import { OPERATOR_POST_PHOTO_MAX_BYTES } from '@/server/operator-post-edit/edit'
import { parseRedrawFace, parseRedrawText, redrawOperatorPostPhoto } from '@/server/operator-post-edit/redraw'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
// The pool may take up to 8 minutes per try, with one retry.
export const maxDuration = 900

const NO_STORE = { 'cache-control': 'no-store' }

/**
 * POST /admin/api/posts/[postId]/image/redraw — multipart: optional
 * `reference` photo, `face` (poster | new), `text` (translate | remove |
 * keep), `note`. Draws a candidate photo for an operator post and answers
 * with its key; the post's photo changes only on PATCH .../image.
 */
export async function POST(request: Request, context: { params: Promise<{ postId: string }> }) {
  const auth = await requireAdminApi()
  if (!auth.ok) return auth.response
  const { postId } = await context.params
  if (Number(request.headers.get('content-length')) > OPERATOR_POST_PHOTO_MAX_BYTES + 65_536) {
    return NextResponse.json({ error: 'image_too_large' }, { status: 413, headers: NO_STORE })
  }
  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return NextResponse.json({ error: 'invalid_form_data' }, { status: 400, headers: NO_STORE })
  }
  const result = await redrawOperatorPostPhoto(auth.ctx, postId, {
    reference: form.get('reference'),
    face: parseRedrawFace(form.get('face')),
    text: parseRedrawText(form.get('text')),
    note: form.get('note'),
  })
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status, headers: NO_STORE })
  return NextResponse.json({ objectKey: result.objectKey, width: result.width, height: result.height }, { headers: NO_STORE })
}
