import { describe, expect, it } from 'vitest'
import { PRIMARY_UI_LOCALES } from '@/i18n/mingle-locales'
import { commentsCopy, formatCommentsCopy, type CommentsCopy } from './comments-copy'

const REQUIRED_KEYS: (keyof CommentsCopy)[] = [
  'title', 'close', 'empty', 'loading', 'loadError', 'retry', 'signedOutHint',
  'writeComment', 'writeReply', 'replyingTo', 'cancelReply', 'send', 'sending',
  'charCount', 'tooLong', 'sendFailed', 'rateLimited',
  'viewReplies', 'hideReplies', 'replyToUser',
  'like', 'unlike', 'likeCount', 'reply', 'edit', 'delete', 'report', 'save',
  'cancel', 'more', 'deleteConfirm', 'deleteConfirmYes', 'deletedPlaceholder',
  'edited', 'actionFailed',
  'seeTranslation', 'translating', 'seeOriginal', 'translationFailed',
  'seeMore', 'seeLess',
]

describe('comments-copy', () => {
  it('covers every primary UI locale (15)', () => {
    for (const locale of PRIMARY_UI_LOCALES) {
      const c = commentsCopy(locale)
      expect(c, `missing copy for ${locale}`).toBeDefined()
      for (const key of REQUIRED_KEYS) {
        expect(typeof c[key], `${locale}.${key}`).toBe('string')
        expect(c[key].length, `${locale}.${key} empty`).toBeGreaterThan(0)
      }
    }
  })

  it('keeps placeholder tokens where the UI substitutes them', () => {
    for (const locale of PRIMARY_UI_LOCALES) {
      const c = commentsCopy(locale)
      expect(c.charCount, `${locale}.charCount`).toContain('{n}')
      expect(c.charCount, `${locale}.charCount`).toContain('{max}')
      expect(c.tooLong, `${locale}.tooLong`).toContain('{max}')
      expect(c.rateLimited, `${locale}.rateLimited`).toContain('{n}')
      expect(c.viewReplies, `${locale}.viewReplies`).toContain('{n}')
      expect(c.replyingTo, `${locale}.replyingTo`).toContain('{name}')
      expect(c.likeCount, `${locale}.likeCount`).toContain('{n}')
    }
  })

  it('falls back to English for an unknown locale', () => {
    expect(commentsCopy('xx-YY')).toEqual(commentsCopy('en'))
  })

  it('maps an app-supported non-primary locale to its primary UI copy', () => {
    // 'nl' is app-supported but not a primary UI locale -> resolves to a primary
    expect(commentsCopy('nl')).toBeDefined()
  })

  describe('formatCommentsCopy', () => {
    it('substitutes single and multiple placeholders', () => {
      expect(formatCommentsCopy('{n}/{max}', { n: 12, max: 500 })).toBe('12/500')
      expect(formatCommentsCopy('Replying to {name}', { name: 'Ada' })).toBe('Replying to Ada')
    })

    it('leaves unknown placeholders untouched', () => {
      expect(formatCommentsCopy('{a} {b}', { a: 'x' })).toBe('x {b}')
    })

    it('is a no-op when there are no placeholders', () => {
      expect(formatCommentsCopy('Comments', { n: 1 })).toBe('Comments')
    })
  })
})
