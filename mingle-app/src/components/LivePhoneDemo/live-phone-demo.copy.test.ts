import { describe, expect, it } from 'vitest'
import { COPY_SUCCESS_EVENT } from './live-phone-demo.copy'

describe('live-phone-demo.copy', () => {
  it('exports the copy success event name', () => {
    expect(typeof COPY_SUCCESS_EVENT).toBe('string')
    expect(COPY_SUCCESS_EVENT.length).toBeGreaterThan(0)
  })
})
