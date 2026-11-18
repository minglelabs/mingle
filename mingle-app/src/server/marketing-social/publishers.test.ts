import { afterEach, describe, expect, it } from 'vitest'
import { __setSocialFetchForTests } from './http'
import { pickTikTokPrivacy, runPublishStep, youtubeTags, type PublishInput } from './publishers'

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

  it('YouTube: resumable upload with title, description and privacy', async () => {
    const calls = mockFetch((call) => {
      if (call.url.endsWith('video.mp4')) return new Response(new Uint8Array([1, 2, 3, 4]))
      if (call.url.includes('uploadType=resumable')) return new Response(null, { status: 200, headers: { location: 'https://upload.example/session-1' } })
      if (call.url === 'https://upload.example/session-1') return json({ id: 'yt1' })
      return json({}, { status: 404 })
    })
    const result = await runPublishStep('youtube', input('youtube', { options: { privacy: 'unlisted' } }))
    expect(result).toEqual({ kind: 'published', externalPostId: 'yt1', permalink: 'https://www.youtube.com/shorts/yt1' })
    const init = calls.find((c) => c.url.includes('uploadType=resumable'))!
    const meta = JSON.parse(init.body!)
    expect(meta.snippet).toMatchObject({ title: '해시챗 소개', description: '말하면 바로 번역 #HashChat', tags: ['HashChat'] })
    expect(meta.status.privacyStatus).toBe('unlisted')
    expect(init.headers['x-upload-content-length']).toBe('4')
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
