import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import {
  ensureTrackingContext,
  sanitizeNonNegativeInt,
} from '@/lib/app-analytics'
import { getAuthOptions } from '@/lib/auth-options'
import { requestAllowsLegacyAnonymousUser } from '@/lib/request-user-identity'
import { EXPECTED_ACCOUNT_HEADER, matchesExpectedAccount } from '@/lib/request-account-guard'
import { prisma } from '@/lib/prisma'
import { getInworldAuthHeaderValue } from '@/server/api/shared/inworld-auth'
import { decodeAudioContent, detectAudioMime } from '@/server/api/shared/audio-utils'
import { resolveVoiceId, INWORLD_API_BASE } from '@/server/api/shared/inworld-voice'
import {
  buildFallbackTranslationsFromCurrentTurnPreviousState,
  normalizeLang,
  normalizeSelectedLanguages,
  normalizeTargetLanguages,
  parseCurrentTurnPreviousState,
  parseImmediatePreviousTurn,
  type CurrentTurnPreviousState,
  type RecentTurnContext,
} from '@/app/api/translate/finalize/utils'
import { shouldRedetectFinalizeSourceLanguage } from '@/lib/api-contract'
import {
  normalizeSelectableTranslationModel,
  resolveDefaultSelectableTranslationModel,
  type UserSelectableTranslationModel,
} from '@/lib/translation-models'
import {
  type TranslationProvider,
  type TranslationUsage,
  type TranslationEngineResult,
  type TranslationProviderConfig,
  type TranslateContext,
  resolveTranslationProviderConfig,
  resolveActiveProviderRateLimitCooldownMs,
  rememberProviderRateLimitCooldown,
  requestTranslationFromProvider,
  shouldUsePreviousStateFallback,
  normalizeTranslationProvider,
} from '@/server/translation/translate-texts'

export const runtime = 'nodejs'

const DEFAULT_TTS_MODEL_ID = process.env.INWORLD_TTS_MODEL_ID || 'inworld-tts-1.5-mini'
const DEFAULT_TTS_SPEAKING_RATE = Number(process.env.INWORLD_TTS_SPEAKING_RATE || '1.3')
const ENABLE_VERBOSE_TRANSLATE_LOGS = process.env.MINGLE_VERBOSE_TRANSLATE_LOGS === '1'

type FinalizeTestFaultMode = 'provider_empty' | 'target_miss' | 'provider_error'

type TranslateRequestMeta = {
  requestPathname: string
  requestMethod: string
  clientBundleRev: string | null
  sessionKeyHint: string | null
}

/** Handler-local TranslateContext with HTTP-specific fields */
type HandlerTranslateContext = TranslateContext & {
  currentTurnPreviousState: CurrentTurnPreviousState | null
  requestMeta: TranslateRequestMeta
}

type SessionUserIdentity = {
  id: string
  email: string
  externalUserId: string
  sessionKey: string
}

// ─── Tracking helpers ────────────────────────────────────────────────────────

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

// ─── Session / user identity ─────────────────────────────────────────────────

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
    const sessionIdentity = normalizeSessionUserIdentity(session)
    const hasAuthenticatedIdentity = Boolean(sessionIdentity.id || sessionIdentity.email)
    const selectedModel = await findUserSelectedTranslationModel(hasAuthenticatedIdentity
      ? sessionIdentity
      : requestAllowsLegacyAnonymousUser(request)
        ? normalizeSessionUserIdentity(null, externalUserId, sessionKey)
        : sessionIdentity)
    if (selectedModel) return selectedModel
  } catch {
    if (requestAllowsLegacyAnonymousUser(request) && (externalUserId || sessionKey)) {
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

// ─── Test fault mode ─────────────────────────────────────────────────────────

function parseFinalizeTestFaultMode(value: unknown): FinalizeTestFaultMode | null {
  if (typeof value !== 'string') return null
  const normalized = value.trim().toLowerCase()
  if (!normalized) return null
  if (normalized === 'provider_empty') return normalized
  if (normalized === 'target_miss') return normalized
  if (normalized === 'provider_error') return normalized
  return null
}

// ─── Logging ─────────────────────────────────────────────────────────────────

function isGeminiTranslationLog(_event: string, payload: Record<string, unknown>): boolean {
  return payload.provider === 'gemini'
}

function logTranslateFinalizeInfo(event: string, payload: Record<string, unknown>) {
  if (!ENABLE_VERBOSE_TRANSLATE_LOGS || isGeminiTranslationLog(event, payload)) return
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
  if (isGeminiTranslationLog(event, payload)) return
  console.error(`[translate/finalize] ${event} ${stringifyTranslateFinalizePayload(payload)}`)
}

function logTranslateFinalizeWarning(event: string, payload: Record<string, unknown>) {
  if (isGeminiTranslationLog(event, payload)) return
  console.warn(`[translate/finalize] ${event}`, payload)
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

function buildTranslateFinalizeLogContext(ctx: HandlerTranslateContext): Record<string, unknown> {
  return {
    path: ctx.requestMeta.requestPathname,
    method: ctx.requestMeta.requestMethod,
    clientBundleRev: ctx.requestMeta.clientBundleRev,
    sessionKeyHint: ctx.requestMeta.sessionKeyHint,
    provider: ctx.provider,
    sourceLanguage: ctx.sourceLanguage,
    targetLanguages: ctx.targetLanguages,
    shouldRedetectSourceLanguage: ctx.shouldRedetectSourceLanguage,
    isFinal: ctx.isFinal,
    textPreview: ctx.text.slice(0, 120),
  }
}

function shouldRedetectSourceLanguageFromRequest(args: {
  pathname: string
  isFinal: boolean
}): boolean {
  if (!args.isFinal) return false
  return shouldRedetectFinalizeSourceLanguage(args.pathname)
}

function resolveTranslationProviderFromEnv(): TranslationProvider {
  const raw = (process.env.TRANSLATE_PROVIDER || process.env.DEMO_TRANSLATE_PROVIDER || '').trim()
  return normalizeTranslationProvider(raw) || 'gemini'
}

// ─── TTS ─────────────────────────────────────────────────────────────────────

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

// ─── Main handler ────────────────────────────────────────────────────────────

export async function handleTranslateFinalizeV1(request: NextRequest) {
  if (request.headers.has(EXPECTED_ACCOUNT_HEADER)
    && !matchesExpectedAccount(request, await getServerSession(getAuthOptions()))) {
    return NextResponse.json({ error: 'account_changed' }, { status: 401 })
  }
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
  const requestedTranslationModel = normalizeSelectableTranslationModel(body.translationModel)
  const selectedTranslationModel = requestedTranslationModel
    ?? await resolveSelectedTranslationModel(request, sessionKeyHint)
  const providerResolution = resolveTranslationProviderConfig(selectedTranslationModel)

  if (!providerResolution.ok) {
    logTranslateFinalizeError('provider_config_error', {
      path: requestMeta.requestPathname,
      method: requestMeta.requestMethod,
      clientBundleRev,
      sessionKeyHint,
      provider: resolveTranslationProviderFromEnv(),
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
  const ctx: HandlerTranslateContext = {
    text,
    sourceLanguage,
    targetLanguages,
    provider: providerConfig.provider,
    shouldRedetectSourceLanguage,
    immediatePreviousTurn,
    currentTurnPreviousState,
    isFinal,
    requestMeta,
  }
  logTranslateFinalizeInfo('request', {
    provider: providerConfig.provider,
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
    let providerRequestFailureReason: 'provider_error' | 'provider_rate_limit_cooldown' | null = null
    const activeProviderRateLimitCooldownMs = resolveActiveProviderRateLimitCooldownMs(providerConfig)
    if (activeProviderRateLimitCooldownMs !== null) {
      providerRequestFailureReason = 'provider_rate_limit_cooldown'
      logTranslateFinalizeWarning('provider_rate_limit_cooldown_active', {
        ...buildTranslateFinalizeLogContext(ctx),
        provider: providerConfig.provider,
        model: providerConfig.model,
        retryInMs: activeProviderRateLimitCooldownMs,
      })
    } else {
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
          selectedResult = await requestTranslationFromProvider(ctx, providerConfig)
        }
      } catch (error) {
        providerRequestFailureReason = 'provider_error'
        const retryInMs = rememberProviderRateLimitCooldown(providerConfig, error)
        if (retryInMs !== null) {
          logTranslateFinalizeWarning('provider_rate_limit_cooldown_started', {
            ...buildTranslateFinalizeLogContext(ctx),
            provider: providerConfig.provider,
            model: providerConfig.model,
            retryInMs,
          })
        }
        logTranslateFinalizeError('provider_error', {
          ...buildTranslateFinalizeLogContext(ctx),
          provider: providerConfig.provider,
          error: summarizeUnknownError(error),
        })
      }
    }

    if (
      selectedResult?.emptyReason === 'blank_translations'
      && !ctx.isFinal
      && !providerRequestFailureReason
    ) {
      if (
        shouldUsePreviousStateFallback(selectedResult.provider)
        && Object.keys(fallbackTranslations).length > 0
      ) {
        logTranslateFinalizeWarning('fallback_from_current_turn_previous_state', {
          ...buildTranslateFinalizeLogContext(ctx),
          fallbackLanguages: Object.keys(fallbackTranslations),
          reason: 'blank_translations',
        })
        return await buildResponseWithOptionalTts(fallbackTranslations, {
          provider: selectedResult.provider,
          infrastructureProvider: selectedResult.infrastructureProvider,
          model: selectedResult.model,
          usage: selectedResult.usage,
          usedFallbackFromPreviousState: true,
        })
      }
      return await buildResponseWithOptionalTts({}, {
        provider: selectedResult.provider,
        infrastructureProvider: selectedResult.infrastructureProvider,
        model: selectedResult.model,
        usage: selectedResult.usage,
      })
    }

    if (!selectedResult || Object.keys(selectedResult.translations).length === 0) {
      logTranslateFinalizeError('provider_empty_response', {
        ...buildTranslateFinalizeLogContext(ctx),
        provider: providerConfig.provider,
        reason: providerRequestFailureReason || 'provider_empty_or_unparseable',
        responseStatus: 502,
      })
      if (
        !ctx.isFinal
        && shouldUsePreviousStateFallback(providerConfig.provider)
        && Object.keys(fallbackTranslations).length > 0
      ) {
        logTranslateFinalizeWarning('fallback_from_current_turn_previous_state', {
          ...buildTranslateFinalizeLogContext(ctx),
          fallbackLanguages: Object.keys(fallbackTranslations),
          reason: providerRequestFailureReason || 'provider_empty_response',
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
      logTranslateFinalizeError('missing_target_languages', {
        ...buildTranslateFinalizeLogContext(ctx),
        provider: selectedResult.provider,
        missingTargetLanguages,
        returnedLanguages: Object.keys(selectedResult.translations),
      })

      if (!ctx.isFinal) {
        const fallbackTranslationsForMissingTargets: Record<string, string> = {}
        for (const language of missingTargetLanguages) {
          const fallbackTranslation = fallbackTranslations[language]
          if (fallbackTranslation) {
            fallbackTranslationsForMissingTargets[language] = fallbackTranslation
          }
        }

        if (
          shouldUsePreviousStateFallback(selectedResult.provider)
          && Object.keys(fallbackTranslationsForMissingTargets).length > 0
        ) {
          const mergedTranslations = {
            ...fallbackTranslationsForMissingTargets,
            ...translations,
          }
          logTranslateFinalizeInfo('fallback_from_current_turn_previous_state', {
            ...buildTranslateFinalizeLogContext(ctx),
            fallbackLanguages: Object.keys(fallbackTranslationsForMissingTargets),
            reason: 'missing_target_languages',
            missingTargetLanguages,
            returnedLanguages: Object.keys(selectedResult.translations),
          })
          return await buildResponseWithOptionalTts(mergedTranslations, {
            provider: selectedResult.provider,
            infrastructureProvider: selectedResult.infrastructureProvider,
            model: selectedResult.model,
            usage: selectedResult.usage,
            usedFallbackFromPreviousState: true,
          })
        }
      }
    }

    if (Object.keys(translations).length === 0) {
      logTranslateFinalizeError('target_language_miss', {
        ...buildTranslateFinalizeLogContext(ctx),
        provider: selectedResult.provider,
        returnedLanguages: Object.keys(selectedResult.translations),
        rawTranslations: selectedResult.translations,
        responseStatus: 502,
      })
      if (
        !ctx.isFinal
        && shouldUsePreviousStateFallback(selectedResult.provider)
        && Object.keys(fallbackTranslations).length > 0
      ) {
        logTranslateFinalizeWarning('fallback_from_current_turn_previous_state', {
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
