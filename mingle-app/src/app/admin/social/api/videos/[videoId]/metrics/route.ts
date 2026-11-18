import { prisma } from '@/lib/prisma'
import { requireAdminApi } from '@/server/admin/guard'
import { getMarketingVideo } from '@/server/marketing-social/posts'
import { refreshTargetMetrics } from '@/server/marketing-social/worker'
import { adminJson } from '../../../../../posts/api/http'

export const runtime = 'nodejs'

/** POST — fetch metrics of every published platform post of this video now. */
export async function POST(_request: Request, { params }: { params: Promise<{ videoId: string }> }) {
  const auth = await requireAdminApi()
  if (!auth.ok) return auth.response
  const { videoId } = await params
  const targets = await prisma.marketingVideoTarget.findMany({ where: { videoId, status: 'published' } })
  await Promise.all(targets.map((target) => refreshTargetMetrics(target)))
  const video = await getMarketingVideo(videoId)
  return video ? adminJson({ video }) : adminJson({ error: 'not_found' }, 404)
}
