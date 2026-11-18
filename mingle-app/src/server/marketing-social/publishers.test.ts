import { afterEach, describe, expect, it } from 'vitest'
import { __setSocialFetchForTests } from './http'
import { findPublishedMedia, pickTikTokPrivacy, runPublishStep, tiktokChunkPlan, youtubeResumeOffset, youtubeTags, type PublishInput } from './publishers'

type Call = { url: string; method: string; body: string | null; headers: Record<string, string> }

function mockFetch(handler: (call: Call) => Response): Call[] {
  const calls: Call[] = []
  __setSocialFetchForTests(async (input, init) => {
    const body = init?.body
    const call: Call = {
      url: String(input),
      method: init?.method ?? 'GET',
      body: typeof body === 'string' ? body : body instanceof URLSearchParams ? body.toString() : null,
      headers: Object.fromEntries(new Headers(init?.headers).entries()),
    }
    calls.push(call)
    return handler(call)
  })
  return calls
}

const json = (body: unknown, init?: ResponseInit) => new Response(JSON.stringify(body), { status: 200, ...init })

function input(platform: string, overrides: Partial<PublishInput> = {}): PublishInput {
  return {
    caption: '말하면 바로 번역 #HashChat',
    options: null,
    containerId: null,
    startedAt: null,
    video: { title: '해시챗 소개', videoUrl: 'https://cdn.example.com/marketing-videos/a/video.mp4', videoBytes: 4, coverUrl: null, hashtags: ['#HashChat'] },
    account: { platform: platform as PublishInput['account']['platform'], externalAccountId: 'acct-1', username: 'hashchat', accessToken: 'tok' },
    ...overrides,
  }
}

describe('publishers', () => {
  afterEach(() => __setSocialFetchForTests(null))

  it('Instagram: creates a REELS container, waits, then publishes and reads the permalink', async () => {
    let status = 'IN_PROGRESS'
    const calls = mockFetch((call) => {
      if (call.url.endsWith('/acct-1/media')) return json({ id: 'c1' })
      if (call.url.includes('/c1?')) return json({ status_code: status })
      if (call.url.endsWith('/media_publish')) return json({ id: 'm1' })
      if (call.url.includes('/m1?')) return json({ permalink: 'https://www.instagram.com/reel/abc/' })
      return json({}, { status: 404 })
    })
    const started = await runPublishStep('instagram', input('instagram', { video: { ...input('instagram').video, coverUrl: 'https://cdn/x/cover.jpg' } }))
    expect(started).toMatchObject({ kind: 'processing', containerId: 'c1' })
    const create = new URLSearchParams(calls[0].body!)
    expect(create.get('media_type')).toBe('REELS')
    expect(create.get('cover_url')).toBe('https://cdn/x/cover.jpg')

    expect(await runPublishStep('instagram', input('instagram', { containerId: 'c1' }))).toMatchObject({ kind: 'processing' })
    status = 'FINISHED'
    expect(await runPublishStep('instagram', input('instagram', { containerId: 'c1' }))).toEqual({
      kind: 'published',
      externalPostId: 'm1',
      permalink: 'https://www.instagram.com/reel/abc/',
    })
  })

  it('Instagram: a container ERROR fails for good', async () => {
    mockFetch(() => json({ status_code: 'ERROR', status: 'Error: video too short' }))
    await expect(runPublishStep('instagram', input('instagram', { containerId: 'c1' }))).rejects.toMatchObject({ transient: false })
  })

  it('Threads: VIDEO container then publish', async () => {
    const calls = mockFetch((call) => {
      if (call.url.endsWith('/acct-1/threads')) return json({ id: 't1' })
      if (call.url.includes('/t1?')) return json({ status: 'FINISHED' })
      if (call.url.endsWith('/threads_publish')) return json({ id: 'tp1' })
      if (call.url.includes('/tp1?')) return json({ permalink: 'https://www.threads.net/@hashchat/post/x' })
      return json({}, { status: 404 })
    })
    await runPublishStep('threads', input('threads'))
    expect(new URLSearchParams(calls[0].body!).get('media_type')).toBe('VIDEO')
    expect(await runPublishStep('threads', input('threads', { containerId: 't1' }))).toMatchObject({ kind: 'published', externalPostId: 'tp1' })
  })

  it('YouTube: opens a resumable session first and saves its URL, then uploads under it', async () => {
    const calls = mockFetch((call) => {
      if (call.url.includes('uploadType=resumable')) return new Response(null, { status: 200, headers: { location: 'https://upload.example/session-1' } })
      if (call.url === 'https://upload.example/session-1' && call.headers['content-range'] === 'bytes */4') return new Response(null, { status: 308 })
      if (call.url.endsWith('video.mp4')) return new Response(new Uint8Array([1, 2, 3, 4]))
      if (call.url === 'https://upload.example/session-1') return json({ id: 'yt1' })
      return json({}, { status: 404 })
    })
    const started = await runPublishStep('youtube', input('youtube', { options: { privacy: 'unlisted' } }))
    expect(started).toEqual({ kind: 'processing', containerId: 'https://upload.example/session-1', retryInMs: 0 })
    expect(calls.some((c) => c.url.endsWith('video.mp4'))).toBe(false)
    const init = calls[0]
    const meta = JSON.parse(init.body!)
    expect(meta.snippet).toMatchObject({ title: '해시챗 소개', description: '말하면 바로 번역 #HashChat', tags: ['HashChat'] })
    expect(meta.status.privacyStatus).toBe('unlisted')
    expect(init.headers['x-upload-content-length']).toBe('4')

    const done = await runPublishStep('youtube', input('youtube', { containerId: 'https://upload.example/session-1' }))
    expect(done).toEqual({ kind: 'published', externalPostId: 'yt1', permalink: 'https://www.youtube.com/shorts/yt1' })
    expect(calls.filter((c) => c.url.includes('uploadType=resumable'))).toHaveLength(1)
    expect(calls.at(-1)!.headers['content-range']).toBe('bytes 0-3/4')
  })

  it('YouTube: a retry after a lost answer resumes or finishes without a second upload', async () => {
    // The session already holds 2 of 4 bytes: only the rest is sent.
    let calls = mockFetch((call) => {
      if (call.headers['content-range'] === 'bytes */4') return new Response(null, { status: 308, headers: { range: 'bytes=0-1' } })
      if (call.url.endsWith('video.mp4')) return new Response(new Uint8Array([1, 2, 3, 4]))
      return json({ id: 'yt1' })
    })
    await runPublishStep('youtube', input('youtube', { containerId: 'https://upload.example/s' }))
    expect(calls.at(-1)!.headers['content-range']).toBe('bytes 2-3/4')
    expect(calls.at(-1)!.headers['content-length']).toBe('2')

    // The upload had completed: the status query returns the video, nothing is re-sent.
    calls = mockFetch(() => json({ id: 'yt1' }))
    expect(await runPublishStep('youtube', input('youtube', { containerId: 'https://upload.example/s' }))).toMatchObject({ kind: 'published', externalPostId: 'yt1' })
    expect(calls).toHaveLength(1)

    mockFetch(() => new Response(null, { status: 404 }))
    await expect(runPublishStep('youtube', input('youtube', { containerId: 'https://upload.example/s' }))).rejects.toMatchObject({ transient: false })
  })

  it('reads the YouTube resume offset', () => {
    expect(youtubeResumeOffset('bytes=0-1048575')).toBe(1048576)
    expect(youtubeResumeOffset(null)).toBe(0)
  })

  it('TikTok: FILE_UPLOAD direct post with an allowed privacy level, then status poll', async () => {
    const calls = mockFetch((call) => {
      if (call.url.includes('creator_info')) return json({ data: { privacy_level_options: ['FOLLOWER_OF_CREATOR', 'SELF_ONLY'] }, error: { code: 'ok' } })
      if (call.url.endsWith('video.mp4')) return new Response(new Uint8Array([1, 2, 3, 4]))
      if (call.url.includes('/video/init/')) return json({ data: { publish_id: 'pub1', upload_url: 'https://upload.tiktok/1' }, error: { code: 'ok' } })
      if (call.url === 'https://upload.tiktok/1') return new Response(null, { status: 201 })
      if (call.url.includes('status/fetch')) {
        return new Response('{"data":{"status":"PUBLISH_COMPLETE","publicaly_available_post_id":[7300000000000000001]},"error":{"code":"ok"}}')
      }
      return json({}, { status: 404 })
    })
    const started = await runPublishStep('tiktok', input('tiktok', { options: { privacy: 'PUBLIC_TO_EVERYONE' } }))
    expect(started).toMatchObject({ kind: 'processing', containerId: 'pub1' })
    const init = JSON.parse(calls.find((c) => c.url.includes('/video/init/'))!.body!)
    expect(init.post_info.privacy_level).toBe('SELF_ONLY')
    expect(init.source_info).toEqual({ source: 'FILE_UPLOAD', video_size: 4, chunk_size: 4, total_chunk_count: 1 })
    expect(calls.find((c) => c.url === 'https://upload.tiktok/1')!.headers['content-range']).toBe('bytes 0-3/4')

    const done = await runPublishStep('tiktok', input('tiktok', { containerId: 'pub1' }))
    expect(done).toMatchObject({ kind: 'published', externalPostId: '7300000000000000001', permalink: 'https://www.tiktok.com/@hashchat/video/7300000000000000001' })
  })

  it('splits TikTok uploads over 64 MB into 10 MB chunks, the last taking the remainder', () => {
    const MB = 1024 * 1024
    expect(tiktokChunkPlan(4)).toEqual({ chunkSize: 4, count: 1, ranges: [[0, 3]] })
    expect(tiktokChunkPlan(64 * MB).count).toBe(1)
    const plan = tiktokChunkPlan(105 * MB + 7)
    expect(plan.chunkSize).toBe(10 * MB)
    expect(plan.count).toBe(10)
    expect(plan.ranges[0]).toEqual([0, 10 * MB - 1])
    expect(plan.ranges.at(-1)).toEqual([90 * MB, 105 * MB + 6])
    for (let i = 1; i < plan.ranges.length; i += 1) expect(plan.ranges[i][0]).toBe(plan.ranges[i - 1][1] + 1)
  })

  it('Instagram / Threads: a container already PUBLISHED is not published again', async () => {
    const startedAt = new Date('2026-11-18T03:00:00Z')
    const calls = mockFetch((call) => {
      if (call.url.includes('/c1?')) return json({ status_code: 'PUBLISHED' })
      if (call.url.includes('/acct-1/media?')) {
        return json({ data: [
          { id: 'old', caption: '말하면 바로 번역 #HashChat', timestamp: '2026-11-17T00:00:00+0000' },
          { id: 'm9', caption: '말하면 바로 번역 #HashChat', permalink: 'https://ig/m9', timestamp: '2026-11-18T03:01:00+0000' },
        ] })
      }
      return json({}, { status: 500 })
    })
    expect(await runPublishStep('instagram', input('instagram', { containerId: 'c1', startedAt }))).toEqual({ kind: 'published', externalPostId: 'm9', permalink: 'https://ig/m9' })
    expect(calls.some((c) => c.url.endsWith('/media_publish'))).toBe(false)

    mockFetch((call) => (call.url.includes('/t1?') ? json({ status: 'PUBLISHED' }) : json({ data: [] })))
    const threads = await runPublishStep('threads', input('threads', { containerId: 't1', startedAt }))
    expect(threads).toMatchObject({ kind: 'published', externalPostId: null })
    expect((threads as { note?: string }).note).toContain('쓰레드')
  })

  it('matches a published post by caption and time', () => {
    const at = new Date('2026-11-18T03:00:00Z')
    expect(findPublishedMedia([{ id: 'a', text: ' x ', timestamp: '2026-11-18T03:00:30Z' }], 'x', at)?.id).toBe('a')
    expect(findPublishedMedia([{ id: 'a', text: 'x', timestamp: '2026-11-18T02:00:00Z' }], 'x', at)).toBeNull()
    expect(findPublishedMedia([{ id: 'a', caption: 'y' }], 'x', at)).toBeNull()
  })

  it('picks a TikTok privacy level the creator allows', () => {
    expect(pickTikTokPrivacy('PUBLIC_TO_EVERYONE', ['PUBLIC_TO_EVERYONE', 'SELF_ONLY'])).toBe('PUBLIC_TO_EVERYONE')
    expect(pickTikTokPrivacy('PUBLIC_TO_EVERYONE', ['SELF_ONLY'])).toBe('SELF_ONLY')
    expect(pickTikTokPrivacy(undefined, undefined)).toBe('SELF_ONLY')
  })

  it('keeps YouTube tags within the 500-character budget', () => {
    expect(youtubeTags(['#a', 'b', ''])).toEqual(['a', 'b'])
    expect(youtubeTags(Array.from({ length: 100 }, (_, i) => `#tag${'x'.repeat(10)}${i}`)).join(',').length).toBeLessThanOrEqual(500)
  })
})
