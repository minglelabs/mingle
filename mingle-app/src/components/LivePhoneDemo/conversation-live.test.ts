import { describe, expect, it, vi } from 'vitest'
import { LivePreviewSender, RemotePreviews, type PreviewEvent } from './conversation-live'
import { createUtteranceStoreState, mergeServerHydrationUtteranceIntoStoreState } from './use-realtime-stt'
import { LiveUtterances } from '../../../../mingle-messaging/live-utterances'
import { verifyVoiceOrderReceipt } from '@/lib/voice-order-receipt'

const utterance = { id: 'voice', originalText: 'hello', originalLang: 'en', translations: {}, speakerUserId: 'alice', createdAtMs: 1000 }
const preview = (revision: number, final = false): PreviewEvent => ({ type: 'utterance_preview', sessionKey: 'room', revision,
  final, expiresAt: Date.now() + 15000, utterance: { ...utterance, createdAtMs: 1000 } })

describe('remote live message lifecycle', () => {
  it('shows speech before any DB message, rejects regression, then replaces it with one translated committed bubble', () => {
    const remote = new RemotePreviews()
    remote.accept(preview(1))
    expect(remote.visible([], 'bob')).toHaveLength(1)
    expect(remote.visible([], 'alice')).toHaveLength(0)
    remote.accept({ ...preview(3, true), utterance: { ...utterance, originalText: 'hello world' } })
    expect(remote.accept(preview(2))).toBe(false)
    expect(remote.accept(preview(4))).toBe(false)
    expect(remote.visible([], 'bob')[0].originalText).toBe('hello world')
    let state = mergeServerHydrationUtteranceIntoStoreState(createUtteranceStoreState([]), {
      ...utterance, originalText: 'hello world', serverMessageId: 'db-1', translations: { ko: '안녕하세요' },
    })
    expect(remote.visible(state.utterances, 'bob')).toHaveLength(0)
    // A late source-only push must not erase the translation or add a row.
    state = mergeServerHydrationUtteranceIntoStoreState(state, { ...utterance, originalText: 'hello world', serverMessageId: 'db-1' })
    expect(state.utterances).toHaveLength(1)
    expect(state.utterances[0].translations.ko).toBe('안녕하세요')
    expect(remote.visible([], 'bob')).toHaveLength(0)
  })
  it('expires disconnected drafts and coalesces offline partials without replaying a backlog', () => {
    const remote = new RemotePreviews()
    remote.accept(preview(1))
    expect(remote.expire(Date.now() + 16000)).toBe(true)
    expect(remote.visible([], 'bob')).toEqual([])
    const sender = new LivePreviewSender()
    sender.setPartials([utterance])
    sender.setPartials([{ ...utterance, originalText: 'latest words' }])
    sender.flush(() => false)
    const send = vi.fn((frame: Record<string, unknown>) => Boolean(frame))
    sender.flush(send)
    expect(send).toHaveBeenCalledOnce()
    expect(send.mock.calls[0][0]).toMatchObject({ originalText: 'latest words', final: false })
    sender.update({ ...utterance, originalText: 'finished' }, true)
    sender.setPartials([])
    sender.flush(send)
    expect(send.mock.calls[1][0]).toMatchObject({ originalText: 'finished', final: true })
    sender.committed('voice')
    sender.flush(send, Date.now() + 2000)
    expect(send).toHaveBeenCalledTimes(2)
  })
  it('uses the same authenticated start-order receipt for live display and durable persistence', () => {
    vi.stubEnv('MINGLE_REALTIME_SECRET', 'live-order-test')
    try {
      const events = new LiveUtterances()
      const frame = events.accept({ id: 'voice', originalText: 'hello', sequence: 1 }, {
        userId: 'alice', sessionKey: 'room', exp: Date.now() + 30000, liveWriter: { name: 'Alice' },
      }, 'live-order-test')!
      expect(verifyVoiceOrderReceipt(frame.orderReceipt, { userId: 'alice', sessionKey: 'room', clientMessageId: 'voice' })).toBe(frame.utterance.createdAtMs)
      expect(verifyVoiceOrderReceipt(frame.orderReceipt, { userId: 'bob', sessionKey: 'room', clientMessageId: 'voice' })).toBeNull()
    } finally { vi.unstubAllEnvs() }
  })
})
