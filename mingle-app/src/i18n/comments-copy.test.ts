import { describe, expect, it } from 'vitest'
import { PRIMARY_UI_LOCALES } from '@/i18n/mingle-locales'
import { commentsCopy, formatCommentsCopy, formatViewReplies, type CommentsCopy } from './comments-copy'

type StringKey = { [K in keyof CommentsCopy]: CommentsCopy[K] extends string ? K : never }[keyof CommentsCopy]

const REQUIRED_KEYS: StringKey[] = [
  'title', 'close', 'empty', 'loading', 'loadError', 'retry', 'signedOutHint',
  'writeComment', 'writeReply', 'replyingTo', 'cancelReply', 'send', 'sending',
  'charCount', 'tooLong', 'sendFailed', 'rateLimited',
  'viewReplies', 'hideReplies', 'replyToUser',
  'like', 'unlike', 'likeCount', 'likeWithCount', 'unlikeWithCount', 'reply', 'edit', 'delete', 'report', 'save',
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

  it('keeps {n} in the like-button accessible names and every plural form', () => {
    for (const locale of PRIMARY_UI_LOCALES) {
      const c = commentsCopy(locale)
      expect(c.likeWithCount, `${locale}.likeWithCount`).toContain('{n}')
      expect(c.unlikeWithCount, `${locale}.unlikeWithCount`).toContain('{n}')
      for (const [category, form] of Object.entries(c.viewRepliesForms)) {
        // Arabic one/two spell the number out; every other form shows it.
        if (locale === 'ar' && (category === 'one' || category === 'two')) continue
        expect(form, `${locale}.viewRepliesForms.${category}`).toContain('{n}')
      }
    }
  })

  describe('formatViewReplies', () => {
    it('uses the singular form for one reply', () => {
      expect(formatViewReplies('en', 1)).toBe('View 1 reply')
      expect(formatViewReplies('en', 2)).toBe('View 2 replies')
      expect(formatViewReplies('es', 1)).toBe('Ver 1 respuesta')
    })

    it('follows Russian and Arabic plural categories', () => {
      expect(formatViewReplies('ru', 1)).toBe('Показать 1 ответ')
      expect(formatViewReplies('ru', 3)).toBe('Показать 3 ответа')
      expect(formatViewReplies('ru', 5)).toBe('Показать 5 ответов')
      expect(formatViewReplies('ar', 2)).toBe('عرض ردّين')
      expect(formatViewReplies('ar', 3)).toBe('عرض 3 ردود')
    })

    it('keeps one form for languages without number inflection', () => {
      expect(formatViewReplies('ko', 1)).toBe('답글 1개 보기')
      expect(formatViewReplies('ko', 7)).toBe('답글 7개 보기')
    })
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
