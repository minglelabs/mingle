/**
 * One bounded OpenAI chat call for server-side text work that is not live
 * conversation translation (profile bios, conversation titles, JSON drafts).
 *
 * - Runs on the standard tier: no `service_tier`. Only live translation uses
 *   Fast mode (see `translate-texts.ts`).
 * - `reasoning_effort: 'none'`, like the translation engine.
 * - Nothing about the input or output is logged; errors carry a code only.
 */

export const OPENAI_TEXT_MODEL = 'gpt-6-luna'

const OPENAI_API_BASE_URL = 'https://api.openai.com/v1'

export type OpenAIChatErrorCode = 'openai_unavailable' | 'openai_timeout' | 'openai_request_failed' | 'openai_empty_response'

export class OpenAIChatError extends Error {
  readonly code: OpenAIChatErrorCode

  constructor(code: OpenAIChatErrorCode, options?: { cause?: unknown }) {
    super(code, options)
    this.name = 'OpenAIChatError'
    this.code = code
  }
}

export type OpenAIChatRequest = {
  system: string
  user: string
  /** Defaults to `OPENAI_TEXT_MODEL`. */
  model?: string
  /** Ask for one JSON object (the system prompt must say what it holds). */
  json?: boolean
  /** Defaults to 0. */
  temperature?: number
  maxOutputTokens?: number
  timeoutMs: number
  signal?: AbortSignal
}

/** True for model ids served by OpenAI (gpt-*). */
export function isOpenAITextModel(model: string | null | undefined): boolean {
  return /^gpt-/i.test((model || '').trim())
}

export async function openaiChat(request: OpenAIChatRequest, fetchImpl: typeof fetch = fetch): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY?.trim()
  if (!apiKey) throw new OpenAIChatError('openai_unavailable')
  const baseUrl = (process.env.OPENAI_BASE_URL || '').trim() || OPENAI_API_BASE_URL

  const signal = request.signal
    ? AbortSignal.any([request.signal, AbortSignal.timeout(request.timeoutMs)])
    : AbortSignal.timeout(request.timeoutMs)

  const payload: Record<string, unknown> = {
    model: request.model?.trim() || OPENAI_TEXT_MODEL,
    messages: [
      { role: 'system', content: request.system },
      { role: 'user', content: request.user },
    ],
    temperature: request.temperature ?? 0,
    reasoning_effort: 'none',
  }
  if (request.maxOutputTokens) payload.max_completion_tokens = request.maxOutputTokens
  if (request.json) payload.response_format = { type: 'json_object' }

  let body: { choices?: Array<{ message?: { content?: unknown } }> }
  try {
    const response = await fetchImpl(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(payload),
      signal,
    })
    if (!response.ok) throw new OpenAIChatError('openai_request_failed')
    body = await response.json() as typeof body
  } catch (error) {
    if (error instanceof OpenAIChatError) throw error
    if (signal.aborted) throw new OpenAIChatError('openai_timeout', { cause: error })
    throw new OpenAIChatError('openai_request_failed', { cause: error })
  }

  const content = body?.choices?.[0]?.message?.content
  if (typeof content !== 'string' || !content.trim()) throw new OpenAIChatError('openai_empty_response')
  return content
}
