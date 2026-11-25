import { describe, expect, it } from 'vitest'
import { needsPronunciation, validatePronunciation } from '@/server/name-pronunciation'
import { nameNeedsPronunciation } from '@/components/name-pronunciation-button'

describe('name pronunciation', () => {
  it('is offered only for names with letters outside the Latin alphabet', () => {
    for (const check of [needsPronunciation, nameNeedsPronunciation]) {
      expect(check('김민지')).toBe(true)
      expect(check('さくら')).toBe(true)
      expect(check('王伟')).toBe(true)
      expect(check('Анна')).toBe(true)
      expect(check('Minji Kim')).toBe(false)
      expect(check('José Ñúñez')).toBe(false)
      expect(check('Nguyễn Văn An')).toBe(false)
      expect(check('😀 Tom')).toBe(false)
      expect(check('')).toBe(false)
      expect(check(null)).toBe(false)
    }
  })

  it('takes only plain English letters back, never IPA or the original script', () => {
    expect(validatePronunciation({ pronunciation: 'Min-ji Kim' })).toBe('Min-ji Kim')
    expect(() => validatePronunciation({ pronunciation: 'mʲindʑi' })).toThrow()
    expect(() => validatePronunciation({ pronunciation: '김민지' })).toThrow()
    expect(() => validatePronunciation({ pronunciation: '' })).toThrow()
  })
})
