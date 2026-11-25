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
  claimAvatarRef: vi.fn(),
  releaseOtherAvatarRefs: vi.fn(async () => {}),
  releaseRef: vi.fn(async () => {}),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    operatorAccount: { findUnique: mocks.accountFindUnique, update: mocks.accountUpdate, updateMany: mocks.accountUpdateMany },
    user: { update: mocks.userUpdate, delete: mocks.userDelete },
    operatorPostReserve: { findUnique: mocks.reserveFindUnique, update: mocks.reserveUpdate, updateMany: mocks.reserveUpdateMany },
    $transaction: mocks.transaction,
  },
}))
vi.mock('@/server/reference-library/avatar-reference', () => ({
  claimAvatarReference: mocks.claimAvatarRef,
  releaseOtherAvatarReferences: mocks.releaseOtherAvatarRefs,
  avatarReferencesByUser: vi.fn(async () => new Map()),
}))
vi.mock('@/server/reference-library/library', () => ({ listReferencePhotos: vi.fn(async () => []), releaseReferencePhoto: mocks.releaseRef }))
vi.mock('@/server/admin/audit', () => ({ writeAdminAudit: mocks.audit }))
vi.mock('@/server/operator-avatars/generate', () => ({ planOperatorAvatar: mocks.generateAvatar, canDrawImagesHere: mocks.canDraw, generateOperatorAvatar: mocks.drawAvatar }))
vi.mock('@/server/operator-post-reserve/post-image', () => ({ PHOTO_NO_REFERENCE: 'photo_no_reference', drawReservePostImage: mocks.drawImage, libraryPhotoForPost: vi.fn(async () => ({ available: true, need: '' })) }))
vi.mock('@/server/posts/post-image-storage', () => ({ getPostImage: vi.fn(async () => Buffer.from('old-photo')) }))
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

import { normalizeReviewFeedback, parseReviewAction, releaseOrphanedDrawings, reviewOperatorPost, reviewOperatorProfile, setReviewPostText, editReviewPost, scheduleReviewPost, unscheduleReviewPost } from './review'

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

  it('draws a live account\'s new photo for review without touching the account or its current photo', async () => {
    mocks.canDraw.mockReturnValue(true)
    mocks.accountFindUnique.mockResolvedValue({ ...PENDING_ACCOUNT, reviewState: 'approved', pendingImage: null, pendingDrawingAt: null })
    mocks.drawAvatar.mockResolvedValue({ ok: true, image: 'https://img/new.jpg' })
    await expect(reviewOperatorProfile(null, 'op1', 'regenerate', '밝게')).resolves.toEqual({ ok: true, state: 'drawing' })
    expect(mocks.accountUpdate).toHaveBeenCalledWith({ where: { userId: 'op1' }, data: expect.objectContaining({ reviewFeedback: '밝게', pendingDrawingAt: expect.any(Date) }) })
    await vi.waitFor(() => expect(mocks.drawAvatar).toHaveBeenCalledWith(null, 'op1', expect.objectContaining({ candidate: true, feedback: '밝게' })))
    expect(mocks.userUpdate).not.toHaveBeenCalled()
    expect(mocks.userDelete).not.toHaveBeenCalled()
    mocks.canDraw.mockReturnValue(false)
  })

  it('takes a live account\'s new photo only when staff publish it', async () => {
    mocks.accountFindUnique.mockResolvedValue({
      ...PENDING_ACCOUNT, reviewState: 'approved', pendingImage: 'https://img/new.jpg', pendingImageObjectKey: 'profiles/op1/new.jpg',
      pendingAvatarSpec: { category: 'face' }, pendingDrawingAt: null, user: { isOperator: true, isDeleted: false, imageObjectKey: 'profiles/op1/old.jpg' },
    })
    await expect(reviewOperatorProfile(null, 'op1', 'publish', null)).resolves.toEqual({ ok: true, state: 'approved', image: 'https://img/new.jpg' })
    expect(mocks.userUpdate).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'op1' }, data: expect.objectContaining({ image: 'https://img/new.jpg', imageObjectKey: 'profiles/op1/new.jpg' }) }))
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
    expect(mocks.publishNow).toHaveBeenCalledWith('r1', 'review', expect.any(Date), { background: true })
  })

  it('rewrites the post with the feedback and draws its photo for review', async () => {
    mocks.reserveFindUnique.mockResolvedValue(REVIEW_POST)
    mocks.loadPersona.mockResolvedValue({ language: 'ja' })
    mocks.loadTexts.mockResolvedValue([])
    mocks.generatePosts.mockResolvedValue([{ topic: 'daily', text: 'new text', language: 'ja', imagePrompt: '[scene] ramen' }])
    mocks.drawImage.mockResolvedValue({ objectKey: 'post-images/op1/a.jpg', width: 900, height: 1200 })
    mocks.reserveUpdate.mockImplementation(async ({ data }) => ({ ...REVIEW_POST, ...data }))

    mocks.canDraw.mockReturnValue(true)

    const result = await reviewOperatorPost(null, 'r1', 'regenerate', '더 짧게')
    // The new text shows at once; the photo follows in the background.
    expect(result).toMatchObject({ ok: true, state: 'review', post: { text: 'new text', photoDrawing: true } })
    expect(mocks.generatePosts).toHaveBeenCalledWith(expect.objectContaining({ revision: { previousText: 'old text', feedback: '더 짧게' } }))
    expect(mocks.reserveUpdate.mock.calls[0][0].data).toMatchObject({ state: 'regenerating', language: null, error: 'photo_drawing' })
    await vi.waitFor(() => expect(mocks.reserveUpdateMany).toHaveBeenCalledTimes(2))
    expect(mocks.reserveUpdateMany.mock.calls[1][0].data).toMatchObject({ state: 'review', imageObjectKey: 'post-images/op1/a.jpg', imageWidth: 900 })
  })

  it('leaves the photo of a rewritten post to be drawn by hand where no pool is set up', async () => {
    mocks.reserveFindUnique.mockResolvedValue(REVIEW_POST)
    mocks.loadPersona.mockResolvedValue({ language: 'ja' })
    mocks.loadTexts.mockResolvedValue([])
    mocks.generatePosts.mockResolvedValue([{ topic: 'daily', text: 'new text', language: 'ja', imagePrompt: '[scene] ramen' }])
    mocks.reserveUpdate.mockImplementation(async ({ data }) => ({ ...REVIEW_POST, ...data }))
    await expect(reviewOperatorPost(null, 'r1', 'regenerate', null)).resolves.toMatchObject({ ok: true, post: { photoRequested: true } })
    expect(mocks.drawImage).not.toHaveBeenCalled()
    expect(mocks.reserveUpdate.mock.calls[0][0].data).toMatchObject({ state: 'review', error: 'photo_requested' })
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

  it('is busy only while a 재제작 really runs here; a row a cut-off job left behind is put back and answered', async () => {
    mocks.publishNow.mockResolvedValue({ ok: true, postId: 'p1' })
    mocks.reserveFindUnique.mockResolvedValue({ ...REVIEW_POST, state: 'regenerating' })
    await expect(reviewOperatorPost(null, 'r1', 'publish', null)).resolves.toEqual({ ok: true, state: 'published', postId: 'p1' })
    expect(mocks.reserveUpdateMany).toHaveBeenCalledWith({ where: { id: 'r1', state: 'regenerating' }, data: { state: 'review', error: null } })

    // A 재제작 that is running here: its claim has not answered yet.
    mocks.reserveUpdateMany.mockClear()
    let claim!: (result: { count: number }) => void
    mocks.reserveFindUnique.mockResolvedValueOnce(REVIEW_POST)
    mocks.reserveUpdateMany.mockReturnValueOnce(new Promise((resolve) => { claim = resolve }))
    const running = reviewOperatorPost(null, 'r1', 'regenerate', null)
    mocks.reserveFindUnique.mockResolvedValue({ ...REVIEW_POST, state: 'regenerating' })
    await vi.waitFor(() => expect(mocks.reserveUpdateMany).toHaveBeenCalledTimes(1))
    await expect(reviewOperatorPost(null, 'r1', 'publish', null)).resolves.toEqual({ ok: false, error: 'busy' })
    expect(mocks.reserveUpdateMany).toHaveBeenCalledTimes(1)
    claim({ count: 0 })
    await expect(running).resolves.toEqual({ ok: false, error: 'busy' })
  })
})

describe('where this server can draw (the ChatGPT pool)', () => {
  beforeEach(() => mocks.canDraw.mockReturnValue(true))

  it('answers at once and draws only the photo of a post in the background', async () => {
    mocks.reserveFindUnique
      .mockResolvedValueOnce({ ...REVIEW_POST, imagePrompt: '[self] a selfie' })
      .mockResolvedValueOnce({ ...REVIEW_POST, imagePrompt: '[self] a selfie', state: 'regenerating', error: 'photo_drawing' })
    mocks.drawImage.mockResolvedValue({ objectKey: 'posts/op1/a.jpg', width: 1280, height: 960 })
    const result = await reviewOperatorPost(null, 'r1', 'draw', '웃는 얼굴로')
    expect(result).toMatchObject({ ok: true, state: 'review', post: { photoDrawing: true } })
    expect(mocks.reserveUpdateMany.mock.calls[0][0]).toMatchObject({ where: { id: 'r1', state: 'review' }, data: { state: 'regenerating', error: 'photo_drawing' } })
    await vi.waitFor(() => expect(mocks.reserveUpdateMany).toHaveBeenCalledTimes(2))
    expect(mocks.drawImage).toHaveBeenCalledWith('op1', '[self] a selfie\nStaff feedback on this photo, to follow: 웃는 얼굴로', undefined, undefined, expect.objectContaining({ engine: undefined }))
    expect(mocks.generatePosts).not.toHaveBeenCalled()
    const done = mocks.reserveUpdateMany.mock.calls[1][0]
    expect(done.data).toMatchObject({ state: 'review', imageObjectKey: 'posts/op1/a.jpg', error: null })
    expect(done.data.text).toBeUndefined()
  })

  it('redraws only the photo with the text, never attaching the photo it replaces', async () => {
    mocks.canDraw.mockReturnValue(true)
    const withPhoto = { ...REVIEW_POST, imagePrompt: '[self] a selfie', imageObjectKey: 'posts/op1/old.jpg' }
    mocks.reserveFindUnique
      .mockResolvedValueOnce(withPhoto)
      .mockResolvedValueOnce({ ...withPhoto, state: 'regenerating', error: 'photo_drawing' })
    mocks.drawImage.mockResolvedValue({ objectKey: 'posts/op1/new.jpg', width: 1280, height: 960 })
    const result = await reviewOperatorPost(null, 'r1', 'redraw_photo', '배경 밝게')
    expect(result).toMatchObject({ ok: true, post: { photoDrawing: true } })
    await vi.waitFor(() => expect(mocks.reserveUpdateMany).toHaveBeenCalledTimes(2))
    const [userId, description, staff, context] = mocks.drawImage.mock.calls[0]
    expect(userId).toBe('op1')
    expect(description).toBe('[self] a selfie\nStaff feedback on the previous photo, to follow: 배경 밝게')
    expect(staff).toBeUndefined()
    expect(context.postText).toBe('old text')
    expect(context.previousPhoto).toBeUndefined()
    expect(mocks.generatePosts).not.toHaveBeenCalled()
    expect(mocks.reserveUpdateMany.mock.calls[1][0].data).toMatchObject({ imageObjectKey: 'posts/op1/new.jpg' })
  })

  it('marks a failed background drawing so the draw button comes back', async () => {
    mocks.reserveFindUnique.mockResolvedValue({ ...REVIEW_POST, imagePrompt: '[self] a selfie' })
    mocks.drawImage.mockResolvedValue(null)
    await expect(reviewOperatorPost(null, 'r1', 'draw', null)).resolves.toMatchObject({ ok: true })
    await vi.waitFor(() => expect(mocks.reserveUpdateMany).toHaveBeenCalledTimes(2))
    expect(mocks.reserveUpdateMany.mock.calls[1][0].data).toEqual({ state: 'review', error: 'photo_draw_failed' })
  })

  it('leaves an automatic photo waiting for a reference photo when none fits', async () => {
    mocks.reserveFindUnique.mockResolvedValue({ ...REVIEW_POST, imagePrompt: '[self] a selfie' })
    mocks.drawImage.mockImplementation(async (_user: string, _brief: string, _ref: unknown, _context: unknown, options?: { onNoReference?: () => void }) => {
      options?.onNoReference?.()
      return null
    })
    await expect(reviewOperatorPost(null, 'r1', 'draw', null)).resolves.toMatchObject({ ok: true })
    await vi.waitFor(() => expect(mocks.reserveUpdateMany).toHaveBeenCalledTimes(2))
    expect(mocks.reserveUpdateMany.mock.calls[1][0].data).toEqual({ state: 'review', error: 'photo_no_reference' })
  })

  it('draws a new profile photo in the background on 재제작', async () => {
    mocks.accountFindUnique.mockResolvedValue(PENDING_ACCOUNT)
    mocks.drawAvatar.mockResolvedValue({ ok: true, image: 'https://img.example/b.jpg', spec: {} })
    await expect(reviewOperatorProfile(null, 'op1', 'regenerate', '안경 없이')).resolves.toEqual({ ok: true, state: 'drawing' })
    expect(mocks.accountUpdate.mock.calls[0][0].data).toMatchObject({ reviewState: 'drawing' })
    await vi.waitFor(() => expect(mocks.accountUpdateMany).toHaveBeenCalled())
    expect(mocks.drawAvatar).toHaveBeenCalledWith(null, 'op1', { feedback: '안경 없이' })
    expect(mocks.accountUpdateMany.mock.calls[0][0]).toMatchObject({ where: { userId: 'op1', reviewState: 'drawing' }, data: { reviewState: 'pending' } })
    expect(mocks.generateAvatar).not.toHaveBeenCalled()
  })

  it('leaves the profile photo to be drawn by hand when the pool fails', async () => {
    mocks.accountFindUnique.mockResolvedValue(PENDING_ACCOUNT)
    mocks.drawAvatar.mockResolvedValue({ ok: false, error: 'image_unavailable' })
    mocks.generateAvatar.mockResolvedValue({ prompt: 'p' })
    await expect(reviewOperatorProfile(null, 'op1', 'regenerate', null)).resolves.toEqual({ ok: true, state: 'drawing' })
    await vi.waitFor(() => expect(mocks.accountUpdateMany).toHaveBeenCalled())
    expect(mocks.accountUpdateMany.mock.calls[0][0].data).toEqual({ avatarSpec: { prompt: 'p' } })
  })
})

describe('rewriting state survives a reload', () => {
  it('shows a row mid-재제작 as rewriting and one mid-drawing as drawing', async () => {
    const { toReviewPostForTest } = await import('./review')
    const base = { id: 'r', text: 't', language: null, topic: null, imagePrompt: null, imageObjectKey: null, imageWidth: null, imageHeight: null, extraImages: [], reviewFeedback: null }
    expect(toReviewPostForTest({ ...base, state: 'regenerating', error: 'text_rewriting' })).toMatchObject({ rewriting: true, photoDrawing: false })
    expect(toReviewPostForTest({ ...base, state: 'regenerating', error: 'photo_drawing' })).toMatchObject({ rewriting: false, photoDrawing: true })
    expect(toReviewPostForTest({ ...base, state: 'review', error: null })).toMatchObject({ rewriting: false, photoDrawing: false })
  })
})

describe('releaseOrphanedDrawings', () => {
  it('puts drawings and rewrites a previous process left behind back in review', async () => {
    mocks.reserveUpdateMany.mockResolvedValueOnce({ count: 3 }).mockResolvedValueOnce({ count: 2 }).mockResolvedValueOnce({ count: 1 })
    await expect(releaseOrphanedDrawings()).resolves.toBe(6)
    expect(mocks.reserveUpdateMany).toHaveBeenNthCalledWith(1, {
      where: { state: 'regenerating', error: 'photo_drawing' },
      data: { state: 'review', error: 'photo_draw_failed' },
    })
    expect(mocks.reserveUpdateMany).toHaveBeenNthCalledWith(2, { where: { state: 'regenerating' }, data: { state: 'review', error: null } })
    expect(mocks.reserveUpdateMany).toHaveBeenNthCalledWith(3, {
      where: { state: 'publishing', releaseAt: null },
      data: { state: 'review', error: 'publish_interrupted' },
    })
  })
})

describe('an account left drawing by a cut-off job', () => {
  it('is put back and answered where the pool draws, not refused as busy', async () => {
    mocks.canDraw.mockReturnValue(true)
    mocks.accountFindUnique.mockResolvedValue({ ...PENDING_ACCOUNT, reviewState: 'drawing' })
    mocks.drawAvatar.mockResolvedValue({ ok: true })
    await expect(reviewOperatorProfile(null, 'op9', 'regenerate', null)).resolves.toEqual({ ok: true, state: 'drawing' })
    expect(mocks.accountUpdateMany).toHaveBeenCalledWith({ where: { userId: 'op9', reviewState: 'drawing' }, data: { reviewState: 'pending' } })
  })

  it('stays busy where nobody draws it here (waiting for the hand-drawn route)', async () => {
    mocks.accountFindUnique.mockResolvedValue({ ...PENDING_ACCOUNT, reviewState: 'drawing' })
    await expect(reviewOperatorProfile(null, 'op9', 'regenerate', null)).resolves.toEqual({ ok: false, error: 'busy' })
  })
})

describe('setReviewPostText', () => {
  it('saves staff-written text on a post in review and audits it', async () => {
    mocks.reserveFindUnique
      .mockResolvedValueOnce({ state: 'review', operatorUserId: 'op1' })
      .mockResolvedValueOnce({ ...REVIEW_POST, text: '새 글' })
    mocks.reserveUpdateMany.mockResolvedValue({ count: 1 })
    await expect(setReviewPostText({} as never, 'r1', '  새 글  ')).resolves.toMatchObject({ ok: true, post: { text: '새 글' } })
    expect(mocks.reserveUpdateMany).toHaveBeenCalledWith({ where: { id: 'r1', state: 'review' }, data: { text: '새 글' } })
    expect(mocks.audit).toHaveBeenCalledWith({}, expect.objectContaining({ metadata: { decision: 'edit_text', length: 3 } }))
  })

  it('refuses empty or too long text, and a post that is not in review', async () => {
    await expect(setReviewPostText({} as never, 'r1', '   ')).resolves.toEqual({ ok: false, error: 'invalid_text' })
    await expect(setReviewPostText({} as never, 'r1', 'a'.repeat(1001))).resolves.toEqual({ ok: false, error: 'invalid_text' })
    mocks.reserveFindUnique.mockResolvedValueOnce({ state: 'published', operatorUserId: 'op1' })
    await expect(setReviewPostText({} as never, 'r1', 'ok')).resolves.toEqual({ ok: false, error: 'not_found' })
  })
})

describe('editReviewPost', () => {
  it('saves text, language, topic and time together', async () => {
    mocks.reserveFindUnique
      .mockResolvedValueOnce({ state: 'review', operatorUserId: 'op1' })
      .mockResolvedValueOnce({ ...REVIEW_POST, text: '새 글' })
    mocks.reserveUpdateMany.mockResolvedValue({ count: 1 })
    const now = new Date('2026-11-23T09:00:00Z')
    await expect(editReviewPost({} as never, 'r1', { text: ' 새 글 ', language: 'ja', topic: ' food ', publishAt: '2026-11-22T06:30:00.000Z' }, now)).resolves.toMatchObject({ ok: true })
    expect(mocks.reserveUpdateMany).toHaveBeenCalledWith({
      where: { id: 'r1', state: 'review' },
      data: { text: '새 글', language: 'ja', topic: 'food', releaseAt: new Date('2026-11-22T06:30:00.000Z') },
    })
  })

  it('clears the time and refuses a future one or an unknown language', async () => {
    const now = new Date('2026-11-23T09:00:00Z')
    await expect(editReviewPost({} as never, 'r1', { publishAt: '2026-11-24T00:00:00Z' }, now)).resolves.toEqual({ ok: false, error: 'invalid_time' })
    await expect(editReviewPost({} as never, 'r1', { language: 'xx-nope' }, now)).resolves.toEqual({ ok: false, error: 'invalid_language' })
    mocks.reserveFindUnique
      .mockResolvedValueOnce({ state: 'regenerating', operatorUserId: 'op1' })
      .mockResolvedValueOnce({ ...REVIEW_POST })
    mocks.reserveUpdateMany.mockResolvedValue({ count: 1 })
    await expect(editReviewPost({} as never, 'r1', { publishAt: null }, now)).resolves.toMatchObject({ ok: true })
    expect(mocks.reserveUpdateMany).toHaveBeenLastCalledWith({ where: { id: 'r1', state: { in: ['review', 'regenerating'] } }, data: { releaseAt: null } })
  })
})

describe('예약 게시', () => {
  const READY = { state: 'review', imagePrompt: '[self] x', imageObjectKey: 'posts/op1/a.jpg', operatorUserId: 'op1', operatorUser: { isActive: true, operatorAccount: { personaCountry: 'KR' } } }
  const now = new Date('2026-11-24T09:00:00Z')

  it('schedules a reviewed post at a time picked 2-30 hours ahead, or the one staff set', async () => {
    mocks.reserveFindUnique.mockResolvedValue(READY)
    mocks.reserveUpdateMany.mockResolvedValue({ count: 1 })
    await scheduleReviewPost(null, 'r1', null, now)
    const picked = mocks.reserveUpdateMany.mock.calls.at(-1)![0]
    expect(picked.where).toEqual({ id: 'r1', state: { in: ['review', 'scheduled'] } })
    expect(picked.data.state).toBe('scheduled')
    expect(picked.data.releaseAt.getTime()).toBeGreaterThan(now.getTime() + 60 * 60_000)
    const chosen = new Date('2026-11-25T12:30:00Z')
    await scheduleReviewPost(null, 'r1', chosen, now)
    expect(mocks.reserveUpdateMany.mock.calls.at(-1)![0].data.releaseAt).toEqual(chosen)
  })

  it('refuses a past time, an account not yet public and a photo not yet drawn', async () => {
    mocks.reserveFindUnique.mockResolvedValue(READY)
    await expect(scheduleReviewPost(null, 'r1', new Date('2026-11-24T08:00:00Z'), now)).resolves.toEqual({ ok: false, error: 'invalid_time' })
    mocks.reserveFindUnique.mockResolvedValue({ ...READY, operatorUser: { ...READY.operatorUser, isActive: false } })
    await expect(scheduleReviewPost(null, 'r1', null, now)).resolves.toEqual({ ok: false, error: 'profile_pending' })
    mocks.reserveFindUnique.mockResolvedValue({ ...READY, imageObjectKey: null })
    await expect(scheduleReviewPost(null, 'r1', null, now)).resolves.toEqual({ ok: false, error: 'photo_pending' })
  })

  it('cancelling puts it back in review with no time', async () => {
    mocks.reserveFindUnique.mockResolvedValue({ operatorUserId: 'op1' })
    mocks.reserveUpdateMany.mockResolvedValue({ count: 1 })
    await unscheduleReviewPost(null, 'r1')
    expect(mocks.reserveUpdateMany.mock.calls.at(-1)![0]).toEqual({ where: { id: 'r1', state: 'scheduled' }, data: { state: 'review', releaseAt: null } })
  })

  it('redraws a profile photo from a fitting reference-library photo', async () => {
    mocks.canDraw.mockReturnValue(true)
    mocks.accountFindUnique.mockResolvedValue(PENDING_ACCOUNT)
    const libraryReference = { reference: { bytes: Buffer.from('ref'), mimeType: 'image/jpeg' }, kind: 'face' }
    mocks.claimAvatarRef.mockResolvedValue({ ok: true, id: 'ref1', libraryReference })
    mocks.drawAvatar.mockResolvedValue({ ok: true, image: 'https://img.example/b.jpg', spec: {} })
    await expect(reviewOperatorProfile(null, 'op1', 'redraw_reference', null)).resolves.toEqual({ ok: true, state: 'drawing' })
    await vi.waitFor(() => expect(mocks.accountUpdateMany).toHaveBeenCalled())
    expect(mocks.drawAvatar).toHaveBeenCalledWith(null, 'op1', expect.objectContaining({ libraryReference }))
    expect(mocks.releaseOtherAvatarRefs).toHaveBeenCalledWith('op1', 'ref1')
  })

  it('says which reference photo a profile needs when none fits', async () => {
    mocks.canDraw.mockReturnValue(true)
    mocks.accountFindUnique.mockResolvedValue(PENDING_ACCOUNT)
    mocks.claimAvatarRef.mockResolvedValue({ ok: false, need: '필요한 짤: 1명·얼굴 보임' })
    await expect(reviewOperatorProfile(null, 'op1', 'redraw_reference', null)).resolves.toEqual({ ok: false, error: 'no_reference', detail: '필요한 짤: 1명·얼굴 보임' })
    expect(mocks.drawAvatar).not.toHaveBeenCalled()
  })
})
