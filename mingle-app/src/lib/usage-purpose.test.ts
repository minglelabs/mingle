import { describe, expect, it } from 'vitest'
import { PRIMARY_UI_LOCALES } from '@/i18n/mingle-locales'
import {
  USAGE_PURPOSE_CODES,
  isUsagePurpose,
  resolveUsagePurposeCopy,
  resolveUsagePurposeSegmentationDefaults,
} from '@/lib/usage-purpose'

describe('usage purpose', () => {
  it('starts work users on the longest automatic-detection step', () => {
    expect(resolveUsagePurposeSegmentationDefaults('work')).toEqual({
      sttSegmentationMode: 'end',
      demoEndpointTuningStep: 4,
    })
  })

  it('keeps the account defaults for social and other users', () => {
    expect(resolveUsagePurposeSegmentationDefaults('social')).toBeNull()
    expect(resolveUsagePurposeSegmentationDefaults('other')).toBeNull()
  })

  it('accepts only known codes', () => {
    expect(isUsagePurpose('work')).toBe(true)
    expect(isUsagePurpose('business')).toBe(false)
    expect(isUsagePurpose(null)).toBe(false)
  })

  it('has a label and hint for every option in every primary locale', () => {
    for (const locale of PRIMARY_UI_LOCALES) {
      const copy = resolveUsagePurposeCopy(locale)
      expect(copy.options.map((option) => option.code)).toEqual([...USAGE_PURPOSE_CODES])
      for (const option of copy.options) {
        expect(option.label.length).toBeGreaterThan(0)
        expect(option.hint.length).toBeGreaterThan(0)
      }
    }
  })

  it('falls back to English for unknown locales', () => {
    expect(resolveUsagePurposeCopy('xx').title).toBe(resolveUsagePurposeCopy('en').title)
  })
})
