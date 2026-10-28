import { describe, expect, it } from 'vitest'
import { LEGAL_DOCUMENT_LOCALES } from '@/i18n'
import { composeCopy, formatComposeCopy } from './compose-copy'

const KEYS = [
  'entryTitle', 'newPost', 'draftsTitle', 'draftsEmpty', 'draftUntitled', 'draftDelete',
  'draftDeleteConfirm', 'draftPhoto', 'savedAtPrefix', 'signInRequired', 'signInCta',
  'editorPlaceholder', 'charCount', 'emptyBlocked', 'publish', 'publishing', 'saveDraft',
  'savingDraft', 'draftSaved', 'discard', 'addPhoto', 'replacePhoto', 'removePhoto',
  'photoPermissionDenied', 'photoUnsupported', 'photoTooLarge', 'photoProcessing',
  'photoUploadFailed', 'changeBackground', 'preview', 'previewTitle', 'backToEdit',
  'bannerPublishing', 'bannerSuccess', 'bannerViewPost', 'bannerFailed', 'bannerRetry',
  'bannerDismiss', 'bannerRateLimited', 'editTitle', 'saveChanges', 'savingChanges',
  'editLoadError', 'editSaved', 'archiveTitle', 'trashTitle', 'hiddenTitle', 'archiveEmpty',
  'trashEmpty', 'hiddenEmpty', 'restoreToPublic', 'restoreFromTrash', 'unhide', 'trashDaysLeft',
  'managePostsTitle', 'loadError', 'retry', 'cancel',
] as const

describe('compose copy', () => {
  it('defines every key for all 15 primary UI locales with non-empty strings', () => {
    expect(LEGAL_DOCUMENT_LOCALES).toHaveLength(15)
    for (const locale of LEGAL_DOCUMENT_LOCALES) {
      const c = composeCopy(locale)
      for (const key of KEYS) {
        expect(c[key].trim(), `${locale}.${key}`).not.toBe('')
      }
    }
  })

  it('keeps the {count}/{max} and {days}/{seconds} tokens intact in templates', () => {
    for (const locale of LEGAL_DOCUMENT_LOCALES) {
      const c = composeCopy(locale)
      expect(c.charCount).toContain('{count}')
      expect(c.charCount).toContain('{max}')
      expect(c.trashDaysLeft).toContain('{days}')
      expect(c.bannerRateLimited).toContain('{seconds}')
    }
  })

  it('falls back to English for an unsupported app locale', () => {
    expect(composeCopy('pl').publish).toBe('Post')
    expect(composeCopy('sw').newPost).toBe('New post')
  })

  it('resolves regional Chinese tags to the right variant', () => {
    expect(composeCopy('zh-Hans').publish).toBe('发布')
    expect(composeCopy('zh-Hant').publish).toBe('發布')
  })

  it('fills template tokens and leaves unknown tokens untouched', () => {
    expect(formatComposeCopy('{count}/{max}', { count: 12, max: 1000 })).toBe('12/1000')
    expect(formatComposeCopy('Try again in {seconds}s.', { seconds: 30 })).toBe('Try again in 30s.')
    expect(formatComposeCopy('{days}d left', { days: 5 })).toBe('5d left')
    expect(formatComposeCopy('{unknown}', {})).toBe('{unknown}')
  })
})
