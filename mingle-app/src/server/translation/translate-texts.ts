/**
 * Pure translation engine — no NextRequest, NextResponse, next-auth, or prisma.
 *
 * Extracts provider calling logic from translate-finalize-handler.ts so that
 * both the conversation-translation HTTP handler and the post-translation
 * service can share the same retry / rate-limit / prompt machinery.
 */

import { GoogleGenerativeAI, SchemaType, type ResponseSchema } from '@google/generative-ai'
import { getTranslationLanguageName } from '@/lib/translation-languages'
import {
  resolveTranslationRuntimeSelection,
  type TranslationInfrastructureProvider,
  type UserSelectableTranslationModel,
} from '@/lib/translation-models'
import {
  isBlankTranslationJson,
  normalizeLang,
  parseDetectedSourceLanguage,
  parseSourceLanguagesMixed,
  parseSourceTextHasForeignScript,
  parseTranslations,
  type RecentTurnContext,
} from '@/app/api/translate/finalize/utils'
import { sanitizeNonNegativeInt } from '@/lib/app-analytics'

// ─── Constants ───────────────────────────────────────────────────────────────

const DEFAULT_GEMINI_MODEL = 'gemini-2.5-flash-lite'
const DEFAULT_GEMMA_MODEL = 'gemma-4-31b-it'
const DEFAULT_QWEN_MODEL = 'Qwen/Qwen3.5-9B'
const DEFAULT_DASHSCOPE_QWEN_MODEL = 'Qwen3.5-9B'
const TRANSLATE_TRANSIENT_RETRY_BACKOFF_MS = 250
const MAX_AUTOMATIC_PROVIDER_RETRY_DELAY_MS = 2_000
const OPENAI_COMPATIBLE_INTERIM_TIMEOUT_MS = 4_000
const OPENAI_COMPATIBLE_FINAL_TIMEOUT_MS = 5_000
const IMMEDIATE_PREVIOUS_TURN_MAX_AGE_MS = 5_000
const ENABLE_VERBOSE_TRANSLATE_LOGS = process.env.MINGLE_VERBOSE_TRANSLATE_LOGS === '1'
const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1'
const TOGETHER_BASE_URL = 'https://api.together.xyz/v1'
const DASHSCOPE_BASE_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1'
const OPENAI_API_BASE_URL = 'https://api.openai.com/v1'

// ─── Public types ────────────────────────────────────────────────────────────

export type TranslationProvider = 'gemini' | 'gemma' | 'qwen' | 'openai' | 'openai-compatible'

export type TranslationUsage = {
  promptTokens?: number
  completionTokens?: number
  reasoningTokens?: number
  totalTokens?: number
}

export type TranslationEngineResult = {
  translations: Record<string, string>
  emptyReason?: 'blank_translations'
  sourceLanguage?: string
  sourceLanguagesMixed?: boolean
  sourceTextHasForeignScript?: boolean
  provider: TranslationProvider
  infrastructureProvider: TranslationInfrastructureProvider | string
  model: string
  usage?: TranslationUsage
}

export type GeminiTranslationProviderConfig = {
  provider: 'gemini' | 'gemma'
  infrastructureProvider: TranslationInfrastructureProvider | string
  model: string
  apiKey: string
}

export type OpenAICompatibleTranslationProviderConfig = {
  provider: 'qwen' | 'openai' | 'openai-compatible'
  infrastructureProvider: TranslationInfrastructureProvider | string
  model: string
  apiKey: string
  baseUrl: string
  extraBody: Record<string, unknown> | null
}

export type TranslationProviderConfig = GeminiTranslationProviderConfig | OpenAICompatibleTranslationProviderConfig

export type TranslationProviderResolution = {
  ok: true
  config: TranslationProviderConfig
} | {
  ok: false
  error: 'missing_api_key' | 'provider_misconfigured' | 'unsupported_model'
  details: string
}

export type TranslateTextsInput = {
  text: string
  sourceLanguage: string
  targetLanguages: string[]
  modelSelection?: UserSelectableTranslationModel | null
  redetectSourceLanguage?: boolean
  isFinal?: boolean
  immediatePreviousTurn?: RecentTurnContext | null
  /** Optional system prompt override for post/comment translations */
  systemPromptOverride?: string
  /** Optional user prompt override */
  userPromptOverride?: string
}

export type TranslateTextsResult = {
  translations: Record<string, string>
  detectedSourceLanguage?: string
  sourceLanguagesMixed?: boolean
  sourceTextHasForeignScript?: boolean
  usage?: TranslationUsage
  provider: string
  model: string
  emptyReason?: 'blank_translations'
}

type ProviderRateLimitCooldown = {
  retryUntilMs: number
}

export type TranslateContext = {
  text: string
  sourceLanguage: string
  targetLanguages: string[]
  provider: TranslationProvider
  shouldRedetectSourceLanguage: boolean
  immediatePreviousTurn: RecentTurnContext | null
  isFinal: boolean
  systemPromptOverride?: string
  userPromptOverride?: string
}

type GeminiUsageMetadata = {
  promptTokenCount?: unknown
  candidatesTokenCount?: unknown
  totalTokenCount?: unknown
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

// ─── Module-level provider rate-limit cooldowns ──────────────────────────────

export const providerRateLimitCooldowns = new Map<string, ProviderRateLimitCooldown>()

// ─── Internal helpers ────────────────────────────────────────────────────────

function readTranslateEnv(name: string): string {
  const direct = process.env[name]
  if (typeof direct === 'string') return direct
  const legacyName = `DEMO_${name}`
  return process.env[legacyName] || ''
}

function sleep(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

// ─── Provider identification helpers ─────────────────────────────────────────

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

function isOpenAIBaseUrl(baseUrl: string): boolean {
  return baseUrl.toLowerCase().includes('api.openai.com')
}

function resolveOpenAICompatibleInfrastructureProvider(baseUrl: string): string {
  if (isOpenRouterBaseUrl(baseUrl)) return 'openrouter'
  if (isTogetherBaseUrl(baseUrl)) return 'together'
  if (isDashScopeBaseUrl(baseUrl)) return 'dashscope'
  if (isOpenAIBaseUrl(baseUrl)) return 'openai'
  return 'openai-compatible'
}

// ─── Provider resolution ─────────────────────────────────────────────────────

export function normalizeTranslationProvider(value: string): TranslationProvider | null {
  const normalized = value.trim().toLowerCase()
  if (!normalized) return null
  if (normalized === 'gemini') return normalized
  if (normalized === 'gemma') return normalized
  if (normalized === 'qwen') return normalized
  if (normalized === 'openai') return normalized
  if (normalized === 'openai-compatible') return normalized
  if (normalized === 'openai_compatible') return 'openai-compatible'
  return null
}

export function isGoogleGenerativeProvider(provider: TranslationProvider): provider is 'gemini' | 'gemma' {
  return provider === 'gemini' || provider === 'gemma'
}

export function isGoogleGenerativeProviderConfig(
  config: TranslationProviderConfig,
): config is GeminiTranslationProviderConfig {
  return config.infrastructureProvider === 'google' && isGoogleGenerativeProvider(config.provider)
}

export function shouldUsePreviousStateFallback(provider: TranslationProvider): boolean {
  return provider !== 'gemma'
}

function resolveTranslationProvider(): TranslationProvider {
  return normalizeTranslationProvider(readTranslateEnv('TRANSLATE_PROVIDER')) || 'gemini'
}

function resolveOpenAICompatibleBaseUrl(provider: TranslationProvider): string {
  const explicitBaseUrl = readTranslateEnv('TRANSLATE_BASE_URL').trim()
  if (explicitBaseUrl) return explicitBaseUrl
  if (provider === 'openai') return (process.env.OPENAI_BASE_URL || OPENAI_API_BASE_URL).trim()
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
  if (config.provider === 'openai') return 'gpt-6-luna'
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

function buildDefaultOpenAICompatibleExtraBody(provider: 'qwen' | 'openai' | 'openai-compatible', baseUrl: string): Record<string, unknown> | null {
  if (provider !== 'qwen') return null
  if (isDashScopeBaseUrl(baseUrl)) return { enable_thinking: false }
  if (isOpenRouterBaseUrl(baseUrl)) return null
  return { chat_template_kwargs: { enable_thinking: false } }
}

export function resolveTranslationProviderConfig(requestedModelRaw?: unknown): TranslationProviderResolution {
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
        return { ok: false, error: 'missing_api_key', details: 'GEMINI_API_KEY is missing.' }
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

    if (
      requestedModelSelection.infrastructureProvider === 'openai'
      || requestedModelSelection.engineProvider === 'openai'
    ) {
      const baseUrl = requestedModelSelection.baseUrl || (process.env.OPENAI_BASE_URL || '').trim() || OPENAI_API_BASE_URL
      const apiKey = (process.env.OPENAI_API_KEY || '').trim()
      if (!apiKey) {
        return { ok: false, error: 'missing_api_key', details: 'OPENAI_API_KEY is missing.' }
      }
      return {
        ok: true,
        config: {
          provider: 'openai',
          infrastructureProvider: requestedModelSelection.infrastructureProvider,
          model: requestedModelSelection.runtimeModel,
          apiKey,
          baseUrl,
          extraBody: null,
        },
      }
    }

    const baseUrl = requestedModelSelection.baseUrl || OPENROUTER_BASE_URL
    const apiKey = resolveOpenAICompatibleApiKey(baseUrl)
    if (!apiKey) {
      return { ok: false, error: 'missing_api_key', details: 'No API key was found for the configured OpenAI-compatible translation provider.' }
    }

    const parsedExtraBody = parseJsonObjectEnv('TRANSLATE_EXTRA_BODY')
    if (parsedExtraBody.error) {
      return { ok: false, error: 'provider_misconfigured', details: parsedExtraBody.error }
    }

    const defaultExtraBody = buildDefaultOpenAICompatibleExtraBody('qwen', baseUrl)
    const extraBody = defaultExtraBody || parsedExtraBody.value
      ? { ...(defaultExtraBody || {}), ...(parsedExtraBody.value || {}) }
      : null

    return {
      ok: true,
      config: {
        provider: 'qwen',
        infrastructureProvider: requestedModelSelection.infrastructureProvider,
        model: requestedModelSelection.runtimeModel,
        apiKey,
        baseUrl,
        extraBody,
      },
    }
  }

  // Fallback: environment-based provider selection
  const provider = resolveTranslationProvider()

  if (isGoogleGenerativeProvider(provider)) {
    const apiKey = (process.env.GEMINI_API_KEY || '').trim()
    if (!apiKey) {
      return { ok: false, error: 'missing_api_key', details: 'GEMINI_API_KEY is missing.' }
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

  if (provider === 'openai') {
    const baseUrl = (process.env.OPENAI_BASE_URL || '').trim() || OPENAI_API_BASE_URL
    const apiKey = (process.env.OPENAI_API_KEY || '').trim()
    if (!apiKey) {
      return { ok: false, error: 'missing_api_key', details: 'OPENAI_API_KEY is missing.' }
    }
    return {
      ok: true,
      config: {
        provider: 'openai',
        infrastructureProvider: 'openai',
        model: resolveTranslationModel({ provider, baseUrl }),
        apiKey,
        baseUrl,
        extraBody: null,
      },
    }
  }

  const baseUrl = resolveOpenAICompatibleBaseUrl(provider)
  if (!baseUrl) {
    return { ok: false, error: 'provider_misconfigured', details: 'TRANSLATE_BASE_URL is missing for the configured translation provider.' }
  }

  const apiKey = resolveOpenAICompatibleApiKey(baseUrl)
  if (!apiKey) {
    return { ok: false, error: 'missing_api_key', details: 'No API key was found for the configured OpenAI-compatible translation provider.' }
  }

  const parsedExtraBody = parseJsonObjectEnv('TRANSLATE_EXTRA_BODY')
  if (parsedExtraBody.error) {
    return { ok: false, error: 'provider_misconfigured', details: parsedExtraBody.error }
  }

  const defaultExtraBody = buildDefaultOpenAICompatibleExtraBody(provider, baseUrl)
  const extraBody = defaultExtraBody || parsedExtraBody.value
    ? { ...(defaultExtraBody || {}), ...(parsedExtraBody.value || {}) }
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

// ─── Logging helpers ─────────────────────────────────────────────────────────

function isGeminiTranslationLog(_event: string, payload: Record<string, unknown>): boolean {
  return payload.provider === 'gemini'
}

function logInfo(event: string, payload: Record<string, unknown>) {
  if (!ENABLE_VERBOSE_TRANSLATE_LOGS || isGeminiTranslationLog(event, payload)) return
  console.info(`[translate/finalize] ${event}`, payload)
}

function logWarning(event: string, payload: Record<string, unknown>) {
  if (isGeminiTranslationLog(event, payload)) return
  console.warn(`[translate/finalize] ${event}`, payload)
}

function logError(event: string, payload: Record<string, unknown>) {
  if (isGeminiTranslationLog(event, payload)) return
  console.error(`[translate/finalize] ${event} ${JSON.stringify(payload)}`)
}

function summarizeUnknownError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return { name: error.name, message: error.message, stack: error.stack }
  }
  return { raw: String(error) }
}

function buildLogContext(ctx: TranslateContext): Record<string, unknown> {
  return {
    provider: ctx.provider,
    sourceLanguage: ctx.sourceLanguage,
    targetLanguages: ctx.targetLanguages,
    shouldRedetectSourceLanguage: ctx.shouldRedetectSourceLanguage,
    isFinal: ctx.isFinal,
    textPreview: ctx.text.slice(0, 120),
  }
}

// ─── Retry / rate-limit helpers ──────────────────────────────────────────────

function extractRetryDelayMsFromError(error: unknown): number | null {
  if (!(error instanceof Error)) return null
  const quotedMatch = error.message.match(/retryDelay":"(\d+)s"/i)
  if (quotedMatch) {
    const seconds = Number.parseInt(quotedMatch[1] || '', 10)
    if (Number.isFinite(seconds) && seconds > 0) return seconds * 1_000
  }
  const naturalMatch = error.message.match(/please retry in\s+([0-9.]+)s/i)
  if (naturalMatch) {
    const seconds = Number.parseFloat(naturalMatch[1] || '')
    if (Number.isFinite(seconds) && seconds > 0) return Math.ceil(seconds * 1_000)
  }
  return null
}

function resolveProviderRetryDelayMs(error: unknown): number {
  return extractRetryDelayMsFromError(error) ?? TRANSLATE_TRANSIENT_RETRY_BACKOFF_MS
}

function isRateLimitProviderError(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  const msg = error.message.toLowerCase()
  return (
    /\[429\b/.test(error.message) ||
    msg.includes('too many requests') ||
    msg.includes('rate limit') ||
    msg.includes('quota exceeded')
  )
}

function shouldRetryProviderError(error: unknown): boolean {
  const parsedDelay = extractRetryDelayMsFromError(error)
  if (parsedDelay === null && isRateLimitProviderError(error)) return false
  const retryDelay = resolveProviderRetryDelayMs(error)
  return retryDelay <= MAX_AUTOMATIC_PROVIDER_RETRY_DELAY_MS
}

function isRetryableGeminiError(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  const msg = error.message.toLowerCase()
  return (
    /\[(429|500|502|503|504)\b/.test(error.message) ||
    msg.includes('service unavailable') ||
    msg.includes('high demand') ||
    msg.includes('temporar') ||
    msg.includes('try again later') ||
    msg.includes('fetch failed') ||
    msg.includes('network') ||
    msg.includes('timed out') ||
    msg.includes('timeout')
  )
}

function isRetryableOpenAICompatibleError(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  const msg = error.message.toLowerCase()
  return (
    /\b(429|500|502|503|504)\b/.test(error.message) ||
    msg.includes('service unavailable') ||
    msg.includes('temporar') ||
    msg.includes('try again later') ||
    msg.includes('fetch failed') ||
    msg.includes('network') ||
    msg.includes('timed out') ||
    msg.includes('timeout') ||
    msg.includes('aborted') ||
    msg.includes('aborterror') ||
    msg.includes('rate limit')
  )
}

function buildProviderRateLimitCooldownKey(config: Pick<TranslationProviderConfig, 'provider' | 'infrastructureProvider' | 'model'>): string {
  return `${config.infrastructureProvider}:${config.provider}:${config.model}`.toLowerCase()
}

export function resolveActiveProviderRateLimitCooldownMs(
  config: Pick<TranslationProviderConfig, 'provider' | 'infrastructureProvider' | 'model'>,
): number | null {
  const key = buildProviderRateLimitCooldownKey(config)
  const cooldown = providerRateLimitCooldowns.get(key)
  if (!cooldown) return null
  const remaining = cooldown.retryUntilMs - Date.now()
  if (remaining > 0) return remaining
  providerRateLimitCooldowns.delete(key)
  return null
}

export function rememberProviderRateLimitCooldown(
  config: Pick<TranslationProviderConfig, 'provider' | 'infrastructureProvider' | 'model'>,
  error: unknown,
): number | null {
  if (!isRateLimitProviderError(error)) return null
  const retryDelayMs = extractRetryDelayMsFromError(error)
  if (retryDelayMs === null || retryDelayMs <= MAX_AUTOMATIC_PROVIDER_RETRY_DELAY_MS) return null
  providerRateLimitCooldowns.set(buildProviderRateLimitCooldownKey(config), {
    retryUntilMs: Date.now() + retryDelayMs,
  })
  return retryDelayMs
}

// ─── Prompt building ─────────────────────────────────────────────────────────

function selectPromptImmediatePreviousTurn(turn: RecentTurnContext | null): RecentTurnContext | null {
  if (!turn) return null
  if (typeof turn.ageMs !== 'number') return null
  if (turn.ageMs > IMMEDIATE_PREVIOUS_TURN_MAX_AGE_MS) return null
  return turn
}

function formatSingleTurnForPromptWithOptions(
  label: string,
  turn: RecentTurnContext,
  options: { includeSourceLanguage: boolean },
): string {
  const ageSuffix = typeof turn.ageMs === 'number' ? ` (~${Math.round(turn.ageMs / 1000)}s ago)` : ''
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

export function buildPrompt(ctx: TranslateContext): { systemPrompt: string, userPrompt: string } {
  if (ctx.systemPromptOverride && ctx.userPromptOverride) {
    return { systemPrompt: ctx.systemPromptOverride, userPrompt: ctx.userPromptOverride }
  }

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
    userPromptLines.push('', 'If is_final=no, avoid over-completing unfinished thoughts.')
  }

  return {
    systemPrompt: ctx.systemPromptOverride || (ctx.shouldRedetectSourceLanguage
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
      ].join('\n')),
    userPrompt: ctx.userPromptOverride || userPromptLines.join('\n'),
  }
}

// ─── Gemini response schema ─────────────────────────────────────────────────

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

  return { type: SchemaType.OBJECT, properties, required }
}

// ─── Token normalization ────────────────────────────────────────────────────

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

// ─── Echo detection for source language ──────────────────────────────────────

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

// ─── Gemini provider ─────────────────────────────────────────────────────────

export async function translateWithGemini(
  ctx: TranslateContext,
  config: GeminiTranslationProviderConfig,
): Promise<TranslationEngineResult | null> {
  const genAI = new GoogleGenerativeAI(config.apiKey)
  const { systemPrompt, userPrompt } = buildPrompt(ctx)
  logInfo('prompt', {
    provider: config.provider,
    sourceLanguage: ctx.sourceLanguage,
    targetLanguages: ctx.targetLanguages,
    shouldRedetectSourceLanguage: ctx.shouldRedetectSourceLanguage,
    isFinal: ctx.isFinal,
    text: ctx.text,
    systemPrompt,
    userPrompt,
  })

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
      const retryInMs = resolveProviderRetryDelayMs(error)
      if (!shouldRetryProviderError(error)) {
        logWarning('provider_retry_skipped', {
          ...buildLogContext(ctx),
          provider: config.provider,
          model: config.model,
          retryInMs,
          error: error instanceof Error ? error.message : String(error),
        })
        throw error
      }
      logWarning('provider_retry_scheduled', {
        ...buildLogContext(ctx),
        provider: config.provider,
        model: config.model,
        retryInMs,
        error: error instanceof Error ? error.message : String(error),
      })
      await sleep(retryInMs)
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

  if (!content) {
    logError('gemini_empty_text', { ...buildLogContext(ctx) })
    return null
  }

  const translations = parseTranslations(content)
  const declaredSourceLanguage = ctx.shouldRedetectSourceLanguage ? parseDetectedSourceLanguage(content) : ''
  const sourceLanguagesMixed = ctx.shouldRedetectSourceLanguage ? parseSourceLanguagesMixed(content) : false
  const sourceTextHasForeignScript = ctx.shouldRedetectSourceLanguage ? parseSourceTextHasForeignScript(content) : false
  const echoDetectedSourceLanguage = ctx.shouldRedetectSourceLanguage
    ? inferDetectedSourceLanguageFromEcho(ctx.text, ctx.targetLanguages, translations)
    : ''
  const detectedSourceLanguage = ctx.shouldRedetectSourceLanguage
    ? (declaredSourceLanguage || echoDetectedSourceLanguage)
    : ''

  if (Object.keys(translations).length === 0) {
    const isBlank = isBlankTranslationJson(content, ctx.targetLanguages)
    if (isBlank && !ctx.isFinal) {
      return {
        provider: config.provider,
        infrastructureProvider: config.infrastructureProvider,
        model: config.model,
        translations: {},
        emptyReason: 'blank_translations',
        usage: normalizeUsage({ prompt: promptTokens, completion: completionTokens, total: totalTokens }),
      }
    }
    return null
  }

  if (ctx.shouldRedetectSourceLanguage && !detectedSourceLanguage) {
    logError('gemini_missing_source_language', { ...buildLogContext(ctx) })
    return null
  }

  return {
    translations,
    ...(detectedSourceLanguage ? { sourceLanguage: detectedSourceLanguage } : {}),
    ...(ctx.shouldRedetectSourceLanguage ? { sourceLanguagesMixed } : {}),
    ...(ctx.shouldRedetectSourceLanguage ? { sourceTextHasForeignScript } : {}),
    provider: config.provider,
    infrastructureProvider: config.infrastructureProvider,
    model: config.model,
    usage: normalizeUsage({ prompt: promptTokens, completion: completionTokens, total: totalTokens }),
  }
}

// ─── OpenAI-compatible provider ──────────────────────────────────────────────

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
    properties.sourceLanguage = { type: 'string', description: 'Detected source language code.' }
    properties.sourceLanguagesMixed = { type: 'boolean', description: 'Whether the current utterance meaningfully mixes multiple source languages.' }
    properties.sourceTextHasForeignScript = { type: 'boolean', description: 'Whether the current utterance contains substantive foreign script for the detected source language.' }
    required.push('sourceLanguage', 'sourceLanguagesMixed', 'sourceTextHasForeignScript')
  }
  for (const language of ctx.targetLanguages) {
    properties[language] = { type: 'string', description: `Translated text for ${language}.` }
    required.push(language)
  }
  return {
    type: 'json_schema',
    json_schema: {
      name: ctx.isFinal ? 'translate_finalize_response' : 'translate_interim_response',
      strict: true,
      schema: { type: 'object', properties, required, additionalProperties: false },
    },
  }
}

function resolveOpenAICompatibleRequestTimeoutMs(isFinal: boolean): number {
  return isFinal ? OPENAI_COMPATIBLE_FINAL_TIMEOUT_MS : OPENAI_COMPATIBLE_INTERIM_TIMEOUT_MS
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
    payload.reasoning = { effort: 'none', exclude: true }
  }

  if (config.provider === 'openai') {
    payload.response_format = buildOpenRouterQwenJsonSchemaResponseFormat(ctx)
    payload.reasoning_effort = 'none'
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
    if (openRouterReferer) headers['HTTP-Referer'] = openRouterReferer
    if (openRouterTitle) headers['X-Title'] = openRouterTitle
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
      throw new Error(`OpenAI-compatible provider error [${response.status}] ${providerErrorMessage || rawText.trim() || `HTTP ${response.status}`}`)
    }

    if (!parsedBody) {
      throw new Error('OpenAI-compatible provider returned non-JSON response.')
    }

    if (providerErrorMessage || typeof providerErrorCode !== 'undefined') {
      const code = typeof providerErrorCode === 'string' || typeof providerErrorCode === 'number'
        ? String(providerErrorCode).trim()
        : ''
      throw new Error(`OpenAI-compatible provider error${code ? ` [${code}]` : ''} ${providerErrorMessage || 'Unknown provider error'}`)
    }

    return parsedBody
  }

  try {
    return await executeRequest()
  } catch (error) {
    if (!ctx.isFinal || !isRetryableOpenAICompatibleError(error)) throw error
    const retryInMs = resolveProviderRetryDelayMs(error)
    if (!shouldRetryProviderError(error)) {
      logWarning('provider_retry_skipped', {
        ...buildLogContext(ctx),
        provider: config.provider,
        model: config.model,
        retryInMs,
        error: error instanceof Error ? error.message : String(error),
      })
      throw error
    }
    logWarning('provider_retry_scheduled', {
      ...buildLogContext(ctx),
      provider: config.provider,
      model: config.model,
      retryInMs,
      error: error instanceof Error ? error.message : String(error),
    })
    await sleep(retryInMs)
    return await executeRequest()
  }
}

export async function translateWithOpenAICompatible(
  ctx: TranslateContext,
  config: OpenAICompatibleTranslationProviderConfig,
): Promise<TranslationEngineResult | null> {
  const { systemPrompt, userPrompt } = buildPrompt(ctx)
  logInfo('prompt', {
    provider: config.provider,
    sourceLanguage: ctx.sourceLanguage,
    targetLanguages: ctx.targetLanguages,
    shouldRedetectSourceLanguage: ctx.shouldRedetectSourceLanguage,
    isFinal: ctx.isFinal,
    text: ctx.text,
    systemPrompt,
    userPrompt,
  })

  const responsePayload = await createOpenAICompatibleCompletion(ctx, config, systemPrompt, userPrompt)
  const rawContent = extractOpenAICompatibleText(responsePayload) || ''
  const content = rawContent.trim()
  const promptTokens = sanitizeNonNegativeInt(responsePayload.usage?.prompt_tokens)
  const completionTokens = sanitizeNonNegativeInt(responsePayload.usage?.completion_tokens)
  const reasoningTokens = sanitizeNonNegativeInt(responsePayload.usage?.completion_tokens_details?.reasoning_tokens)
  const totalTokens = sanitizeNonNegativeInt(responsePayload.usage?.total_tokens)

  if (!content) {
    logError(`${config.provider}_empty_text`, { ...buildLogContext(ctx) })
    return null
  }

  const translations = parseTranslations(content)
  const declaredSourceLanguage = ctx.shouldRedetectSourceLanguage ? parseDetectedSourceLanguage(content) : ''
  const sourceLanguagesMixed = ctx.shouldRedetectSourceLanguage ? parseSourceLanguagesMixed(content) : false
  const sourceTextHasForeignScript = ctx.shouldRedetectSourceLanguage ? parseSourceTextHasForeignScript(content) : false
  const echoDetectedSourceLanguage = ctx.shouldRedetectSourceLanguage
    ? inferDetectedSourceLanguageFromEcho(ctx.text, ctx.targetLanguages, translations)
    : ''
  const detectedSourceLanguage = ctx.shouldRedetectSourceLanguage
    ? (declaredSourceLanguage || echoDetectedSourceLanguage)
    : ''

  if (Object.keys(translations).length === 0) {
    logError(`${config.provider}_unparseable_json`, { ...buildLogContext(ctx) })
    return null
  }

  if (ctx.shouldRedetectSourceLanguage && !detectedSourceLanguage) {
    logError(`${config.provider}_missing_source_language`, { ...buildLogContext(ctx) })
    return null
  }

  return {
    translations,
    ...(detectedSourceLanguage ? { sourceLanguage: detectedSourceLanguage } : {}),
    ...(ctx.shouldRedetectSourceLanguage ? { sourceLanguagesMixed } : {}),
    ...(ctx.shouldRedetectSourceLanguage ? { sourceTextHasForeignScript } : {}),
    provider: config.provider,
    infrastructureProvider: config.infrastructureProvider,
    model: config.model,
    usage: normalizeUsage({ prompt: promptTokens, completion: completionTokens, reasoning: reasoningTokens, total: totalTokens }),
  }
}

// ─── Dispatch to correct provider ────────────────────────────────────────────

export async function requestTranslationFromProvider(
  ctx: TranslateContext,
  config: TranslationProviderConfig,
): Promise<TranslationEngineResult | null> {
  if (isGoogleGenerativeProviderConfig(config)) {
    return await translateWithGemini(ctx, config)
  }
  return await translateWithOpenAICompatible(ctx, config)
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Pure translation function. No NextRequest / NextResponse / next-auth / prisma.
 * Resolves the provider config, calls the LLM, and returns structured results.
 */
export async function translateTexts(input: TranslateTextsInput): Promise<TranslateTextsResult> {
  const providerResolution = resolveTranslationProviderConfig(input.modelSelection)
  if (!providerResolution.ok) {
    throw new Error(`Translation provider error: ${providerResolution.details}`)
  }

  const providerConfig = providerResolution.config
  const sourceLanguage = normalizeLang(input.sourceLanguage) || 'unknown'
  const targetLanguages = input.targetLanguages.filter(Boolean)
  const shouldRedetectSourceLanguage = input.redetectSourceLanguage ?? false
  const isFinal = input.isFinal ?? true

  if (targetLanguages.length === 0) {
    return {
      translations: {},
      provider: providerConfig.provider,
      model: providerConfig.model,
    }
  }

  // Check rate limit cooldown
  const cooldownMs = resolveActiveProviderRateLimitCooldownMs(providerConfig)
  if (cooldownMs !== null) {
    logWarning('provider_rate_limit_cooldown_active', {
      provider: providerConfig.provider,
      model: providerConfig.model,
      retryInMs: cooldownMs,
    })
    throw new Error(`Provider rate-limited. Retry in ${Math.ceil(cooldownMs / 1000)}s.`)
  }

  const ctx: TranslateContext = {
    text: input.text,
    sourceLanguage,
    targetLanguages,
    provider: providerConfig.provider,
    shouldRedetectSourceLanguage,
    immediatePreviousTurn: input.immediatePreviousTurn ?? null,
    isFinal,
    systemPromptOverride: input.systemPromptOverride,
    userPromptOverride: input.userPromptOverride,
  }

  try {
    const result = await requestTranslationFromProvider(ctx, providerConfig)

    if (!result || Object.keys(result.translations).length === 0) {
      if (result?.emptyReason === 'blank_translations') {
        return {
          translations: {},
          provider: providerConfig.provider,
          model: providerConfig.model,
          usage: result.usage,
          emptyReason: 'blank_translations',
        }
      }
      throw new Error('Translation provider returned empty or unparseable response.')
    }

    return {
      translations: result.translations,
      ...(result.sourceLanguage ? { detectedSourceLanguage: result.sourceLanguage } : {}),
      ...(typeof result.sourceLanguagesMixed === 'boolean' ? { sourceLanguagesMixed: result.sourceLanguagesMixed } : {}),
      ...(typeof result.sourceTextHasForeignScript === 'boolean' ? { sourceTextHasForeignScript: result.sourceTextHasForeignScript } : {}),
      usage: result.usage,
      provider: result.provider,
      model: result.model,
    }
  } catch (error) {
    rememberProviderRateLimitCooldown(providerConfig, error)
    logError('translateTexts_error', {
      provider: providerConfig.provider,
      model: providerConfig.model,
      error: summarizeUnknownError(error),
    })
    throw error
  }
}
