import { describe, expect, it } from 'vitest'
import { LEGAL_DOCUMENT_LOCALES } from '@/i18n'
import { resolveNotificationCopy } from './notification-copy'

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
