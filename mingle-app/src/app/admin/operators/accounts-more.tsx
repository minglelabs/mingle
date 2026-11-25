'use client'

import { useCallback } from 'react'
import { InfiniteMore } from '../_components/infinite-more'
import { loadMoreAccounts } from './actions'

/** The accounts tab's following pages, appended as staff scroll down. */
export function AccountsMore({ query, scope, initialCursor }: { query: string; scope: string; initialCursor: string | null }) {
  const load = useCallback(async (cursor: string) => {
    const { node, nextCursor } = await loadMoreAccounts(query, scope, Number(cursor))
    return { value: node, nextCursor }
  }, [query, scope])
  return (
    <InfiniteMore
      initialCursor={initialCursor}
      load={load}
      label="계정 더 보기"
      render={(node, index) => <ul key={index} className="mt-3 space-y-3">{node}</ul>}
    />
  )
}
