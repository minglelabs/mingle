'use client'

import { useCallback } from 'react'
import { InfiniteMore } from '../_components/infinite-more'
import { loadMoreFeed } from './actions'

/** The feed preview's following pages, appended as staff scroll down. */
export function FeedMore({ as, initialCursor, here }: { as: string | null; initialCursor: string | null; here: string }) {
  const load = useCallback(async (cursor: string) => {
    const { node, nextCursor } = await loadMoreFeed(as, cursor, here)
    return { value: node, nextCursor }
  }, [as, here])
  return (
    <InfiniteMore
      initialCursor={initialCursor}
      load={load}
      render={(node, index) => <ul key={index} className="mt-3 space-y-3">{node}</ul>}
    />
  )
}
