/**
 * Client for the ChatGPT pool API (docs/chatgpt-pool-api.md): ChatGPT web
 * through Nam's Chrome profiles on the home Windows PC, rotated over the
 * connected accounts. Text is one request; images are always async jobs,
 * polled every 10s for up to 8 minutes.
 *
 * The key is read only from CHATGPT_POOL_KEY and never logged.
 */

export const CHATGPT_POOL_DEFAULT_URL = 'https://chatgpt-pool.minglelabs.app'
const CHAT_TIMEOUT_MS = 120_000
const REQUEST_TIMEOUT_MS = 30_000
const POLL_INTERVAL_MS = 10_000
const JOB_DEADLINE_MS = 8 * 60_000
const RETRY_DELAY_MS = 5_000

export type ChatgptPoolError = {
  /** HTTP status, or 0 when the pool could not be reached. */
  status: number
  /** The pool's error code (`image_refused`, `image_limit`, `no_account`, `timeout`, ...). */
  code: string
  message?: string
}

export type ChatgptPoolServed = { account?: string; profile?: string }

export type ChatgptPoolChatResult =
  | ({ ok: true; content: string } & ChatgptPoolServed)
  | { ok: false; error: ChatgptPoolError }

export type ChatgptPoolImageResult =
  | ({ ok: true; bytes: Buffer } & ChatgptPoolServed)
  | { ok: false; error: ChatgptPoolError }

export type ChatgptPoolOptions = {
  fetchImpl?: typeof fetch
  env?: NodeJS.ProcessEnv
  /** Test hook: how long to wait between polls and before a retry. */
  sleep?: (ms: number) => Promise<void>
  now?: () => number
}

type PoolMessage = { role: 'system' | 'user' | 'assistant'; content: unknown }
type ErrorBody = { error?: { status?: number; code?: string; message?: string } }

export function chatgptPoolKey(env: NodeJS.ProcessEnv = process.env): string | undefined {
  return env.CHATGPT_POOL_KEY?.trim() || undefined
}

export function chatgptPoolUrl(env: NodeJS.ProcessEnv = process.env): string {
  return (env.CHATGPT_POOL_URL?.trim() || CHATGPT_POOL_DEFAULT_URL).replace(/\/+$/, '')
}

function headers(key: string) {
  return { authorization: `Bearer ${key}`, 'content-type': 'application/json; charset=utf-8' }
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

async function readJson<T>(response: Response): Promise<T | null> {
  try {
    return (await response.json()) as T
  } catch {
    return null
  }
}

function errorFrom(status: number, body: ErrorBody | null): ChatgptPoolError {
  return { status: body?.error?.status ?? status, code: body?.error?.code ?? `http_${status}`, message: body?.error?.message }
}

/** 502, `timeout` and `job_not_found` are retried once; 429 and 503 never are. */
function retryable(error: ChatgptPoolError): boolean {
  return error.status === 502 || error.code === 'timeout' || error.code === 'job_not_found'
}

const MISSING_KEY: ChatgptPoolError = { status: 0, code: 'missing_key', message: 'CHATGPT_POOL_KEY is not set' }

async function chatOnce(messages: PoolMessage[], key: string, base: string, fetchImpl: typeof fetch): Promise<ChatgptPoolChatResult> {
  let response: Response
  try {
    response = await fetchImpl(`${base}/v1/chat/completions`, {
      method: 'POST',
      headers: headers(key),
      body: JSON.stringify({ model: 'chatgpt-web', messages }),
      signal: AbortSignal.timeout(CHAT_TIMEOUT_MS),
    })
  } catch (error) {
    const timedOut = error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')
    return { ok: false, error: timedOut ? { status: 0, code: 'timeout' } : { status: 0, code: 'unreachable' } }
  }
  const body = await readJson<ErrorBody & ChatgptPoolServed & { choices?: Array<{ message?: { content?: string } }> }>(response)
  if (!response.ok) return { ok: false, error: errorFrom(response.status, body) }
  const content = body?.choices?.[0]?.message?.content
  if (typeof content !== 'string') return { ok: false, error: { status: response.status, code: 'bad_response' } }
  return { ok: true, content, account: body?.account, profile: body?.profile }
}

/**
 * One ChatGPT answer. `input` is a single user message or a whole
 * conversation (system messages and earlier turns are folded in by the pool).
 */
export async function chatgptPoolChat(input: string | PoolMessage[], options: ChatgptPoolOptions = {}): Promise<ChatgptPoolChatResult> {
  const env = options.env ?? process.env
  const key = chatgptPoolKey(env)
  if (!key) return { ok: false, error: MISSING_KEY }
  const messages = typeof input === 'string' ? [{ role: 'user' as const, content: input }] : input
  const fetchImpl = options.fetchImpl ?? fetch
  const sleep = options.sleep ?? defaultSleep
  const first = await chatOnce(messages, key, chatgptPoolUrl(env), fetchImpl)
  if (first.ok || !retryable(first.error)) return first
  await sleep(RETRY_DELAY_MS)
  return chatOnce(messages, key, chatgptPoolUrl(env), fetchImpl)
}

type JobBody = ErrorBody & {
  id?: string
  status?: 'pending' | 'done' | 'error'
  result?: { data?: Array<{ b64_json?: string }> } & ChatgptPoolServed
}

async function imageOnce(prompt: string, reference: string | undefined, key: string, base: string, options: ChatgptPoolOptions): Promise<ChatgptPoolImageResult> {
  const fetchImpl = options.fetchImpl ?? fetch
  const sleep = options.sleep ?? defaultSleep
  const now = options.now ?? Date.now
  let submitted: Response
  try {
    submitted = await fetchImpl(`${base}/v1/images/generations`, {
      method: 'POST',
      headers: headers(key),
      body: JSON.stringify({ prompt, ...(reference ? { reference } : {}), async: true }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
  } catch {
    return { ok: false, error: { status: 0, code: 'unreachable' } }
  }
  const job = await readJson<JobBody>(submitted)
  if (submitted.status !== 202 || !job?.id) return { ok: false, error: errorFrom(submitted.status, job) }

  const deadline = now() + JOB_DEADLINE_MS
  while (now() < deadline) {
    await sleep(POLL_INTERVAL_MS)
    let polled: Response
    try {
      polled = await fetchImpl(`${base}/v1/jobs/${encodeURIComponent(job.id)}`, {
        headers: headers(key),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      })
    } catch {
      continue // a dropped poll is not a failed job; ask again next round
    }
    const state = await readJson<JobBody>(polled)
    if (!polled.ok) return { ok: false, error: errorFrom(polled.status, state) }
    if (state?.status === 'done') {
      const b64 = state.result?.data?.[0]?.b64_json
      if (!b64) return { ok: false, error: { status: 200, code: 'bad_response' } }
      return { ok: true, bytes: Buffer.from(b64, 'base64'), account: state.result?.account, profile: state.result?.profile }
    }
    if (state?.status === 'error') return { ok: false, error: errorFrom(state.error?.status ?? 502, state) }
  }
  return { ok: false, error: { status: 0, code: 'timeout' } }
}

/**
 * One image (PNG bytes). `reference` is a data URL of a photo to draw from.
 * Retries once on 502, `timeout` or `job_not_found`.
 */
export async function chatgptPoolImage(prompt: string, options: ChatgptPoolOptions & { reference?: string } = {}): Promise<ChatgptPoolImageResult> {
  const env = options.env ?? process.env
  const key = chatgptPoolKey(env)
  if (!key) return { ok: false, error: MISSING_KEY }
  const base = chatgptPoolUrl(env)
  const first = await imageOnce(prompt, options.reference, key, base, options)
  if (first.ok || !retryable(first.error)) return first
  await (options.sleep ?? defaultSleep)(RETRY_DELAY_MS)
  return imageOnce(prompt, options.reference, key, base, options)
}
