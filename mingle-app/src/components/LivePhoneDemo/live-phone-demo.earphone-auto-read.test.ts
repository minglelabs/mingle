import { describe, expect, it } from 'vitest'
import type { Utterance } from './ChatBubble'
import {
  EarphoneAutoReadController,
  type EarphoneAutoReadControllerOptions,
  type EarphoneAutoReadDispatchItem,
  type EarphoneAutoReadSnapshot,
} from './live-phone-demo.earphone-auto-read'
import {
  EARPHONE_MODE_AUDIO_TIMEOUT_MS,
  EARPHONE_MODE_STALL_TIMEOUT_MS,
  type EarphoneModeReadContext,
} from './live-phone-demo.earphone-mode.logic'

// The session reads Korean unless a test picks another language.
const koRead: EarphoneModeReadContext = { readLanguage: 'ko', languageOrder: ['ko', 'en', 'ja'] }

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
  const audioRequests: Array<{
    playbackKey: string
    resolve: (blob: Blob | null) => void
    signal: AbortSignal
  }> = []
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
      audioRequests.push({ playbackKey: target.playbackKey, resolve, signal })
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

  const snapshot = (
    committed: Utterance[],
    drafts: Utterance[] = [],
    conversationKey = 'room-1',
    read: EarphoneModeReadContext = koRead,
  ): EarphoneAutoReadSnapshot => ({
    conversationKey,
    committed,
    drafts,
    read,
    viewerUserId: 'viewer',
  })

  return {
    controller,
    state,
    dispatched,
    queuedKeys,
    requests,
    audioRequests,
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
    async resolveAudioRequest(index: number, blob: Blob | null = new Blob(['audio'])) {
      const request = audioRequests[index]
      if (!request) throw new Error(`no audio request at index ${index}`)
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

describe('EarphoneAutoReadController translation pending at the rising edge', () => {
  it('reads a message committed before the edge whose translation completes after it, in start order', async () => {
    const h = createHarness()
    // Own message: committed, its durable translation still pending.
    const own = message('own', h.now() - 2_000, { speakerUserId: 'viewer' })
    // Partner message: the source was persisted before the translation.
    const partner = message('partner', h.now() - 1_000)
    const partnerUntranslated: Utterance = { ...partner, translations: {}, translationFinalized: {} }
    h.controller.arm(h.snapshot([incomplete(own), partnerUntranslated]))
    await h.advance(1)
    expect(h.requestOrder).toEqual([])

    // A message that starts after the edge completes first: it is prefetched
    // but waits for the two that started earlier.
    const fresh = message('fresh', h.now() + 100)
    h.controller.update(h.snapshot([incomplete(own), partnerUntranslated, fresh]))
    expect(h.requestOrder).toEqual([key('fresh')])
    await h.resolveAudio(key('fresh'))
    expect(h.dispatchedIds()).toEqual([])

    // The own translation lands.
    h.controller.update(h.snapshot([own, partnerUntranslated, fresh]))
    await h.resolveAudio(key('own'))
    expect(h.dispatchedIds()).toEqual(['own'])

    // The partner translation streams (interim), then settles.
    h.controller.update(h.snapshot([own, { ...partner, translations: { ko: '번역 중' }, translationFinalized: { ko: false } }, fresh]))
    expect(h.requestOrder).toEqual([key('fresh'), key('own')])
    h.controller.update(h.snapshot([own, partner, fresh]))
    await h.resolveAudio(key('partner'))
    await h.finishPlayback()
    expect(h.dispatchedIds()).toEqual(['own', 'partner'])
    await h.finishPlayback()
    expect(h.dispatchedIds()).toEqual(['own', 'partner', 'fresh'])
  })

  it('keeps what was readable at the edge existing and never reads what completed while the gate was closed', async () => {
    const h = createHarness()
    const readable = message('readable', h.now() - 5_000)
    h.controller.arm(h.snapshot([readable]))
    // A later re-translation of an existing message is not a new message.
    h.controller.update(h.snapshot([{ ...readable, translations: { ko: '다시 번역 readable' } }]))
    await h.advance(1)
    expect(h.requestOrder).toEqual([])

    const landedWhileOff = message('landed-while-off', h.now() + 10)
    const stillPending = message('still-pending', h.now() + 20)
    h.controller.update(h.snapshot([readable, incomplete(landedWhileOff), incomplete(stillPending)]))
    // Unplugged: one translation lands while the gate is closed, the other is
    // still pending when the earphones come back.
    h.controller.disarm()
    h.controller.update(h.snapshot([readable, landedWhileOff, incomplete(stillPending)]))
    h.controller.arm(h.snapshot([readable, landedWhileOff, incomplete(stillPending)]))
    await h.advance(1)
    expect(h.requestOrder).toEqual([])

    h.controller.update(h.snapshot([readable, landedWhileOff, stillPending]))
    expect(h.requestOrder).toEqual([key('still-pending')])
    await h.resolveAudio(key('still-pending'))
    expect(h.dispatchedIds()).toEqual(['still-pending'])
    expect(h.controller.getCandidateStatus('landed-while-off')).toBeUndefined()
    expect(h.controller.getCandidateStatus('readable')).toBeUndefined()
  })
})

describe('EarphoneAutoReadController prefetch slots', () => {
  it('releases the slots of queued clips that manual taps consume while they synthesize', async () => {
    const h = createHarness()
    h.controller.arm(h.snapshot([]))
    h.state.engineIdle = false // a clip is playing
    const rows = [1, 2, 3, 4, 5].map((n) => message(`m${n}`, h.now() + n))
    h.controller.update(h.snapshot(rows))
    expect(h.requestOrder).toEqual([key('m1'), key('m2'), key('m3')])

    // The user taps the three bubbles whose auto audio is still synthesizing.
    for (const id of ['m1', 'm2', 'm3']) h.controller.consumePlaybackKey(key(id))
    expect(['m1', 'm2', 'm3'].map((id) => h.requests.get(key(id))?.signal.aborted)).toEqual([true, true, true])

    // The manual clip ends: the freed slots go to the next messages at once.
    await h.finishPlayback()
    expect(h.requestOrder).toEqual([key('m1'), key('m2'), key('m3'), key('m4'), key('m5')])
    await h.resolveAudio(key('m4'))
    expect(h.dispatchedIds()).toEqual(['m4'])

    // A late answer to an aborted request changes nothing.
    await h.resolveAudio(key('m1'))
    await h.finishPlayback()
    expect(h.dispatchedIds()).toEqual(['m4'])
    expect(h.controller.getCandidateStatus('m1')).toBe('dispatched')
  })

  it('releases the slot of a message removed while its audio synthesizes', async () => {
    const h = createHarness()
    h.controller.arm(h.snapshot([]))
    h.state.engineIdle = false
    const rows = [1, 2, 3, 4].map((n) => message(`m${n}`, h.now() + n))
    h.controller.update(h.snapshot(rows))
    expect(h.requestOrder).toEqual([key('m1'), key('m2'), key('m3')])

    h.controller.update(h.snapshot(rows.slice(1)))
    expect(h.requests.get(key('m1'))?.signal.aborted).toBe(true)
    expect(h.controller.getCandidateStatus('m1')).toBe('skipped')
    expect(h.requestOrder).toEqual([key('m1'), key('m2'), key('m3'), key('m4')])
  })

  it('wakes up at the audio timeout when the head waits for a slot held by hung requests', async () => {
    const h = createHarness()
    h.controller.arm(h.snapshot([]))
    const head = message('head', h.now() + 1)
    const later = [2, 3, 4].map((n) => message(`m${n}`, h.now() + n))
    // The three later messages complete first and take every slot.
    h.controller.update(h.snapshot([incomplete(head), ...later]))
    expect(h.requestOrder).toEqual([key('m2'), key('m3'), key('m4')])

    await h.advance(1_000)
    h.controller.update(h.snapshot([head, ...later]))
    expect(h.requestOrder).toEqual([key('m2'), key('m3'), key('m4')])

    // Nothing else happens: the hung requests time out and the head gets a slot.
    await h.advance(EARPHONE_MODE_AUDIO_TIMEOUT_MS - 1_000)
    expect(['m2', 'm3', 'm4'].map((id) => h.requests.get(key(id))?.signal.aborted)).toEqual([true, true, true])
    expect(h.requestOrder).toEqual([key('m2'), key('m3'), key('m4'), key('head')])
    await h.resolveAudio(key('head'))
    expect(h.dispatchedIds()).toEqual(['head'])
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
    const own = message('own', h.now() + 100, { speakerUserId: 'viewer' })
    const partner = message('partner', h.now() + 200)
    h.controller.update(h.snapshot([own, partner]))
    await h.resolveAudio(key('own'))
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

describe('EarphoneAutoReadController read language', () => {
  it('cancels stale pending audio when a same-ID translation is revised', async () => {
    const h = createHarness()
    h.controller.arm(h.snapshot([]))
    const original = message('revision', h.now() + 100)
    h.controller.update(h.snapshot([original]))

    h.controller.update(h.snapshot([{
      ...original,
      translations: { ko: '수정된 번역' },
    }]))

    expect(h.requestOrder).toEqual([key('revision'), key('revision')])
    expect(h.audioRequests[0]?.signal.aborted).toBe(true)
    expect(h.audioRequests[1]?.signal.aborted).toBe(false)
    await h.resolveAudioRequest(0, new Blob(['stale audio']))
    expect(h.dispatchedIds()).toEqual([])

    await h.resolveAudioRequest(1, new Blob(['current audio']))
    expect(h.dispatched[0]).toMatchObject({ text: '수정된 번역' })
    expect(await h.dispatched[0]!.audioBlob.text()).toBe('current audio')
  })

  it('re-synthesizes a revised ready prefetch while it waits behind an earlier message', async () => {
    const h = createHarness()
    h.controller.arm(h.snapshot([]))
    const earlier = incomplete(message('earlier', h.now() + 100))
    const original = message('prefetched', h.now() + 200)
    h.controller.update(h.snapshot([earlier, original]))
    await h.resolveAudio(key('prefetched'), new Blob(['stale audio']))
    expect(h.dispatchedIds()).toEqual([])

    const revised = { ...original, translations: { ko: '최신 번역' } }
    h.controller.update(h.snapshot([earlier, revised]))
    expect(h.requestOrder).toEqual([key('prefetched'), key('prefetched')])

    const completedEarlier = message('earlier', earlier.createdAtMs!, { translations: { ko: '먼저' } })
    h.controller.update(h.snapshot([completedEarlier, revised]))
    await h.resolveAudio(key('earlier'))
    expect(h.dispatchedIds()).toEqual(['earlier'])

    await h.resolveAudioRequest(1, new Blob(['current audio']))
    await h.finishPlayback()
    expect(h.dispatched[1]).toMatchObject({ utteranceId: 'prefetched', text: '최신 번역' })
    expect(await h.dispatched[1]!.audioBlob.text()).toBe('current audio')
  })

  it('discards a pending translation when a same-ID message is reclassified as spoken in the read language', async () => {
    const h = createHarness()
    h.controller.arm(h.snapshot([]))
    const translated = message('source-change', h.now() + 100)
    h.controller.update(h.snapshot([translated]))

    const nowSpokenInKorean = {
      ...translated,
      originalLang: 'ko',
      translations: { ko: '번역 source-change', en: 'English source-change' },
      translationFinalized: { ko: true, en: true },
    }
    h.controller.update(h.snapshot([nowSpokenInKorean]))

    expect(h.audioRequests[0]?.signal.aborted).toBe(true)
    expect(h.controller.getCandidateStatus('source-change')).toBe('skipped')
    await h.resolveAudioRequest(0)
    expect(h.dispatchedIds()).toEqual([])
  })

  it('cancels ready audio while source expansion makes the translation incomplete', async () => {
    const h = createHarness()
    h.controller.arm(h.snapshot([]))
    const original = message('expanding', h.now() + 100)
    h.controller.update(h.snapshot([original]))

    const expanding = {
      ...original,
      originalText: `${original.originalText} with more source text`,
      translationStatus: 'pending' as const,
    }
    h.controller.update(h.snapshot([expanding]))

    expect(h.audioRequests[0]?.signal.aborted).toBe(true)
    expect(h.controller.getCandidateStatus('expanding')).toBe('waiting')
    expect(h.dispatchedIds()).toEqual([])

    const finalized = {
      ...expanding,
      translationStatus: undefined,
      translations: { ko: '확장된 최종 번역' },
      translationFinalized: { ko: true },
    }
    h.controller.update(h.snapshot([finalized]))
    expect(h.requestOrder).toEqual([key('expanding'), key('expanding')])

    await h.resolveAudioRequest(0, new Blob(['stale audio']))
    expect(h.dispatchedIds()).toEqual([])
    await h.resolveAudioRequest(1, new Blob(['final audio']))
    expect(h.dispatched[0]).toMatchObject({ text: '확장된 최종 번역' })
    expect(await h.dispatched[0]!.audioBlob.text()).toBe('final audio')
  })

  it('keeps pending audio when a row changes but resolves to the same immutable read target', async () => {
    const h = createHarness()
    h.controller.arm(h.snapshot([]))
    const original = message('same-target', h.now() + 100)
    h.controller.update(h.snapshot([original]))

    h.controller.update(h.snapshot([{
      ...original,
      originalText: 'corrected source text',
    }]))

    expect(h.requestOrder).toEqual([key('same-target')])
    expect(h.audioRequests[0]?.signal.aborted).toBe(false)
    await h.resolveAudio(key('same-target'))
    expect(h.dispatched[0]).toMatchObject({ text: '번역 same-target' })
  })

  it('never reads a message spoken in L, and does not hold the queue for it', async () => {
    const h = createHarness()
    h.controller.arm(h.snapshot([]))
    const spokenInKorean = {
      originalLang: 'ko',
      targetLanguages: ['en', 'ja'],
      translationFinalized: { en: true, ja: true },
    }
    const ownKorean = message('own-ko', h.now() + 100, {
      ...spokenInKorean,
      originalText: '저는 괜찮아요',
      translations: { en: "I'm fine", ja: '大丈夫です' },
      speakerUserId: 'viewer',
    })
    const partnerKorean = message('partner-ko', h.now() + 200, {
      ...spokenInKorean,
      originalText: '좋아요',
      translations: { en: 'Good', ja: 'いいね' },
    })
    const english = message('english', h.now() + 300)
    h.controller.update(h.snapshot([incomplete(ownKorean), partnerKorean, english]))
    expect(h.controller.getCandidateStatus('partner-ko')).toBe('skipped')
    // Held only while the own message's translation is pending...
    await h.resolveAudio(key('english'))
    expect(h.dispatchedIds()).toEqual([])

    // ...and skipped the moment it lands: no stall wait.
    h.controller.update(h.snapshot([ownKorean, partnerKorean, english]))
    expect(h.dispatchedIds()).toEqual(['english'])
    expect(h.controller.getCandidateStatus('own-ko')).toBe('skipped')
    expect(h.requestOrder).toEqual([key('english')])
  })

  it('skips a message whose translations finished without L at once', async () => {
    const h = createHarness()
    h.controller.arm(h.snapshot([]))
    const withoutKorean = message('without-ko', h.now() + 100, {
      targetLanguages: ['ko', 'ja'],
      translations: { ja: 'こんにちは' },
      translationFinalized: { ja: true },
    })
    const next = message('next', h.now() + 200)
    h.controller.update(h.snapshot([incomplete(withoutKorean), next]))
    await h.resolveAudio(key('next'))
    expect(h.dispatchedIds()).toEqual([])

    h.controller.update(h.snapshot([withoutKorean, next]))
    expect(h.dispatchedIds()).toEqual(['next'])
    expect(h.controller.getCandidateStatus('without-ko')).toBe('skipped')
  })

  it('reads what is still queued in a newly picked language', async () => {
    const h = createHarness()
    h.controller.arm(h.snapshot([]))
    h.state.engineIdle = false // a clip is playing
    const both = message('both', h.now() + 100, {
      targetLanguages: ['ko', 'ja'],
      translations: { ko: '번역 both', ja: '翻訳 both' },
      translationFinalized: { ko: true, ja: true },
    })
    const japanese = message('japanese', h.now() + 200, {
      originalLang: 'ja',
      originalText: 'こんにちは',
      targetLanguages: ['ko', 'en'],
      translations: { ko: '안녕하세요', en: 'Hello' },
      translationFinalized: { ko: true, en: true },
    })
    h.controller.update(h.snapshot([both, japanese]))
    expect(h.requestOrder).toEqual([key('both'), key('japanese')])

    // Japanese picked in the notice while both are queued.
    h.controller.update(h.snapshot([both, japanese], [], 'room-1', { ...koRead, readLanguage: 'ja' }))
    expect([key('both'), key('japanese')].map((playbackKey) => h.requests.get(playbackKey)?.signal.aborted)).toEqual([true, true])
    expect(h.requestOrder).toEqual([key('both'), key('japanese'), 'translation:both:ja'])
    expect(h.queuedKeys.at(-1)).toEqual(['translation:both:ja'])
    // Spoken in the new language: skipped.
    expect(h.controller.getCandidateStatus('japanese')).toBe('skipped')

    // A late answer for the old language changes nothing.
    await h.resolveAudio(key('both'))
    await h.resolveAudio('translation:both:ja')
    await h.finishPlayback()
    expect(h.dispatched.map((item) => [item.utteranceId, item.language, item.text])).toEqual([['both', 'ja', '翻訳 both']])
  })
})
