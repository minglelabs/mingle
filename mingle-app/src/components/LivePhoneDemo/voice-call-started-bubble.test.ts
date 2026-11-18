import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import ChatBubble from './ChatBubble'
import VoiceCallStartedBubble from './VoiceCallStartedBubble'
import { VoiceTalkRoomContext, type VoiceTalkRoomState } from './voice-talk-room-context'

function render(room: VoiceTalkRoomState | null, overrides: { isOwnMessage?: boolean; speakerName?: string; locale?: string } = {}) {
  return renderToStaticMarkup(createElement(
    VoiceTalkRoomContext.Provider,
    { value: room },
    createElement(VoiceCallStartedBubble, {
      message: { callId: 'c1' },
      speakerName: overrides.speakerName ?? '민아',
      isOwnMessage: overrides.isOwnMessage ?? false,
      locale: overrides.locale ?? 'ko',
    }),
  ))
}

describe('VoiceCallStartedBubble', () => {
  it('says who started the voice talk and offers Join while that call is live', () => {
    const html = render({ liveCallId: 'c1', joined: false, participants: [], join: () => {} })
    expect(html).toContain('민아님이 보이스톡을 시작했습니다.')
    expect(html).toContain('data-voice-call-state="joinable"')
    expect(html).toContain('data-qa="voice-call-message-join"')
    expect(html).toContain('참여하기')
  })

  it('shows "in the call" instead of the button to someone already in it', () => {
    const html = render({ liveCallId: 'c1', joined: true, participants: [], join: () => {} }, { isOwnMessage: true })
    expect(html).toContain('보이스톡을 시작했습니다.')
    expect(html).not.toContain('님이')
    expect(html).toContain('참여 중')
    expect(html).not.toContain('data-qa="voice-call-message-join"')
  })

  it('is a closed card once that call is over, also when a later call is live', () => {
    for (const room of [{ liveCallId: null, joined: false, participants: [], join: () => {} }, { liveCallId: 'c2', joined: false, participants: [], join: () => {} }, null]) {
      const html = render(room)
      expect(html).toContain('data-voice-call-state="ended"')
      expect(html).toContain('종료된 보이스톡')
      expect(html).not.toContain('data-qa="voice-call-message-join"')
    }
  })

  it('shows who is in the live call, small, with each one\'s flag', () => {
    const participants = [
      { userId: 'u1', name: '민아', image: 'https://example.com/a.png', lang: 'ko' },
      { userId: 'u2', name: 'Ken', image: null, lang: 'ja' },
    ]
    const html = render({ liveCallId: 'c1', joined: false, participants, join: () => {} })
    expect(html).toContain('data-qa="voice-talk-participant-strip"')
    expect(html.split('data-qa="voice-talk-participant-chip"').length - 1).toBe(2)
    expect(html.split('data-qa="voice-talk-participant-flag"').length - 1).toBe(2)
    expect(html).toContain('https://example.com/a.png')
    expect(html).toContain('>K<')
    // Not on the card of a call that is over.
    expect(render({ liveCallId: 'c2', joined: false, participants, join: () => {} })).not.toContain('voice-talk-participant-strip')
  })

  it('has English copy', () => {
    expect(render({ liveCallId: 'c1', joined: false, participants: [], join: () => {} }, { speakerName: 'Mina', locale: 'en' }))
      .toContain('Mina started a voice talk.')
  })
})

describe('ChatBubble with a voice talk announcement', () => {
  it('renders the card instead of text, with no translate controls and no language flag', () => {
    const html = renderToStaticMarkup(createElement(
      VoiceTalkRoomContext.Provider,
      { value: { liveCallId: 'c1', joined: false, participants: [], join: () => {} } },
      createElement(ChatBubble, {
        utterance: {
          id: 'voice-call-c1', originalText: '📞 Voice talk', originalLang: 'en', targetLanguages: ['ko', 'en'],
          translations: {}, voiceCall: { callId: 'c1' }, speakerName: '민아', speakerUserId: 'u1',
        },
        uiLocale: 'ko', preferredDisplayLanguage: 'ko', defaultDisplayLanguage: 'ko', bubbleDisplayMode: 'collapsed',
        viewerUserId: 'me',
      }),
    ))
    expect(html).toContain('data-voice-call-message="c1"')
    expect(html).toContain('참여하기')
    expect(html).not.toContain('📞 Voice talk')
    expect(html).not.toContain('data-speaker-avatar-flag')
  })

  it('reads as my own start when the server says I sent it, even without the account id on the row', () => {
    const html = renderToStaticMarkup(createElement(
      VoiceTalkRoomContext.Provider,
      { value: { liveCallId: 'c1', joined: true, participants: [], join: () => {} } },
      createElement(ChatBubble, {
        utterance: {
          id: 'voice-call-c1', originalText: '📞 Voice talk', originalLang: 'en', targetLanguages: ['ko', 'en'],
          translations: {}, voiceCall: { callId: 'c1' }, speakerName: 'pp74', sentByViewer: true,
        },
        uiLocale: 'ko', preferredDisplayLanguage: 'ko', defaultDisplayLanguage: 'ko', bubbleDisplayMode: 'collapsed',
        viewerUserId: 'me',
      }),
    ))
    expect(html).toContain('보이스톡을 시작했습니다.')
    expect(html).not.toContain('pp74님이')
    expect(html).toContain('참여 중')
  })
})
