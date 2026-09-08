import { expect, it } from 'vitest'
import { compareUtteranceOrder, utteranceOrderTime } from './utterance-order'
import { createUtteranceStoreState, mergeServerHydrationUtteranceIntoStoreState, mergeDisplayUtterances } from './use-realtime-stt'

const message = (id: string, createdAtMs: number) => ({ id, createdAtMs, originalText: id, originalLang: 'en', translations: {} })

it('converges different sender caches on identical server order and preserves capture timestamps', () => {
  const start = 1700000000000
  const a = message('a', start)
  const b = message('b', start + 500)
  const snapshot = [
    { ...a, createdAtMs: start + 2000, serverCreatedAtMs: start + 2000, serverMessageId: 'db-a' },
    { ...b, createdAtMs: start + 2500, serverCreatedAtMs: start + 2500, serverMessageId: 'db-b' },
  ]
  for (const original of [a, b]) {
    let store = createUtteranceStoreState([original])
    for (let i = 0; i < 3; i++) store = snapshot.reduce(mergeServerHydrationUtteranceIntoStoreState, store)
    expect(store.utterances.map(u => u.id)).toEqual(['a', 'b'])
    expect(store.utterances.find(u => u.id === original.id)?.createdAtMs).toBe(original.createdAtMs)
    const cached = createUtteranceStoreState(JSON.parse(JSON.stringify(store.utterances)))
    expect(mergeDisplayUtterances({ utterances: cached.utterances, liveUtterances: [] }).map(u => u.id)).toEqual(['a', 'b'])
    expect([...cached.utterances].sort(compareUtteranceOrder).map(u => u.id)).toEqual(['a', 'b'])
  }
})

it('breaks equal server timestamps by server ID regardless of receipt or capture order', () => {
  const a = { ...message('client-z', 10), serverCreatedAtMs: 100, serverMessageId: 'db-a' }
  const b = { ...message('client-a', 1), serverCreatedAtMs: 100, serverMessageId: 'db-b' }
  for (const snapshot of [[a, b], [b, a]]) {
    const store = snapshot.reduce(mergeServerHydrationUtteranceIntoStoreState, createUtteranceStoreState([]))
    expect(store.utterances.map(u => u.id)).toEqual(['client-z', 'client-a'])
    expect(mergeDisplayUtterances({ utterances: store.utterances, liveUtterances: [] }).map(u => u.id)).toEqual(['client-z', 'client-a'])
  }
})

it('reconciles reversed old caches and older pages despite device clock skew', () => {
  const time = 1700000000000
  const a = message('a', time + 600000)
  const b = message('b', time - 600000)
  const c = message('c', time)
  const snapshot = [a, b, c].map((u, i) => ({
    ...u, createdAtMs: time + i, serverCreatedAtMs: time + i, serverMessageId: `db-${u.id}`,
  }))
  let store = createUtteranceStoreState([c, b, a])
  // The latest page can arrive before older history.
  store = mergeServerHydrationUtteranceIntoStoreState(store, snapshot[2])
  store = [snapshot[1], snapshot[0]].reduce(mergeServerHydrationUtteranceIntoStoreState, store)
  expect(store.utterances.map(u => u.id)).toEqual(['a', 'b', 'c'])
  expect(mergeDisplayUtterances({ utterances: store.utterances, liveUtterances: [] }).map(u => u.id)).toEqual(['a', 'b', 'c'])
  const same = snapshot.reduce(mergeServerHydrationUtteranceIntoStoreState, store)
  expect(same).toBe(store)
})

it('keeps pending capture time and safely handles a malformed cached timestamp', () => {
  expect(utteranceOrderTime(message('pending', 123))).toBe(123)
  expect(utteranceOrderTime({ ...message('cached', 123), serverCreatedAtMs: NaN })).toBe(123)
  expect(utteranceOrderTime({ id: 'legacy', createdAtMs: NaN })).toBe(0)
})

it('keeps a long voice turn before a reply that was persisted first', () => {
  const started = 1700000000000
  const voice = { ...message('voice', started), serverCreatedAtMs: started, serverMessageId: 'db-voice' }
  const reply = { ...message('reply', started + 10000), serverCreatedAtMs: started + 10000, serverMessageId: 'db-reply' }
  // The reply arrives first; the voice final snapshot arrives much later.
  for (const cached of [[voice], [reply]]) {
    let store = createUtteranceStoreState(cached)
    store = [reply, { ...voice, createdAtMs: started + 60000 }].reduce(mergeServerHydrationUtteranceIntoStoreState, store)
    expect(store.utterances.map(u => u.id)).toEqual(['voice', 'reply'])
  }
})
