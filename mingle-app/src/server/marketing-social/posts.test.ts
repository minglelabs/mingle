import { beforeEach, describe, expect, it, vi } from 'vitest'

const prismaMock = vi.hoisted(() => ({
  marketingVideo: { create: vi.fn() },
  marketingVideoTarget: { findFirst: vi.fn(), update: vi.fn() },
}))
vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))
const accountsMock = vi.hoisted(() => ({ connectedPlatforms: vi.fn() }))
vi.mock('./accounts', () => accountsMock)
vi.mock('@/server/profile-image-storage', () => ({
  readProfileImageStorageConfig: () => ({ publicBaseUrl: 'https://cdn.example.com' }),
  putProfileImage: vi.fn(),
}))

import { createMarketingVideo, retryTarget } from './posts'

const VIDEO = 'https://cdn.example.com/marketing-videos/2026-11-18/abc/video.mp4'

function input(overrides: Record<string, unknown> = {}) {
  return {
    title: 'HashChat 소개',
    videoUrl: VIDEO,
    videoBytes: 1234,
    durationMs: 14900,
    width: 1080,
    height: 1920,
    hashtags: '#HashChat 통번역',
    targets: [
      { platform: 'instagram', caption: 'IG 캡션' },
      { platform: 'tiktok', caption: 'TT 캡션', options: { privacy: 'SELF_ONLY' } },
      { platform: 'tiktok', caption: 'duplicate' },
      { platform: 'myspace', caption: 'x' },
    ],
    ...overrides,
  }
}

describe('createMarketingVideo', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    accountsMock.connectedPlatforms.mockResolvedValue(['instagram', 'threads', 'tiktok'])
    prismaMock.marketingVideo.create.mockResolvedValue({ id: 'v1' })
  })

  it('queues one target per chosen platform', async () => {
    expect(await createMarketingVideo(input())).toEqual({ ok: true, videoId: 'v1' })
    const data = prismaMock.marketingVideo.create.mock.calls[0][0].data
    expect(data).toMatchObject({ title: 'HashChat 소개', videoObjectKey: 'marketing-videos/2026-11-18/abc/video.mp4', hashtags: ['#HashChat', '#통번역'] })
    expect(data.targets.create).toEqual([
      { platform: 'instagram', caption: 'IG 캡션' },
      { platform: 'tiktok', caption: 'TT 캡션', options: { privacy: 'SELF_ONLY' } },
    ])
  })

  it('only accepts media this tool stored', async () => {
    expect(await createMarketingVideo(input({ videoUrl: 'https://evil.example/video.mp4' }))).toEqual({ ok: false, error: 'video_required' })
    expect(await createMarketingVideo(input({ coverUrl: 'https://cdn.example.com/avatars/x.jpg' }))).toEqual({ ok: false, error: 'cover_invalid' })
  })

  it('refuses unconnected platforms, too-long captions and empty choices', async () => {
    expect(await createMarketingVideo(input({ targets: [{ platform: 'youtube', caption: 'x' }] }))).toEqual({ ok: false, error: 'platform_not_connected', platform: 'youtube' })
    expect(await createMarketingVideo(input({ targets: [{ platform: 'threads', caption: 'x'.repeat(501) }] }))).toEqual({ ok: false, error: 'caption_too_long', platform: 'threads' })
    expect(await createMarketingVideo(input({ targets: [] }))).toEqual({ ok: false, error: 'no_platforms' })
    expect(await createMarketingVideo(input({ title: ' ' }))).toEqual({ ok: false, error: 'title_required' })
    expect(prismaMock.marketingVideo.create).not.toHaveBeenCalled()
  })
})

describe('retryTarget', () => {
  beforeEach(() => vi.clearAllMocks())

  it('requeues only failed targets of that video', async () => {
    prismaMock.marketingVideoTarget.findFirst.mockResolvedValueOnce(null)
    expect(await retryTarget('v1', 't1')).toBe('not_found')
    prismaMock.marketingVideoTarget.findFirst.mockResolvedValueOnce({ id: 't1', status: 'published' })
    expect(await retryTarget('v1', 't1')).toBe('not_failed')
    prismaMock.marketingVideoTarget.findFirst.mockResolvedValueOnce({ id: 't1', status: 'failed' })
    expect(await retryTarget('v1', 't1')).toBe('ok')
    expect(prismaMock.marketingVideoTarget.update.mock.calls[0][0].data).toMatchObject({ status: 'queued', containerId: null, attempts: 0, error: null })
  })
})
