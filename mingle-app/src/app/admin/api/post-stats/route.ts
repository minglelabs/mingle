import { NextResponse } from 'next/server'
import { resolveOperatorPostStatsAccess } from '@/server/operator-post-stats/access'
import { loadOperatorPostStats } from '@/server/operator-post-stats/load'
import { parseSourcePostId } from '@/server/posts/source-post'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Feed cards ask in batches (see use-operator-post-stats.ts); more ids than this are refused. */
const POST_STATS_MAX_IDS = 20

function json(payload: object, status = 200): NextResponse {
  return NextResponse.json(payload, { status, headers: { 'cache-control': 'private, no-store' } })
}

/** Distinct well-formed ids from `ids=a,b,c`, or null when there are none or too many. */
function parsePostStatsIds(raw: string | null): string[] | null {
  const ids = [...new Set((raw ?? '').split(',').map(parseSourcePostId).filter((id): id is string => id !== null))]
  return ids.length > 0 && ids.length <= POST_STATS_MAX_IDS ? ids : null
}

/**
 * GET /admin/api/post-stats?ids=a,b — engagement stats of the operator posts
 * among `ids`, for the staff-only stats row on the app's feed cards (the web
 * view shares the operator tool's cookie). `{ stats: { [postId]: OperatorPostStats } }`;
 * any other post is simply absent. Access is checked before anything else
 * (`resolveOperatorPostStatsAccess`): anyone without it gets 403 whatever the
 * ids, so the response never tells which posts are operator posts.
 */
export async function GET(request: Request) {
  const access = await resolveOperatorPostStatsAccess()
  if (!access) return json({ error: 'forbidden' }, 403)

  const ids = parsePostStatsIds(new URL(request.url).searchParams.get('ids'))
  if (!ids) return json({ error: 'invalid_ids' }, 400)

  const stats = await loadOperatorPostStats({
    postIds: ids,
    authorId: access.scope === 'own' ? access.operatorUserId : null,
  })
  return json({ stats: Object.fromEntries(stats) })
}
