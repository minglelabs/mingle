import { describe, expect, it } from 'vitest'
import { normalizeRecalledMessageIds, readMessageRecalledAtMs } from './message-recall'

describe('message recall', () => {
  it('reads only a positive recall timestamp', () => {
    expect(readMessageRecalledAtMs({ recalledAtMs: 1700000000000 })).toBe(1700000000000)
    expect(readMessageRecalledAtMs({ recalledAtMs: 0 })).toBeNull()
    expect(readMessageRecalledAtMs({ recalledAtMs: '1' })).toBeNull()
    expect(readMessageRecalledAtMs([1])).toBeNull()
    expect(readMessageRecalledAtMs(null)).toBeNull()
  })
  it('keeps unique, well-formed ids', () => {
    expect(normalizeRecalledMessageIds(['a', 'a', '', 3, 'b'])).toEqual(['a', 'b'])
    expect(normalizeRecalledMessageIds({})).toEqual([])
  })
})
