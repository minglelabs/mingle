import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  buildReportTargetKey,
  createReport,
  normalizeReportMessage,
  normalizeReportReason,
  MAX_REPORT_MESSAGE_LENGTH,
  type ReportServiceDeps,
} from './report-service'

describe('normalizeReportReason', () => {
  it('accepts each fixed reason case-insensitively', () => {
    expect(normalizeReportReason('SPAM')).toBe('spam')
    expect(normalizeReportReason(' harassment ')).toBe('harassment')
    expect(normalizeReportReason('other')).toBe('other')
  })

  it('rejects unknown reasons and non-strings', () => {
    expect(normalizeReportReason('nope')).toBeNull()
    expect(normalizeReportReason(123)).toBeNull()
    expect(normalizeReportReason(undefined)).toBeNull()
  })
})

describe('normalizeReportMessage', () => {
  it('treats absent/blank as null (note is optional for every reason)', () => {
    expect(normalizeReportMessage(undefined)).toEqual({ ok: true, message: null })
    expect(normalizeReportMessage(null)).toEqual({ ok: true, message: null })
    expect(normalizeReportMessage('   ')).toEqual({ ok: true, message: null })
  })

  it('caps a note at 500 characters', () => {
    const long = 'a'.repeat(600)
    const result = normalizeReportMessage(long)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.message).toHaveLength(MAX_REPORT_MESSAGE_LENGTH)
  })

  it('rejects a non-string, non-null note', () => {
    expect(normalizeReportMessage(42)).toEqual({ ok: false })
  })
})

describe('buildReportTargetKey', () => {
  it('namespaces by target type so a user and post report never collide', () => {
    expect(buildReportTargetKey('user', 'u1')).toBe('user:u1')
    expect(buildReportTargetKey('post', 'u1')).toBe('post:u1')
    expect(buildReportTargetKey('comment', 'c1')).toBe('comment:c1')
  })
})

describe('createReport', () => {
  let deps: ReportServiceDeps
  const create = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    deps = { userReport: { create } }
  })

  it('creates a post report with the author as reportedUserId and a post target key', async () => {
    create.mockResolvedValue({ id: 'r1', status: 'open' })
    const result = await createReport(deps, {
      reporterId: 'reporter',
      reportedUserId: 'author',
      targetType: 'post',
      targetPostId: 'p1',
      reason: 'spam',
      message: 'buys followers',
    })
    expect(result).toEqual({ status: 'created', reportId: 'r1', reportStatus: 'open' })
    expect(create).toHaveBeenCalledWith({
      data: {
        reporterId: 'reporter',
        reportedUserId: 'author',
        targetType: 'post',
        targetPostId: 'p1',
        targetCommentId: null,
        targetKey: 'post:p1',
        reason: 'spam',
        message: 'buys followers',
      },
      select: { id: true, status: true },
    })
  })

  it('omits message when null', async () => {
    create.mockResolvedValue({ id: 'r2', status: 'open' })
    await createReport(deps, {
      reporterId: 'reporter',
      reportedUserId: 'target',
      targetType: 'user',
      reason: 'other',
      message: null,
    })
    expect(create.mock.calls[0][0].data).not.toHaveProperty('message')
    expect(create.mock.calls[0][0].data.targetKey).toBe('user:target')
  })

  it('maps a unique-constraint violation to duplicate (first report wins)', async () => {
    create.mockRejectedValue({ code: 'P2002' })
    const result = await createReport(deps, {
      reporterId: 'reporter',
      reportedUserId: 'author',
      targetType: 'comment',
      targetCommentId: 'c1',
      reason: 'harassment',
      message: null,
    })
    expect(result).toEqual({ status: 'duplicate' })
  })

  it('rethrows a non-unique error', async () => {
    create.mockRejectedValue(new Error('db down'))
    await expect(
      createReport(deps, {
        reporterId: 'r',
        reportedUserId: 'a',
        targetType: 'user',
        reason: 'spam',
        message: null,
      }),
    ).rejects.toThrow('db down')
  })
})
