'use server'

import { requireAdmin } from '@/server/admin/guard'
import { loadFeedChunk, resolveFeedView } from './feed-chunk'

/** The next page of the admin feed preview, rendered on the server, for the list to append. */
export async function loadMoreFeed(as: string | null, cursor: string, here: string) {
  await requireAdmin('/admin/feed')
  const view = await resolveFeedView(as)
  const { node, nextCursor } = await loadFeedChunk(view, cursor, here)
  return { node, nextCursor }
}
