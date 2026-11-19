import { beforeEach, describe, expect, it, vi } from 'vitest'

const db = vi.hoisted(() => ({ count: vi.fn(), findMany: vi.fn(), create: vi.fn(), userFindUnique: vi.fn(), userUpdateMany: vi.fn() }))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    appNotice: { count: db.count, findMany: db.findMany, create: db.create },
    user: { findUnique: db.userFindUnique, updateMany: db.userUpdateMany },
  },
}))

import { createBanNotice, createGeneralNotice, listNotices, maskNoticeName, pickNoticeText, readNoticeSummary, toNoticeDto } from './notices'

const now = new Date('2026-11-16T12:00:00.000Z')
const row = { id: 'n1', maskedName: null, category: null, texts: null, isImportant: false, publishedAt: now }

beforeEach(() => {
  vi.clearAllMocks()
  db.create.mockResolvedValue({ id: 'new' })
})

describe('notices', () => {
  it('masks a name to its first character, in any script', () => {
    expect(maskNoticeName('Jimin')).toBe('J***')
    expect(maskNoticeName('  민지 ')).toBe('민***')
    expect(maskNoticeName('😀abc')).toBe('😀***')
    expect(maskNoticeName('')).toBe('***')
    expect(maskNoticeName(null)).toBe('***')
  })

  it('picks the text for the app language, then English, then Korean', () => {
    const texts = { ko: { title: '점검', body: '오늘 밤' }, en: { title: 'Maintenance', body: 'Tonight' } }
    expect(pickNoticeText(texts, 'ko-KR')).toEqual({ title: '점검', body: '오늘 밤' })
    expect(pickNoticeText(texts, 'ja')).toEqual({ title: 'Maintenance', body: 'Tonight' })
    expect(pickNoticeText({ ko: { title: '점검', body: '' } }, 'fr')).toEqual({ title: '점검', body: '' })
    expect(pickNoticeText({ ko: { title: ' ', body: '' } }, 'ko')).toBeNull()
    expect(pickNoticeText(null, 'ko')).toBeNull()
  })

  it('shows a ban only as a masked name, a category and the day', () => {
    expect(toNoticeDto({ ...row, kind: 'ban', maskedName: 'J***', category: 'harassment' }, 'ko')).toEqual({
      id: 'n1', kind: 'ban', maskedName: 'J***', category: 'harassment', publishedAt: now.toISOString(),
    })
    expect(toNoticeDto({ ...row, kind: 'ban', maskedName: null, category: 'made-up' }, 'ko')).toMatchObject({ maskedName: '***', category: 'other' })
    expect(toNoticeDto({ ...row, kind: 'general', texts: {} }, 'ko')).toBeNull()
  })

  it('stores only the masked name of a banned account', async () => {
    await createBanNotice({ name: 'Jimin Kim', category: 'scam' })
    expect(db.create).toHaveBeenCalledWith({ data: { kind: 'ban', maskedName: 'J***', category: 'scam' }, select: { id: true } })
  })

  it('drops empty languages of a text notice, and refuses an empty one', async () => {
    await expect(createGeneralNotice({ texts: { ko: { title: '', body: ' ' } } })).resolves.toBeNull()
    await createGeneralNotice({ texts: { ko: { title: '점검', body: '' }, en: { title: '', body: '' } }, isImportant: true })
    expect(db.create).toHaveBeenCalledWith({ data: { kind: 'general', texts: { ko: { title: '점검', body: '' } }, isImportant: true }, select: { id: true } })
  })

  it('counts this week\'s bans and the notices published since the user last looked', async () => {
    db.count.mockResolvedValueOnce(3).mockResolvedValueOnce(2)
    db.userFindUnique.mockResolvedValue({ noticesSeenAt: new Date('2026-11-15T00:00:00.000Z') })
    await expect(readNoticeSummary('me', now)).resolves.toEqual({ weekBanCount: 3, unreadCount: 2 })
    expect(db.count).toHaveBeenNthCalledWith(1, {
      where: { kind: 'ban', deletedAt: null, publishedAt: { gte: new Date('2026-11-09T12:00:00.000Z'), lte: now } },
    })
    expect(db.count).toHaveBeenNthCalledWith(2, {
      where: { deletedAt: null, publishedAt: { lte: now, gt: new Date('2026-11-15T00:00:00.000Z') } },
    })
  })

  it('lists the newest notices and marks them seen', async () => {
    db.findMany.mockResolvedValue([
      { ...row, id: 'b', kind: 'ban', maskedName: 'K***', category: 'spam' },
      { ...row, id: 'g', kind: 'general', texts: { en: { title: 'Hello', body: '' } } },
      { ...row, id: 'x', kind: 'general', texts: {} },
    ])
    const notices = await listNotices('me', 'ko', now)
    expect(notices.map((notice) => notice.id)).toEqual(['b', 'g'])
    expect(db.userUpdateMany).toHaveBeenCalledWith({ where: { id: 'me' }, data: { noticesSeenAt: now } })
  })
})
