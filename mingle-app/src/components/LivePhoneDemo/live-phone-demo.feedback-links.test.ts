import { describe, expect, it } from 'vitest'
import { splitLivePhoneDemoFeedbackTextLinks } from './live-phone-demo.feedback-links'

describe('live-phone-demo.feedback-links', () => {
  it('turns https URLs into link parts', () => {
    expect(splitLivePhoneDemoFeedbackTextLinks('Please check https://example.com/help')).toEqual([
      { type: 'text', text: 'Please check ' },
      { type: 'link', text: 'https://example.com/help', href: 'https://example.com/help' },
    ])
  })

  it('normalizes www URLs to https hrefs', () => {
    expect(splitLivePhoneDemoFeedbackTextLinks('Open www.instagram.com/mingle.labs/')).toEqual([
      { type: 'text', text: 'Open ' },
      {
        type: 'link',
        text: 'www.instagram.com/mingle.labs/',
        href: 'https://www.instagram.com/mingle.labs/',
      },
    ])
  })

  it('keeps trailing sentence punctuation outside the link', () => {
    expect(splitLivePhoneDemoFeedbackTextLinks('Go to https://example.com/path, thanks.')).toEqual([
      { type: 'text', text: 'Go to ' },
      { type: 'link', text: 'https://example.com/path', href: 'https://example.com/path' },
      { type: 'text', text: ', thanks.' },
    ])
  })

  it('keeps balanced closing parentheses inside the link', () => {
    expect(splitLivePhoneDemoFeedbackTextLinks('Read https://example.com/a_(b).')).toEqual([
      { type: 'text', text: 'Read ' },
      { type: 'link', text: 'https://example.com/a_(b)', href: 'https://example.com/a_(b)' },
      { type: 'text', text: '.' },
    ])
  })
})
