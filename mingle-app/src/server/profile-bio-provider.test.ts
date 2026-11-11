import { afterEach, describe, expect, it, vi } from 'vitest'
import { parseBioTranslationResult, translateProfileBio } from './profile-bio-provider'

describe('profile biography provider response', () => {
  it('extracts only the translated text from structured output', () => {
    expect(parseBioTranslationResult('{"text":"散歩が好きです。"}')).toBe('散歩が好きです。')
    expect(parseBioTranslationResult('{"text":"ko"}')).toBe('ko')
  })
  it.each(['{"biography":"wrong wrapper"}', '{"text":null}', '{"text":" "}', 'plain text', '{"text":"' + 'a'.repeat(4001) + '"}'])('rejects invalid or unbounded results', raw => {
    expect(() => parseBioTranslationResult(raw)).toThrow()
  })
})

describe('translateProfileBio on GPT-6 Luna', () => {
  const originalKey = process.env.OPENAI_API_KEY

  afterEach(() => {
    if (originalKey === undefined) delete process.env.OPENAI_API_KEY
    else process.env.OPENAI_API_KEY = originalKey
    vi.unstubAllGlobals()
  })

  function stubAnswer(content: string) {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response(
      JSON.stringify({ choices: [{ message: { content } }] }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    ))
    vi.stubGlobal('fetch', fetchMock)
    return fetchMock
  }

  it('detects the language on the standard tier (no Fast mode) with the bio sent as data', async () => {
    process.env.OPENAI_API_KEY = 'test-openai-key'
    const fetchMock = stubAnswer('{"text":"ko"}')

    await expect(translateProfileBio('산책을 좋아해요', null, new AbortController().signal)).resolves.toBe('ko')

    const payload = JSON.parse(String((fetchMock.mock.calls[0]?.[1] as RequestInit).body))
    expect(payload.model).toBe('gpt-6-luna')
    expect(payload.service_tier).toBeUndefined()
    expect(payload.response_format).toEqual({ type: 'json_object' })
    expect(payload.messages[0].content).toContain('Identify the main language')
    expect(payload.messages[1].content).toBe(JSON.stringify({ biography: '산책을 좋아해요' }))
  })

  it('translates into the target language and maps an unknown detection to und', async () => {
    process.env.OPENAI_API_KEY = 'test-openai-key'
    const fetchMock = stubAnswer('{"text":"I like walks."}')
    await expect(translateProfileBio('산책을 좋아해요', 'en', new AbortController().signal)).resolves.toBe('I like walks.')
    expect(JSON.parse(String((fetchMock.mock.calls[0]?.[1] as RequestInit).body)).messages[0].content).toContain('into English')

    stubAnswer('{"text":"xx-nope"}')
    await expect(translateProfileBio('???', null, new AbortController().signal)).resolves.toBe('und')
  })

  it('is unavailable without an OpenAI key', async () => {
    delete process.env.OPENAI_API_KEY
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    await expect(translateProfileBio('hi', 'ko', new AbortController().signal)).rejects.toThrow('translation_unavailable')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
