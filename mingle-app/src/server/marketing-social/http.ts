/**
 * Small fetch helpers for the platform APIs. Errors carry the platform's own
 * message (never a token) so staff can read why a post failed.
 */
export class SocialApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    /** True when retrying later may succeed (rate limit / 5xx / network). */
    readonly transient: boolean,
  ) {
    super(message)
    this.name = 'SocialApiError'
  }
}

type FetchLike = typeof fetch

let fetchImpl: FetchLike = (...args) => fetch(...args)

/** Tests only. */
export function __setSocialFetchForTests(impl: FetchLike | null): void {
  fetchImpl = impl ?? ((...args) => fetch(...args))
}

export function socialFetch(input: string, init?: RequestInit): Promise<Response> {
  return fetchImpl(input, { ...init, signal: init?.signal ?? AbortSignal.timeout(60_000) })
}

/** The platform's error text from a JSON error body (Meta, Google and TikTok shapes). */
export function extractApiErrorMessage(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null
  const record = body as Record<string, unknown>
  const error = record.error
  if (error && typeof error === 'object') {
    const e = error as Record<string, unknown>
    const message = typeof e.message === 'string' ? e.message : null
    const userMessage = typeof e.error_user_msg === 'string' ? e.error_user_msg : null
    const code = typeof e.code === 'string' && e.code !== 'ok' ? e.code : null
    if (e.code === 'ok') return null
    const parts = [userMessage ?? message, code].filter(Boolean)
    if (parts.length) return parts.join(' · ')
  }
  if (typeof error === 'string') {
    if (error === 'ok') return null
    return typeof record.error_description === 'string' ? `${error}: ${record.error_description}` : error
  }
  if (typeof record.error_message === 'string') return record.error_message
  if (typeof record.message === 'string') return record.message
  return null
}

/**
 * Quote integers too long for a JS number (TikTok returns int64 post ids as
 * bare JSON numbers), so `JSON.parse` keeps every digit.
 */
export function quoteLongIntegers(text: string): string {
  return text.replace(/([:[,]\s*)(-?\d{16,})(?=\s*[,\]}])/g, '$1"$2"')
}

function clipMessage(text: string): string {
  return text.length > 500 ? `${text.slice(0, 500)}…` : text
}

/** fetch + JSON parse; throws SocialApiError on HTTP errors or API-level errors. */
export async function socialJson<T = Record<string, unknown>>(input: string, init?: RequestInit): Promise<T> {
  let response: Response
  try {
    response = await socialFetch(input, init)
  } catch (error) {
    throw new SocialApiError(`network: ${error instanceof Error ? error.message : 'request failed'}`, 0, true)
  }
  const text = await response.text()
  let body: unknown = null
  try {
    body = text ? JSON.parse(quoteLongIntegers(text)) : null
  } catch {
    body = null
  }
  const apiMessage = extractApiErrorMessage(body)
  if (!response.ok) {
    const transient = response.status === 429 || response.status >= 500
    throw new SocialApiError(clipMessage(apiMessage ?? `HTTP ${response.status}`), response.status, transient)
  }
  // TikTok answers 200 with { error: { code: "ok" } } on success; anything else is a failure.
  if (apiMessage && body && typeof body === 'object' && 'error' in body) {
    throw new SocialApiError(clipMessage(apiMessage), response.status, false)
  }
  return (body ?? {}) as T
}

export function formBody(values: Record<string, string>): URLSearchParams {
  return new URLSearchParams(values)
}
