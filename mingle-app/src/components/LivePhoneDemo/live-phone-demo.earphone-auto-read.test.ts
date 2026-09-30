import { describe, expect, it } from 'vitest'
import type { Utterance } from './ChatBubble'
import {
  EarphoneAutoReadController,
  type EarphoneAutoReadControllerOptions,
  type EarphoneAutoReadDispatchItem,
  type EarphoneAutoReadSnapshot,
} from './live-phone-demo.earphone-auto-read'
import { EARPHONE_MODE_AUDIO_TIMEOUT_MS, EARPHONE_MODE_STALL_TIMEOUT_MS } from './live-phone-demo.earphone-mode.logic'

const display = {
  preferredDisplayLanguage: 'ko',
  preferredDisplayLanguages: ['ko'],
  defaultDisplayLanguage: 'ko',
  languageOrder: ['ko', 'en'],
}

function message(id: string, startedAtMs: number, overrides: Partial<Utterance> = {}): Utterance {
  return {
    id,
    originalText: `text ${id}`,
    originalLang: 'en',
    targetLanguages: ['ko', 'en'],
    translations: { ko: `번역 ${id}` },
    translationFinalized: { ko: true },
    createdAtMs: startedAtMs,
    speakerUserId: 'partner',
    ...overrides,
  }
}

// Same row while it is still being spoken / translated.
function incomplete(row: Utterance): Utterance {
  return { ...row, translations: {}, translationFinalized: {}, translationStatus: 'pending' }
}

function key(id: string) {
  return `translation:${id}:ko`
}

async function flushAsync() {
  await new Promise((resolve) => setTimeout(resolve, 0))
}

function createHarness(options: Partial<EarphoneAutoReadControllerOptions> = {}) {
  let now = 10_000_000
  let nextTimerId = 1
  const timers = new Map<number, { at: number, callback: () => void }>()
  const requests = new Map<string, { resolve: (blob: Blob | null) => void, signal: AbortSignal }>()
  const requestOrder: string[] = []
  const dispatched: EarphoneAutoReadDispatchItem[] = []
  const queuedKeys: string[][] = []
  const state = { engineIdle: true, gateOpen: true }

  const controller = new EarphoneAutoReadController({
    now: () => now,
    setTimer: (callback, delayMs) => {
      const id = nextTimerId
      nextTimerId += 1
      timers.set(id, { at: now + delayMs, callback })
      return id
    },
    clearTimer: (handle) => { timers.delete(handle as number) },
    synthesize: (target, signal) => new Promise((resolve) => {
      requests.set(target.playbackKey, { resolve, signal })
      requestOrder.push(target.playbackKey)
    }),
    isEngineIdle: () => state.engineIdle,
    canDispatch: () => state.gateOpen,
    dispatch: (item) => {
      dispatched.push(item)
      state.engineIdle = false
    },
    onQueuedPlaybackKeysChange: (keys) => queuedKeys.push([...keys]),
    ...options,
  })

  const snapshot = (committed: Utterance[], drafts: Utterance[] = [], conversationKey = 'room-1'): EarphoneAutoReadSnapshot => ({
    conversationKey,
    committed,
    drafts,
    display,
    viewerUserId: 'viewer',
  })

  return {
    controller,
    state,
    dispatched,
    queuedKeys,
    requests,
    requestOrder,
    snapshot,
    now: () => now,
    async advance(ms: number) {
      now += ms
      for (const [id, timer] of [...timers.entries()].sort((a, b) => a[1].at - b[1].at)) {
        if (timer.at > now || !timers.has(id)) continue
        timers.delete(id)
        timer.callback()
      }
      await flushAsync()
    },
    async resolveAudio(playbackKey: string, blob: Blob | null = new Blob(['audio'])) {
      const request = requests.get(playbackKey)
      if (!request) throw new Error(`no request for ${playbackKey}`)
      request.resolve(blob)
      await flushAsync()
    },
    async finishPlayback() {
      state.engineIdle = true
      controller.pump()
      await flushAsync()
    },
    dispatchedIds: () => dispatched.map((item) => item.utteranceId),
  }
}

describe('EarphoneAutoReadController watermark', () => {
  it('never reads what existed at the rising edge, reads what completes after it', async () => {
    const h = createHarness()
    const old = message('old', 1_000)
    h.controller.arm(h.snapshot([old]))
    expect(h.requestOrder).toEqual([])

    const fresh = message('fresh', h.now() + 100)
    h.controller.update(h.snapshot([old, fresh]))
    expect(h.requestOrder).toEqual([key('fresh')])
    await h.resolveAudio(key('fresh'))
    expect(h.dispatchedIds()).toEqual(['fresh'])
    expect(h.dispatched[0]).toMatchObject({ language: 'ko', kind: 'translation', text: '번역 fresh' })
  })

  it('reads a draft that was being spoken at the edge once it completes', async () => {
    const h = createHarness()
    const speaking = message('speaking', 1_000)
    h.controller.arm(h.snapshot([], [incomplete(speaking)]))
    h.controller.update(h.snapshot([speaking]))
    await h.resolveAudio(key('speaking'))
    expect(h.dispatchedIds()).toEqual(['speaking'])
  })

  it('starts a new watermark on every rising edge: nothing from the disconnected period is read', async () => {
    const h = createHarness()
    h.controller.arm(h.snapshot([]))
    h.controller.disarm()
    const whileOff = message('while-off', h.now() + 10)
    h.controller.update(h.snapshot([whileOff]))
    h.controller.arm(h.snapshot([whileOff]))
    await h.advance(1)
    expect(h.requestOrder).toEqual([])

    const afterReconnect = message('after', h.now() + 10)
    h.controller.update(h.snapshot([whileOff, afterReconnect]))
    await h.resolveAudio(key('after'))
    expect(h.dispatchedIds()).toEqual(['after'])
  })

  it('resets per conversation', async () => {
    const h = createHarness()
    h.controller.arm(h.snapshot([], [], 'room-1'))
    const otherRoomHistory = message('other-room', h.now() + 10)
    h.controller.update(h.snapshot([otherRoomHistory], [], 'room-2'))
    await h.advance(1)
    expect(h.requestOrder).toEqual([])
  })

  it('ignores older pages loaded after the edge', async () => {
    const h = createHarness()
    const newest = message('newest', h.now() - 60_000)
    h.controller.arm(h.snapshot([newest]))
    const olderPage = [message('older-1', h.now() - 3_600_000), message('older-2', h.now() - 3_000_000)]
    h.controller.update(h.snapshot([...olderPage, newest]))
    await h.advance(1)
    expect(h.requestOrder).toEqual([])
  })
})

describe('EarphoneAutoReadController ordering', () => {
  it('plays in start order when completion order differs, prefetching at completion', async () => {
    const h = createHarness()
    h.controller.arm(h.snapshot([]))
    const first = message('first', h.now() + 100)
    const second = message('second', h.now() + 200)
    h.controller.update(h.snapshot([], [incomplete(first), incomplete(second)]))

    // The later-started message completes first: its audio is fetched now...
    h.controller.update(h.snapshot([second], [incomplete(first)]))
    expect(h.requestOrder).toEqual([key('second')])
    await h.resolveAudio(key('second'))
    // ...but it waits for the earlier-started one.
    expect(h.dispatchedIds()).toEqual([])

    h.controller.update(h.snapshot([incomplete(first), second]))
    h.controller.update(h.snapshot([first, second]))
    await h.resolveAudio(key('first'))
    expect(h.dispatchedIds()).toEqual(['first'])
    await h.finishPlayback()
    expect(h.dispatchedIds()).toEqual(['first', 'second'])
  })

  it('evaluates the order at dequeue time (a server start that lands late re-orders)', async () => {
    const h = createHarness()
    h.controller.arm(h.snapshot([]))
    h.state.engineIdle = false // a manual clip is playing
    const own = message('own', h.now() + 100, { originalLang: 'ko', originalText: '네', translations: {}, translationFinalized: {}, speakerUserId: 'viewer' })
    const partner = message('partner', h.now() + 200)
    h.controller.update(h.snapshot([own, partner]))
    await h.resolveAudio('original:own:ko')
    await h.resolveAudio(key('partner'))

    // The server-reserved start of `own` arrives: it actually started after `partner`.
    h.controller.update(h.snapshot([{ ...own, serverCreatedAtMs: h.now() + 300 }, partner]))
    await h.finishPlayback()
    expect(h.dispatchedIds()).toEqual(['partner'])
    await h.finishPlayback()
    expect(h.dispatchedIds()).toEqual(['partner', 'own'])
  })

  it('holds behind an incomplete earlier message, then skips it after 15 s without progress', async () => {
    const h = createHarness()
    h.controller.arm(h.snapshot([]))
    const stuck = incomplete(message('stuck', h.now() + 100))
    const ready = message('ready', h.now() + 200)
    h.controller.update(h.snapshot([stuck, ready]))
    await h.resolveAudio(key('ready'))
    expect(h.dispatchedIds()).toEqual([])

    await h.advance(10_000)
    // Progress (text changed) restarts the wait.
    h.controller.update(h.snapshot([{ ...stuck, originalText: 'text stuck, more' }, ready]))
    await h.advance(EARPHONE_MODE_STALL_TIMEOUT_MS - 1)
    expect(h.dispatchedIds()).toEqual([])
    await h.advance(1)
    expect(h.dispatchedIds()).toEqual(['ready'])
    expect(h.controller.getCandidateStatus('stuck')).toBe('skipped')

    // Completing later does not bring it back.
    await h.finishPlayback()
    h.controller.update(h.snapshot([message('stuck', stuck.createdAtMs!), ready]))
    await h.advance(1)
    expect(h.dispatchedIds()).toEqual(['ready'])
  })

  it('stops waiting for a message that is removed or cancelled', async () => {
    const h = createHarness()
    h.controller.arm(h.snapshot([]))
    const cancelled = incomplete(message('cancelled', h.now() + 100))
    const ready = message('ready', h.now() + 200)
    h.controller.update(h.snapshot([ready], [cancelled]))
    await h.resolveAudio(key('ready'))
    expect(h.dispatchedIds()).toEqual([])

    h.controller.update(h.snapshot([ready]))
    await flushAsync()
    expect(h.dispatchedIds()).toEqual(['ready'])
    expect(h.controller.getCandidateStatus('cancelled')).toBe('skipped')
  })

  it('skips a message whose audio fails or never arrives', async () => {
    const h = createHarness()
    h.controller.arm(h.snapshot([]))
    const failing = message('failing', h.now() + 100)
    const slow = message('slow', h.now() + 200)
    const last = message('last', h.now() + 300)
    h.controller.update(h.snapshot([failing, slow, last]))
    await h.resolveAudio(key('failing'), null)
    await h.resolveAudio(key('last'))
    expect(h.dispatchedIds()).toEqual([])

    await h.advance(EARPHONE_MODE_AUDIO_TIMEOUT_MS)
    expect(h.requests.get(key('slow'))?.signal.aborted).toBe(true)
    expect(h.dispatchedIds()).toEqual(['last'])
  })

  it('does not let a photo or an empty message block the queue', async () => {
    const h = createHarness()
    h.controller.arm(h.snapshot([]))
    const photo = message('photo', h.now() + 100, { image: { conversationId: 'room-1', messageId: 'photo', width: 10, height: 10 } })
    const text = message('text', h.now() + 200)
    h.controller.update(h.snapshot([photo, text]))
    await h.resolveAudio(key('text'))
    expect(h.dispatchedIds()).toEqual(['text'])
  })

  it('prefetches at most three clips at once, in order', async () => {
    const h = createHarness()
    h.controller.arm(h.snapshot([]))
    h.state.engineIdle = false
    const rows = [1, 2, 3, 4, 5].map((n) => message(`m${n}`, h.now() + n))
    h.controller.update(h.snapshot(rows))
    expect(h.requestOrder).toEqual([key('m1'), key('m2'), key('m3')])
    await h.resolveAudio(key('m1'))
    expect(h.requestOrder).toEqual([key('m1'), key('m2'), key('m3'), key('m4')])
  })
})

describe('EarphoneAutoReadController gate and manual preemption', () => {
  it('exposes queued items so their bubbles show the static "…"', async () => {
    const h = createHarness()
    h.controller.arm(h.snapshot([]))
    h.state.engineIdle = false
    h.controller.update(h.snapshot([message('a', h.now() + 1), message('b', h.now() + 2)]))
    expect(h.queuedKeys.at(-1)).toEqual([key('a'), key('b')])
    await h.resolveAudio(key('a'))
    await h.finishPlayback()
    expect(h.dispatchedIds()).toEqual(['a'])
    expect(h.queuedKeys.at(-1)).toEqual([key('b')])
  })

  it('drops every auto item on a falling edge and never dispatches once the gate is closed', async () => {
    const h = createHarness()
    h.controller.arm(h.snapshot([]))
    const a = message('a', h.now() + 1)
    const b = message('b', h.now() + 2)
    h.controller.update(h.snapshot([a, b]))
    await h.resolveAudio(key('a'))
    expect(h.dispatchedIds()).toEqual(['a'])

    // Unplugged while `a` plays and `b` is still being fetched.
    h.controller.disarm()
    expect(h.requests.get(key('b'))?.signal.aborted).toBe(true)
    expect(h.queuedKeys.at(-1)).toEqual([])
    await h.resolveAudio(key('b'))
    await h.finishPlayback()
    expect(h.dispatchedIds()).toEqual(['a'])
  })

  it('re-checks the gate synchronously before handing over a clip', async () => {
    const h = createHarness()
    h.controller.arm(h.snapshot([]))
    h.controller.update(h.snapshot([message('a', h.now() + 1)]))
    h.state.gateOpen = false
    await h.resolveAudio(key('a'))
    expect(h.dispatchedIds()).toEqual([])
  })

  it('lets a manual tap interrupt, then continues with the next queued item', async () => {
    const h = createHarness()
    h.controller.arm(h.snapshot([]))
    const a = message('a', h.now() + 1)
    const b = message('b', h.now() + 2)
    const c = message('c', h.now() + 3)
    h.controller.update(h.snapshot([a, b, c]))
    await h.resolveAudio(key('a'))
    await h.resolveAudio(key('b'))
    await h.resolveAudio(key('c'))
    expect(h.dispatchedIds()).toEqual(['a'])

    // Manual tap on `c`'s bubble while `a` plays: the room stops `a` and
    // plays `c` manually (the player stays busy); `a` is dropped, `c` is not
    // read again by auto.
    h.controller.consumePlaybackKey(key('c'))
    h.controller.pump()
    expect(h.dispatchedIds()).toEqual(['a'])

    await h.finishPlayback()
    expect(h.dispatchedIds()).toEqual(['a', 'b'])
    await h.finishPlayback()
    expect(h.dispatchedIds()).toEqual(['a', 'b'])
    expect(h.controller.getCandidateStatus('c')).toBe('dispatched')
  })
})
