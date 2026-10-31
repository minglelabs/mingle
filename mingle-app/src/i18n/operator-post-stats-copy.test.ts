import { describe, expect, it } from 'vitest'
import { LEGAL_DOCUMENT_LOCALES } from '@/i18n'
import { OPERATOR_POST_STAT_KEYS } from '@/lib/operator-post-stats'
import { operatorPostStatsCopy } from './operator-post-stats-copy'

describe('operator post stats copy', () => {
  it('labels every stat in all 15 primary UI locales', () => {
    expect(LEGAL_DOCUMENT_LOCALES).toHaveLength(15)
    for (const locale of LEGAL_DOCUMENT_LOCALES) {
      const copy = operatorPostStatsCopy(locale)
      expect(copy.title.trim(), `${locale}.title`).not.toBe('')
      for (const key of OPERATOR_POST_STAT_KEYS) {
        expect(copy.labels[key]?.trim(), `${locale}.${key}`).toBeTruthy()
      }
    }
  })

  it('falls back to English and resolves region tags', () => {
    expect(operatorPostStatsCopy('pl').labels.views).toBe('Views')
    expect(operatorPostStatsCopy('ko-KR').labels.views).toBe('조회')
  })
})
