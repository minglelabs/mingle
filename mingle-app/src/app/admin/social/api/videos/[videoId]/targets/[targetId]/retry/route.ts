import { kickMarketingSocialWorker } from '@/instrumentation'
import { writeAdminAudit } from '@/server/admin/audit'
import { requireAdminApi } from '@/server/admin/guard'
import { retryTarget } from '@/server/marketing-social/posts'
import { adminJson } from '../../../../../../../posts/api/http'

export const runtime = 'nodejs'

/** POST — put a failed platform post back in the queue. */
export async function POST(_request: Request, { params }: { params: Promise<{ videoId: string; targetId: string }> }) {
  const auth = await requireAdminApi()
  if (!auth.ok) return auth.response
  const { videoId, targetId } = await params
  const result = await retryTarget(videoId, targetId)
  if (result === 'not_found') return adminJson({ error: result }, 404)
  if (result === 'not_failed') return adminJson({ error: result }, 409)
  await writeAdminAudit(auth.ctx, { action: 'social.retry', targetType: 'marketing_video_target', targetId })
  kickMarketingSocialWorker()
  return adminJson({ ok: true })
}
