import { describe, expect, it } from 'vitest'
import { LEGAL_DOCUMENT_LOCALES } from '@/i18n'
import { feedCopy, formatRateLimited, type FeedCopy } from './feed-copy'

const REQUIRED_KEYS: (keyof FeedCopy)[] = [
  'compose', 'notifications', 'like', 'unlike', 'comment', 'more', 'follow', 'followed',
  'expand', 'collapse', 'translateShow', 'translateHide', 'translating', 'translateFailed',
  'openImage', 'closeImage', 'nextPost', 'previousPost', 'followFailed', 'likeFailed',
  'rateLimited', 'loading', 'loadingMore', 'loadMoreFailed', 'imageFailed', 'retry',
  'feedLoadFailed', 'emptyTitle', 'emptyAction', 'postUnavailable',
]

describe('feed copy', () => {
  it('defines every feed string for all 15 primary UI locales', () => {
    expect(LEGAL_DOCUMENT_LOCALES).toHaveLength(15)

    for (const locale of LEGAL_DOCUMENT_LOCALES) {
      const copy = feedCopy(locale)
      for (const key of REQUIRED_KEYS) {
        expect(copy[key].trim(), `${locale}.${key}`).not.toBe('')
      }
      // Rate-limit template must carry the {seconds} placeholder.
      expect(copy.rateLimited, `${locale}.rateLimited`).toContain('{seconds}')
    }
  })

  it('falls back to English for an unsupported app locale', () => {
    expect(feedCopy('pl').compose).toBe('Write')
    expect(feedCopy('sv').feedLoadFailed).toBe('Could not load the feed.')
  })

  it('resolves a region tag to its primary UI locale', () => {
    expect(feedCopy('en-US').compose).toBe('Write')
    expect(feedCopy('ko-KR').compose).toBe('글쓰기')
  })

  it('substitutes and rounds up the retry seconds', () => {
    expect(formatRateLimited(feedCopy('en'), 3)).toBe('Please try again in 3s.')
    expect(formatRateLimited(feedCopy('en'), 2.1)).toBe('Please try again in 3s.')
    expect(formatRateLimited(feedCopy('en'), 0)).toBe('Please try again in 1s.')
  })
})
