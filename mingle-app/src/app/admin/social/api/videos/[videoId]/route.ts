import { requireAdminApi } from '@/server/admin/guard'
import { getMarketingVideo } from '@/server/marketing-social/posts'
import { adminJson } from '../../../../posts/api/http'

export const runtime = 'nodejs'

/** GET — one video with every platform's status, link and metrics (polled by the detail page). */
export async function GET(_request: Request, { params }: { params: Promise<{ videoId: string }> }) {
  const auth = await requireAdminApi()
  if (!auth.ok) return auth.response
  const { videoId } = await params
  const video = await getMarketingVideo(videoId)
  return video ? adminJson({ video }) : adminJson({ error: 'not_found' }, 404)
}
