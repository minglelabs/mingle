import { kickMarketingSocialWorker } from '@/instrumentation'
import { writeAdminAudit } from '@/server/admin/audit'
import { requireAdminApi } from '@/server/admin/guard'
import { createMarketingVideo, listMarketingVideos } from '@/server/marketing-social/posts'
import { adminJson, readJsonObject } from '../../../posts/api/http'

export const runtime = 'nodejs'

/** POST `{ title, videoUrl, videoBytes, durationMs, width, height, coverUrl, hashtags, targets: [{ platform, caption, options }] }` — queue the cross-post. */
export async function POST(request: Request) {
  const auth = await requireAdminApi()
  if (!auth.ok) return auth.response
  const body = await readJsonObject(request)
  if (!body) return adminJson({ error: 'invalid_body' }, 400)
  const result = await createMarketingVideo(body)
  if (!result.ok) return adminJson({ error: result.error, platform: result.platform ?? null }, 400)
  await writeAdminAudit(auth.ctx, { action: 'social.video_create', targetType: 'marketing_video', targetId: result.videoId })
  kickMarketingSocialWorker()
  return adminJson({ videoId: result.videoId }, 202)
}

export async function GET() {
  const auth = await requireAdminApi()
  if (!auth.ok) return auth.response
  return adminJson({ videos: await listMarketingVideos() })
}
