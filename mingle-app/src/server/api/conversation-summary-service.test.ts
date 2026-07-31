import { describe, expect, it } from 'vitest'
import {
  buildConversationSummaryPrompt,
  parseConversationSummaryResponse,
  sanitizeConversationSummaryUtterances,
} from './conversation-summary-service'

describe('sanitizeConversationSummaryUtterances', () => {
  it('keeps valid transcript lines and removes malformed entries', () => {
    expect(sanitizeConversationSummaryUtterances([
      { speaker: 'Traveler', language: 'en', text: ' Two tickets, please. ' },
      { text: '  ' },
      null,
    ])).toEqual([
      { speaker: 'Traveler', language: 'en', text: 'Two tickets, please.' },
    ])
  })
})

describe('buildConversationSummaryPrompt', () => {
  it('labels the transcript as untrusted and requests the UI locale', () => {
    const prompt = buildConversationSummaryPrompt({
      outputLocale: 'ko',
      utterances: [{ speaker: 'A', language: 'en', text: 'Hello' }],
    })

    expect(prompt).toContain('Korean (ko)')
    expect(prompt).toContain('Do not use another output language')
    expect(prompt).toContain('untrusted data')
    expect(prompt).toContain('[en] A: Hello')
  })
})

describe('parseConversationSummaryResponse', () => {
  it('normalizes a structured model response', () => {
    expect(parseConversationSummaryResponse({
      overview: ' A ticket purchase ',
      keyPoints: [' Two tickets '],
      decisions: [],
      followUps: [' Pay at the counter '],
      needsConfirmation: [],
    })).toEqual({
      overview: 'A ticket purchase',
      keyPoints: ['Two tickets'],
      decisions: [],
      followUps: ['Pay at the counter'],
      needsConfirmation: [],
    })
  })

  it('rejects an empty response', () => {
    expect(parseConversationSummaryResponse({
      overview: '',
      keyPoints: [],
      decisions: [],
      followUps: [],
      needsConfirmation: [],
    })).toBeNull()
  })
})
