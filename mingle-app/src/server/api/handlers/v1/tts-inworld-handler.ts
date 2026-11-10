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
import { synthesizeSpeech } from '@/server/api/shared/tts-provider'
import { COIN_INSUFFICIENT_ERROR } from '@/lib/coin-units'
import { randomUUID } from 'node:crypto'
import { estimateTtsAudioSeconds, resolveCoinBillingUserId } from '@/server/coins/request-billing'
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
  const language = normalizeLanguage(typeof body?.language === 'string' ? body.language : '')
  const sessionKeyHint = typeof body?.sessionKey === 'string' ? body.sessionKey.trim() : null
  const clientMessageId = typeof body?.clientMessageId === 'string' ? body.clientMessageId.trim().slice(0, 128) : null
  const clientContext = parseClientContext(body?.clientContext)
  // `ttsModel` and `voiceId` from older clients are ignored: there is one model.

  const buildMissingCredentialsResponse = () => {
    const response = NextResponse.json({ error: 'GEMINI_API_KEY is required' }, { status: 500 })
    ensureTrackingContext(request, response, { sessionKeyHint })
    return response
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
    const result = await synthesizeSpeech({ text, language })

    if (!result.ok) {
      if (result.reason === 'missing_credentials') {
        return buildMissingCredentialsResponse()
      }

      if (result.reason === 'upstream_error') {
        const status = result.status ?? 502
        const errorResponse = NextResponse.json(
          { error: 'tts_failed', status, detail: result.detail ?? '' },
          { status },
        )

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
    if (coinBillingUserId) {
      const charge = await chargeCoinUsageSafely({
        userId: coinBillingUserId,
        kind: 'tts',
        units: { char: text.length, second: estimateTtsAudioSeconds(audioBuffer, result.mime) },
        model: result.modelId,
        provider: result.provider,
        sessionKey: sessionKeyHint,
        // Every request here is a real synthesis the user asked for (a bubble tap is not
        // cached client-side), so each one is charged: the key is unique per request.
        idempotencyKey: `tts:${coinBillingUserId}:${randomUUID()}`,
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
        },
      })
    })

    return audioResponse
  } catch (error) {
    console.error('TTS route error:', error)
    return NextResponse.json({ error: 'tts_internal_error' }, { status: 500 })
  }
}
