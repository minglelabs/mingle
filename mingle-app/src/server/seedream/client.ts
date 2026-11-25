/**
 * Seedream 5.5 (BytePlus ModelArk) image generation, tried by staff from the
 * review tool only (2026-11-25): a post photo is drawn with it only when staff
 * pick Seedream on that photo. It is never a fallback for the ChatGPT pool.
 *
 * Env: SEEDREAM_API_KEY (the ModelArk API key), optionally SEEDREAM_MODEL and
 * SEEDREAM_BASE_URL.
 */
export const SEEDREAM_DEFAULT_MODEL = 'dola-seedream-5-5-261028'
const SEEDREAM_DEFAULT_BASE_URL = 'https://ark.ap-southeast.bytepluses.com/api/v3'
/** Vertical 3:4, like the pool's post photos (pixels within the 5.5 range). */
const SEEDREAM_SIZE = '1728x2304'
const SEEDREAM_TIMEOUT_MS = 180_000
/** Seedream 5.5 takes up to 10 reference images. */
const SEEDREAM_MAX_REFERENCES = 10

/** Who draws a photo staff asked for: the ChatGPT pool (default) or Seedream. */
export type ImageEngine = 'pool' | 'seedream'

export function parseImageEngine(value: unknown): ImageEngine {
  return value === 'seedream' ? 'seedream' : 'pool'
}

export type SeedreamReference = { bytes: Buffer; mimeType: string }

export type SeedreamResult =
  | { ok: true; bytes: Buffer; model: string }
  | { ok: false; error: 'seedream_unconfigured' | 'image_timeout' | 'image_refused' | 'image_request_failed'; detail?: string }

export function seedreamApiKey(env: NodeJS.ProcessEnv = process.env): string | null {
  return env.SEEDREAM_API_KEY?.trim() || null
}

export function seedreamConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(seedreamApiKey(env))
}

export function seedreamModel(env: NodeJS.ProcessEnv = process.env): string {
  return env.SEEDREAM_MODEL?.trim() || SEEDREAM_DEFAULT_MODEL
}

function dataUri(reference: SeedreamReference): string {
  const format = (reference.mimeType.split('/')[1] || 'jpeg').toLowerCase()
  return `data:image/${format};base64,${reference.bytes.toString('base64')}`
}

/** The request body for one image (exported for tests). */
export function seedreamBody(prompt: string, references: SeedreamReference[], model: string) {
  const images = references.slice(0, SEEDREAM_MAX_REFERENCES).map(dataUri)
  return {
    model,
    prompt,
    ...(images.length === 1 ? { image: images[0] } : images.length > 1 ? { image: images } : {}),
    size: SEEDREAM_SIZE,
    output_format: 'jpeg',
    response_format: 'b64_json',
    watermark: false,
  }
}

type SeedreamPayload = {
  data?: Array<{ b64_json?: string; url?: string; error?: { code?: string; message?: string } }>
  error?: { code?: string; message?: string }
}

/** One image. Never throws. */
export async function requestSeedreamImage(
  prompt: string,
  options: { references?: SeedreamReference[]; fetchImpl?: typeof fetch; env?: NodeJS.ProcessEnv } = {},
): Promise<SeedreamResult> {
  const env = options.env ?? process.env
  const key = seedreamApiKey(env)
  if (!key) return { ok: false, error: 'seedream_unconfigured' }
  const model = seedreamModel(env)
  const base = (env.SEEDREAM_BASE_URL?.trim() || SEEDREAM_DEFAULT_BASE_URL).replace(/\/+$/, '')
  const signal = AbortSignal.timeout(SEEDREAM_TIMEOUT_MS)
  try {
    const response = await (options.fetchImpl ?? fetch)(`${base}/images/generations`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
      body: JSON.stringify(seedreamBody(prompt, options.references ?? [], model)),
      signal,
    })
    const payload = await response.json().catch(() => ({})) as SeedreamPayload
    const item = payload.data?.[0]
    const failure = payload.error ?? item?.error
    if (!response.ok || failure) {
      const code = failure?.code ?? `http_${response.status}`
      // Safety refusals come back as a sensitive-content code.
      const refused = /sensitive|risk|safety|moderation/i.test(code)
      return { ok: false, error: refused ? 'image_refused' : 'image_request_failed', detail: `seedream_${code}` }
    }
    if (item?.b64_json) return { ok: true, bytes: Buffer.from(item.b64_json, 'base64'), model }
    return { ok: false, error: 'image_refused', detail: 'seedream_no_image' }
  } catch (error) {
    if (signal.aborted) return { ok: false, error: 'image_timeout', detail: 'seedream_timeout' }
    return { ok: false, error: 'image_request_failed', detail: error instanceof Error ? `seedream_${error.name}` : 'seedream_unknown' }
  }
}
