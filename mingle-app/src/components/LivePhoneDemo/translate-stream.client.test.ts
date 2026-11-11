import { describe, expect, it } from 'vitest'
import { isTranslateStreamResponse, readTranslateStream } from './translate-stream.client'

function streamResponse(chunks: string[]): Response {
  const encoder = new TextEncoder()
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk))
      controller.close()
    },
  })
  return new Response(body, { headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8' } })
}

describe('readTranslateStream', () => {
  it('passes partial lines on and returns the final line, across chunk splits', async () => {
    const partials: Record<string, string>[] = []
    const response = streamResponse([
      '{"type":"partial","translations":{"ko":"안"}}\n{"type":"par',
      'tial","translations":{"ko":"안녕"}}\n',
      '{"type":"final","status":200,"body":{"translations":{"ko":"안녕."}}}\n',
    ])
    expect(isTranslateStreamResponse(response)).toBe(true)
    const final = await readTranslateStream(response, (translations) => partials.push(translations))
    expect(partials).toEqual([{ ko: '안' }, { ko: '안녕' }])
    expect(final).toEqual({ status: 200, body: { translations: { ko: '안녕.' } } })
  })

  it('returns null when the stream ends without a final line', async () => {
    const final = await readTranslateStream(streamResponse(['{"type":"partial","translations":{"ko":"a"}}\n']), () => {})
    expect(final).toBeNull()
  })

  it('carries a failed status from the final line', async () => {
    const final = await readTranslateStream(streamResponse(['{"type":"final","status":402,"body":{"error":"x"}}']), () => {})
    expect(final?.status).toBe(402)
  })
})
