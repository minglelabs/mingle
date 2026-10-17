import { describe, expect, it } from 'vitest'
import { isDuplicateReportBody } from './report-response'

describe('isDuplicateReportBody', () => {
  it('recognises the duplicate report response', () => {
    expect(isDuplicateReportBody({ status: 'already_reported', duplicate: true })).toBe(true)
    expect(isDuplicateReportBody({ duplicate: true })).toBe(true)
    expect(isDuplicateReportBody({ status: 'already_reported' })).toBe(true)
  })

  it('treats a fresh receipt or an unreadable body as not duplicate', () => {
    expect(isDuplicateReportBody({ status: 'created' })).toBe(false)
    expect(isDuplicateReportBody({})).toBe(false)
    expect(isDuplicateReportBody(null)).toBe(false)
  })
})
