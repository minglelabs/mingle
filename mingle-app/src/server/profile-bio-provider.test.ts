import { describe, expect, it } from 'vitest'
import { parseBioTranslationResult } from './profile-bio-provider'

describe('profile biography provider response', () => {
  it('extracts only the translated text from structured output', () => {
    expect(parseBioTranslationResult('{"text":"散歩が好きです。"}')).toBe('散歩が好きです。')
    expect(parseBioTranslationResult('{"text":"ko"}')).toBe('ko')
  })
  it.each(['{"biography":"wrong wrapper"}', '{"text":null}', '{"text":" "}', 'plain text', '{"text":"' + 'a'.repeat(4001) + '"}'])('rejects invalid or unbounded results', raw => {
    expect(() => parseBioTranslationResult(raw)).toThrow()
  })
})
