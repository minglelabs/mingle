import { describe, expect, it } from 'vitest'
import {
  buildVoiceCaptionTag,
  canViewMessageWithMetadata,
  normalizeVoiceCaptionTag,
  readVoiceCaptionTag,
} from './voice-caption'

describe('voice caption tag', () => {
  it('reads a tag and drops anything malformed', () => {
    expect(normalizeVoiceCaptionTag({ callId: 'c1', viewers: ['a', 'a', '', 3, 'b'] })).toEqual({ callId: 'c1', viewers: ['a', 'b'] })
    expect(normalizeVoiceCaptionTag({ viewers: ['a'] })).toBeNull()
    expect(normalizeVoiceCaptionTag(null)).toBeNull()
    expect(readVoiceCaptionTag({ voiceCaption: { callId: 'c1', viewers: [] } })).toEqual({ callId: 'c1', viewers: [] })
    expect(readVoiceCaptionTag({ clientMetadata: { voiceCaption: { callId: 'c1', viewers: ['x'] } } })).toBeNull()
  })

  it('shows a caption only to its viewers, and an ordinary message to everyone', () => {
    const caption = { voiceCaption: { callId: 'c1', viewers: ['a', 'b'] } }
    expect(canViewMessageWithMetadata(caption, 'a')).toBe(true)
    expect(canViewMessageWithMetadata(caption, 'c')).toBe(false)
    expect(canViewMessageWithMetadata(caption, null)).toBe(false)
    expect(canViewMessageWithMetadata({ replyTo: {} }, 'c')).toBe(true)
    expect(canViewMessageWithMetadata(null, null)).toBe(true)
  })

  it('always lets the speaker read their own line', () => {
    expect(buildVoiceCaptionTag({ callId: 'c1', speakerUserId: 's', viewers: ['a'] })).toEqual({ callId: 'c1', viewers: ['a', 's'] })
    expect(buildVoiceCaptionTag({ callId: 'c1', speakerUserId: 'a', viewers: ['a'] }).viewers).toEqual(['a'])
  })
})
