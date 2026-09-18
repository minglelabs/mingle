import { describe, expect, it } from 'vitest'
import { LEGAL_DOCUMENT_LOCALES } from '@/i18n'
import { resolveProfileImageCropCopy } from './profile-image-crop-copy'

describe('profile image crop copy', () => {
  it('defines crop controls for all primary UI locales', () => {
    expect(LEGAL_DOCUMENT_LOCALES).toHaveLength(15)

    for (const locale of LEGAL_DOCUMENT_LOCALES) {
      const copy = resolveProfileImageCropCopy(locale)
      expect(copy.addPhoto.trim()).not.toBe('')
      expect(copy.changePhoto.trim()).not.toBe('')
      expect(copy.invalidFile.trim()).not.toBe('')
    }
  })

  it('falls back to English for an unsupported app locale', () => {
    expect(resolveProfileImageCropCopy('pl').addPhoto).toBe('Add profile photo')
  })
})
