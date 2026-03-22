import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenerativeAI, SchemaType, type ResponseSchema } from '@google/generative-ai'
import {
  ensureTrackingContext,
  sanitizeNonNegativeInt,
} from '@/lib/app-analytics'
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

export const runtime = 'nodejs'

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || ''
const DEFAULT_MODEL = process.env.DEMO_TRANSLATE_MODEL || 'gemini-2.5-flash-lite'
const DEFAULT_TTS_MODEL_ID = process.env.INWORLD_TTS_MODEL_ID || 'inworld-tts-1.5-mini'
const DEFAULT_TTS_SPEAKING_RATE = Number(process.env.INWORLD_TTS_SPEAKING_RATE || '1.3')
const IMMEDIATE_PREVIOUS_TURN_MAX_AGE_MS = 5_000
const GEMINI_TRANSIENT_RETRY_BACKOFF_MS = 250
const ENABLE_VERBOSE_TRANSLATE_LOGS = process.env.MINGLE_VERBOSE_TRANSLATE_LOGS === '1'



type TranslationUsage = {
  promptTokens?: number
  completionTokens?: number
  totalTokens?: number
}

type TranslationEngineResult = {
  translations: Record<string, string>
  sourceLanguage?: string
  sourceLanguagesMixed?: boolean
  sourceTextHasForeignScript?: boolean
  provider: 'gemini'
  model: string
  usage?: TranslationUsage
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

type GeminiResponseLike = {
  text: () => string
  usageMetadata?: GeminiUsageMetadata
  promptFeedback?: unknown
  candidates?: Array<{
    finishReason?: unknown
    safetyRatings?: unknown
  }>
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
        'Check whether the provided sourceLanguage matches the current text.',
        'If the provided sourceLanguage does not seem correct, replace it with the source language that best matches the current text.',
        'If the text is written in the script of one language but clearly phonetically represents another language, choose the intended spoken language rather than the writing system. For example, "료카이데스" should be classified as Japanese, not Korean.',
        'For example, in "そんな답답해서 죽겠다고 내가 진짜로.", sourceLanguagesMixed should be true and sourceTextHasForeignScript should also be true, because the utterance contains substantive Japanese script inside an otherwise Korean sentence.',
        'Determine whether the current text itself meaningfully mixes two or more languages within the same utterance.',
        'Set sourceLanguagesMixed=true only when two or more languages are actually mixed in the current text itself; otherwise set it to false.',
        'Determine whether the current text contains substantive characters or script not normally used to write the chosen sourceLanguage.',
        'Set sourceTextHasForeignScript=true only when the current text contains substantive non-source-language characters or script; otherwise set it to false. Ignore spaces, punctuation, and digits.',
        'For example, if sourceLanguage is Japanese, "료카이데스" should set sourceTextHasForeignScript=true because it is written in Hangul rather than Japanese script, even though it represents Japanese speech.',
        'For every other requested language key, return the ENTIRE current text translated as a standalone translation.',
        'Never omit any requested language key, and never return only a suffix, delta, patch, completion fragment, or continuation.',
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
  total?: unknown
}): TranslationUsage | undefined {
  const promptTokens = sanitizeNonNegativeInt(raw.prompt)
  const completionTokens = sanitizeNonNegativeInt(raw.completion)
  const totalTokens = sanitizeNonNegativeInt(raw.total)

  if (promptTokens === null && completionTokens === null && totalTokens === null) {
    return undefined
  }

  const usage: TranslationUsage = {}
  if (promptTokens !== null) usage.promptTokens = promptTokens
  if (completionTokens !== null) usage.completionTokens = completionTokens
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
  return /^\/api\/(?:ios|android)\/v1\.0\.4\/translate\/finalize\/?$/.test(args.pathname)
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

async function translateWithGemini(ctx: TranslateContext): Promise<TranslationEngineResult | null> {
  if (!GEMINI_API_KEY) return null

  const genAI = new GoogleGenerativeAI(GEMINI_API_KEY)
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
    console.info('[translate/finalize] prompt', promptLogPayload)
  }
  const responseSchema = buildGeminiResponseSchema(ctx.targetLanguages, {
    shouldRedetectSourceLanguage: ctx.shouldRedetectSourceLanguage,
  })
  const model = genAI.getGenerativeModel({
    model: DEFAULT_MODEL,
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
        provider: 'gemini',
        model: DEFAULT_MODEL,
        retryInMs: GEMINI_TRANSIENT_RETRY_BACKOFF_MS,
        error: error instanceof Error ? error.message : String(error),
      })

      await sleep(GEMINI_TRANSIENT_RETRY_BACKOFF_MS)
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
    provider: 'gemini',
    model: DEFAULT_MODEL,
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
    provider: 'gemini',
    model: DEFAULT_MODEL,
    usage: normalizeUsage({
      prompt: promptTokens,
      completion: completionTokens,
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

  if (!GEMINI_API_KEY) {
    const response = NextResponse.json({ error: 'No translation API key configured' }, { status: 500 })
    ensureTrackingContext(request, response, { sessionKeyHint })
    return response
  }

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
        model: string
        sourceLanguage?: string
        sourceLanguagesMixed?: boolean
        sourceTextHasForeignScript?: boolean
        usedFallbackFromPreviousState?: boolean
      },
    ): Promise<NextResponse> => {
      const responsePayload: Record<string, unknown> = {
        translations,
        provider: meta.provider,
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
    let geminiRequestFailed = false
    try {
      if (testFaultMode === 'provider_empty') {
        selectedResult = null
      } else if (testFaultMode === 'target_miss') {
        selectedResult = {
          provider: 'gemini',
          model: DEFAULT_MODEL,
          translations: {
            zz: 'forced_target_miss',
          },
        }
      } else if (testFaultMode === 'provider_error') {
        throw new Error('forced_provider_error_for_e2e')
      } else {
        selectedResult = await translateWithGemini(ctx)
      }
    } catch (error) {
      geminiRequestFailed = true
      logTranslateFinalizeError('provider_error', {
        ...buildTranslateFinalizeLogContext(ctx),
        provider: 'gemini',
        error: summarizeUnknownError(error),
      })
    }

    if (!selectedResult || Object.keys(selectedResult.translations).length === 0) {
      logTranslateFinalizeError('provider_empty_response', {
        ...buildTranslateFinalizeLogContext(ctx),
        provider: 'gemini',
        reason: geminiRequestFailed ? 'provider_error' : 'provider_empty_or_unparseable',
        responseStatus: 502,
      })
      if (!ctx.isFinal && !geminiRequestFailed && Object.keys(fallbackTranslations).length > 0) {
        console.warn('[translate/finalize] fallback_from_current_turn_previous_state', {
          ...buildTranslateFinalizeLogContext(ctx),
          fallbackLanguages: Object.keys(fallbackTranslations),
          reason: 'provider_empty_response',
        })
        return await buildResponseWithOptionalTts(fallbackTranslations, {
          provider: 'gemini',
          model: DEFAULT_MODEL,
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
          model: selectedResult.model,
          usedFallbackFromPreviousState: true,
        })
      }
      const response = NextResponse.json({ error: 'empty_translation_response' }, { status: 502 })
      ensureTrackingContext(request, response, { sessionKeyHint })
      return response
    }

    return await buildResponseWithOptionalTts(translations, {
      provider: selectedResult.provider,
      model: selectedResult.model,
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
