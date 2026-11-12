// Reads a streamed /translate/finalize answer (NDJSON, see
// translate-finalize-handler streamTranslateFinalize): `partial` lines carry
// the translations so far for display, the `final` line carries the status
// and the same body a plain JSON answer would.

export const TRANSLATE_STREAM_CONTENT_TYPE = 'application/x-ndjson'

export type TranslateStreamFinal = { status: number, body: Record<string, unknown> }

export function isTranslateStreamResponse(response: Pick<Response, 'headers'>): boolean {
  return (response.headers.get('content-type') || '').includes(TRANSLATE_STREAM_CONTENT_TYPE)
}

function readStringRecord(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  return Object.fromEntries(Object.entries(raw as Record<string, unknown>)
    .filter((entry): entry is [string, string] => typeof entry[1] === 'string'))
}

/** Handles one NDJSON line; returns the final answer when this line is it. */
function handleLine(
  line: string,
  onPartial: (translations: Record<string, string>) => void,
): TranslateStreamFinal | null {
  const trimmed = line.trim()
  if (!trimmed) return null
  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(trimmed) as Record<string, unknown>
  } catch {
    return null
  }
  if (parsed.type === 'partial') {
    const translations = readStringRecord(parsed.translations)
    if (Object.keys(translations).length > 0) {
      try { onPartial(translations) } catch { /* A display hook cannot break the request. */ }
    }
    return null
  }
  if (parsed.type === 'final') {
    const body = parsed.body && typeof parsed.body === 'object' && !Array.isArray(parsed.body)
      ? parsed.body as Record<string, unknown>
      : {}
    return { status: typeof parsed.status === 'number' ? parsed.status : 500, body }
  }
  return null
}

/** Null when the stream ended without a final line (dropped connection). */
export async function readTranslateStream(
  response: Response,
  onPartial: (translations: Record<string, string>) => void,
): Promise<TranslateStreamFinal | null> {
  let final: TranslateStreamFinal | null = null
  const reader = response.body?.getReader()
  if (!reader) {
    // No streaming body (old WebView): the lines arrive all at once.
    for (const line of (await response.text()).split('\n')) {
      final = handleLine(line, onPartial) ?? final
    }
    return final
  }
  const decoder = new TextDecoder()
  let buffer = ''
  for (;;) {
    const { value, done } = await reader.read()
    if (value) buffer += decoder.decode(value, { stream: true })
    if (done) buffer += decoder.decode()
    const lines = buffer.split('\n')
    buffer = done ? '' : (lines.pop() ?? '')
    for (const line of lines) {
      final = handleLine(line, onPartial) ?? final
    }
    if (done) break
  }
  return final
}
