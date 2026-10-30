import { prisma } from '@/lib/prisma'
import type { AdminContext } from '@/server/admin/guard'
import { ageOn } from '@/server/operator-auto-reply/generate'
import { setOperatorAvatarFromBytes } from '@/server/operators/operator-avatar'
import { pickAvatarSpec, seededRandom, type AvatarPersona, type AvatarSpec } from './taxonomy'

/**
 * AI profile photos for operator accounts: pick a photo spec from the
 * taxonomy, have it drawn (see requestAvatarImage), and store it through the same path
 * as a staff upload (re-encoded, audited). The spec is saved on the account
 * so staff can see what the photo was meant to be.
 */
/**
 * No route by default: photos wait to be drawn by hand in ChatGPT through the
 * staff Chrome profiles. Setting OPERATOR_AVATAR_IMAGE_MODEL to a proxy or
 * `chatgpt-app/*` model on a staff Mac draws there instead; no paid image API
 * is ever called (see requestAvatarImage).
 */
export const AVATAR_DEFAULT_IMAGE_MODEL = 'none'
/** Why a photo was not drawn on this machine: it waits to be drawn by hand. */
export const IMAGE_API_DISABLED = 'image_api_disabled'
const CALL_TIMEOUT_MS = 120_000
const DEFAULT_IMAGE_PROXY_URL = 'http://127.0.0.1:10100'
/** `scripts/chatgpt-image-bridge.mjs`, which draws with the ChatGPT desktop app. */
const DEFAULT_CHATGPT_APP_URL = 'http://127.0.0.1:10310'
/** The bridge draws one image at a time, so a request may wait behind others. */
const CHATGPT_APP_TIMEOUT_MS = 10 * 60_000
const PROXY_UNREACHABLE = 'proxy_unreachable'

export function resolveAvatarImageModel(env: NodeJS.ProcessEnv = process.env): string {
  return env.OPERATOR_AVATAR_IMAGE_MODEL?.trim() || AVATAR_DEFAULT_IMAGE_MODEL
}

/**
 * A model id with a provider prefix (`google-antigravity/gemini-3.1-flash-image`)
 * is served by a local model proxy that draws on a subscription login instead
 * of an API key. The proxy only exists on a developer machine.
 */
export function isProxyImageModel(model: string): boolean {
  return model.includes('/')
}

/** `chatgpt-app/*` models are drawn by the ChatGPT app bridge on a staff Mac. */
export function isChatgptAppImageModel(model: string): boolean {
  return model.startsWith('chatgpt-app/')
}

export function resolveImageProxyUrl(env: NodeJS.ProcessEnv = process.env, model = ''): string {
  const url = isChatgptAppImageModel(model)
    ? env.OPERATOR_CHATGPT_IMAGE_URL?.trim() || DEFAULT_CHATGPT_APP_URL
    : env.OPERATOR_IMAGE_PROXY_URL?.trim() || DEFAULT_IMAGE_PROXY_URL
  return url.replace(/\/+$/, '')
}

function resolveImageProxyKey(model: string, env: NodeJS.ProcessEnv = process.env): string | undefined {
  return (isChatgptAppImageModel(model) ? env.OPERATOR_CHATGPT_IMAGE_KEY : env.OPERATOR_IMAGE_PROXY_KEY)?.trim() || undefined
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

/** A photo the image model must draw the same person from. */
export type AvatarReference = { bytes: Buffer; mimeType: string }

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
async function requestProxyImage(prompt: string, model: string, fetchImpl: typeof fetch, signal: AbortSignal, reference?: AvatarReference): Promise<AvatarImageResult> {
  const base = resolveImageProxyUrl(process.env, model)
  const key = resolveImageProxyKey(model)
  let response: Response
  try {
    response = await fetchImpl(`${base}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(key ? { authorization: `Bearer ${key}` } : {}) },
      body: JSON.stringify({ model, messages: [{ role: 'user', content: proxyContent(`Generate this image.\n\n${prompt}`, reference) }] }),
      signal,
    })
  } catch (error) {
    if (signal.aborted) return { ok: false, error: 'image_timeout' }
    return { ok: false, error: 'image_unavailable', detail: PROXY_UNREACHABLE }
  }
  if (!response.ok) {
    // The bridge says why in its body (a usage limit, a refusal); keep that for staff.
    const reason = await response.json().then((body: { error?: { code?: string } }) => body.error?.code, () => undefined)
    return { ok: false, error: response.status === 422 ? 'image_refused' : 'image_request_failed', detail: reason ? `http_${response.status}_${reason}` : `http_${response.status}` }
  }
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

function dataUrl(reference: AvatarReference): string {
  return `data:${reference.mimeType};base64,${reference.bytes.toString('base64')}`
}

function proxyContent(text: string, reference?: AvatarReference) {
  return reference ? [{ type: 'text', text }, { type: 'image_url', image_url: { url: dataUrl(reference) } }] : text
}

/**
 * One image, only ever through the hand-off routes on a staff Mac (the model
 * proxy or the ChatGPT app bridge), never a paid image API: staff decided
 * (2026-10-30) that every operator photo is drawn in ChatGPT through the
 * staff Chrome profiles. Where no such route answers (a deployed server) the
 * result is `image_unavailable`, and callers leave the photo to be drawn by
 * hand (scripts/draw-pending-photos.mts).
 */
export async function requestAvatarImage(
  prompt: string,
  options: { model?: string; fetchImpl?: typeof fetch; reference?: AvatarReference } = {},
): Promise<AvatarImageResult> {
  const reference = options.reference
  const model = options.model ?? resolveAvatarImageModel()
  if (!isProxyImageModel(model)) return { ok: false, error: 'image_unavailable', detail: IMAGE_API_DISABLED }
  const signal = AbortSignal.timeout(isChatgptAppImageModel(model) ? CHATGPT_APP_TIMEOUT_MS : CALL_TIMEOUT_MS)
  try {
    return await requestProxyImage(prompt, model, options.fetchImpl ?? fetch, signal, reference)
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
 * A new photo spec for an operator account, its prompt carrying staff
 * feedback, to be drawn by hand (scripts/draw-pending-photos.mts). Null for
 * an account that is not an operator.
 */
export async function planOperatorAvatar(
  userId: string,
  options: { nonce?: string; now?: Date; feedback?: string | null } = {},
): Promise<AvatarSpec | null> {
  const now = options.now ?? new Date()
  const persona = await loadAvatarPersona(userId, now)
  if (!persona) return null
  const spec = pickAvatarSpec(persona, seededRandom(`${userId}:${options.nonce ?? now.getTime()}`))
  const feedback = options.feedback?.trim()
  return feedback ? { ...spec, prompt: `${spec.prompt}\nStaff feedback on the previous photo of this person, to follow: ${feedback}` } : spec
}

/**
 * Generates and stores a new AI profile photo for an operator account. A
 * different `nonce` gives the same account a different kind of photo. `ctx`
 * is null for the worker. Never throws.
 */
export async function generateOperatorAvatar(
  ctx: AdminContext | null,
  userId: string,
  options: { nonce?: string; now?: Date; fetchImpl?: typeof fetch; feedback?: string | null } = {},
): Promise<AvatarGenerationResult> {
  try {
    const now = options.now ?? new Date()
    const persona = await loadAvatarPersona(userId, now)
    if (!persona) return { ok: false, error: 'not_operator' }

    const spec = pickAvatarSpec(persona, seededRandom(`${userId}:${options.nonce ?? now.getTime()}`))
    const feedback = options.feedback?.trim()
    const prompt = feedback ? `${spec.prompt}\nStaff feedback on the previous photo of this person, to follow: ${feedback}` : spec.prompt
    const image = await requestAvatarImage(prompt, { fetchImpl: options.fetchImpl })
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
