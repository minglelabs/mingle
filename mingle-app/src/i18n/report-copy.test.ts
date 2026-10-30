import { describe, expect, it } from 'vitest'
import { PRIMARY_UI_LOCALES } from '@/i18n/mingle-locales'
import { REPORT_REASONS } from '@/server/reports/report-service'
import { reportCopy } from './report-copy'

describe('reportCopy', () => {
  it('resolves complete copy for every primary UI locale (15)', () => {
    expect(PRIMARY_UI_LOCALES).toHaveLength(15)
    for (const locale of PRIMARY_UI_LOCALES) {
      const copy = reportCopy(locale)
      expect(copy.reportPost.length).toBeGreaterThan(0)
      expect(copy.submit.length).toBeGreaterThan(0)
      expect(copy.alreadyReported.length).toBeGreaterThan(0)
      expect(copy.noAutoAction.length).toBeGreaterThan(0)
      for (const reason of REPORT_REASONS) {
        expect(copy.reasons[reason].length).toBeGreaterThan(0)
      }
    }
  })

  it('falls back to English for an unknown locale', () => {
    expect(reportCopy('xx').submit).toBe('Submit report')
  })

  it('maps a regional tag to its primary UI locale', () => {
    expect(reportCopy('zh-HK').reportPost.length).toBeGreaterThan(0)
    expect(reportCopy('en-US').submit).toBe('Submit report')
  })
})
