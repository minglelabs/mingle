import { describe, expect, it } from 'vitest'
import { isTypedFinalizeRequest } from './translate-finalize-handler'

describe('isTypedFinalizeRequest', () => {
  it('bills per message only when the client marks the final as typed', () => {
    expect(isTypedFinalizeRequest({ typedMessage: true })).toBe(true)
  })

  it('a spoken final without an STT duration is not a typed message', () => {
    expect(isTypedFinalizeRequest({})).toBe(false)
    expect(isTypedFinalizeRequest({ sttDurationMs: 0 })).toBe(false)
  })

  it('a final that carries an STT duration is spoken even if marked typed', () => {
    expect(isTypedFinalizeRequest({ typedMessage: true, sttDurationMs: 1200 })).toBe(false)
  })
})
