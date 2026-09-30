import { describe, expect, it } from 'vitest'
import { applyNativeTtsEvent, isNativeTtsEventForActiveClip } from './live-phone-demo.native-tts-events'

function recorder() {
  const calls: string[] = []
  return {
    calls,
    handlers: {
      finishCurrentClip: () => calls.push('finish'),
      markStarted: (playbackKey: string) => calls.push(`started:${playbackKey}`),
      markEarphonesDisconnected: () => calls.push('earphones-disconnected'),
      advanceQueue: () => calls.push('advance'),
    },
  }
}

const active = { playbackId: 'translation:u-1:ko::7', playbackKey: 'translation:u-1:ko' }

describe('applyNativeTtsEvent', () => {
  it('marks the clip in flight as playing on tts_started', () => {
    const { calls, handlers } = recorder()
    applyNativeTtsEvent({ type: 'tts_started', playbackId: active.playbackId, utteranceId: active.playbackKey }, active, handlers)
    expect(calls).toEqual([`started:${active.playbackKey}`])
  })

  it('ignores a tts_started for any other clip or when nothing is in flight', () => {
    const { calls, handlers } = recorder()
    applyNativeTtsEvent({ type: 'tts_started', playbackId: 'translation:u-0:ko::6', utteranceId: 'translation:u-0:ko' }, active, handlers)
    applyNativeTtsEvent({ type: 'tts_started', playbackId: active.playbackId }, { playbackId: null, playbackKey: null }, handlers)
    expect(calls).toEqual([])
  })

  it('finishes the clip and moves the queue on tts_ended / tts_error', () => {
    const { calls, handlers } = recorder()
    applyNativeTtsEvent({ type: 'tts_ended', playbackId: active.playbackId, utteranceId: active.playbackKey }, active, handlers)
    applyNativeTtsEvent({ type: 'tts_error', playbackId: active.playbackId, message: 'decode' }, active, handlers)
    expect(calls).toEqual(['finish', 'advance', 'finish', 'advance'])
  })

  it('handles a refused start (no tts_started): clear the clip, close the gate, then move the queue', () => {
    const { calls, handlers } = recorder()
    applyNativeTtsEvent({
      type: 'tts_stopped',
      playbackId: active.playbackId,
      utteranceId: active.playbackKey,
      reason: 'earphones_disconnected',
    }, active, handlers)
    // The gate closes after the clip is cleared (no redundant stop) and
    // before the queue step (which then sees auto items as not playable).
    expect(calls).toEqual(['finish', 'earphones-disconnected', 'advance'])
    expect(calls.some((call) => call.startsWith('started:'))).toBe(false)
  })

  it('still closes the gate when the disconnect stop belongs to a clip the room already dropped', () => {
    const { calls, handlers } = recorder()
    applyNativeTtsEvent({
      type: 'tts_stopped',
      playbackId: 'translation:u-0:ko::6',
      reason: 'earphones_disconnected',
    }, active, handlers)
    expect(calls).toEqual(['earphones-disconnected'])
  })

  it('lets an ordinary stop of the current clip move the queue without touching the gate', () => {
    const { calls, handlers } = recorder()
    applyNativeTtsEvent({ type: 'tts_stopped', playbackId: active.playbackId, utteranceId: active.playbackKey }, active, handlers)
    expect(calls).toEqual(['finish', 'advance'])
  })

  it('ignores a late stop for a clip the room stopped itself, so the next clip in flight survives', () => {
    const { calls, handlers } = recorder()
    applyNativeTtsEvent({ type: 'tts_stopped', playbackId: 'translation:u-0:ko::6' }, { playbackId: null, playbackKey: null }, handlers)
    applyNativeTtsEvent({ type: 'tts_ended', playbackId: 'translation:u-0:ko::6' }, active, handlers)
    expect(calls).toEqual([])
  })

  it('ignores malformed payloads and unknown types', () => {
    const { calls, handlers } = recorder()
    for (const detail of [null, undefined, 'tts_ended', 3, { type: 'tts_paused' }]) {
      applyNativeTtsEvent(detail, active, handlers)
    }
    expect(calls).toEqual([])
  })
})

describe('isNativeTtsEventForActiveClip', () => {
  it('matches by playbackId, then by playback key, and accepts id-less events from old shells', () => {
    expect(isNativeTtsEventForActiveClip({ playbackId: active.playbackId }, active)).toBe(true)
    expect(isNativeTtsEventForActiveClip({ playbackId: 'other' }, active)).toBe(false)
    expect(isNativeTtsEventForActiveClip({ utteranceId: active.playbackKey }, active)).toBe(true)
    expect(isNativeTtsEventForActiveClip({ utteranceId: 'translation:u-9:ko' }, active)).toBe(false)
    expect(isNativeTtsEventForActiveClip({}, active)).toBe(true)
  })
})
