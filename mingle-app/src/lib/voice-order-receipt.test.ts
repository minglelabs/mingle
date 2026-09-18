import { afterEach, expect, it, vi } from 'vitest'
import { mintVoiceOrderReceipt, verifyVoiceOrderReceipt } from './voice-order-receipt'

const scope = { userId: 'alice', sessionKey: 'room', clientMessageId: 'voice' }
afterEach(() => vi.unstubAllEnvs())

it('keeps a server-issued start time across long speech and rejects scope substitution', () => {
  vi.stubEnv('MINGLE_REALTIME_SECRET', 'test-only')
  const token = mintVoiceOrderReceipt(scope, 10000)
  expect(verifyVoiceOrderReceipt(token, scope, 70000)).toBe(10000)
  for (const field of ['userId', 'sessionKey', 'clientMessageId']) {
    expect(verifyVoiceOrderReceipt(token, { ...scope, [field]: 'other' }, 70000)).toBeNull()
  }
  expect(verifyVoiceOrderReceipt(token + 'x', scope, 70000)).toBeNull()
  expect(verifyVoiceOrderReceipt(token, scope, 9999)).toBeNull()
  expect(verifyVoiceOrderReceipt(token, scope, 10000 + 31 * 86400000)).toBeNull()
})

it('fails safely without a signing secret or with malformed tokens', () => {
  vi.stubEnv('MINGLE_REALTIME_SECRET', '')
  expect(mintVoiceOrderReceipt(scope)).toBeNull()
  expect(verifyVoiceOrderReceipt('abc.def', scope)).toBeNull()
  vi.stubEnv('MINGLE_REALTIME_SECRET', 'test-only')
  for (const token of [null, 123, 'bad', 'a.b.c', 'x'.repeat(5000)]) {
    expect(verifyVoiceOrderReceipt(token, scope)).toBeNull()
  }
})
