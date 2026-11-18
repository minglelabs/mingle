import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import VoiceTalkParticipantStrip, { sameVoiceTalkParticipants } from './VoiceTalkParticipantStrip'

const chip = (id: string, lang = 'ko') => ({ userId: id, name: id, image: null, lang })

describe('VoiceTalkParticipantStrip', () => {
  it('draws nothing for an empty call and "+N" past the limit', () => {
    expect(renderToStaticMarkup(createElement(VoiceTalkParticipantStrip, { participants: [] }))).toBe('')
    const html = renderToStaticMarkup(createElement(VoiceTalkParticipantStrip, {
      participants: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((id) => chip(id)),
    }))
    expect(html.split('data-qa="voice-talk-participant-chip"').length - 1).toBe(6)
    expect(html).toContain('+2')
  })

  it('leaves the flag off when the language is unknown', () => {
    const html = renderToStaticMarkup(createElement(VoiceTalkParticipantStrip, { participants: [chip('a', '')] }))
    expect(html).not.toContain('voice-talk-participant-flag')
  })

  it('compares lists by person, name, photo and language', () => {
    expect(sameVoiceTalkParticipants([chip('a')], [chip('a')])).toBe(true)
    expect(sameVoiceTalkParticipants([chip('a')], [chip('a', 'ja')])).toBe(false)
    expect(sameVoiceTalkParticipants([chip('a')], [])).toBe(false)
  })
})
