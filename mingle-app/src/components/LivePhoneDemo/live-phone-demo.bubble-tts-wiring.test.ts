import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

// Exercise the real bubble-tap TTS callback without mounting the room, so the
// request it sends stays checked: there is one TTS model, chosen by the server.
const source = readFileSync(new URL('./LivePhoneDemo.tsx', import.meta.url), 'utf8')
const tree = ts.createSourceFile('LivePhoneDemo.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)

type BubbleTtsInput = { playbackKey: string, text: string, language: string }

function bubbleTtsCallback(context: Record<string, unknown>): (input: BubbleTtsInput) => Promise<Blob | null> {
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

function buildContext() {
  const requests: Array<{ url: string, body: Record<string, unknown> }> = []
  const fetch = async (url: string, init: RequestInit) => {
    requests.push({ url, body: JSON.parse(String(init.body)) })
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
      TTS_API_PATH: '/api/ios/v2.1.0/tts/inworld',
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
  it('asks the TTS route for the tapped text and never names a model', async () => {
    const { requests, context } = buildContext()
    const blob = await bubbleTtsCallback(context)(input)

    expect(blob?.type).toBe('audio/wav')
    expect(requests).toHaveLength(1)
    expect(requests[0].url).toBe('/api/ios/v2.1.0/tts/inworld')
    expect(requests[0].body).not.toHaveProperty('ttsModel')
    expect(requests[0].body).toMatchObject({
      text: '안녕하세요',
      language: 'ko',
      sessionKey: 'session-1',
      clientMessageId: 'utt-1:ko',
    })
  })
})
