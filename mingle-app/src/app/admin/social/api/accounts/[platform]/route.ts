import { writeAdminAudit } from '@/server/admin/audit'
import { requireAdminApi } from '@/server/admin/guard'
import { disconnectSocialAccount } from '@/server/marketing-social/accounts'
import { isSocialPlatform } from '@/server/marketing-social/types'
import { adminJson } from '../../../../posts/api/http'

export const runtime = 'nodejs'

/** DELETE — disconnect the platform (revokes the token where the platform supports it). */
export async function DELETE(_request: Request, { params }: { params: Promise<{ platform: string }> }) {
  const auth = await requireAdminApi()
  if (!auth.ok) return auth.response
  const { platform } = await params
  if (!isSocialPlatform(platform)) return adminJson({ error: 'unknown_platform' }, 404)
  const removed = await disconnectSocialAccount(platform)
  if (removed) await writeAdminAudit(auth.ctx, { action: 'social.disconnect', targetType: 'social_platform', targetId: platform })
  return adminJson({ ok: true, removed })
}
