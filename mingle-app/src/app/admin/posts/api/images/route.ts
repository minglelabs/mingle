import { NextResponse, type NextRequest } from 'next/server'
import { requireAdminApi } from '@/server/admin/guard'
import { checkOperatorForPosting } from '@/server/operator-posts/operator-check'
import { findOperatorAccount } from '@/server/operators/operator-guard'
import { isOwnedPostImageKey } from '@/server/posts/post-image-keys'
import { getPostImage } from '@/server/posts/post-image-storage'
import { contentLengthTooLarge, storeUploadedPostImage } from '@/server/posts/post-image-upload'
import { adminJson } from '../http'

export const runtime = 'nodejs'

const CHECK_STATUS = { not_operator: 404, operator_inactive: 409, account_restricted: 403 } as const

/**
 * POST multipart `operatorUserId` + `file` — store ONE photo for a post an
 * operator will publish (one request per photo; never a Server Action, whose
 * body limit is 1 MB). The key is minted under the operator's id, the only
 * kind of key its post may carry. jpeg/png/webp up to 10 MB, like the app.
 */
export async function POST(request: NextRequest) {
  const auth = await requireAdminApi()
  if (!auth.ok) return auth.response

  if (contentLengthTooLarge(request.headers)) return adminJson({ error: 'image_too_large' }, 413)

  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return adminJson({ error: 'invalid_form_data' }, 400)
  }

  const rawOperatorId = form.get('operatorUserId')
  const operatorUserId = typeof rawOperatorId === 'string' ? rawOperatorId.trim() : ''
  if (!operatorUserId) return adminJson({ error: 'not_operator' }, 404)

  const check = await checkOperatorForPosting(operatorUserId)
  if (!check.ok) return adminJson({ error: check.reason }, CHECK_STATUS[check.reason])

  const stored = await storeUploadedPostImage(form, check.account.id)
  if (!stored.ok) return adminJson({ error: stored.error }, stored.status)

  return adminJson(
    { imageObjectKey: stored.image.objectKey, width: stored.image.width, height: stored.image.height },
    201,
  )
}

const POST_IMAGE_OWNER = /^post-images\/([^/]+)\//

/**
 * GET `?key=` — the photo of a queued operator post, for the batch status
 * page (the post does not exist yet, so the public post image route cannot
 * serve it). Only post-image keys issued to an operator account are served.
 */
export async function GET(request: NextRequest) {
  const auth = await requireAdminApi()
  if (!auth.ok) return auth.response

  const key = request.nextUrl.searchParams.get('key') ?? ''
  const ownerId = POST_IMAGE_OWNER.exec(key)?.[1] ?? ''
  if (!ownerId || !isOwnedPostImageKey(key, ownerId) || !(await findOperatorAccount(ownerId))) {
    return adminJson({ error: 'not_found' }, 404)
  }

  try {
    const bytes = await getPostImage(key)
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        'Content-Type': 'image/jpeg',
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch {
    return adminJson({ error: 'image_unavailable' }, 503)
  }
}
