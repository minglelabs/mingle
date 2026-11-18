import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'
import {
  StreamingTtsClip,
  parseNativeTtsStreamCapability,
  parseStreamedPcmSampleRate,
  readStreamingTtsResponse,
} from './tts-stream-clip'

// Exercise the real bubble-tap TTS callback without mounting the room, so the
// manual playback path cannot drift from the auto TTS path's model choice.
const source = readFileSync(new URL('./LivePhoneDemo.tsx', import.meta.url), 'utf8')
const tree = ts.createSourceFile('LivePhoneDemo.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)

type BubbleTtsInput = { playbackKey: string, text: string, language: string }

function bubbleTtsCallback(context: Record<string, unknown>): (input: BubbleTtsInput) => Promise<Blob | StreamingTtsClip | null> {
  let callback = ''
  function visit(node: ts.Node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(tree) === 'synthesizeBubbleTtsViaApi'
      && node.initializer && ts.isCallExpression(node.initializer)) callback = node.initializer.arguments[0].getText(tree)
    ts.forEachChild(node, visit)
  }
  visit(tree)
  if (!callback) throw new Error('Missing synthesizeBubbleTtsViaApi callback')
  return runInNewContext(ts.transpileModule(`(${callback})`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText, context)
}

function buildContext(
  requestTtsModel: string | undefined,
  shell: { capabilities?: unknown, streamedResponse?: boolean } = {},
) {
  const requests: Array<{ url: string, body: Record<string, unknown> }> = []
  const fetch = async (url: string, init: RequestInit) => {
    requests.push({ url, body: JSON.parse(String(init.body)) })
    if (shell.streamedResponse) {
      return new Response(new Uint8Array(4800).fill(1), {
        headers: { 'Content-Type': 'audio/L16;rate=24000;channels=1' },
      })
    }
    return {
      ok: true,
      arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
      headers: { get: (name: string) => (name.toLowerCase() === 'content-type' ? 'audio/wav' : null) },
    }
  }
  return {
    requests,
    context: {
      fetch,
      Blob,
      isNativeApp: () => shell.capabilities !== undefined,
      readCachedNativeShellCapabilities: () => shell.capabilities ?? null,
      parseNativeTtsStreamCapability,
      parseStreamedPcmSampleRate,
      readStreamingTtsResponse,
      // Read by the auto-read prefetch limit; the request only records the answer kind.
      lastTtsAnswerStreamedRef: { current: null },
      TTS_API_PATH: '/api/ios/v2.1.0/tts/inworld',
      requestTtsModel,
      nativeAppUpdate: null,
      resolveConversationSessionKey: () => 'session-1',
      getOrCreateTrackingUserId: () => 'tracking-1',
      buildTrackingRequestHeaders: () => ({}),
      // Coin balance side effects of the response; irrelevant to the request wiring.
      applyCoinBalanceFromHeaders: () => {},
      notifyCoinsExhausted: () => {},
    },
  }
}

const input: BubbleTtsInput = { playbackKey: 'utt-1:ko', text: '안녕하세요', language: 'ko' }

describe('bubble-tap TTS request wiring', () => {
  it('sends the TTS model the user picked, like the auto TTS path', async () => {
    const { requests, context } = buildContext('inworld-tts-1.5-mini')
    const blob = await bubbleTtsCallback(context)(input)

    expect((blob as Blob | null)?.type).toBe('audio/wav')
    expect(requests).toHaveLength(1)
    expect(requests[0].url).toBe('/api/ios/v2.1.0/tts/inworld')
    expect(requests[0].body.ttsModel).toBe('inworld-tts-1.5-mini')
  })

  it('omits ttsModel while the user has not picked one, so the server default applies', async () => {
    const { requests, context } = buildContext(undefined)
    await bubbleTtsCallback(context)(input)

    expect(requests).toHaveLength(1)
    expect(requests[0].body).not.toHaveProperty('ttsModel')
    expect(requests[0].body).toMatchObject({
      text: '안녕하세요',
      language: 'ko',
      sessionKey: 'session-1',
      clientMessageId: 'utt-1:ko',
    })
  })

  it('asks for a stream only from a shell that plays one, and returns the clip on its first audio', async () => {
    const plain = buildContext(undefined, { capabilities: { type: 'capabilities', nativeTts: true } })
    await bubbleTtsCallback(plain.context)(input)
    expect(plain.requests[0].body).not.toHaveProperty('stream')

    const streaming = buildContext(undefined, {
      capabilities: { type: 'capabilities', nativeTts: true, ttsStream: true },
      streamedResponse: true,
    })
    const clip = await bubbleTtsCallback(streaming.context)(input)
    expect(streaming.requests[0].body.stream).toBe(true)
    expect(clip).toBeInstanceOf(StreamingTtsClip)
    expect((await (clip as StreamingTtsClip).whenComplete()).size).toBe(44 + 4800)
  })

  it('takes a whole clip when the server answers a stream request without streaming', async () => {
    const { context } = buildContext(undefined, { capabilities: { type: 'capabilities', ttsStream: true } })
    const blob = await bubbleTtsCallback(context)(input)
    expect((blob as Blob).type).toBe('audio/wav')
  })
})
