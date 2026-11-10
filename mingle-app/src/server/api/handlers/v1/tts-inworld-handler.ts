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
import {
  openSpeechPcmStream,
  synthesizeSpeech,
  type TtsPcmStream,
  type TtsSynthesisResult,
} from '@/server/api/shared/tts-provider'
import {
  TTS_STREAM_CONTENT_TYPE,
  TTS_STREAM_FRAME_AUDIO,
  TTS_STREAM_SAMPLE_RATE_HEADER,
  encodeTtsStreamEnd,
  encodeTtsStreamFrame,
} from '@/lib/tts-stream-format'
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
  // A client that can play audio as it arrives asks for a stream; anything
  // else gets the whole clip.
  const wantsStream = body?.stream === true
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

  // Frames of `@/lib/tts-stream-format`: audio as it is generated, then one
  // end frame with the coin balance. Charged when the stream ends, for the
  // audio that was sent (also when the client stopped listening halfway).
  const respondWithPcmStream = (stream: TtsPcmStream) => {
    let sentBytes = 0
    let settled = false
    const settle = async (): Promise<{ coinBalance?: number, coinExhausted?: boolean }> => {
      if (settled) return {}
      settled = true
      const audioSeconds = Math.ceil(sentBytes / 2 / stream.sampleRate)
      let end: { coinBalance?: number, coinExhausted?: boolean } = {}
      if (coinBillingUserId && sentBytes > 0) {
        const charge = await chargeCoinUsageSafely({
          userId: coinBillingUserId,
          kind: 'tts',
          units: { char: text.length, second: audioSeconds },
          model: stream.modelId,
          provider: stream.provider,
          sessionKey: sessionKeyHint,
          idempotencyKey: `tts:${coinBillingUserId}:${randomUUID()}`,
        })
        end = {
          ...(charge?.wallet ? { coinBalance: charge.wallet.balance } : {}),
          ...(charge?.balanceExhausted ? { coinExhausted: true } : {}),
        }
      }
      fireAndForgetDbWrite('tts.inworld.success', async () => {
        const userId = await resolveUserIdForTrackedWrite({
          request,
          session: await sessionPromise,
          tracking: streamTracking,
          clientContext,
        })
        if (!userId) return
        await createTrackedEventLog({
          userId,
          tracking: streamTracking,
          clientContext,
          sessionKey: streamTracking.sessionKey,
          eventType: 'tts_generated',
          metadata: {
            language,
            voiceId: stream.voiceId,
            modelId: stream.modelId,
            textLength: text.length,
            audioBytes: sentBytes,
            clientMessageId,
            provider: stream.provider,
            streamed: true,
          },
        })
      })
      return end
    }
    const bodyStream = new ReadableStream<Uint8Array>({
      async pull(controller) {
        try {
          const next = await stream.pcm.next()
          if (next.done) {
            controller.enqueue(encodeTtsStreamEnd(await settle()))
            controller.close()
            return
          }
          sentBytes += next.value.length
          controller.enqueue(encodeTtsStreamFrame(TTS_STREAM_FRAME_AUDIO, next.value))
        } catch (error) {
          // Cut off upstream: close without an end frame. What was sent plays.
          console.warn('[tts] stream cut off', { sentBytes, error: error instanceof Error ? error.message : String(error) })
          await settle()
          controller.close()
        }
      },
      async cancel() {
        stream.cancel()
        await stream.pcm.return(undefined).catch(() => undefined)
        await settle()
      },
    })
    const streamResponse = new NextResponse(bodyStream, {
      headers: {
        'Content-Type': TTS_STREAM_CONTENT_TYPE,
        'Cache-Control': 'no-store',
        // Tell proxies not to hold the audio back.
        'X-Accel-Buffering': 'no',
        [TTS_STREAM_SAMPLE_RATE_HEADER]: String(stream.sampleRate),
        'X-TTS-Provider': stream.provider,
        'X-TTS-Voice-Id': stream.voiceId,
      },
    })
    const streamTracking = ensureTrackingContext(request, streamResponse, { sessionKeyHint })
    return streamResponse
  }

  try {
    const streamed = wantsStream ? await openSpeechPcmStream({ text, language }) : null
    if (streamed?.ok) {
      return respondWithPcmStream(streamed)
    }
    // A stream that failed is reported like a failed whole answer; a stream
    // that is not available (null) is answered whole.
    const result: TtsSynthesisResult = streamed ?? await synthesizeSpeech({ text, language })

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
