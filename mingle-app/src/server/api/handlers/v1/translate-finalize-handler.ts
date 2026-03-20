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
  normalizeTargetLanguages,
  parseCurrentTurnPreviousState,
  parseImmediatePreviousTurn,
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
const ENABLE_VERBOSE_TRANSLATE_LOGS = (
  process.env.NODE_ENV !== 'production'
  || process.env.MINGLE_VERBOSE_TRANSLATE_LOGS === '1'
)



type TranslationUsage = {
  promptTokens?: number
  completionTokens?: number
  totalTokens?: number
}

type TranslationEngineResult = {
  translations: Record<string, string>
  provider: 'gemini'
  model: string
  usage?: TranslationUsage
}

type FinalizeTestFaultMode = 'provider_empty' | 'target_miss' | 'provider_error'

type TranslateContext = {
  text: string
  sourceLanguage: string
  targetLanguages: string[]
  immediatePreviousTurn: RecentTurnContext | null
  currentTurnPreviousState: CurrentTurnPreviousState | null
  isFinal: boolean
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

function logParsedTranslations(event: string, payload: {
  sourceLanguage: string
  targetLanguages: string[]
  isFinal: boolean
  text: string
  parsedLanguages: string[]
  translations: Record<string, string>
  usage?: Record<string, unknown>
}) {
  if (ENABLE_VERBOSE_TRANSLATE_LOGS) {
    console.info(`[translate/finalize] ${event}`, payload)
    return
  }

  const translationsPreview = Object.fromEntries(
    Object.entries(payload.translations).map(([language, translatedText]) => [
      language,
      translatedText.slice(0, 80),
    ]),
  )

  console.info(`[translate/finalize] ${event}`, {
    sourceLanguage: payload.sourceLanguage,
    targetLanguages: payload.targetLanguages,
    isFinal: payload.isFinal,
    textPreview: payload.text.slice(0, 120),
    parsedLanguages: payload.parsedLanguages,
    translationsPreview,
    usage: payload.usage,
  })
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

function countMatches(input: string, pattern: RegExp): number {
  return input.match(pattern)?.length || 0
}

function isProbablySourceLeakTranslation(
  sourceTextRaw: string,
  translatedTextRaw: string,
  targetLanguageRaw: string,
): boolean {
  const sourceText = sourceTextRaw.trim().toLowerCase()
  const translatedText = translatedTextRaw.trim()
  const translatedLower = translatedText.toLowerCase()
  const targetLanguage = normalizeLang(targetLanguageRaw)

  if (!sourceText || !translatedText) return false
  if (translatedLower === sourceText) return true

  const latinChars = countMatches(translatedText, /[A-Za-z]/g)
  const hasMeaningfulLatin = latinChars >= 6
  const sourcePrefix = sourceText.slice(0, Math.min(32, sourceText.length))
  const containsSourcePrefix = sourcePrefix.length >= 8 && translatedLower.includes(sourcePrefix)

  if (targetLanguage === 'ko') {
    const hangulChars = countMatches(translatedText, /[\uac00-\ud7a3]/g)
    if (hangulChars === 0 && hasMeaningfulLatin) return true
    if (containsSourcePrefix && latinChars > Math.max(8, hangulChars * 2)) return true
    return false
  }

  if (targetLanguage === 'ja') {
    const japaneseChars = countMatches(translatedText, /[\u3040-\u30ff\u4e00-\u9fff]/g)
    if (japaneseChars === 0 && hasMeaningfulLatin) return true
    if (containsSourcePrefix && latinChars > Math.max(8, japaneseChars * 2)) return true
    return false
  }

  return false
}

function formatSingleTurnForPrompt(label: string, turn: RecentTurnContext): string {
  const ageSuffix = typeof turn.ageMs === 'number'
    ? ` (~${Math.round(turn.ageMs / 1000)}s ago)`
    : ''
  const translationLines = Object.entries(turn.translations)
    .map(([language, translatedText]) => `    - ${language}: "${translatedText}"`)
    .join('\n')

  return [
    `${label}${ageSuffix}:`,
    `  Original [${turn.sourceLanguage}]: "${turn.sourceText}"`,
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

function formatCurrentTurnPreviousStateForPrompt(state: CurrentTurnPreviousState | null): string {
  if (!state) return 'None'
  const translationLines = Object.entries(state.translations)
    .map(([language, translatedText]) => `    - ${language}: "${translatedText}"`)
    .join('\n')

  return [
    `  Source [${state.sourceLanguage}]: "${state.sourceText}"`,
    '  Prior translations from same turn:',
    translationLines || '    - (none)',
  ].join('\n')
}

function buildPrompt(ctx: TranslateContext): { systemPrompt: string, userPrompt: string } {
  const immediatePreviousTurn = selectPromptImmediatePreviousTurn(ctx.immediatePreviousTurn)
  const currentTurnPreviousState = formatCurrentTurnPreviousStateForPrompt(ctx.currentTurnPreviousState)
  const targetLangCodes = ctx.targetLanguages.join(', ')
  const userPromptLines = [
    'Current turn:',
    `source=${ctx.sourceLanguage}`,
    `targets=${targetLangCodes}`,
    `is_final=${ctx.isFinal ? 'yes' : 'no'}`,
    `text="${ctx.text}"`,
    '',
    'Previous state of current turn:',
    currentTurnPreviousState,
  ]

  if (immediatePreviousTurn) {
    userPromptLines.push(
      '',
      formatSingleTurnForPrompt('Immediate previous turn', immediatePreviousTurn),
    )
  }

  userPromptLines.push(
    '',
    'If is_final=no, avoid over-completing unfinished thoughts.',
  )

  return {
    systemPrompt: [
      'You are an expert live-conversation translator.',
      'Return ONLY strict JSON with keys exactly matching target language codes.',
      'No explanations, no markdown, no extra keys.',
      'Always translate the ENTIRE current text as a standalone translation for each target language.',
      'Never return only a suffix, delta, patch, completion fragment, or continuation.',
      'Previous state of current turn is reference context only; do not assume any part is already rendered on screen.',
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

function buildGeminiResponseSchema(targetLanguages: string[]): ResponseSchema {
  const properties: Record<string, ResponseSchema> = {}
  for (const language of targetLanguages) {
    properties[language] = {
      type: SchemaType.STRING,
      description: `Translated text in ${getTranslationLanguageName(language) || language}.`,
    }
  }

  return {
    type: SchemaType.OBJECT,
    properties,
    required: [...targetLanguages],
  }
}

async function translateWithGemini(ctx: TranslateContext): Promise<TranslationEngineResult | null> {
  if (!GEMINI_API_KEY) return null

  const genAI = new GoogleGenerativeAI(GEMINI_API_KEY)
  const { systemPrompt, userPrompt } = buildPrompt(ctx)
  logTranslateFinalizeInfo('prompt', {
    sourceLanguage: ctx.sourceLanguage,
    targetLanguages: ctx.targetLanguages,
    isFinal: ctx.isFinal,
    text: ctx.text,
    systemPrompt,
    userPrompt,
  })
  const responseSchema = buildGeminiResponseSchema(ctx.targetLanguages)
  const model = genAI.getGenerativeModel({
    model: DEFAULT_MODEL,
    systemInstruction: systemPrompt,
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema,
    },
  })

  let result: Awaited<ReturnType<typeof model.generateContent>>
  try {
    result = await model.generateContent(userPrompt)
  } catch (error) {
    if (!isRetryableGeminiError(error)) throw error

    console.warn('[translate/finalize] provider_retry_scheduled', {
      provider: 'gemini',
      model: DEFAULT_MODEL,
      sourceLanguage: ctx.sourceLanguage,
      targetLanguages: ctx.targetLanguages,
      isFinal: ctx.isFinal,
      textPreview: ctx.text.slice(0, 120),
      retryInMs: GEMINI_TRANSIENT_RETRY_BACKOFF_MS,
      error: error instanceof Error ? error.message : String(error),
    })

    await sleep(GEMINI_TRANSIENT_RETRY_BACKOFF_MS)
    result = await model.generateContent(userPrompt)
  }

  const response = result.response as unknown as GeminiResponseLike
  const rawContent = response.text() || ''
  logTranslateFinalizeInfo('gemini_raw_response', {
    sourceLanguage: ctx.sourceLanguage,
    targetLanguages: ctx.targetLanguages,
    isFinal: ctx.isFinal,
    text: ctx.text,
    rawResponseLength: rawContent.length,
    rawResponse: rawContent,
  })
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

  if (!content) {
    console.error('[translate/finalize] gemini_empty_text', {
      sourceLanguage: ctx.sourceLanguage,
      targetLanguages: ctx.targetLanguages,
      textPreview: ctx.text.slice(0, 120),
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
  if (Object.keys(translations).length === 0) {
    console.error('[translate/finalize] gemini_unparseable_json', {
      sourceLanguage: ctx.sourceLanguage,
      targetLanguages: ctx.targetLanguages,
      textPreview: ctx.text.slice(0, 120),
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
  const sourceLanguageRaw = normalizeLang(typeof body.sourceLanguage === 'string' ? body.sourceLanguage : '')
  const sourceLanguage = sourceLanguageRaw || 'unknown'
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

  if (!GEMINI_API_KEY) {
    const response = NextResponse.json({ error: 'No translation API key configured' }, { status: 500 })
    ensureTrackingContext(request, response, { sessionKeyHint })
    return response
  }

  const targetLanguages = normalizeTargetLanguages(targetLanguagesRaw, sourceLanguage)

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
    immediatePreviousTurn,
    currentTurnPreviousState,
    isFinal,
  }
  logTranslateFinalizeInfo('request', {
    sourceLanguage,
    targetLanguages,
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
      meta: { provider: string, model: string, usedFallbackFromPreviousState?: boolean },
    ): Promise<NextResponse> => {
      const responsePayload: Record<string, unknown> = {
        translations,
        provider: meta.provider,
        model: meta.model,
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
      const errorPayload = error instanceof Error
        ? {
          name: error.name,
          message: error.message,
          stack: error.stack,
        }
        : { raw: String(error) }
      console.error('[translate/finalize] provider_error', {
        provider: 'gemini',
        sourceLanguage,
        targetLanguages,
        error: errorPayload,
      })
    }

    if (!selectedResult || Object.keys(selectedResult.translations).length === 0) {
      console.error('[translate/finalize] provider_empty_response', {
        provider: 'gemini',
        sourceLanguage,
        targetLanguages,
        textPreview: text.slice(0, 120),
      })
      if (!ctx.isFinal && !geminiRequestFailed && Object.keys(fallbackTranslations).length > 0) {
        console.warn('[translate/finalize] fallback_from_current_turn_previous_state', {
          sourceLanguage,
          targetLanguages,
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

    const rejectedSourceLeakLanguages: string[] = []
    for (const [lang, translatedText] of Object.entries(translations)) {
      if (!isProbablySourceLeakTranslation(text, translatedText, lang)) continue
      rejectedSourceLeakLanguages.push(lang)
      delete translations[lang]
    }

    if (rejectedSourceLeakLanguages.length > 0) {
      console.warn('[translate/finalize] rejected_source_leak_translations', {
        provider: selectedResult.provider,
        sourceLanguage,
        targetLanguages,
        rejectedLanguages: rejectedSourceLeakLanguages,
        isFinal,
        text,
        rawTranslations: selectedResult.translations,
      })
    }

    const missingTargetLanguages = targetLanguages.filter((lang) => !translations[lang])
    if (missingTargetLanguages.length > 0) {
      console.warn('[translate/finalize] missing_target_languages', {
        provider: selectedResult.provider,
        sourceLanguage,
        targetLanguages,
        missingTargetLanguages,
        returnedLanguages: Object.keys(selectedResult.translations),
        isFinal,
        textPreview: text.slice(0, 120),
      })
    }

    if (Object.keys(translations).length === 0) {
      console.error('[translate/finalize] target_language_miss', {
        provider: selectedResult.provider,
        sourceLanguage,
        targetLanguages,
        returnedLanguages: Object.keys(selectedResult.translations),
        textPreview: text.slice(0, 120),
      })
      if (!ctx.isFinal && Object.keys(fallbackTranslations).length > 0) {
        console.warn('[translate/finalize] fallback_from_current_turn_previous_state', {
          sourceLanguage,
          targetLanguages,
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
    })
  } catch (error) {
    console.error('Finalize translation route error:', error)
    const response = NextResponse.json({ error: 'finalize_translation_failed' }, { status: 500 })
    ensureTrackingContext(request, response, { sessionKeyHint })
    return response
  }
}
