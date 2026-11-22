/** The review page's two tabs: posts (the default) and accounts. */
export type ReviewTab = 'posts' | 'accounts'

export function parseReviewTab(value: string | undefined): ReviewTab {
  return value === 'accounts' ? 'accounts' : 'posts'
}

/** The queue item kind a tab lists. */
export function reviewTabKind(tab: ReviewTab): 'profile' | 'post' {
  return tab === 'accounts' ? 'profile' : 'post'
}

export function reviewTabHref(tab: ReviewTab, cursor?: string): string {
  const params = new URLSearchParams()
  if (tab === 'accounts') params.set('tab', 'accounts')
  if (cursor) params.set('after', cursor)
  const query = params.toString()
  return `/admin/operators/review${query ? `?${query}` : ''}`
}
