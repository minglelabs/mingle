import { describe, expect, it } from 'vitest'
import {
  buildVoiceCallMessageClientId,
  normalizeVoiceCallMessage,
  resolveVoiceCallMessageState,
} from './voice-call-message'

describe('voice call message', () => {
  it('reads the call id and rejects anything else', () => {
    expect(normalizeVoiceCallMessage({ callId: ' c1 ' })).toEqual({ callId: 'c1' })
    expect(normalizeVoiceCallMessage({ callId: '' })).toBeNull()
    expect(normalizeVoiceCallMessage({})).toBeNull()
    expect(normalizeVoiceCallMessage(null)).toBeNull()
    expect(normalizeVoiceCallMessage(['c1'])).toBeNull()
  })

  it('has one client id per call', () => {
    expect(buildVoiceCallMessageClientId('c1')).toBe('voice-call-c1')
  })

  it('can be joined only while its own call is live and this phone is not in it', () => {
    const message = { callId: 'c1' }
    expect(resolveVoiceCallMessageState({ message, liveCallId: 'c1', joined: false })).toBe('joinable')
    expect(resolveVoiceCallMessageState({ message, liveCallId: 'c1', joined: true })).toBe('joined')
    // The call ended, or a later call is live now.
    expect(resolveVoiceCallMessageState({ message, liveCallId: null, joined: false })).toBe('ended')
    expect(resolveVoiceCallMessageState({ message, liveCallId: 'c2', joined: true })).toBe('ended')
  })
})
