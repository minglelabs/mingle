import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/prisma', () => ({ prisma: {} }))
vi.mock('@/server/push-notifications', () => ({ sendPushToUsers: vi.fn() }))

import { buildImportantNoticePush, noticeListHref } from './notice-push'

const texts = { ko: { title: '점검 안내', body: '오늘 밤\n10시부터 점검합니다.' }, en: { title: 'Maintenance', body: 'Tonight from 10 pm.' } }

describe('buildImportantNoticePush', () => {
  it('uses the notice text in the recipient\'s language and opens the notice list', () => {
    const push = buildImportantNoticePush('n1', texts, { userId: 'u1', language: 'ko' })
    expect(push).toMatchObject({
      type: 'important_notice',
      notificationId: 'notice:n1',
      collapseKey: 'notice:n1',
      noticeTitle: '점검 안내',
      messagePreview: '오늘 밤 10시부터 점검합니다.',
      navigationUrl: '/ko/explore?notices=1',
    })
  })

  it('falls back to English for a language the notice was not written in', () => {
    const push = buildImportantNoticePush('n1', texts, { userId: 'u1', language: 'fr' })
    expect(push?.noticeTitle).toBe('Maintenance')
    expect(push?.navigationUrl).toBe(noticeListHref('fr'))
  })

  it('skips a notice with no text', () => {
    expect(buildImportantNoticePush('n1', {}, { userId: 'u1', language: 'ko' })).toBeNull()
    expect(buildImportantNoticePush('n1', null, { userId: 'u1', language: 'ko' })).toBeNull()
  })
})
