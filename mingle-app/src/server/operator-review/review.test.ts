import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  accountFindUnique: vi.fn(),
  accountUpdate: vi.fn(),
  accountUpdateMany: vi.fn(),
  userUpdate: vi.fn(),
  userDelete: vi.fn(),
  reserveFindUnique: vi.fn(),
  reserveUpdate: vi.fn(),
  reserveUpdateMany: vi.fn(),
  transaction: vi.fn(),
  audit: vi.fn(),
  generateAvatar: vi.fn(),
  generatePosts: vi.fn(),
  drawImage: vi.fn(),
  loadPersona: vi.fn(),
  loadTexts: vi.fn(),
  publishNow: vi.fn(),
  canDraw: vi.fn(() => false),
  drawAvatar: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    operatorAccount: { findUnique: mocks.accountFindUnique, update: mocks.accountUpdate, updateMany: mocks.accountUpdateMany },
    user: { update: mocks.userUpdate, delete: mocks.userDelete },
    operatorPostReserve: { findUnique: mocks.reserveFindUnique, update: mocks.reserveUpdate, updateMany: mocks.reserveUpdateMany },
    $transaction: mocks.transaction,
  },
}))
vi.mock('@/server/admin/audit', () => ({ writeAdminAudit: mocks.audit }))
vi.mock('@/server/operator-avatars/generate', () => ({ planOperatorAvatar: mocks.generateAvatar, canDrawImagesHere: mocks.canDraw, generateOperatorAvatar: mocks.drawAvatar }))
vi.mock('@/server/operator-post-reserve/post-image', () => ({ drawReservePostImage: mocks.drawImage }))
vi.mock('@/server/operator-post-reserve/generate', () => ({
  generateReservePosts: mocks.generatePosts,
  pickReserveTopics: () => ['daily'],
  reservePosterProfile: () => ({ topicFactors: {} }),
}))
vi.mock('@/server/operator-post-reserve/worker', () => ({
  loadReservePersona: mocks.loadPersona,
  loadExistingReserveTexts: mocks.loadTexts,
  publishReservePostNow: mocks.publishNow,
  PHOTO_REQUESTED: 'photo_requested',
}))

import { normalizeReviewFeedback, parseReviewAction, reviewOperatorPost, reviewOperatorProfile } from './review'

const PENDING_ACCOUNT = { reviewState: 'pending', user: { isOperator: true, isDeleted: false } }
const REVIEW_POST = {
  id: 'r1', text: 'old text', language: null, topic: 'daily', state: 'review', imagePrompt: null,
  imageObjectKey: null, reviewFeedback: null, error: null, operatorUserId: 'op1', operatorUser: { isActive: true },
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.transaction.mockResolvedValue([])
  mocks.accountUpdateMany.mockResolvedValue({ count: 1 })
  mocks.reserveUpdateMany.mockResolvedValue({ count: 1 })
  mocks.canDraw.mockReturnValue(false)
})

describe('review input', () => {
  it('accepts only the three answers', () => {
    expect(parseReviewAction('publish')).toBe('publish')
    expect(parseReviewAction('regenerate')).toBe('regenerate')
    expect(parseReviewAction('approve')).toBeNull()
  })

  it('keeps feedback optional and bounded', () => {
    expect(normalizeReviewFeedback('   ')).toBeNull()
    expect(normalizeReviewFeedback(42)).toBeNull()
    expect(normalizeReviewFeedback(' 더 밝게 ')).toBe('더 밝게')
    expect(Array.from(normalizeReviewFeedback('가'.repeat(1200)) ?? '')).toHaveLength(1000)
  })
})

describe('reviewOperatorProfile', () => {
  it('publishing makes the account active and approved', async () => {
    mocks.accountFindUnique.mockResolvedValue(PENDING_ACCOUNT)
    await expect(reviewOperatorProfile(null, 'op1', 'publish', null)).resolves.toEqual({ ok: true, state: 'approved' })
    expect(mocks.accountUpdate).toHaveBeenCalledWith({ where: { userId: 'op1' }, data: { reviewState: 'approved' } })
    expect(mocks.userUpdate).toHaveBeenCalledWith({ where: { id: 'op1' }, data: { isActive: true } })
  })

  it('never deletes an account that is already public', async () => {
    mocks.accountFindUnique.mockResolvedValue({ ...PENDING_ACCOUNT, reviewState: 'approved' })
    await expect(reviewOperatorProfile(null, 'op1', 'delete', null)).resolves.toEqual({ ok: false, error: 'already_approved' })
    expect(mocks.userDelete).not.toHaveBeenCalled()
  })

  it('leaves the new photo, with the feedback, to be drawn by hand', async () => {
    mocks.accountFindUnique.mockResolvedValue(PENDING_ACCOUNT)
    mocks.generateAvatar.mockResolvedValue({ prompt: 'a photo' })
    await expect(reviewOperatorProfile(null, 'op1', 'regenerate', '안경 없이')).resolves.toEqual({ ok: true, state: 'drawing' })
    expect(mocks.generateAvatar).toHaveBeenCalledWith('op1', { feedback: '안경 없이' })
    expect(mocks.accountUpdate).toHaveBeenCalledWith({ where: { userId: 'op1' }, data: { reviewState: 'drawing', reviewFeedback: '안경 없이', avatarSpec: { prompt: 'a photo' } } })
  })
})

describe('reviewOperatorPost', () => {
  it('holds a post back while its account is still in review', async () => {
    mocks.reserveFindUnique.mockResolvedValue({ ...REVIEW_POST, operatorUser: { isActive: false } })
    await expect(reviewOperatorPost(null, 'r1', 'publish', null)).resolves.toEqual({ ok: false, error: 'profile_pending' })
    expect(mocks.publishNow).not.toHaveBeenCalled()
  })

  it('publishes from review', async () => {
    mocks.reserveFindUnique.mockResolvedValue(REVIEW_POST)
    mocks.publishNow.mockResolvedValue({ ok: true, postId: 'p1' })
    await expect(reviewOperatorPost(null, 'r1', 'publish', null)).resolves.toEqual({ ok: true, state: 'published', postId: 'p1' })
    expect(mocks.publishNow).toHaveBeenCalledWith('r1', 'review', expect.any(Date))
  })

  it('rewrites the post with the feedback and draws its photo for review', async () => {
    mocks.reserveFindUnique.mockResolvedValue(REVIEW_POST)
    mocks.loadPersona.mockResolvedValue({ language: 'ja' })
    mocks.loadTexts.mockResolvedValue([])
    mocks.generatePosts.mockResolvedValue([{ topic: 'daily', text: 'new text', language: 'ja', imagePrompt: '[scene] ramen' }])
    mocks.drawImage.mockResolvedValue({ objectKey: 'post-images/op1/a.jpg', width: 900, height: 1200 })
    mocks.reserveUpdate.mockImplementation(async ({ data }) => ({ ...REVIEW_POST, ...data }))

    const result = await reviewOperatorPost(null, 'r1', 'regenerate', '더 짧게')
    expect(result).toMatchObject({ ok: true, state: 'review', post: { text: 'new text', imageObjectKey: 'post-images/op1/a.jpg' } })
    expect(mocks.generatePosts).toHaveBeenCalledWith(expect.objectContaining({ revision: { previousText: 'old text', feedback: '더 짧게' } }))
    expect(mocks.reserveUpdate.mock.calls[0][0].data).toMatchObject({ state: 'review', language: null, imageWidth: 900 })
  })

  it('puts a failed rewrite back in review', async () => {
    mocks.reserveFindUnique.mockResolvedValue(REVIEW_POST)
    mocks.loadPersona.mockResolvedValue(null)
    await expect(reviewOperatorPost(null, 'r1', 'regenerate', null)).resolves.toEqual({ ok: false, error: 'regenerate_failed' })
    expect(mocks.reserveUpdateMany).toHaveBeenLastCalledWith({
      where: { id: 'r1', state: 'regenerating' },
      data: { state: 'review', error: 'persona_unavailable' },
    })
  })

  it('stays busy while a 재제작 is running, and lets staff answer once one has hung', async () => {
    const now = new Date('2026-10-30T06:00:00Z')
    mocks.reserveFindUnique.mockResolvedValue({ ...REVIEW_POST, state: 'regenerating' })
    mocks.reserveUpdateMany.mockResolvedValueOnce({ count: 0 })
    await expect(reviewOperatorPost(null, 'r1', 'publish', null, now)).resolves.toEqual({ ok: false, error: 'busy' })
    expect(mocks.reserveUpdateMany).toHaveBeenLastCalledWith({
      where: { id: 'r1', state: 'regenerating', updatedAt: { lt: new Date('2026-10-30T05:45:00Z') } },
      data: { state: 'review' },
    })

    mocks.reserveUpdateMany.mockResolvedValueOnce({ count: 1 })
    mocks.publishNow.mockResolvedValue({ ok: true, postId: 'p1' })
    await expect(reviewOperatorPost(null, 'r1', 'publish', null, now)).resolves.toEqual({ ok: true, state: 'published', postId: 'p1' })
  })
})

describe('where this server can draw (the ChatGPT pool)', () => {
  beforeEach(() => mocks.canDraw.mockReturnValue(true))

  it('draws only the photo of a post right away and keeps the text', async () => {
    mocks.reserveFindUnique.mockResolvedValue({ ...REVIEW_POST, imagePrompt: '[self] a selfie' })
    mocks.drawImage.mockResolvedValue({ objectKey: 'posts/op1/a.jpg', width: 1280, height: 960 })
    mocks.reserveUpdate.mockResolvedValue({ ...REVIEW_POST, imagePrompt: '[self] a selfie', imageObjectKey: 'posts/op1/a.jpg' })
    const result = await reviewOperatorPost(null, 'r1', 'draw', '웃는 얼굴로')
    expect(result).toMatchObject({ ok: true, state: 'review' })
    expect(mocks.drawImage).toHaveBeenCalledWith('op1', '[self] a selfie\nStaff feedback on this photo, to follow: 웃는 얼굴로')
    expect(mocks.generatePosts).not.toHaveBeenCalled()
    const data = mocks.reserveUpdate.mock.calls[0][0].data
    expect(data).toMatchObject({ state: 'review', imageObjectKey: 'posts/op1/a.jpg', error: null })
    expect(data.text).toBeUndefined()
  })

  it('falls back to drawing by hand when the pool fails', async () => {
    mocks.reserveFindUnique.mockResolvedValue({ ...REVIEW_POST, imagePrompt: '[self] a selfie' })
    mocks.drawImage.mockResolvedValue(null)
    mocks.reserveUpdate.mockResolvedValue({ ...REVIEW_POST, imagePrompt: '[self] a selfie', error: 'photo_requested' })
    await reviewOperatorPost(null, 'r1', 'draw', null)
    expect(mocks.reserveUpdate.mock.calls[0][0].data).toMatchObject({ state: 'review', error: 'photo_requested' })
  })

  it('draws a new profile photo right away on 재제작', async () => {
    mocks.accountFindUnique.mockResolvedValue(PENDING_ACCOUNT)
    mocks.drawAvatar.mockResolvedValue({ ok: true, image: 'https://img.example/b.jpg', spec: {} })
    await expect(reviewOperatorProfile(null, 'op1', 'regenerate', '안경 없이')).resolves.toEqual({ ok: true, state: 'pending', image: 'https://img.example/b.jpg' })
    expect(mocks.drawAvatar).toHaveBeenCalledWith(null, 'op1', { feedback: '안경 없이' })
    expect(mocks.generateAvatar).not.toHaveBeenCalled()
  })

  it('leaves the profile photo to be drawn by hand when the pool fails', async () => {
    mocks.accountFindUnique.mockResolvedValue(PENDING_ACCOUNT)
    mocks.drawAvatar.mockResolvedValue({ ok: false, error: 'image_unavailable' })
    mocks.generateAvatar.mockResolvedValue({ prompt: 'p' })
    await expect(reviewOperatorProfile(null, 'op1', 'regenerate', null)).resolves.toEqual({ ok: true, state: 'drawing' })
  })
})
