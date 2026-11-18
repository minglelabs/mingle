import { requireAdminApi } from '@/server/admin/guard'
import { storeMarketingMedia } from '@/server/marketing-social/media'
import { VIDEO_MAX_BYTES } from '@/server/marketing-social/types'
import { adminJson } from '../../../posts/api/http'

export const runtime = 'nodejs'
export const maxDuration = 120

/**
 * POST multipart `kind` (video | cover) + `file` — store the marketing video
 * or its cover in the public bucket. Skipped by the proxy matcher so large
 * bodies are not cut at the proxy body limit.
 */
export async function POST(request: Request) {
  const auth = await requireAdminApi()
  if (!auth.ok) return auth.response

  const length = Number(request.headers.get('content-length') ?? '0')
  if (Number.isFinite(length) && length > VIDEO_MAX_BYTES + 1024 * 1024) return adminJson({ error: 'video_too_large' }, 413)

  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return adminJson({ error: 'invalid_form_data' }, 400)
  }
  const kind = form.get('kind')
  const file = form.get('file')
  if ((kind !== 'video' && kind !== 'cover') || !(file instanceof File)) return adminJson({ error: 'invalid_form_data' }, 400)

  try {
    const stored = await storeMarketingMedia(kind, file)
    if (!stored.ok) return adminJson({ error: stored.error }, stored.status)
    if (stored.kind === 'video') {
      return adminJson({ url: stored.url, bytes: stored.bytes, durationMs: stored.info.durationMs, width: stored.info.width, height: stored.info.height }, 201)
    }
    return adminJson({ url: stored.url, bytes: stored.bytes }, 201)
  } catch (error) {
    console.error('[marketing-social] media_store_failed', { error: error instanceof Error ? error.name : 'unknown' })
    return adminJson({ error: 'storage_failed' }, 503)
  }
}
