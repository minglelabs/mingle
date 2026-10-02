import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { getAuthOptions } from '@/lib/auth-options'
import {
  createTrackedEventLog,
  ensureTrackingContext,
  fireAndForgetDbWrite,
  parseClientContext,
} from '@/lib/app-analytics'
import { resolveUserIdForTrackedWrite } from '@/lib/request-user-identity'
import { getInworldAuthHeaderValue } from '@/server/api/shared/inworld-auth'
import { resolveTtsRuntimeSelection, synthesizeSpeech } from '@/server/api/shared/tts-provider'
import { COIN_INSUFFICIENT_ERROR } from '@/lib/coin-units'
import { coinKeyDigest, estimateTtsAudioSeconds, resolveCoinBillingUserId } from '@/server/coins/request-billing'
import { canSpendCoins, chargeCoinUsageSafely } from '@/server/coins/wallet'

export const runtime = 'nodejs'

function normalizeLanguage(input?: string): string | null {
  if (!input) return null
  const normalized = input.trim().replace(/_/g, '-').toLowerCase()
  if (!normalized) return null
  return normalized.split('-')[0] || null
}

export async function handleTtsInworldV1(request: NextRequest) {
  const body = await request.json().catch((): Record<string, unknown> => ({}))
  const text = typeof body?.text === 'string' ? body.text.trim() : ''
  const requestedVoiceId = typeof body?.voiceId === 'string' ? body.voiceId.trim() : ''
  const language = normalizeLanguage(typeof body?.language === 'string' ? body.language : '')
  const sessionKeyHint = typeof body?.sessionKey === 'string' ? body.sessionKey.trim() : null
  const clientMessageId = typeof body?.clientMessageId === 'string' ? body.clientMessageId.trim().slice(0, 128) : null
  const clientContext = parseClientContext(body?.clientContext)
  // User-selected TTS model sent by the client; missing/invalid -> default (gemini-3.8-flash-lite-tts).
  const ttsSelection = resolveTtsRuntimeSelection(body?.ttsModel)

  const buildMissingCredentialsResponse = () => {
    const response = NextResponse.json(
      {
        error:
          'INWORLD_BASIC (or INWORLD_RUNTIME_BASE64_CREDENTIAL / INWORLD_BASIC_CREDENTIAL) is required',
      },
      { status: 500 },
    )
    ensureTrackingContext(request, response, { sessionKeyHint })
    return response
  }

  // Inworld path keeps the original check order (credentials, then text).
  // Gemini can synthesize without Inworld credentials; it only needs them to fall back.
  if (ttsSelection.provider === 'inworld' && !getInworldAuthHeaderValue()) {
    return buildMissingCredentialsResponse()
  }

  if (!text) {
    const response = NextResponse.json({ error: 'text is required' }, { status: 400 })
    ensureTrackingContext(request, response, { sessionKeyHint })
    return response
  }

  // Coins (docs/coin-iap-spec.md 3.5, 4.3): whoever asks for the audio pays; no coins, no synthesis.
  const coinBillingUserId = await resolveCoinBillingUserId()
  if (coinBillingUserId && !(await canSpendCoins(coinBillingUserId))) {
    const response = NextResponse.json({ error: COIN_INSUFFICIENT_ERROR }, { status: 402 })
    ensureTrackingContext(request, response, { sessionKeyHint })
    return response
  }

  // Start session verification alongside the upstream TTS request. Auth
  // failure must never delay or fail audio delivery; it only suppresses the
  // optional current-client analytics write.
  const sessionPromise = getServerSession(getAuthOptions()).catch(() => null)

  try {
    const result = await synthesizeSpeech({
      text,
      language,
      requestedVoiceId,
      ttsModel: ttsSelection.value,
    })
    const fallbackMetadata = result.fallbackFrom ? { fallbackFrom: result.fallbackFrom } : {}

    if (!result.ok) {
      if (result.reason === 'missing_credentials') {
        return buildMissingCredentialsResponse()
      }

      if (result.reason === 'upstream_error') {
        const status = result.status ?? 502
        const errorResponse = NextResponse.json(
          { error: 'inworld_tts_failed', status, detail: result.detail ?? '' },
          { status },
        )
        if (result.fallbackFrom) errorResponse.headers.set('X-TTS-Fallback-From', result.fallbackFrom)

        const tracking = ensureTrackingContext(request, errorResponse, { sessionKeyHint })
        fireAndForgetDbWrite('tts.inworld.failed', async () => {
          const userId = await resolveUserIdForTrackedWrite({
            request,
            session: await sessionPromise,
            tracking,
            clientContext,
          })
          if (!userId) return
          await createTrackedEventLog({
            userId,
            tracking,
            clientContext,
            sessionKey: tracking.sessionKey,
            eventType: 'tts_failed',
            metadata: {
              status,
              language,
              voiceId: result.voiceId,
              modelId: result.modelId,
              textLength: text.length,
              clientMessageId,
              provider: result.provider,
              ...fallbackMetadata,
            },
          })
        })

        return errorResponse
      }

      if (result.reason === 'invalid_audio') {
        const invalidResponse = NextResponse.json({ error: 'invalid_audio_content' }, { status: 502 })
        ensureTrackingContext(request, invalidResponse, { sessionKeyHint })
        return invalidResponse
      }

      throw result.error ?? new Error(`tts_${result.reason}`)
    }

    const audioBuffer = result.audio
    const headers: Record<string, string> = {
      'Content-Type': result.mime,
      'Cache-Control': 'no-store',
      'X-TTS-Provider': result.provider,
      'X-TTS-Voice-Id': result.voiceId,
    }
    if (result.fallbackFrom) headers['X-TTS-Fallback-From'] = result.fallbackFrom
    if (coinBillingUserId) {
      const charge = await chargeCoinUsageSafely({
        userId: coinBillingUserId,
        kind: 'tts',
        units: { char: text.length, second: estimateTtsAudioSeconds(audioBuffer, result.mime) },
        model: result.modelId,
        provider: result.provider,
        sessionKey: sessionKeyHint,
        idempotencyKey: `tts:${coinBillingUserId}:${clientMessageId || '-'}:${coinKeyDigest(sessionKeyHint, language, text)}`,
      })
      if (charge?.wallet) headers['X-Coin-Balance'] = String(charge.wallet.balance)
      if (charge?.balanceExhausted) headers['X-Coin-Exhausted'] = '1'
    }
    const audioResponse = new NextResponse(new Uint8Array(audioBuffer), { headers })

    const tracking = ensureTrackingContext(request, audioResponse, { sessionKeyHint })
    fireAndForgetDbWrite('tts.inworld.success', async () => {
      const userId = await resolveUserIdForTrackedWrite({
        request,
        session: await sessionPromise,
        tracking,
        clientContext,
      })
      if (!userId) return
      await createTrackedEventLog({
        userId,
        tracking,
        clientContext,
        sessionKey: tracking.sessionKey,
        eventType: 'tts_generated',
        metadata: {
          language,
          voiceId: result.voiceId,
          modelId: result.modelId,
          textLength: text.length,
          audioBytes: audioBuffer.byteLength,
          clientMessageId,
          provider: result.provider,
          ...fallbackMetadata,
        },
      })
    })

    return audioResponse
  } catch (error) {
    console.error('Inworld TTS route error:', error)
    return NextResponse.json({ error: 'inworld_tts_internal_error' }, { status: 500 })
  }
}
