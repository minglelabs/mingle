import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { GoogleGenerativeAI, SchemaType, type ResponseSchema } from '@google/generative-ai'
import {
  ensureTrackingContext,
  sanitizeNonNegativeInt,
} from '@/lib/app-analytics'
import { getAuthOptions } from '@/lib/auth-options'
import { prisma } from '@/lib/prisma'
import { getTranslationLanguageName } from '@/lib/translation-languages'
import { getInworldAuthHeaderValue } from '@/server/api/shared/inworld-auth'
import { decodeAudioContent, detectAudioMime } from '@/server/api/shared/audio-utils'
import { resolveVoiceId, INWORLD_API_BASE } from '@/server/api/shared/inworld-voice'
import {
  buildFallbackTranslationsFromCurrentTurnPreviousState,
  normalizeLang,
  normalizeSelectedLanguages,
  normalizeTargetLanguages,
  parseCurrentTurnPreviousState,
  parseDetectedSourceLanguage,
  parseImmediatePreviousTurn,
  parseSourceLanguagesMixed,
  parseSourceTextHasForeignScript,
  parseTranslations,
  type CurrentTurnPreviousState,
  type RecentTurnContext,
} from '@/app/api/translate/finalize/utils'
import { shouldRedetectFinalizeSourceLanguage } from '@/lib/api-contract'
import {
  normalizeSelectableTranslationModel,
  resolveDefaultSelectableTranslationModel,
  resolveTranslationRuntimeSelection,
  type TranslationInfrastructureProvider,
  type UserSelectableTranslationModel,
} from '@/lib/translation-models'

export const runtime = 'nodejs'

const DEFAULT_GEMINI_MODEL = 'gemini-2.5-flash-lite'
const DEFAULT_GEMMA_MODEL = 'gemma-4-31b-it'
const DEFAULT_QWEN_MODEL = 'Qwen/Qwen3.5-9B'
const DEFAULT_DASHSCOPE_QWEN_MODEL = 'Qwen3.5-9B'
const DEFAULT_TTS_MODEL_ID = process.env.INWORLD_TTS_MODEL_ID || 'inworld-tts-1.5-mini'
const DEFAULT_TTS_SPEAKING_RATE = Number(process.env.INWORLD_TTS_SPEAKING_RATE || '1.3')
const IMMEDIATE_PREVIOUS_TURN_MAX_AGE_MS = 5_000
const TRANSLATE_TRANSIENT_RETRY_BACKOFF_MS = 250
const OPENAI_COMPATIBLE_INTERIM_TIMEOUT_MS = 2_000
const OPENAI_COMPATIBLE_FINAL_TIMEOUT_MS = 5_000
const ENABLE_VERBOSE_TRANSLATE_LOGS = process.env.MINGLE_VERBOSE_TRANSLATE_LOGS === '1'
const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1'
const TOGETHER_BASE_URL = 'https://api.together.xyz/v1'
const DASHSCOPE_BASE_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1'


type TranslationProvider = 'gemini' | 'gemma' | 'qwen' | 'openai-compatible'

type TranslationUsage = {
  promptTokens?: number
  completionTokens?: number
  reasoningTokens?: number
  totalTokens?: number
}

type TranslationEngineResult = {
  translations: Record<string, string>
  sourceLanguage?: string
  sourceLanguagesMixed?: boolean
  sourceTextHasForeignScript?: boolean
  provider: TranslationProvider
  infrastructureProvider: TranslationInfrastructureProvider | string
  model: string
  usage?: TranslationUsage
}

type GeminiTranslationProviderConfig = {
  provider: 'gemini' | 'gemma'
  infrastructureProvider: TranslationInfrastructureProvider | string
  model: string
  apiKey: string
}

type OpenAICompatibleTranslationProviderConfig = {
  provider: 'gemma' | 'qwen' | 'openai-compatible'
  infrastructureProvider: TranslationInfrastructureProvider | string
  model: string
  apiKey: string
  baseUrl: string
  extraBody: Record<string, unknown> | null
}

type TranslationProviderConfig = GeminiTranslationProviderConfig | OpenAICompatibleTranslationProviderConfig

type TranslationProviderResolution = {
  ok: true
  config: TranslationProviderConfig
} | {
  ok: false
  error: 'missing_api_key' | 'provider_misconfigured' | 'unsupported_model'
  details: string
}

type FinalizeTestFaultMode = 'provider_empty' | 'target_miss' | 'provider_error'

type TranslateRequestMeta = {
  requestPathname: string
  requestMethod: string
  clientBundleRev: string | null
  sessionKeyHint: string | null
}

type TranslateContext = {
  text: string
  sourceLanguage: string
  targetLanguages: string[]
  shouldRedetectSourceLanguage: boolean
  immediatePreviousTurn: RecentTurnContext | null
  currentTurnPreviousState: CurrentTurnPreviousState | null
  isFinal: boolean
  requestMeta: TranslateRequestMeta
}

type GeminiUsageMetadata = {
  promptTokenCount?: unknown
  candidatesTokenCount?: unknown
  totalTokenCount?: unknown
}

type SessionUserIdentity = {
  id: string
  email: string
  externalUserId: string
  sessionKey: string
}

type GeminiResponseLike = {
  text: () => string
  usageMetadata?: GeminiUsageMetadata
  promptFeedback?: unknown
  candidates?: Array<{
    finishReason?: unknown
    safetyRatings?: unknown
  }>
}

type OpenAICompatibleResponseLike = {
  model?: unknown
  choices?: Array<{
    finish_reason?: unknown
    message?: {
      content?: unknown
      refusal?: unknown
      reasoning?: unknown
      reasoning_content?: unknown
    }
  }>
  usage?: {
    prompt_tokens?: unknown
    completion_tokens?: unknown
    total_tokens?: unknown
    completion_tokens_details?: {
      reasoning_tokens?: unknown
    }
  }
  error?: {
    message?: unknown
    code?: unknown
  }
}

function normalizeTranslationProvider(value: string): TranslationProvider | null {
  const normalized = value.trim().toLowerCase()
  if (!normalized) return null
  if (normalized === 'gemini') return normalized
  if (normalized === 'gemma') return normalized
  if (normalized === 'qwen') return normalized
  if (normalized === 'openai-compatible') return normalized
  if (normalized === 'openai_compatible') return 'openai-compatible'
  return null
}

function isGoogleGenerativeProvider(provider: TranslationProvider): provider is 'gemini' | 'gemma' {
  return provider === 'gemini' || provider === 'gemma'
}

function readTranslateEnv(name: string): string {
  const direct = process.env[name]
  if (typeof direct === 'string') return direct

  const legacyName = `DEMO_${name}`
  return process.env[legacyName] || ''
}

function isDashScopeBaseUrl(baseUrl: string): boolean {
  const normalized = baseUrl.trim().toLowerCase()
  if (!normalized) return false

  return (
    normalized.includes('dashscope.aliyuncs.com') ||
    normalized.includes('dashscope-intl.aliyuncs.com') ||
    normalized.includes('dashscope-us.aliyuncs.com') ||
    normalized.includes('cn-hongkong.dashscope.aliyuncs.com') ||
    normalized.includes('.maas.aliyuncs.com')
  )
}

function isOpenRouterBaseUrl(baseUrl: string): boolean {
  return baseUrl.toLowerCase().includes('openrouter.ai')
}

function isTogetherBaseUrl(baseUrl: string): boolean {
  return baseUrl.toLowerCase().includes('together.xyz')
}

function resolveOpenAICompatibleInfrastructureProvider(baseUrl: string): string {
  if (isOpenRouterBaseUrl(baseUrl)) return 'openrouter'
  if (isTogetherBaseUrl(baseUrl)) return 'together'
  if (isDashScopeBaseUrl(baseUrl)) return 'dashscope'
  return 'openai-compatible'
}

function resolveTranslationProvider(): TranslationProvider {
  return normalizeTranslationProvider(readTranslateEnv('TRANSLATE_PROVIDER')) || 'gemini'
}

function sanitizeTrackingValue(rawValue: string | null): string {
  return (rawValue || '').trim().slice(0, 128)
}

function resolveTrackingSessionKey(request: NextRequest, sessionKeyHint?: string | null): string {
  const cookieStore = (
    typeof (request as { cookies?: { get?: (name: string) => { value?: string } | undefined } }).cookies === 'object'
      ? (request as { cookies?: { get?: (name: string) => { value?: string } | undefined } }).cookies
      : undefined
  )

  return sanitizeTrackingValue(
    sessionKeyHint
    || request.headers.get('x-mingle-session-key')
    || cookieStore?.get?.('mingle_sid')?.value
    || readCookieValueFromHeader(request.headers.get('cookie'), 'mingle_sid')
    || null,
  )
}

function readCookieValueFromHeader(cookieHeader: string | null, cookieName: string): string {
  const rawHeader = cookieHeader || ''
  for (const segment of rawHeader.split(';')) {
    const trimmed = segment.trim()
    if (!trimmed) continue
    const separatorIndex = trimmed.indexOf('=')
    if (separatorIndex <= 0) continue
    const name = trimmed.slice(0, separatorIndex).trim()
    if (name !== cookieName) continue
    const value = trimmed.slice(separatorIndex + 1).trim()
    try {
      return decodeURIComponent(value)
    } catch {
      return value
    }
  }
  return ''
}

function resolveTrackingExternalUserId(request: NextRequest): string {
  const cookieStore = (
    typeof (request as { cookies?: { get?: (name: string) => { value?: string } | undefined } }).cookies === 'object'
      ? (request as { cookies?: { get?: (name: string) => { value?: string } | undefined } }).cookies
      : undefined
  )

  return sanitizeTrackingValue(
    request.headers.get('x-mingle-user-id')
    || cookieStore?.get?.('mingle_uid')?.value
    || readCookieValueFromHeader(request.headers.get('cookie'), 'mingle_uid')
    || null,
  )
}

function normalizeSessionUserIdentity(
  session: { user?: { id?: unknown, email?: unknown } } | null,
  externalUserId = '',
  sessionKey = '',
): SessionUserIdentity {
  return {
    id: typeof session?.user?.id === 'string' ? session.user.id.trim() : '',
    email: typeof session?.user?.email === 'string' ? session.user.email.trim().toLowerCase() : '',
    externalUserId,
    sessionKey,
  }
}

async function findUserIdBySessionKey(sessionKey: string): Promise<string | null> {
  if (!sessionKey) return null

  const recentEvent = await prisma.appEventLog.findFirst({
    where: {
      sessionKey,
      userId: { not: null },
    },
    orderBy: { createdAt: 'desc' },
    select: { userId: true },
  })
  if (recentEvent?.userId) return recentEvent.userId

  const recentMessage = await prisma.appMessage.findFirst({
    where: {
      sessionKey,
      userId: { not: null },
    },
    orderBy: { createdAt: 'desc' },
    select: { userId: true },
  })
  return recentMessage?.userId || null
}

async function findUserSelectedTranslationModel(identity: SessionUserIdentity): Promise<UserSelectableTranslationModel | null> {
  const select = {
    translationModel: true,
  } as const

  if (identity.id) {
    const record = await prisma.user.findUnique({
      where: { id: identity.id },
      select,
    })
    const normalizedModel = normalizeSelectableTranslationModel(record?.translationModel)
    if (normalizedModel) return normalizedModel
  }

  if (identity.email) {
    const record = await prisma.user.findUnique({
      where: { email: identity.email },
      select,
    })
    const normalizedModel = normalizeSelectableTranslationModel(record?.translationModel)
    if (normalizedModel) return normalizedModel
  }

  if (identity.externalUserId) {
    const record = await prisma.user.findUnique({
      where: { externalUserId: identity.externalUserId },
      select,
    })
    const normalizedModel = normalizeSelectableTranslationModel(record?.translationModel)
    if (normalizedModel) return normalizedModel
  }

  if (identity.sessionKey) {
    const userId = await findUserIdBySessionKey(identity.sessionKey)
    if (userId) {
      const record = await prisma.user.findUnique({
        where: { id: userId },
        select,
      })
      const normalizedModel = normalizeSelectableTranslationModel(record?.translationModel)
      if (normalizedModel) return normalizedModel
    }
  }

  return null
}

async function resolveSelectedTranslationModel(
  request: NextRequest,
  sessionKeyHint?: string | null,
): Promise<UserSelectableTranslationModel> {
  const externalUserId = resolveTrackingExternalUserId(request)
  const sessionKey = resolveTrackingSessionKey(request, sessionKeyHint)
  try {
    const session = await getServerSession(getAuthOptions())
    const selectedModel = await findUserSelectedTranslationModel(
      normalizeSessionUserIdentity(session, externalUserId, sessionKey),
    )
    if (selectedModel) return selectedModel
  } catch {
    if (externalUserId || sessionKey) {
      const selectedModel = await findUserSelectedTranslationModel({
        id: '',
        email: '',
        externalUserId,
        sessionKey,
      })
      if (selectedModel) return selectedModel
    }
  }

  return resolveDefaultSelectableTranslationModel()
}

function resolveOpenAICompatibleBaseUrl(provider: TranslationProvider): string {
  const explicitBaseUrl = readTranslateEnv('TRANSLATE_BASE_URL').trim()
  if (explicitBaseUrl) return explicitBaseUrl
  if ((process.env.OPENROUTER_API_KEY || '').trim()) return OPENROUTER_BASE_URL
  if ((process.env.TOGETHER_API_KEY || '').trim()) return TOGETHER_BASE_URL
  if ((process.env.DASHSCOPE_API_KEY || '').trim()) return DASHSCOPE_BASE_URL
  if (provider === 'qwen' && readTranslateEnv('TRANSLATE_API_KEY').trim()) return OPENROUTER_BASE_URL
  return (process.env.OPENAI_BASE_URL || '').trim()
}

function resolveOpenAICompatibleApiKey(baseUrl: string): string {
  const explicitApiKey = readTranslateEnv('TRANSLATE_API_KEY').trim()
  if (explicitApiKey) return explicitApiKey
  if (isOpenRouterBaseUrl(baseUrl)) return (process.env.OPENROUTER_API_KEY || '').trim()
  if (isTogetherBaseUrl(baseUrl)) return (process.env.TOGETHER_API_KEY || '').trim()
  if (isDashScopeBaseUrl(baseUrl)) return (process.env.DASHSCOPE_API_KEY || '').trim()
  return (process.env.OPENAI_API_KEY || '').trim()
}

function resolveTranslationModel(config: {
  provider: TranslationProvider
  baseUrl?: string
}): string {
  const explicitModel = readTranslateEnv('TRANSLATE_MODEL').trim()
  if (explicitModel) return explicitModel
  if (config.provider === 'gemini') return DEFAULT_GEMINI_MODEL
  if (config.provider === 'gemma') return DEFAULT_GEMMA_MODEL
  if (config.provider === 'qwen' && config.baseUrl && isDashScopeBaseUrl(config.baseUrl)) {
    return DEFAULT_DASHSCOPE_QWEN_MODEL
  }
  if (config.provider === 'qwen') return DEFAULT_QWEN_MODEL
  return ''
}

function parseJsonObjectEnv(name: string): {
  value: Record<string, unknown> | null
  error?: string
} {
  const raw = readTranslateEnv(name).trim()
  if (!raw) return { value: null }

  try {
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { value: null, error: `${name} must be a JSON object.` }
    }
    return { value: parsed as Record<string, unknown> }
  } catch (error) {
    return {
      value: null,
      error: `${name} could not be parsed: ${error instanceof Error ? error.message : String(error)}`,
    }
  }
}

function buildDefaultOpenAICompatibleExtraBody(provider: 'gemma' | 'qwen' | 'openai-compatible', baseUrl: string): Record<string, unknown> | null {
  if (provider !== 'qwen') return null
  if (isDashScopeBaseUrl(baseUrl)) return { enable_thinking: false }
  if (isOpenRouterBaseUrl(baseUrl)) return null
  return { chat_template_kwargs: { enable_thinking: false } }
}

function resolveTranslationProviderConfig(requestedModelRaw?: unknown): TranslationProviderResolution {
  const requestedModelSelection = resolveTranslationRuntimeSelection(requestedModelRaw)
  if (typeof requestedModelRaw === 'string' && requestedModelRaw.trim() && !requestedModelSelection) {
    return {
      ok: false,
      error: 'unsupported_model',
      details: `Unsupported translation model: ${requestedModelRaw.trim()}`,
    }
  }

  if (requestedModelSelection) {
    if (
      requestedModelSelection.infrastructureProvider === 'google'
      && (requestedModelSelection.engineProvider === 'gemini' || requestedModelSelection.engineProvider === 'gemma')
    ) {
      const apiKey = (process.env.GEMINI_API_KEY || '').trim()
      if (!apiKey) {
        return {
          ok: false,
          error: 'missing_api_key',
          details: 'GEMINI_API_KEY is missing.',
        }
      }

      return {
        ok: true,
        config: {
          provider: requestedModelSelection.engineProvider,
          infrastructureProvider: requestedModelSelection.infrastructureProvider,
          model: requestedModelSelection.runtimeModel,
          apiKey,
        },
      }
    }

    const baseUrl = requestedModelSelection.baseUrl || OPENROUTER_BASE_URL
    const apiKey = resolveOpenAICompatibleApiKey(baseUrl)
    if (!apiKey) {
      return {
        ok: false,
        error: 'missing_api_key',
        details: 'No API key was found for the configured OpenAI-compatible translation provider.',
      }
    }

    const parsedExtraBody = parseJsonObjectEnv('TRANSLATE_EXTRA_BODY')
    if (parsedExtraBody.error) {
      return {
        ok: false,
        error: 'provider_misconfigured',
        details: parsedExtraBody.error,
      }
    }

    const defaultExtraBody = buildDefaultOpenAICompatibleExtraBody('qwen', baseUrl)
    const extraBody = defaultExtraBody || parsedExtraBody.value
      ? {
        ...(defaultExtraBody || {}),
        ...(parsedExtraBody.value || {}),
      }
      : null

    return {
      ok: true,
      config: {
        provider: requestedModelSelection.engineProvider,
        infrastructureProvider: requestedModelSelection.infrastructureProvider,
        model: requestedModelSelection.runtimeModel,
        apiKey,
        baseUrl,
        extraBody,
      },
    }
  }

  const provider = resolveTranslationProvider()

  if (isGoogleGenerativeProvider(provider)) {
    const apiKey = (process.env.GEMINI_API_KEY || '').trim()
    if (!apiKey) {
      return {
        ok: false,
        error: 'missing_api_key',
        details: 'GEMINI_API_KEY is missing.',
      }
    }

    return {
      ok: true,
      config: {
        provider,
        infrastructureProvider: 'google',
        model: resolveTranslationModel({ provider }),
        apiKey,
      },
    }
  }

  const baseUrl = resolveOpenAICompatibleBaseUrl(provider)
  if (!baseUrl) {
    return {
      ok: false,
      error: 'provider_misconfigured',
      details: 'TRANSLATE_BASE_URL is missing for the configured translation provider.',
    }
  }

  const apiKey = resolveOpenAICompatibleApiKey(baseUrl)
  if (!apiKey) {
    return {
      ok: false,
      error: 'missing_api_key',
      details: 'No API key was found for the configured OpenAI-compatible translation provider.',
    }
  }

  const parsedExtraBody = parseJsonObjectEnv('TRANSLATE_EXTRA_BODY')
  if (parsedExtraBody.error) {
    return {
      ok: false,
      error: 'provider_misconfigured',
      details: parsedExtraBody.error,
    }
  }

  const defaultExtraBody = buildDefaultOpenAICompatibleExtraBody(provider, baseUrl)
  const extraBody = defaultExtraBody || parsedExtraBody.value
    ? {
      ...(defaultExtraBody || {}),
      ...(parsedExtraBody.value || {}),
    }
    : null

  return {
    ok: true,
    config: {
      provider,
      infrastructureProvider: resolveOpenAICompatibleInfrastructureProvider(baseUrl),
      model: resolveTranslationModel({ provider, baseUrl }),
      apiKey,
      baseUrl,
      extraBody,
    },
  }
}



function parseFinalizeTestFaultMode(value: unknown): FinalizeTestFaultMode | null {
  if (typeof value !== 'string') return null
  const normalized = value.trim().toLowerCase()
  if (!normalized) return null
  if (normalized === 'provider_empty') return normalized
  if (normalized === 'target_miss') return normalized
  if (normalized === 'provider_error') return normalized
  return null
}

function logTranslateFinalizeInfo(event: string, payload: Record<string, unknown>) {
  if (!ENABLE_VERBOSE_TRANSLATE_LOGS) return
  console.info(`[translate/finalize] ${event}`, payload)
}

function stringifyTranslateFinalizePayload(payload: Record<string, unknown>): string {
  try {
    return JSON.stringify(payload)
  } catch (error) {
    return JSON.stringify({
      serializationError: error instanceof Error ? error.message : String(error),
    })
  }
}

function logTranslateFinalizeError(event: string, payload: Record<string, unknown>) {
  console.error(`[translate/finalize] ${event} ${stringifyTranslateFinalizePayload(payload)}`)
}

function summarizeUnknownError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    }
  }

  return { raw: String(error) }
}

function resolveRequestPathname(request: NextRequest): string {
  const nextUrlPathname = request.nextUrl?.pathname
  if (typeof nextUrlPathname === 'string' && nextUrlPathname.trim()) {
    return nextUrlPathname
  }

  try {
    return new URL(request.url).pathname
  } catch {
    return ''
  }
}

function buildTranslateFinalizeLogContext(ctx: TranslateContext): Record<string, unknown> {
  return {
    path: ctx.requestMeta.requestPathname,
    method: ctx.requestMeta.requestMethod,
    clientBundleRev: ctx.requestMeta.clientBundleRev,
    sessionKeyHint: ctx.requestMeta.sessionKeyHint,
    sourceLanguage: ctx.sourceLanguage,
    targetLanguages: ctx.targetLanguages,
    shouldRedetectSourceLanguage: ctx.shouldRedetectSourceLanguage,
    isFinal: ctx.isFinal,
    textPreview: ctx.text.slice(0, 120),
  }
}

function logParsedTranslations(event: string, payload: {
  sourceLanguage: string
  targetLanguages: string[]
  isFinal: boolean
  text: string
  parsedLanguages: string[]
  translations: Record<string, string>
  usage?: Record<string, unknown>
}) {
  if (!ENABLE_VERBOSE_TRANSLATE_LOGS) return
  console.info(`[translate/finalize] ${event}`, payload)
}

function formatPromptConsoleLog(payload: {
  sourceLanguage: string
  targetLanguages: string[]
  shouldRedetectSourceLanguage: boolean
  isFinal: boolean
  text: string
  systemPrompt: string
  userPrompt: string
}): Record<string, unknown> {
  const collapsePromptText = (text: string) => text.replace(/\s*\n\s*/g, ' ').trim()

  return {
    ...payload,
    systemPrompt: collapsePromptText(payload.systemPrompt),
    userPrompt: collapsePromptText(payload.userPrompt),
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

function isRetryableGeminiError(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  const normalizedMessage = error.message.toLowerCase()

  return (
    /\[(429|500|502|503|504)\b/.test(error.message)
    || normalizedMessage.includes('service unavailable')
    || normalizedMessage.includes('high demand')
    || normalizedMessage.includes('temporar')
    || normalizedMessage.includes('try again later')
    || normalizedMessage.includes('fetch failed')
    || normalizedMessage.includes('network')
    || normalizedMessage.includes('timed out')
    || normalizedMessage.includes('timeout')
  )
}

function isRetryableOpenAICompatibleError(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  const normalizedMessage = error.message.toLowerCase()

  return (
    /\b(429|500|502|503|504)\b/.test(error.message)
    || normalizedMessage.includes('service unavailable')
    || normalizedMessage.includes('temporar')
    || normalizedMessage.includes('try again later')
    || normalizedMessage.includes('fetch failed')
    || normalizedMessage.includes('network')
    || normalizedMessage.includes('timed out')
    || normalizedMessage.includes('timeout')
    || normalizedMessage.includes('aborted')
    || normalizedMessage.includes('aborterror')
    || normalizedMessage.includes('rate limit')
  )
}

function resolveOpenAICompatibleRequestTimeoutMs(isFinal: boolean): number {
  return isFinal ? OPENAI_COMPATIBLE_FINAL_TIMEOUT_MS : OPENAI_COMPATIBLE_INTERIM_TIMEOUT_MS
}

function formatSingleTurnForPromptWithOptions(
  label: string,
  turn: RecentTurnContext,
  options: { includeSourceLanguage: boolean },
): string {
  const ageSuffix = typeof turn.ageMs === 'number'
    ? ` (~${Math.round(turn.ageMs / 1000)}s ago)`
    : ''
  const translationLines = Object.entries(turn.translations)
    .map(([language, translatedText]) => `    - ${language}: "${translatedText}"`)
    .join('\n')
  const sourceLine = options.includeSourceLanguage
    ? `  Original [${turn.sourceLanguage}]: "${turn.sourceText}"`
    : `  Original: "${turn.sourceText}"`

  return [
    `${label}${ageSuffix}:`,
    sourceLine,
    '  Translations:',
    translationLines || '    - (none)',
  ].join('\n')
}

function selectPromptImmediatePreviousTurn(turn: RecentTurnContext | null): RecentTurnContext | null {
  if (!turn) return null
  if (typeof turn.ageMs !== 'number') return null
  if (turn.ageMs > IMMEDIATE_PREVIOUS_TURN_MAX_AGE_MS) return null
  return turn
}

function buildPrompt(ctx: TranslateContext): { systemPrompt: string, userPrompt: string } {
  const immediatePreviousTurn = selectPromptImmediatePreviousTurn(ctx.immediatePreviousTurn)
  const includeSourceLanguage = !ctx.shouldRedetectSourceLanguage
  const targetLangCodes = ctx.targetLanguages.join(', ')
  const userPromptLines = ctx.shouldRedetectSourceLanguage
    ? [
      'Current turn:',
      `language_hints=${targetLangCodes}`,
      `sourceLanguage=${ctx.sourceLanguage}`,
      `text="${ctx.text}"`,
    ]
    : [
      'Current turn:',
      `source=${ctx.sourceLanguage}`,
      `targets=${targetLangCodes}`,
      `is_final=${ctx.isFinal ? 'yes' : 'no'}`,
      `text="${ctx.text}"`,
    ]

  if (immediatePreviousTurn) {
    userPromptLines.push(
      '',
      formatSingleTurnForPromptWithOptions('Immediate previous turn', immediatePreviousTurn, {
        includeSourceLanguage,
      }),
    )
  }

  if (!ctx.shouldRedetectSourceLanguage) {
    userPromptLines.push(
      '',
      'If is_final=no, avoid over-completing unfinished thoughts.',
    )
  }

  return {
    systemPrompt: ctx.shouldRedetectSourceLanguage
      ? [
        'You are an expert live-conversation translator.',
        'Return ONLY strict JSON with keys exactly matching sourceLanguage, sourceLanguagesMixed, sourceTextHasForeignScript, and the requested language codes.',
        'No explanations, no markdown, no extra keys.',
        'Treat language_hints as reference-only hints, not a constraint. If the current text clearly indicates a different source language, choose that language even when it is not included in language_hints.',
        'Set sourceLanguagesMixed=true only when the current text itself meaningfully mixes two or more languages within the same utterance; otherwise set it to false. For example, in "そんな답답해서 죽겠다고 내가 진짜로.", sourceLanguagesMixed should be true.',
        'Set sourceTextHasForeignScript=true only when the current text contains substantive non-source-language characters or script for the chosen sourceLanguage; otherwise set it to false. Ignore spaces, punctuation, and digits. For example, in "そんな답답해서 죽겠다고 내가 진짜로.", sourceTextHasForeignScript should be true, and if sourceLanguage is Japanese, "료카이데스" should also set sourceTextHasForeignScript=true because it is written in Hangul rather than Japanese script.',
        'Only if the provided sourceLanguage clearly seems wrong for the current text, replace it with the source language that best matches the current text. For example, if "료카이데스" is given sourceLanguage=ko, it should be corrected to Japanese because it is Korean script that phonetically represents Japanese speech.',
      ].join('\n')
      : [
        'You are an expert live-conversation translator.',
        'Return ONLY strict JSON with keys exactly matching target language codes.',
        'No explanations, no markdown, no extra keys.',
        'Always translate the ENTIRE current text as a standalone translation for each target language.',
        'Never return only a suffix, delta, patch, completion fragment, or continuation.',
        'If is_final=yes, translate the full final text from scratch, not an incremental update.',
      ].join('\n'),
    userPrompt: userPromptLines.join('\n'),
  }
}

function normalizeUsage(raw: {
  prompt?: unknown
  completion?: unknown
  reasoning?: unknown
  total?: unknown
}): TranslationUsage | undefined {
  const promptTokens = sanitizeNonNegativeInt(raw.prompt)
  const completionTokens = sanitizeNonNegativeInt(raw.completion)
  const reasoningTokens = sanitizeNonNegativeInt(raw.reasoning)
  const totalTokens = sanitizeNonNegativeInt(raw.total)

  if (promptTokens === null && completionTokens === null && reasoningTokens === null && totalTokens === null) {
    return undefined
  }

  const usage: TranslationUsage = {}
  if (promptTokens !== null) usage.promptTokens = promptTokens
  if (completionTokens !== null) usage.completionTokens = completionTokens
  if (reasoningTokens !== null) usage.reasoningTokens = reasoningTokens
  if (totalTokens !== null) usage.totalTokens = totalTokens
  return usage
}

function buildGeminiResponseSchema(targetLanguages: string[], options?: {
  shouldRedetectSourceLanguage: boolean
}): ResponseSchema {
  const properties: Record<string, ResponseSchema> = {}
  const required = [...targetLanguages]

  if (options?.shouldRedetectSourceLanguage) {
    properties.sourceLanguage = {
      type: SchemaType.STRING,
      description: 'Detected source language code for the current text.',
    }
    properties.sourceLanguagesMixed = {
      type: SchemaType.BOOLEAN,
      description: 'Whether the current text itself meaningfully mixes two or more languages.',
    }
    properties.sourceTextHasForeignScript = {
      type: SchemaType.BOOLEAN,
      description: 'Whether the current text contains substantive characters or script not normally used to write the chosen source language.',
    }
    required.unshift('sourceLanguage')
    required.splice(1, 0, 'sourceLanguagesMixed')
    required.splice(2, 0, 'sourceTextHasForeignScript')
  }

  for (const language of targetLanguages) {
    properties[language] = {
      type: SchemaType.STRING,
      description: `Translated text in ${getTranslationLanguageName(language) || language}.`,
    }
  }

  return {
    type: SchemaType.OBJECT,
    properties,
    required,
  }
}

function shouldRedetectSourceLanguageFromRequest(args: {
  pathname: string
  isFinal: boolean
}): boolean {
  if (!args.isFinal) return false
  return shouldRedetectFinalizeSourceLanguage(args.pathname)
}

function inferDetectedSourceLanguageFromEcho(
  text: string,
  targetLanguages: string[],
  translations: Record<string, string>,
): string {
  const normalizedText = text.trim()
  if (!normalizedText) return ''

  for (const language of targetLanguages) {
    if ((translations[language] || '').trim() === normalizedText) {
      return language
    }
  }

  return ''
}

async function translateWithGemini(
  ctx: TranslateContext,
  config: GeminiTranslationProviderConfig,
): Promise<TranslationEngineResult | null> {
  const genAI = new GoogleGenerativeAI(config.apiKey)
  const { systemPrompt, userPrompt } = buildPrompt(ctx)
  const promptLogPayload = {
    sourceLanguage: ctx.sourceLanguage,
    targetLanguages: ctx.targetLanguages,
    shouldRedetectSourceLanguage: ctx.shouldRedetectSourceLanguage,
    isFinal: ctx.isFinal,
    text: ctx.text,
    systemPrompt,
    userPrompt,
  }
  logTranslateFinalizeInfo('prompt', promptLogPayload)
  if (process.env.NODE_ENV !== 'production' && ctx.shouldRedetectSourceLanguage) {
    console.info('[translate/finalize] prompt', formatPromptConsoleLog(promptLogPayload))
  }
  const responseSchema = buildGeminiResponseSchema(ctx.targetLanguages, {
    shouldRedetectSourceLanguage: ctx.shouldRedetectSourceLanguage,
  })
  const model = genAI.getGenerativeModel({
    model: config.model,
    systemInstruction: systemPrompt,
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema,
    },
  })

  const generateContentWithRetry = async () => {
    try {
      return await model.generateContent(userPrompt)
    } catch (error) {
      if (!isRetryableGeminiError(error)) throw error

      console.warn('[translate/finalize] provider_retry_scheduled', {
        ...buildTranslateFinalizeLogContext(ctx),
        provider: config.provider,
        model: config.model,
        retryInMs: TRANSLATE_TRANSIENT_RETRY_BACKOFF_MS,
        error: error instanceof Error ? error.message : String(error),
      })

      await sleep(TRANSLATE_TRANSIENT_RETRY_BACKOFF_MS)
      return await model.generateContent(userPrompt)
    }
  }

  const result = await generateContentWithRetry()
  const response = result.response as unknown as GeminiResponseLike
  const rawContent = response.text() || ''
  const content = rawContent.trim()
  const usageMetadata = response.usageMetadata
  const promptTokens = sanitizeNonNegativeInt(usageMetadata?.promptTokenCount)
  const completionTokens = sanitizeNonNegativeInt(usageMetadata?.candidatesTokenCount)
  const totalTokens = sanitizeNonNegativeInt(usageMetadata?.totalTokenCount)
  const candidateMeta = Array.isArray(response.candidates)
    ? response.candidates.map((candidate, index) => ({
      index,
      finishReason: candidate.finishReason ?? null,
      safetyRatings: candidate.safetyRatings ?? null,
    }))
    : []
  const responseLogPayload = {
    sourceLanguage: ctx.sourceLanguage,
    targetLanguages: ctx.targetLanguages,
    shouldRedetectSourceLanguage: ctx.shouldRedetectSourceLanguage,
    isFinal: ctx.isFinal,
    text: ctx.text,
    provider: config.provider,
    model: config.model,
    rawResponseLength: rawContent.length,
    rawResponse: rawContent,
    usage: {
      input_tokens: promptTokens,
      output_tokens: completionTokens,
      total_tokens: totalTokens,
    },
    promptFeedback: response.promptFeedback ?? null,
    candidates: candidateMeta,
  }

  logTranslateFinalizeInfo('gemini_response', responseLogPayload)
  if (process.env.NODE_ENV !== 'production' && ctx.shouldRedetectSourceLanguage) {
    console.info('[translate/finalize] gemini_response', responseLogPayload)
  }

  if (!content) {
    logTranslateFinalizeError('gemini_empty_text', {
      ...buildTranslateFinalizeLogContext(ctx),
      promptFeedback: response.promptFeedback ?? null,
      candidates: candidateMeta,
      usage: {
        input_tokens: promptTokens,
        output_tokens: completionTokens,
        total_tokens: totalTokens,
      },
    })
    return null
  }

  const translations = parseTranslations(content)
  const declaredSourceLanguage = ctx.shouldRedetectSourceLanguage
    ? parseDetectedSourceLanguage(content)
    : ''
  const sourceLanguagesMixed = ctx.shouldRedetectSourceLanguage
    ? parseSourceLanguagesMixed(content)
    : false
  const sourceTextHasForeignScript = ctx.shouldRedetectSourceLanguage
    ? parseSourceTextHasForeignScript(content)
    : false
  const echoDetectedSourceLanguage = ctx.shouldRedetectSourceLanguage
    ? inferDetectedSourceLanguageFromEcho(
      ctx.text,
      ctx.targetLanguages,
      translations,
    )
    : ''
  const detectedSourceLanguage = ctx.shouldRedetectSourceLanguage
    ? (declaredSourceLanguage || echoDetectedSourceLanguage)
    : ''

  if (Object.keys(translations).length === 0) {
    logTranslateFinalizeError('gemini_unparseable_json', {
      ...buildTranslateFinalizeLogContext(ctx),
      promptFeedback: response.promptFeedback ?? null,
      candidates: candidateMeta,
      responseTextLength: content.length,
      responseTextPreview: content.slice(0, 2000),
      usage: {
        input_tokens: promptTokens,
        output_tokens: completionTokens,
        total_tokens: totalTokens,
      },
    })
    return null
  }

  if (ctx.shouldRedetectSourceLanguage && !detectedSourceLanguage) {
    logTranslateFinalizeError('gemini_missing_source_language', {
      ...buildTranslateFinalizeLogContext(ctx),
      responseTextLength: content.length,
      responseTextPreview: content.slice(0, 2000),
      parsedLanguages: Object.keys(translations),
      declaredSourceLanguage: declaredSourceLanguage || null,
    })
    return null
  }

  logParsedTranslations('gemini_parsed_translations', {
    sourceLanguage: ctx.sourceLanguage,
    targetLanguages: ctx.targetLanguages,
    isFinal: ctx.isFinal,
    text: ctx.text,
    parsedLanguages: Object.keys(translations),
    translations,
    usage: {
      input_tokens: promptTokens,
      output_tokens: completionTokens,
      total_tokens: totalTokens,
    },
  })

  return {
    translations,
    ...(detectedSourceLanguage ? { sourceLanguage: detectedSourceLanguage } : {}),
    ...(ctx.shouldRedetectSourceLanguage ? { sourceLanguagesMixed } : {}),
    ...(ctx.shouldRedetectSourceLanguage ? { sourceTextHasForeignScript } : {}),
    provider: config.provider,
    infrastructureProvider: config.infrastructureProvider,
    model: config.model,
    usage: normalizeUsage({
      prompt: promptTokens,
      completion: completionTokens,
      total: totalTokens,
    }),
  }
}

function extractOpenAICompatibleText(responsePayload: OpenAICompatibleResponseLike): string {
  const content = responsePayload.choices?.[0]?.message?.content
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''

  return content
    .map((part) => {
      if (!part || typeof part !== 'object') return ''
      if ('text' in part && typeof part.text === 'string') return part.text
      if ('content' in part && typeof part.content === 'string') return part.content
      return ''
    })
    .filter(Boolean)
    .join('\n')
}

function buildOpenRouterQwenJsonSchemaResponseFormat(ctx: TranslateContext): Record<string, unknown> {
  const properties: Record<string, unknown> = {}
  const required: string[] = []

  if (ctx.shouldRedetectSourceLanguage) {
    properties.sourceLanguage = {
      type: 'string',
      description: 'Detected source language code.',
    }
    properties.sourceLanguagesMixed = {
      type: 'boolean',
      description: 'Whether the current utterance meaningfully mixes multiple source languages.',
    }
    properties.sourceTextHasForeignScript = {
      type: 'boolean',
      description: 'Whether the current utterance contains substantive foreign script for the detected source language.',
    }
    required.push('sourceLanguage', 'sourceLanguagesMixed', 'sourceTextHasForeignScript')
  }

  for (const language of ctx.targetLanguages) {
    properties[language] = {
      type: 'string',
      description: `Translated text for ${language}.`,
    }
    required.push(language)
  }

  return {
    type: 'json_schema',
    json_schema: {
      name: ctx.isFinal ? 'translate_finalize_response' : 'translate_interim_response',
      strict: true,
      schema: {
        type: 'object',
        properties,
        required,
        additionalProperties: false,
      },
    },
  }
}

async function createOpenAICompatibleCompletion(
  ctx: TranslateContext,
  config: OpenAICompatibleTranslationProviderConfig,
  systemPrompt: string,
  userPrompt: string,
): Promise<OpenAICompatibleResponseLike> {
  const payload: Record<string, unknown> = {
    model: config.model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0,
  }

  if (config.provider === 'qwen' && isOpenRouterBaseUrl(config.baseUrl)) {
    payload.response_format = buildOpenRouterQwenJsonSchemaResponseFormat(ctx)
    payload.reasoning = {
      effort: 'none',
      exclude: true,
    }
  }

  if (config.extraBody) {
    payload.extra_body = config.extraBody
  }

  const endpoint = `${config.baseUrl.replace(/\/$/, '')}/chat/completions`
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${config.apiKey}`,
  }

  if (isOpenRouterBaseUrl(config.baseUrl)) {
    const openRouterReferer = (process.env.OPENROUTER_HTTP_REFERER || process.env.NEXT_PUBLIC_SITE_URL || '').trim()
    const openRouterTitle = (process.env.OPENROUTER_X_TITLE || 'mingle-app').trim()
    if (openRouterReferer) {
      headers['HTTP-Referer'] = openRouterReferer
    }
    if (openRouterTitle) {
      headers['X-Title'] = openRouterTitle
    }
  }

  const executeRequest = async () => {
    const timeoutMs = resolveOpenAICompatibleRequestTimeoutMs(ctx.isFinal)
    const signal = typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
      ? AbortSignal.timeout(timeoutMs)
      : undefined
    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      cache: 'no-store',
      ...(signal ? { signal } : {}),
    })

    const rawText = await response.text()
    let parsedBody: OpenAICompatibleResponseLike | null = null
    try {
      parsedBody = JSON.parse(rawText) as OpenAICompatibleResponseLike
    } catch {
      parsedBody = null
    }

    const providerErrorMessage = typeof parsedBody?.error?.message === 'string'
      ? parsedBody.error.message.trim()
      : ''
    const providerErrorCode = parsedBody?.error?.code

    if (!response.ok) {
      const errorMessage = providerErrorMessage || rawText.trim() || `HTTP ${response.status}`
      throw new Error(`OpenAI-compatible provider error [${response.status}] ${errorMessage}`)
    }

    if (!parsedBody) {
      throw new Error('OpenAI-compatible provider returned non-JSON response.')
    }

    if (providerErrorMessage || typeof providerErrorCode !== 'undefined') {
      const normalizedProviderErrorCode = typeof providerErrorCode === 'string' || typeof providerErrorCode === 'number'
        ? String(providerErrorCode).trim()
        : ''
      const providerErrorLabel = normalizedProviderErrorCode ? ` [${normalizedProviderErrorCode}]` : ''
      throw new Error(`OpenAI-compatible provider error${providerErrorLabel} ${providerErrorMessage || 'Unknown provider error'}`)
    }

    return parsedBody
  }

  try {
    return await executeRequest()
  } catch (error) {
    if (!ctx.isFinal || !isRetryableOpenAICompatibleError(error)) throw error

    console.warn('[translate/finalize] provider_retry_scheduled', {
      ...buildTranslateFinalizeLogContext(ctx),
      provider: config.provider,
      model: config.model,
      retryInMs: TRANSLATE_TRANSIENT_RETRY_BACKOFF_MS,
      error: error instanceof Error ? error.message : String(error),
    })

    await sleep(TRANSLATE_TRANSIENT_RETRY_BACKOFF_MS)
    return await executeRequest()
  }
}

async function translateWithOpenAICompatible(
  ctx: TranslateContext,
  config: OpenAICompatibleTranslationProviderConfig,
): Promise<TranslationEngineResult | null> {
  const { systemPrompt, userPrompt } = buildPrompt(ctx)
  const promptLogPayload = {
    sourceLanguage: ctx.sourceLanguage,
    targetLanguages: ctx.targetLanguages,
    shouldRedetectSourceLanguage: ctx.shouldRedetectSourceLanguage,
    isFinal: ctx.isFinal,
    text: ctx.text,
    systemPrompt,
    userPrompt,
  }
  logTranslateFinalizeInfo('prompt', promptLogPayload)
  if (process.env.NODE_ENV !== 'production' && ctx.shouldRedetectSourceLanguage) {
    console.info('[translate/finalize] prompt', formatPromptConsoleLog(promptLogPayload))
  }

  const responsePayload = await createOpenAICompatibleCompletion(ctx, config, systemPrompt, userPrompt)
  const rawContent = extractOpenAICompatibleText(responsePayload) || ''
  const content = rawContent.trim()
  const promptTokens = sanitizeNonNegativeInt(responsePayload.usage?.prompt_tokens)
  const completionTokens = sanitizeNonNegativeInt(responsePayload.usage?.completion_tokens)
  const reasoningTokens = sanitizeNonNegativeInt(responsePayload.usage?.completion_tokens_details?.reasoning_tokens)
  const totalTokens = sanitizeNonNegativeInt(responsePayload.usage?.total_tokens)
  const responseLogPayload = {
    sourceLanguage: ctx.sourceLanguage,
    targetLanguages: ctx.targetLanguages,
    shouldRedetectSourceLanguage: ctx.shouldRedetectSourceLanguage,
    isFinal: ctx.isFinal,
    text: ctx.text,
    provider: config.provider,
    model: config.model,
    rawResponseLength: rawContent.length,
    rawResponse: rawContent,
    usage: {
      input_tokens: promptTokens,
      output_tokens: completionTokens,
      reasoning_tokens: reasoningTokens,
      total_tokens: totalTokens,
    },
    finishReason: responsePayload.choices?.[0]?.finish_reason ?? null,
  }

  logTranslateFinalizeInfo(`${config.provider}_response`, responseLogPayload)
  if (process.env.NODE_ENV !== 'production' && ctx.shouldRedetectSourceLanguage) {
    console.info(`[translate/finalize] ${config.provider}_response`, responseLogPayload)
  }

  if (!content) {
    logTranslateFinalizeError(`${config.provider}_empty_text`, {
      ...buildTranslateFinalizeLogContext(ctx),
      responsePreview: JSON.stringify(responsePayload).slice(0, 2000),
      usage: {
        input_tokens: promptTokens,
        output_tokens: completionTokens,
        reasoning_tokens: reasoningTokens,
        total_tokens: totalTokens,
      },
    })
    return null
  }

  const translations = parseTranslations(content)
  const declaredSourceLanguage = ctx.shouldRedetectSourceLanguage
    ? parseDetectedSourceLanguage(content)
    : ''
  const sourceLanguagesMixed = ctx.shouldRedetectSourceLanguage
    ? parseSourceLanguagesMixed(content)
    : false
  const sourceTextHasForeignScript = ctx.shouldRedetectSourceLanguage
    ? parseSourceTextHasForeignScript(content)
    : false
  const echoDetectedSourceLanguage = ctx.shouldRedetectSourceLanguage
    ? inferDetectedSourceLanguageFromEcho(
      ctx.text,
      ctx.targetLanguages,
      translations,
    )
    : ''
  const detectedSourceLanguage = ctx.shouldRedetectSourceLanguage
    ? (declaredSourceLanguage || echoDetectedSourceLanguage)
    : ''

  if (Object.keys(translations).length === 0) {
    logTranslateFinalizeError(`${config.provider}_unparseable_json`, {
      ...buildTranslateFinalizeLogContext(ctx),
      responseTextLength: content.length,
      responseTextPreview: content.slice(0, 2000),
      usage: {
        input_tokens: promptTokens,
        output_tokens: completionTokens,
        reasoning_tokens: reasoningTokens,
        total_tokens: totalTokens,
      },
    })
    return null
  }

  if (ctx.shouldRedetectSourceLanguage && !detectedSourceLanguage) {
    logTranslateFinalizeError(`${config.provider}_missing_source_language`, {
      ...buildTranslateFinalizeLogContext(ctx),
      responseTextLength: content.length,
      responseTextPreview: content.slice(0, 2000),
      parsedLanguages: Object.keys(translations),
      declaredSourceLanguage: declaredSourceLanguage || null,
    })
    return null
  }

  logParsedTranslations(`${config.provider}_parsed_translations`, {
    sourceLanguage: ctx.sourceLanguage,
    targetLanguages: ctx.targetLanguages,
    isFinal: ctx.isFinal,
    text: ctx.text,
    parsedLanguages: Object.keys(translations),
    translations,
    usage: {
      input_tokens: promptTokens,
      output_tokens: completionTokens,
      reasoning_tokens: reasoningTokens,
      total_tokens: totalTokens,
    },
  })

  return {
    translations,
    ...(detectedSourceLanguage ? { sourceLanguage: detectedSourceLanguage } : {}),
    ...(ctx.shouldRedetectSourceLanguage ? { sourceLanguagesMixed } : {}),
    ...(ctx.shouldRedetectSourceLanguage ? { sourceTextHasForeignScript } : {}),
    provider: config.provider,
    infrastructureProvider: config.infrastructureProvider,
    model: config.model,
    usage: normalizeUsage({
      prompt: promptTokens,
      completion: completionTokens,
      reasoning: reasoningTokens,
      total: totalTokens,
    }),
  }
}



async function synthesizeTtsInline(args: {
  text: string
  language: string
  requestedVoiceId?: string
}): Promise<{ audioBase64: string, audioMime: string, voiceId: string } | null> {
  if (!args.text.trim() || !args.language.trim()) return null
  const authHeader = getInworldAuthHeaderValue()
  if (!authHeader) return null

  const resolvedVoiceId = args.requestedVoiceId?.trim() || await resolveVoiceId(authHeader, args.language)
  try {
    const response = await fetch(`${INWORLD_API_BASE}/tts/v1/voice`, {
      method: 'POST',
      headers: {
        Authorization: authHeader,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text: args.text,
        voiceId: resolvedVoiceId,
        modelId: DEFAULT_TTS_MODEL_ID,
        audioConfig: {
          speakingRate: Number.isFinite(DEFAULT_TTS_SPEAKING_RATE) && DEFAULT_TTS_SPEAKING_RATE > 0
            ? DEFAULT_TTS_SPEAKING_RATE
            : 1.3,
        },
      }),
      cache: 'no-store',
    })

    if (!response.ok) return null
    const data = await response.json() as { audioContent?: string }
    const audioBuffer = decodeAudioContent(data.audioContent)
    if (!audioBuffer) return null

    return {
      audioBase64: audioBuffer.toString('base64'),
      audioMime: detectAudioMime(audioBuffer),
      voiceId: resolvedVoiceId,
    }
  } catch {
    return null
  }
}

export async function handleTranslateFinalizeV1(request: NextRequest) {
  const body = await request.json().catch((): Record<string, unknown> => ({}))
  const text = typeof body.text === 'string' ? body.text.trim() : ''
  const targetLanguagesRaw: unknown[] = Array.isArray(body.targetLanguages) ? body.targetLanguages : []
  const ttsPayload = (typeof body.tts === 'object' && body.tts !== null) ? body.tts as Record<string, unknown> : null
  const ttsLanguage = normalizeLang(typeof ttsPayload?.language === 'string' ? ttsPayload.language : '')
  const ttsVoiceId = typeof ttsPayload?.voiceId === 'string' ? ttsPayload.voiceId.trim() : ''
  const enableTts = ttsPayload?.enabled === true
  const isFinal = body.isFinal === true
  const currentTurnPreviousState = parseCurrentTurnPreviousState(body.currentTurnPreviousState)
  const clientBundleRev = typeof body.clientBundleRev === 'string' ? body.clientBundleRev.trim() : null
  const sessionKeyHint = typeof body.sessionKey === 'string' ? body.sessionKey.trim() : null
  const isLocalLiveTestRequest = request.headers.get('x-mingle-live-test') === '1'
  const allowTestFaults = process.env.NODE_ENV !== 'production' && isLocalLiveTestRequest
  const testFaultMode = allowTestFaults ? parseFinalizeTestFaultMode(body.__testFaultMode) : null
  const requestMeta: TranslateRequestMeta = {
    requestPathname: resolveRequestPathname(request),
    requestMethod: request.method,
    clientBundleRev,
    sessionKeyHint,
  }
  const shouldRedetectSourceLanguage = shouldRedetectSourceLanguageFromRequest({
    pathname: requestMeta.requestPathname,
    isFinal,
  })
  const sourceLanguageRaw = normalizeLang(typeof body.sourceLanguage === 'string' ? body.sourceLanguage : '')
  const sourceLanguage = sourceLanguageRaw || 'unknown'
  const selectedTranslationModel = await resolveSelectedTranslationModel(request, sessionKeyHint)
  const providerResolution = resolveTranslationProviderConfig(selectedTranslationModel)

  if (!providerResolution.ok) {
    logTranslateFinalizeError('provider_config_error', {
      path: requestMeta.requestPathname,
      method: requestMeta.requestMethod,
      clientBundleRev,
      sessionKeyHint,
      provider: resolveTranslationProvider(),
      error: providerResolution.details,
    })
    const response = NextResponse.json({
      error: providerResolution.error === 'missing_api_key'
        ? 'No translation API key configured'
        : providerResolution.error === 'unsupported_model'
          ? 'unsupported_translation_model'
          : 'translation_provider_misconfigured',
    }, { status: providerResolution.error === 'unsupported_model' ? 400 : 500 })
    ensureTrackingContext(request, response, { sessionKeyHint })
    return response
  }
  const providerConfig = providerResolution.config

  const targetLanguages = shouldRedetectSourceLanguage
    ? normalizeSelectedLanguages(targetLanguagesRaw)
    : normalizeTargetLanguages(targetLanguagesRaw, sourceLanguage)

  if (!text) {
    const response = NextResponse.json({ error: 'text is required' }, { status: 400 })
    ensureTrackingContext(request, response, { sessionKeyHint })
    return response
  }

  if (targetLanguages.length === 0) {
    const response = NextResponse.json({ translations: {} })
    ensureTrackingContext(request, response, { sessionKeyHint })
    return response
  }

  const immediatePreviousTurn = parseImmediatePreviousTurn(body.immediatePreviousTurn)
  const ctx: TranslateContext = {
    text,
    sourceLanguage,
    targetLanguages,
    shouldRedetectSourceLanguage,
    immediatePreviousTurn,
    currentTurnPreviousState,
    isFinal,
    requestMeta,
  }
  logTranslateFinalizeInfo('request', {
    sourceLanguage,
    targetLanguages,
    shouldRedetectSourceLanguage,
    isFinal,
    text,
    clientBundleRev,
    hasImmediatePreviousTurn: Boolean(immediatePreviousTurn),
    hasCurrentTurnPreviousState: Boolean(currentTurnPreviousState),
    currentTurnPreviousLanguages: Object.keys(currentTurnPreviousState?.translations || {}),
  })

  try {
    const fallbackTranslations = buildFallbackTranslationsFromCurrentTurnPreviousState(
      currentTurnPreviousState,
      targetLanguages,
    )
    const buildResponseWithOptionalTts = async (
      translations: Record<string, string>,
      meta: {
        provider: string
        infrastructureProvider: string
        model: string
        usage?: TranslationUsage
        sourceLanguage?: string
        sourceLanguagesMixed?: boolean
        sourceTextHasForeignScript?: boolean
        usedFallbackFromPreviousState?: boolean
      },
    ): Promise<NextResponse> => {
      const responsePayload: Record<string, unknown> = {
        translations,
        provider: meta.provider,
        infrastructureProvider: meta.infrastructureProvider,
        model: meta.model,
      }
      if (meta.sourceLanguage) {
        responsePayload.sourceLanguage = meta.sourceLanguage
      }
      if (typeof meta.sourceLanguagesMixed === 'boolean') {
        responsePayload.sourceLanguagesMixed = meta.sourceLanguagesMixed
      }
      if (typeof meta.sourceTextHasForeignScript === 'boolean') {
        responsePayload.sourceTextHasForeignScript = meta.sourceTextHasForeignScript
      }
      if (meta.usedFallbackFromPreviousState) {
        responsePayload.usedFallbackFromPreviousState = true
      }
      if (meta.usage?.promptTokens !== undefined) {
        responsePayload.translationPromptTokens = meta.usage.promptTokens
      }
      if (meta.usage?.completionTokens !== undefined) {
        responsePayload.translationCompletionTokens = meta.usage.completionTokens
      }
      if (meta.usage?.totalTokens !== undefined) {
        responsePayload.translationTotalTokens = meta.usage.totalTokens
      }

      if (enableTts && ttsLanguage && targetLanguages.includes(ttsLanguage)) {
        const ttsText = (translations[ttsLanguage] || '').trim()
        if (ttsText) {
          const ttsResult = await synthesizeTtsInline({
            text: ttsText,
            language: ttsLanguage,
            requestedVoiceId: ttsVoiceId,
          })

          if (ttsResult) {
            responsePayload.ttsLanguage = ttsLanguage
            responsePayload.ttsAudioBase64 = ttsResult.audioBase64
            responsePayload.ttsAudioMime = ttsResult.audioMime
            responsePayload.ttsVoiceId = ttsResult.voiceId
          }
        }
      }

      const response = NextResponse.json(responsePayload)
      ensureTrackingContext(request, response, { sessionKeyHint })
      return response
    }

    let selectedResult: TranslationEngineResult | null = null
    let providerRequestFailed = false
    try {
      if (testFaultMode === 'provider_empty') {
        selectedResult = null
      } else if (testFaultMode === 'target_miss') {
        selectedResult = {
          provider: providerConfig.provider,
          infrastructureProvider: providerConfig.infrastructureProvider,
          model: providerConfig.model,
          translations: {
            zz: 'forced_target_miss',
          },
        }
      } else if (testFaultMode === 'provider_error') {
        throw new Error('forced_provider_error_for_e2e')
      } else {
        selectedResult = providerConfig.infrastructureProvider === 'google' && isGoogleGenerativeProvider(providerConfig.provider)
          ? await translateWithGemini(ctx, providerConfig)
          : await translateWithOpenAICompatible(ctx, providerConfig)
      }
    } catch (error) {
      providerRequestFailed = true
      logTranslateFinalizeError('provider_error', {
        ...buildTranslateFinalizeLogContext(ctx),
        provider: providerConfig.provider,
        error: summarizeUnknownError(error),
      })
    }

    if (!selectedResult || Object.keys(selectedResult.translations).length === 0) {
      logTranslateFinalizeError('provider_empty_response', {
        ...buildTranslateFinalizeLogContext(ctx),
        provider: providerConfig.provider,
        reason: providerRequestFailed ? 'provider_error' : 'provider_empty_or_unparseable',
        responseStatus: 502,
      })
      if (!ctx.isFinal && Object.keys(fallbackTranslations).length > 0) {
        console.warn('[translate/finalize] fallback_from_current_turn_previous_state', {
          ...buildTranslateFinalizeLogContext(ctx),
          fallbackLanguages: Object.keys(fallbackTranslations),
          reason: providerRequestFailed ? 'provider_error' : 'provider_empty_response',
        })
        return await buildResponseWithOptionalTts(fallbackTranslations, {
          provider: providerConfig.provider,
          infrastructureProvider: providerConfig.infrastructureProvider,
          model: providerConfig.model,
          usedFallbackFromPreviousState: true,
        })
      }
      const response = NextResponse.json({ error: 'empty_translation_response' }, { status: 502 })
      ensureTrackingContext(request, response, { sessionKeyHint })
      return response
    }

    logTranslateFinalizeInfo('response_usage', {
      provider: selectedResult.provider,
      model: selectedResult.model,
      sourceLanguage,
      detectedSourceLanguage: selectedResult.sourceLanguage || null,
      sourceLanguagesMixed: selectedResult.sourceLanguagesMixed ?? null,
      sourceTextHasForeignScript: selectedResult.sourceTextHasForeignScript ?? null,
      targetLanguages,
      isFinal,
      inputTokens: selectedResult.usage?.promptTokens ?? 'unknown',
      outputTokens: selectedResult.usage?.completionTokens ?? 'unknown',
      totalTokens: selectedResult.usage?.totalTokens ?? 'unknown',
    })

    const translations: Record<string, string> = {}
    for (const lang of targetLanguages) {
      if (selectedResult.translations[lang]) {
        translations[lang] = selectedResult.translations[lang]
      }
    }

    const missingTargetLanguages = targetLanguages.filter((lang) => !translations[lang])
    if (missingTargetLanguages.length > 0) {
      console.warn('[translate/finalize] missing_target_languages', {
        ...buildTranslateFinalizeLogContext(ctx),
        provider: selectedResult.provider,
        missingTargetLanguages,
        returnedLanguages: Object.keys(selectedResult.translations),
      })
    }

    if (Object.keys(translations).length === 0) {
      logTranslateFinalizeError('target_language_miss', {
        ...buildTranslateFinalizeLogContext(ctx),
        provider: selectedResult.provider,
        returnedLanguages: Object.keys(selectedResult.translations),
        rawTranslations: selectedResult.translations,
        responseStatus: 502,
      })
      if (!ctx.isFinal && Object.keys(fallbackTranslations).length > 0) {
        console.warn('[translate/finalize] fallback_from_current_turn_previous_state', {
          ...buildTranslateFinalizeLogContext(ctx),
          fallbackLanguages: Object.keys(fallbackTranslations),
          reason: 'target_language_miss',
        })
        return await buildResponseWithOptionalTts(fallbackTranslations, {
          provider: selectedResult.provider,
          infrastructureProvider: selectedResult.infrastructureProvider,
          model: selectedResult.model,
          usage: selectedResult.usage,
          usedFallbackFromPreviousState: true,
        })
      }
      const response = NextResponse.json({ error: 'empty_translation_response' }, { status: 502 })
      ensureTrackingContext(request, response, { sessionKeyHint })
      return response
    }

    return await buildResponseWithOptionalTts(translations, {
      provider: selectedResult.provider,
      infrastructureProvider: selectedResult.infrastructureProvider,
      model: selectedResult.model,
      usage: selectedResult.usage,
      sourceLanguage: selectedResult.sourceLanguage,
      sourceLanguagesMixed: selectedResult.sourceLanguagesMixed,
      sourceTextHasForeignScript: selectedResult.sourceTextHasForeignScript,
    })
  } catch (error) {
    logTranslateFinalizeError('unexpected_handler_error', {
      ...buildTranslateFinalizeLogContext(ctx),
      error: summarizeUnknownError(error),
      responseStatus: 500,
    })
    const response = NextResponse.json({ error: 'finalize_translation_failed' }, { status: 500 })
    ensureTrackingContext(request, response, { sessionKeyHint })
    return response
  }
}
