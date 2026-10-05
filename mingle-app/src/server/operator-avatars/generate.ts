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

/** One image-model call. Returns the image bytes or an error code; never throws. */
export async function requestAvatarImage(
  prompt: string,
  options: { model?: string; fetchImpl?: typeof fetch } = {},
): Promise<{ ok: true; bytes: Buffer } | { ok: false; error: AvatarGenerationErrorCode; detail?: string }> {
  const model = options.model ?? resolveAvatarImageModel()
  const openAi = isOpenAiImageModel(model)
  const apiKey = (openAi ? process.env.OPENAI_API_KEY : process.env.GEMINI_API_KEY)?.trim()
  if (!apiKey) return { ok: false, error: 'image_unavailable' }
  const signal = AbortSignal.timeout(CALL_TIMEOUT_MS)
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
      return data ? { ok: true, bytes: Buffer.from(data, 'base64') } : { ok: false, error: 'image_refused', detail: 'no_image' }
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
      if (data) return { ok: true, bytes: Buffer.from(data, 'base64') }
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
    const model = resolveAvatarImageModel()
    const image = await requestAvatarImage(spec.prompt, { model, fetchImpl: options.fetchImpl })
    if (!image.ok) return image

    const stored = await setOperatorAvatarFromBytes(ctx, userId, image.bytes, {
      generated: true, category: spec.category, subtype: spec.subtype, model,
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
