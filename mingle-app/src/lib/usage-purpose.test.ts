import { describe, expect, it } from 'vitest'
import { PRIMARY_UI_LOCALES } from '@/i18n/mingle-locales'
import {
  USAGE_PURPOSE_CODES,
  USAGE_PURPOSE_NOTE_MAX_LENGTH,
  isUsagePurpose,
  normalizeUsagePurposeNote,
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

  it('starts other users on the longest step too, and keeps the account defaults for casual chats', () => {
    expect(resolveUsagePurposeSegmentationDefaults('other')).toEqual({
      sttSegmentationMode: 'end',
      demoEndpointTuningStep: 4,
    })
    expect(resolveUsagePurposeSegmentationDefaults('social')).toBeNull()
  })

  it('trims the other reason and drops it when blank', () => {
    expect(normalizeUsagePurposeNote('  통역 공부  ')).toBe('통역 공부')
    expect(normalizeUsagePurposeNote('   ')).toBeNull()
    expect(normalizeUsagePurposeNote(3)).toBeNull()
    expect(normalizeUsagePurposeNote('a'.repeat(300))).toHaveLength(USAGE_PURPOSE_NOTE_MAX_LENGTH)
  })

  it('accepts only known codes', () => {
    expect(isUsagePurpose('work')).toBe(true)
    expect(isUsagePurpose('business')).toBe(false)
    expect(isUsagePurpose(null)).toBe(false)
  })

  it('has a label for every option in every primary locale', () => {
    for (const locale of PRIMARY_UI_LOCALES) {
      const copy = resolveUsagePurposeCopy(locale)
      expect(copy.options.map((option) => option.code)).toEqual([...USAGE_PURPOSE_CODES])
      expect(copy.otherNotePlaceholder.length).toBeGreaterThan(0)
      for (const option of copy.options) {
        expect(option.label.length).toBeGreaterThan(0)
        if (option.code !== 'other') expect(option.hint?.length).toBeGreaterThan(0)
      }
    }
  })

  it('falls back to English for unknown locales', () => {
    expect(resolveUsagePurposeCopy('xx').title).toBe(resolveUsagePurposeCopy('en').title)
  })
})
