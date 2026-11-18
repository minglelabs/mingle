import { afterEach, describe, expect, it } from 'vitest'
import { __setSocialFetchForTests } from './http'
import { fetchPostMetrics, readInsightValues } from './metrics'

const account = { platform: 'instagram' as const, externalAccountId: 'a', username: 'u', accessToken: 'tok' }
const json = (body: unknown) => new Response(JSON.stringify(body))

describe('metrics', () => {
  afterEach(() => __setSocialFetchForTests(null))

  it('reads insight rows in both value shapes', () => {
    expect(readInsightValues([{ name: 'views', values: [{ value: 12 }] }, { name: 'likes', total_value: { value: 3 } }, { name: 'x' }])).toEqual({ views: 12, likes: 3 })
  })

  it('Instagram: insights, falling back to public counts when insights fail', async () => {
    __setSocialFetchForTests(async (url) => {
      if (String(url).includes('/insights')) return new Response('{"error":{"message":"no permission"}}', { status: 400 })
      return json({ permalink: 'https://ig/p', like_count: 5, comments_count: 1 })
    })
    expect(await fetchPostMetrics('instagram', account, 'm1')).toEqual({ permalink: 'https://ig/p', metrics: { likes: 5, comments: 1 } })
  })

  it('YouTube statistics and TikTok video counts', async () => {
    __setSocialFetchForTests(async () => json({ items: [{ statistics: { viewCount: '100', likeCount: '7', commentCount: '2' } }] }))
    expect((await fetchPostMetrics('youtube', account, 'y1')).metrics).toEqual({ views: 100, likes: 7, comments: 2 })
    __setSocialFetchForTests(async () => json({ data: { videos: [{ share_url: 'https://tiktok/v', view_count: 9, like_count: 1, comment_count: 0, share_count: 3 }] }, error: { code: 'ok' } }))
    expect(await fetchPostMetrics('tiktok', account, '7300000000000000001')).toEqual({ permalink: 'https://tiktok/v', metrics: { views: 9, likes: 1, comments: 0, shares: 3 } })
  })

  it('Threads: replies count as comments, reposts and quotes as shares', async () => {
    __setSocialFetchForTests(async (url) =>
      String(url).includes('/insights')
        ? json({ data: [{ name: 'views', values: [{ value: 50 }] }, { name: 'likes', values: [{ value: 4 }] }, { name: 'replies', values: [{ value: 2 }] }, { name: 'reposts', values: [{ value: 1 }] }, { name: 'quotes', values: [{ value: 1 }] }, { name: 'shares', values: [{ value: 3 }] }] })
        : json({ permalink: 'https://threads/p' }),
    )
    expect(await fetchPostMetrics('threads', account, 't1')).toEqual({ permalink: 'https://threads/p', metrics: { views: 50, likes: 4, comments: 2, shares: 5 } })
  })
})
