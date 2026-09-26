import { describe, expect, it } from 'vitest'
import { LEGAL_DOCUMENT_LOCALES } from '@/i18n'
import { resolveNotificationCopy, resolvePushNotificationCopy } from './notification-copy'

describe('notification copy', () => {
  it('defines notification and relative-time copy for all primary UI locales', () => {
    expect(LEGAL_DOCUMENT_LOCALES).toHaveLength(15)

    for (const locale of LEGAL_DOCUMENT_LOCALES) {
      const copy = resolveNotificationCopy(locale)
      expect(copy.buttonLabel.trim()).not.toBe('')
      expect(copy.followBackAction.trim()).not.toBe('')
      expect(copy.minutesAgo).toContain('{count}')
    }
  })

  it('falls back to English for an unsupported app locale', () => {
    expect(resolveNotificationCopy('pl').buttonLabel).toBe('Notifications')
    expect(resolveNotificationCopy('pl').minutesAgo).toBe('{count}m ago')
  })
})

describe('notification copy — load more, app switch and push (15 languages)', () => {
  it('has every new key in all 15 primary UI locales', () => {
    for (const locale of LEGAL_DOCUMENT_LOCALES) {
      const copy = resolveNotificationCopy(locale)
      for (const value of [
        copy.loadMoreAction, copy.inAppToggleTitle, copy.inAppToggleDescription,
        copy.push.followTitle, copy.push.followBody, copy.push.commentTitle,
        copy.push.commentBody, copy.push.replyTitle, copy.push.replyBody,
      ]) {
        expect(value.trim(), locale).not.toBe('')
      }
      expect(copy.push.followBody, `${locale}.followBody`).toContain('{name}')
      expect(copy.push.commentBody, `${locale}.commentBody`).toContain('{name}')
      expect(copy.push.replyBody, `${locale}.replyBody`).toContain('{name}')
    }
  })

  it('translates the app switch instead of falling back to English (13 non-ko/en locales)', () => {
    const en = resolveNotificationCopy('en')
    for (const locale of LEGAL_DOCUMENT_LOCALES) {
      if (locale === 'en') continue
      const copy = resolveNotificationCopy(locale)
      expect(copy.inAppToggleTitle, locale).not.toBe(en.inAppToggleTitle)
      expect(copy.inAppToggleDescription, locale).not.toBe(en.inAppToggleDescription)
    }
  })

  it('pushes comment / reply / follow in it, ru, ar, hi, th and vi (previously English)', () => {
    const en = resolvePushNotificationCopy('en', 'comment', 'Ada')
    for (const language of ['it', 'ru', 'ar', 'hi', 'th', 'vi']) {
      for (const type of ['follow', 'comment', 'comment_reply'] as const) {
        const push = resolvePushNotificationCopy(language, type, 'Ada')
        expect(push.body, `${language}.${type}`).toContain('Ada')
        expect(push.title, `${language}.${type}`).not.toBe(resolvePushNotificationCopy('en', type, 'Ada').title)
      }
    }
    expect(en).toEqual({ title: 'New comment', body: 'Ada commented on your post.' })
  })

  it('keeps the existing wording and resolves language tags case-insensitively', () => {
    expect(resolvePushNotificationCopy('ko', 'follow', '민지')).toEqual({ title: '새 팔로워', body: '민지님이 회원님을 팔로우했습니다.' })
    expect(resolvePushNotificationCopy('zh-cn', 'comment_reply', 'A').title).toBe('新回复')
    expect(resolvePushNotificationCopy('zh-TW', 'comment_reply', 'A').title).toBe('新回覆')
  })

  it('falls back to English for an unknown language', () => {
    expect(resolvePushNotificationCopy('xx', 'follow', 'Ada')).toEqual({ title: 'New follower', body: 'Ada followed you.' })
  })
})
