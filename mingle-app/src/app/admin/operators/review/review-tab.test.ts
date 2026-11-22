import { describe, expect, it } from 'vitest'
import { parseReviewTab, reviewTabHref, reviewTabKind } from './review-tab'

describe('review tabs', () => {
  it('opens on posts unless accounts is asked for', () => {
    expect(parseReviewTab(undefined)).toBe('posts')
    expect(parseReviewTab('')).toBe('posts')
    expect(parseReviewTab('nonsense')).toBe('posts')
    expect(parseReviewTab('accounts')).toBe('accounts')
  })

  it('lists posts on the posts tab and profiles on the accounts tab', () => {
    expect(reviewTabKind('posts')).toBe('post')
    expect(reviewTabKind('accounts')).toBe('profile')
  })

  it('keeps the tab in the next-page link', () => {
    expect(reviewTabHref('posts')).toBe('/admin/operators/review')
    expect(reviewTabHref('accounts')).toBe('/admin/operators/review?tab=accounts')
    expect(reviewTabHref('accounts', '1|0|1|2026-11-22T00:00:00.000Z|0|u1')).toBe('/admin/operators/review?tab=accounts&after=1%7C0%7C1%7C2026-11-22T00%3A00%3A00.000Z%7C0%7Cu1')
    expect(reviewTabHref('posts', 'c')).toBe('/admin/operators/review?after=c')
  })
})
