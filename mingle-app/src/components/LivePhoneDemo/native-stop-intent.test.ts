import { describe, expect, it, vi } from 'vitest'
import { createNativeStopIntentRegistry } from './native-stop-intent'
import {
  parseSttTranscriptMessage, resolveConnectionStatusFromNativeBridgeStatus,
  shouldApplyNativeBridgeConnectionStatus, shouldCompleteNativeStopFromStatus,
  shouldHandleNativeBridgeServerMessage, shouldPromoteConnectionStatusFromNativeActivity,
} from './use-realtime-stt'

describe('native stop lifecycle', () => {
  it('allows restart after the bounded wait without reviving a stopped session', () => {
    vi.useFakeTimers()
    try {
      const intent = createNativeStopIntentRegistry()
      intent.stop('room', 5000)
      vi.advanceTimersByTime(5000)
      expect(intent.isPending('room')).toBe(false)
      expect(intent.isStopped('room')).toBe(true)
      intent.start('room')
      expect(intent.isStopped('room')).toBe(false)
    } finally {
      vi.useRealTimers()
    }
  })

  it('keeps Start visible through early acceptance, final text, ACK, close and stale events', () => {
    const intent = createNativeStopIntentRegistry()
    const key = 'account/ios/room'
    let status: 'idle' | 'connecting' | 'ready' | 'error' = 'ready'
    let pending = true
    intent.stop(key)
    status = 'idle'
    const states: Array<'idle' | 'connecting' | 'ready' | 'error'> = [status]
    const applyStatus = (nativeStatus: string) => {
      const next = resolveConnectionStatusFromNativeBridgeStatus({ nativeStatus, previousConnectionStatus: status })
      if (shouldApplyNativeBridgeConnectionStatus({
        nextConnectionStatus: next, nativeStopRequested: pending, stopIntent: intent.isStopped(key),
      })) status = next!
      if (shouldCompleteNativeStopFromStatus({ status: nativeStatus, stopRequested: pending })) pending = false
      states.push(status)
    }
    // Legacy RN promises early completion; the physical transport still drains.
    applyStatus('stopped')
    expect(pending).toBe(true)
    applyStatus('running')
    const finalText = { type: 'transcript', data: { utterance: { text: 'last words', language: 'en' }, is_final: true } }
    const ack = { type: 'stop_recording_ack' }
    for (const message of [finalText, ack]) {
      expect(shouldHandleNativeBridgeServerMessage({
        message, nativeStopRequested: pending, stopIntent: intent.isStopped(key),
      })).toBe(true)
      expect(shouldPromoteConnectionStatusFromNativeActivity({
        message, previousConnectionStatus: status, nativeStopRequested: pending, stopIntent: intent.isStopped(key),
      })).toBe(false)
      states.push(status)
    }
    expect(parseSttTranscriptMessage(finalText)?.isFinal).toBe(true)
    pending = false // Actual server ACK resolves the in-flight stop.
    intent.complete(key)
    expect(intent.isPending(key)).toBe(false)
    expect(intent.isStopped(key)).toBe(true)
    applyStatus('closed')
    applyStatus('ready') // Late old-session status after completion.
    expect(shouldPromoteConnectionStatusFromNativeActivity({
      previousConnectionStatus: status, message: finalText, stopIntent: intent.isStopped(key),
    })).toBe(false)
    expect(states.every(state => state === 'idle')).toBe(true)
    // Explicit Start lifts intent; normal ready and transcript delivery resume.
    intent.start(key)
    applyStatus('ready')
    expect(status).toBe('ready')
  })

  it('never promotes an ACK, ping or malformed payload to ready, even outside stopping', () => {
    for (const message of [{ type: 'stop_recording_ack' }, { type: 'pong' }, {}]) {
      expect(shouldPromoteConnectionStatusFromNativeActivity({ previousConnectionStatus: 'idle', message })).toBe(false)
    }
    expect(shouldPromoteConnectionStatusFromNativeActivity({ previousConnectionStatus: 'idle', message: { status: 'ready' } })).toBe(true)
  })

  it('shares Stop intent across same-room consumers without crossing account or room boundaries', () => {
    const shared = createNativeStopIntentRegistry()
    shared.stop('alice/ios/room-a')
    expect(shared.isPending('alice/ios/room-a')).toBe(true)
    expect(shared.isStopped('alice/ios/room-a')).toBe(true)
    expect(shared.isStopped('alice/ios/room-b')).toBe(false)
    expect(shared.isStopped('bob/ios/room-a')).toBe(false)
    shared.start('bob/ios/room-a')
    expect(shared.isStopped('alice/ios/room-a')).toBe(true)
    shared.start('alice/ios/room-a')
    expect(shared.isStopped('alice/ios/room-a')).toBe(false)
  })
})
