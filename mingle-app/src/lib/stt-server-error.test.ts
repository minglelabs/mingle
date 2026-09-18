import { describe, expect, it } from 'vitest'
import { parseSttServerError } from './stt-server-error'

describe('terminal STT provider errors', () => {
  it.each([408, '408'])('accepts numeric and string error codes (%s)', (code) => {
    expect(parseSttServerError({
      type: 'error', provider: 'soniox', error_code: code,
      error_type: 'request_timeout', error_message: 'Request timeout.', request_id: 'test-request',
    })).toEqual({
      provider: 'soniox', code: '408', errorType: 'request_timeout',
      message: 'Request timeout.', requestId: 'test-request',
    })
  })

  it('does not treat ready, transcripts, usage or stop acknowledgements as failures', () => {
    for (const message of [
      { status: 'ready' }, { type: 'transcript' }, { type: 'usage' },
      { type: 'stop_recording_ack' }, { type: 'error', provider: 'other' },
    ]) expect(parseSttServerError(message)).toBeNull()
  })

  it('handles malformed optional fields without passing arbitrary objects to diagnostics', () => {
    expect(parseSttServerError({
      type: 'error', provider: 'soniox', error_code: {}, error_type: {}, error_message: {}, request_id: {},
    })).toEqual({
      provider: 'soniox', code: 'unknown', errorType: 'upstream_error',
      message: 'Speech recognition failed.', requestId: undefined,
    })
  })
})
