import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockUpsert } = vi.hoisted(() => ({ mockUpsert: vi.fn() }))
vi.mock('@/lib/prisma', () => ({ prisma: { postView: { upsert: mockUpsert } } }))

import { markPostViewed, markPostViewedQuietly } from './post-view'

describe('markPostViewed', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUpsert.mockResolvedValue({})
  })

  it('creates the view with a timestamp and never bumps viewedAt on a re-view', async () => {
    await markPostViewed('u1', 'p1')
    const arg = mockUpsert.mock.calls[0][0]
    expect(arg.where).toEqual({ postId_userId: { postId: 'p1', userId: 'u1' } })
    expect(arg.create).toMatchObject({ postId: 'p1', userId: 'u1' })
    expect(arg.create.viewedAt).toBeInstanceOf(Date)
    expect(arg.update).toEqual({})
  })

  it('quiet variant swallows DB errors', async () => {
    mockUpsert.mockRejectedValue(new Error('db down'))
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await expect(markPostViewedQuietly('u1', 'p1')).resolves.toBeUndefined()
    warn.mockRestore()
  })
})
