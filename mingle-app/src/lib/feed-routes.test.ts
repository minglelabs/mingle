import { describe, expect, it } from 'vitest'

import {
  composeHref,
  editPostHref,
  feedHref,
  feedSourceEndpoint,
  myPostsEndpoint,
  myPostsHref,
  notificationsHref,
  postEndpoint,
  postViewerHref,
  searchPeopleHref,
} from './feed-routes'

describe('feed page routes', () => {
  it('builds the home feed with an optional post and comment target', () => {
    expect(feedHref('ko')).toBe('/ko/feed')
    expect(feedHref('ko', { postId: 'p1' })).toBe('/ko/feed?postId=p1')
    expect(feedHref('en', { postId: 'p1', commentId: 'c9' })).toBe('/en/feed?postId=p1&commentId=c9')
  })

  it('builds viewer routes for an author and for a search', () => {
    expect(postViewerHref('ko', { kind: 'author', authorId: 'u1' }, 'p2')).toBe(
      '/ko/posts/viewer?kind=author&authorId=u1&postId=p2',
    )
    expect(postViewerHref('ja', { kind: 'search', query: '피부과 추천' }, 'p3')).toBe(
      `/ja/posts/viewer?kind=search&q=${encodeURIComponent('피부과 추천').replace(/%20/g, '+')}&postId=p3`,
    )
  })

  it('builds compose, edit, my-posts, notifications and people-search routes', () => {
    expect(composeHref('ko')).toBe('/ko/compose')
    expect(composeHref('ko', { draftId: 'd1' })).toBe('/ko/compose?draftId=d1')
    expect(editPostHref('ko', 'p/1')).toBe('/ko/posts/p%2F1/edit')
    expect(myPostsHref('ko', 'trash')).toBe('/ko/mypage/posts/trash')
    expect(notificationsHref('en')).toBe('/en/notifications')
    expect(searchPeopleHref('ko', 'min')).toBe('/ko/connect/search/people?q=min')
  })
})

describe('feed list endpoints', () => {
  it('maps each source to its endpoint and omits empty paging params', () => {
    expect(feedSourceEndpoint({ kind: 'home' }, {})).toBe('/feed')
    expect(feedSourceEndpoint({ kind: 'home' }, { cursor: 'abc', limit: 10, displayLanguage: 'ko' })).toBe(
      '/feed?cursor=abc&limit=10&displayLanguage=ko',
    )
    expect(feedSourceEndpoint({ kind: 'author', authorId: 'u1' }, { cursor: null })).toBe('/users/u1/posts')
    expect(feedSourceEndpoint({ kind: 'search', query: 'nail' }, { limit: 30 })).toBe('/search/posts?q=nail&limit=30')
  })

  it('maps my-posts sections: archive and trash under /posts/mine, hidden under the account', () => {
    expect(myPostsEndpoint('archived', {})).toBe('/posts/mine?section=archived')
    expect(myPostsEndpoint('trash', { cursor: 'c1', limit: 30 })).toBe('/posts/mine?section=trash&cursor=c1&limit=30')
    expect(myPostsEndpoint('hidden', { displayLanguage: 'ja' })).toBe('/account/hidden-posts?displayLanguage=ja')
  })

  it('builds the single-post endpoint', () => {
    expect(postEndpoint('p/1')).toBe('/posts/p%2F1')
    expect(postEndpoint('p1', { displayLanguage: 'ko' })).toBe('/posts/p1?displayLanguage=ko')
  })
})
