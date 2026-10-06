import { prisma } from '@/lib/prisma'
import type { AdminContext } from '@/server/admin/guard'
import { ageOn } from '@/server/operator-auto-reply/generate'
import { setOperatorAvatarFromBytes } from '@/server/operators/operator-avatar'
import { pickAvatarSpec, seededRandom, type AvatarPersona, type AvatarSpec } from './taxonomy'

/**
 * AI profile photos for operator accounts: pick a photo spec from the
 * taxonomy, have the image model draw it, and store it through the same path
 * as a staff upload (re-encoded, audited). The spec is saved on the account
 * so staff can see what the photo was meant to be.
 */
export const AVATAR_DEFAULT_IMAGE_MODEL = 'gpt-image-2'
/** OpenAI only. `low` is about $0.006 a photo and good enough for a profile picture. */
export const AVATAR_DEFAULT_IMAGE_QUALITY = 'low'
const CALL_TIMEOUT_MS = 120_000
const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models'
const OPENAI_ENDPOINT = 'https://api.openai.com/v1/images/generations'
const DEFAULT_IMAGE_PROXY_URL = 'http://127.0.0.1:10100'
const PROXY_UNREACHABLE = 'proxy_unreachable'

export function resolveAvatarImageModel(env: NodeJS.ProcessEnv = process.env): string {
  return env.OPERATOR_AVATAR_IMAGE_MODEL?.trim() || AVATAR_DEFAULT_IMAGE_MODEL
}

export function resolveAvatarImageQuality(env: NodeJS.ProcessEnv = process.env): string {
  return env.OPERATOR_AVATAR_IMAGE_QUALITY?.trim() || AVATAR_DEFAULT_IMAGE_QUALITY
}

/** `gpt-*` and `chatgpt-*` models go to OpenAI; everything else to Gemini. */
export function isOpenAiImageModel(model: string): boolean {
  return /^(gpt-|chatgpt-|dall-e)/i.test(model)
}

/**
 * A model id with a provider prefix (`google-antigravity/gemini-3.1-flash-image`)
 * is served by a local model proxy that draws on a subscription login instead
 * of an API key. The proxy only exists on a developer machine.
 */
export function isProxyImageModel(model: string): boolean {
  return model.includes('/')
}

export function resolveImageProxyUrl(env: NodeJS.ProcessEnv = process.env): string {
  return (env.OPERATOR_IMAGE_PROXY_URL?.trim() || DEFAULT_IMAGE_PROXY_URL).replace(/\/+$/, '')
}

export type AvatarGenerationErrorCode =
  | 'not_operator'
  | 'image_unavailable'
  | 'image_timeout'
  | 'image_request_failed'
  /** The model answered without an image (usually a safety refusal). */
  | 'image_refused'
  | 'image_storage_failed'

export type AvatarGenerationResult =
  | { ok: true; image: string; spec: AvatarSpec }
  | { ok: false; error: AvatarGenerationErrorCode; detail?: string }

type ImagePart = { inlineData?: { mimeType?: string; data?: string }; inline_data?: { mime_type?: string; data?: string } }

export type AvatarImageResult =
  /** `model` is the one that drew the image, which differs from the configured one after a fallback. */
  | { ok: true; bytes: Buffer; model: string }
  | { ok: false; error: AvatarGenerationErrorCode; detail?: string }

type ProxyContentPart = { type?: string; text?: string; image_url?: { url?: string } }

/** The text of a chat reply plus any image URLs it carries as content parts. */
function readProxyReply(content: unknown): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return (content as ProxyContentPart[]).map((part) => part?.image_url?.url ?? part?.text ?? '').join('\n')
}

/**
 * One image through the local proxy: a chat request to an image model. The
 * proxy stores the picture and answers with a markdown link to it on itself
 * (or inlines it as a data URL). The reply is model output, so nothing but a
 * path on the proxy is ever fetched.
 */
async function requestProxyImage(prompt: string, model: string, fetchImpl: typeof fetch, signal: AbortSignal): Promise<AvatarImageResult> {
  const base = resolveImageProxyUrl()
  const key = process.env.OPERATOR_IMAGE_PROXY_KEY?.trim()
  let response: Response
  try {
    response = await fetchImpl(`${base}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(key ? { authorization: `Bearer ${key}` } : {}) },
      body: JSON.stringify({ model, messages: [{ role: 'user', content: `Generate this image.\n\n${prompt}` }] }),
      signal,
    })
  } catch (error) {
    if (signal.aborted) return { ok: false, error: 'image_timeout' }
    return { ok: false, error: 'image_unavailable', detail: PROXY_UNREACHABLE }
  }
  if (!response.ok) return { ok: false, error: 'image_request_failed', detail: `http_${response.status}` }
  const payload = await response.json() as { choices?: Array<{ message?: { content?: unknown } }> }
  const reply = readProxyReply(payload.choices?.[0]?.message?.content)
  const inline = /data:image\/[a-z+]+;base64,([A-Za-z0-9+/=]+)/.exec(reply)
  if (inline) return { ok: true, bytes: Buffer.from(inline[1], 'base64'), model }
  const link = /\]\((\/[^)\s]+)\)/.exec(reply)
  if (!link) return { ok: false, error: 'image_refused', detail: 'no_image' }
  const artifact = await fetchImpl(`${base}${link[1]}`, { signal })
  if (!artifact.ok) return { ok: false, error: 'image_request_failed', detail: `artifact_http_${artifact.status}` }
  return { ok: true, bytes: Buffer.from(await artifact.arrayBuffer()), model }
}

/** One image-model call. Returns the image bytes or an error code; never throws. */
export async function requestAvatarImage(
  prompt: string,
  options: { model?: string; fetchImpl?: typeof fetch } = {},
): Promise<AvatarImageResult> {
  let model = options.model ?? resolveAvatarImageModel()
  const signal = AbortSignal.timeout(CALL_TIMEOUT_MS)
  if (isProxyImageModel(model)) {
    try {
      const viaProxy = await requestProxyImage(prompt, model, options.fetchImpl ?? fetch, signal)
      // A proxy that cannot be reached at all means this is not the machine it runs on
      // (a deployed server): draw with the API model instead. A proxy that answers with
      // an error (quota, refusal) is reported as it is, so nothing is paid for silently.
      if (viaProxy.ok || viaProxy.detail !== PROXY_UNREACHABLE) return viaProxy
    } catch (error) {
      if (signal.aborted) return { ok: false, error: 'image_timeout' }
      return { ok: false, error: 'image_request_failed', detail: error instanceof Error ? error.name : 'unknown' }
    }
    model = AVATAR_DEFAULT_IMAGE_MODEL
  }
  const openAi = isOpenAiImageModel(model)
  const apiKey = (openAi ? process.env.OPENAI_API_KEY : process.env.GEMINI_API_KEY)?.trim()
  if (!apiKey) return { ok: false, error: 'image_unavailable' }
  try {
    if (openAi) {
      const response = await (options.fetchImpl ?? fetch)(OPENAI_ENDPOINT, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ model, prompt, size: '1024x1024', quality: resolveAvatarImageQuality(), n: 1 }),
        signal,
      })
      if (!response.ok) {
        // 400 here is nearly always the content filter turning the prompt down.
        return { ok: false, error: response.status === 400 ? 'image_refused' : 'image_request_failed', detail: `http_${response.status}` }
      }
      const payload = await response.json() as { data?: Array<{ b64_json?: string }> }
      const data = payload.data?.[0]?.b64_json
      return data ? { ok: true, bytes: Buffer.from(data, 'base64'), model } : { ok: false, error: 'image_refused', detail: 'no_image' }
    }
    const response = await (options.fetchImpl ?? fetch)(`${ENDPOINT}/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: '1:1' } },
      }),
      signal,
    })
    if (!response.ok) return { ok: false, error: 'image_request_failed', detail: `http_${response.status}` }
    const payload = await response.json() as { candidates?: Array<{ content?: { parts?: ImagePart[] }; finishReason?: string }> }
    const candidate = payload.candidates?.[0]
    for (const part of candidate?.content?.parts ?? []) {
      const data = part.inlineData?.data ?? part.inline_data?.data
      if (data) return { ok: true, bytes: Buffer.from(data, 'base64'), model }
    }
    return { ok: false, error: 'image_refused', detail: candidate?.finishReason ?? 'no_image' }
  } catch (error) {
    if (signal.aborted) return { ok: false, error: 'image_timeout' }
    return { ok: false, error: 'image_request_failed', detail: error instanceof Error ? error.name : 'unknown' }
  }
}

/** The persona gender: stored on the account, else from the creation audit row of older accounts. */
async function resolvePersonaGender(userId: string, stored: string | null | undefined): Promise<string | null> {
  if (stored === 'female' || stored === 'male') return stored
  const created = await prisma.adminAuditLog.findFirst({
    where: { action: 'operator.create', operatorUserId: userId },
    orderBy: { createdAt: 'asc' },
    select: { metadata: true },
  })
  const metadata = created?.metadata
  const gender = metadata && typeof metadata === 'object' && !Array.isArray(metadata) ? (metadata as Record<string, unknown>).gender : null
  return gender === 'female' || gender === 'male' ? gender : null
}

export async function loadAvatarPersona(userId: string, now: Date = new Date()): Promise<AvatarPersona | null> {
  const user = await prisma.user.findFirst({
    where: { id: userId, isOperator: true, isDeleted: false },
    select: {
      name: true, bio: true, birthDate: true, locationCity: true, locationCountry: true,
      operatorAccount: { select: { personaCountry: true, personaGender: true } },
    },
  })
  if (!user) return null
  return {
    gender: await resolvePersonaGender(userId, user.operatorAccount?.personaGender),
    name: user.name?.trim() || null,
    age: ageOn(user.birthDate, now),
    country: user.operatorAccount?.personaCountry ?? null,
    countryName: user.locationCountry ?? null,
    city: user.locationCity ?? null,
    bio: user.bio?.trim() || null,
  }
}

/**
 * Generates and stores a new AI profile photo for an operator account. A
 * different `nonce` gives the same account a different kind of photo. `ctx`
 * is null for the worker. Never throws.
 */
export async function generateOperatorAvatar(
  ctx: AdminContext | null,
  userId: string,
  options: { nonce?: string; now?: Date; fetchImpl?: typeof fetch } = {},
): Promise<AvatarGenerationResult> {
  try {
    const now = options.now ?? new Date()
    const persona = await loadAvatarPersona(userId, now)
    if (!persona) return { ok: false, error: 'not_operator' }

    const spec = pickAvatarSpec(persona, seededRandom(`${userId}:${options.nonce ?? now.getTime()}`))
    const image = await requestAvatarImage(spec.prompt, { fetchImpl: options.fetchImpl })
    if (!image.ok) return image

    const stored = await setOperatorAvatarFromBytes(ctx, userId, image.bytes, {
      generated: true, category: spec.category, subtype: spec.subtype, model: image.model,
    })
    if (!stored.ok) return { ok: false, error: 'image_storage_failed', detail: stored.error }

    await prisma.operatorAccount.updateMany({
      where: { userId },
      data: { avatarSpec: spec, avatarGeneratedAt: now, ...(persona.gender ? { personaGender: persona.gender } : {}) },
    })
    return { ok: true, image: stored.image, spec }
  } catch (error) {
    console.error('[operator-avatar] generate_failed', { error: error instanceof Error ? error.name : 'unknown' })
    return { ok: false, error: 'image_request_failed', detail: error instanceof Error ? error.name : 'unknown' }
  }
}
