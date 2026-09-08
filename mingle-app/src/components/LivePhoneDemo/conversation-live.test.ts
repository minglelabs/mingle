import { describe, expect, it, vi } from 'vitest'
import { LivePreviewSender, RemotePreviews, type PreviewEvent } from './conversation-live'
import { createUtteranceStoreState, mergeServerHydrationUtteranceIntoStoreState, appendFinalizedUtteranceToStoreState, mergeDisplayUtterances, normalizeConversationHydrationUtterances } from './use-realtime-stt'
import { LiveUtterances } from '../../../../mingle-messaging/live-utterances'
import { verifyVoiceOrderReceipt } from '@/lib/voice-order-receipt'

const utterance = { id: 'voice', originalText: 'hello', originalLang: 'en', translations: {}, speakerUserId: 'alice', createdAtMs: 1000 }
const preview = (revision: number, final = false): PreviewEvent => ({ type: 'utterance_preview', sessionKey: 'room', revision,
  final, expiresAt: Date.now() + 15000, utterance: { ...utterance, createdAtMs: 1000 } })

describe('remote live message lifecycle', () => {
  it.each([0, 50])('keeps both phones in the same order through opposite finalization, translation, and cached hydration (gap %s)', gap => {
    const alice = { ...utterance, id: 'client-z', createdAtMs: 9000 }
    const bob = { ...utterance, id: 'client-a', speakerUserId: 'bob', createdAtMs: 1 }
    const timeFor = (userId?: string | null) => 1000 + (userId === 'bob' ? gap : 0)
    const expected = gap === 0 ? ['client-a', 'client-z'] : ['client-z', 'client-a']
    // Equal server timestamps exercise the tie-breaker too. Local clocks and
    // database IDs deliberately disagree with the shared message identity.
    for (const viewer of ['alice', 'bob']) {
      const previews = new RemotePreviews()
      for (const u of [alice, bob]) previews.accept({ ...preview(1), utterance: { ...u, createdAtMs: timeFor(u.speakerUserId) } })
      let state = createUtteranceStoreState([])
      let localLive = [viewer === 'alice' ? alice : bob]
      const display = () => mergeDisplayUtterances({ utterances: state.utterances,
        liveUtterances: [...localLive.map(u => previews.applyOrder(u)), ...previews.visible(state.utterances, viewer)] }).map(u => u.id)
      expect(display()).toEqual(expected)
      // Local final replaces the preview before the DB response.
      state = appendFinalizedUtteranceToStoreState(state, previews.applyOrder(localLive[0]))
      localLive = []
      expect(display()).toEqual(expected)
      // Disposing the preview must not dispose its order reservation.
      expect(previews.orderFor(viewer, state.utterances[0].id)).toBe(timeFor(viewer))
      const snapshots = [alice, bob].map((u, i) => ({ ...u, serverCreatedAtMs: timeFor(u.speakerUserId), serverMessageId: `db-${i}`, originalText: 'finished' }))
      for (const snapshot of viewer === 'alice' ? snapshots : [...snapshots].reverse()) {
        state = mergeServerHydrationUtteranceIntoStoreState(state, snapshot)
        expect(display()).toEqual(expected)
      }
      for (const snapshot of snapshots) {
        state = mergeServerHydrationUtteranceIntoStoreState(state, { ...snapshot, translations: { ko: '완료' } })
        expect(display()).toEqual(expected)
      }
      state = createUtteranceStoreState(normalizeConversationHydrationUtterances(JSON.parse(JSON.stringify(state.utterances))))
      expect(display()).toEqual(expected)
    }
  })

  it('retains reserved order in a pre-DB cache after disposing the preview', () => {
    const remote = new RemotePreviews()
    remote.accept(preview(1))
    const finalized = remote.applyOrder(utterance)
    expect(finalized.serverCreatedAtMs).toBe(1000)
    remote.visible([finalized], 'alice')
    expect(remote.applyOrder({ ...utterance, createdAtMs: 5000 }).serverCreatedAtMs).toBe(1000)
    expect(normalizeConversationHydrationUtterances([finalized])[0].serverCreatedAtMs).toBe(1000)
    remote.clear()
    expect(remote.orderFor('alice', 'voice')).toBeUndefined()
  })

  it('applies the first echo to a turn already finalized locally without losing text or translation', () => {
    const remote = new RemotePreviews()
    const finalized = { ...utterance, originalText: 'finished', translations: { ko: '완료' } }
    remote.accept(preview(1))
    expect(remote.applyOrder(finalized)).toMatchObject({
      serverCreatedAtMs: 1000, originalText: 'finished', translations: { ko: '완료' },
    })
    const persisted = { ...finalized, serverCreatedAtMs: 999, serverMessageId: 'db-1' }
    expect(remote.applyOrder(persisted)).toBe(persisted)
  })
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
