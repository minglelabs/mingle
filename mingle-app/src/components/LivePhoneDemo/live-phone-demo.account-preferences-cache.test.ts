import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { LivePhoneDemoAccountPreferences } from './live-phone-demo.account-preferences'

type PreferencesModule = typeof import('./live-phone-demo.account-preferences')

function createStorage(): Storage {
  const values = new Map<string, string>()
  return {
    get length() {
      return values.size
    },
    clear() {
      values.clear()
    },
    getItem(key: string) {
      return values.get(key) ?? null
    },
    key(index: number) {
      return [...values.keys()][index] ?? null
    },
    removeItem(key: string) {
      values.delete(key)
    },
    setItem(key: string, value: string) {
      values.set(key, value)
    },
  }
}

function buildPreferences(): LivePhoneDemoAccountPreferences {
  return {
    textSizeLevel: 4,
    sonioxManualFinalizeSilenceMs: 1_800,
    sonioxEndpointMaxDelayMs: 2_500,
    sonioxEndpointTuningStep: 4,
    translationModel: 'qwen/qwen3.5-9b',
    ttsModel: 'inworld-tts-1.5-mini',
    adBannerPosition: 'bottom',
    inputMode: 'text',
    speakerEnabled: false,
    echoAllowed: true,
    bubbleDisplayMode: 'collapsed',
    sttSegmentationMode: 'end',
  }
}

describe('account preferences client cache', () => {
  let preferencesModule: PreferencesModule
  let localStorage: Storage

  beforeEach(async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-26T04:00:00.000Z'))
    localStorage = createStorage()
    vi.stubGlobal('window', { localStorage })
    vi.resetModules()
    preferencesModule = await import('./live-phone-demo.account-preferences')
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('restores a pending local edit after the room component is recreated', async () => {
    const identity = {
      apiNamespace: 'ios/v2.0.0',
      userId: 'user-1',
    }
    const preferences = buildPreferences()
    preferencesModule.writeCachedAccountPreferences(identity, preferences, { pendingSync: true })

    vi.resetModules()
    const reloadedModule = await import('./live-phone-demo.account-preferences')

    expect(reloadedModule.readCachedAccountPreferencesSnapshot(identity, false)).toEqual({
      savedAt: Date.now(),
      preferences,
      pendingSync: true,
    })
  })

  const identity = { apiNamespace: 'ios/v2.0.1', userId: 'same-account' }
  const snapshot = () => preferencesModule.readCachedAccountPreferencesSnapshot(identity, false)!
  const edit = (previous: LivePhoneDemoAccountPreferences, next: LivePhoneDemoAccountPreferences) => (
    preferencesModule.commitAccountPreferencesEdit(identity, previous, next, false)
  )
  const flush = (send: (preferences: LivePhoneDemoAccountPreferences) => Promise<void>) => (
    preferencesModule.flushCachedAccountPreferences({ identity, isLegacyNamespace: false, send })
  )

  it('merges only edited fields from a stale room and notifies other rooms', () => {
    const original = buildPreferences()
    preferencesModule.writeCachedAccountPreferences(identity, original)
    const changed = vi.fn()
    const unsubscribe = preferencesModule.subscribeAccountPreferences(identity, changed)
    edit(original, { ...original, textSizeLevel: 5 })
    edit(original, { ...original, sonioxEndpointTuningStep: 1 })
    expect(snapshot().preferences).toMatchObject({ textSizeLevel: 5, sonioxEndpointTuningStep: 1 })
    expect(changed).toHaveBeenCalledTimes(2)
    unsubscribe()
    edit(original, { ...original, textSizeLevel: 2 })
    expect(changed).toHaveBeenCalledTimes(2)
  })

  it('an old room retry cannot overwrite a newer successful edit', async () => {
    const original = buildPreferences()
    edit(original, { ...original, textSizeLevel: 5 })
    const sendA = vi.fn().mockRejectedValueOnce(new Error('503'))
    await expect(flush(sendA)).rejects.toThrow('503')
    edit(original, { ...original, textSizeLevel: 3 })
    const sendB = vi.fn().mockResolvedValue(undefined)
    await flush(sendB)
    await flush(sendA)
    expect(sendA).toHaveBeenCalledTimes(1)
    expect(sendB).toHaveBeenCalledWith(expect.objectContaining({ textSizeLevel: 3 }))
    expect(snapshot()).toMatchObject({ pendingSync: false, preferences: { textSizeLevel: 3 } })
  })

  it('serializes both room writers and drains newer edits after a slow response', async () => {
    const original = buildPreferences()
    edit(original, { ...original, textSizeLevel: 5 })
    let complete!: () => void
    const sendA = vi.fn().mockImplementationOnce(() => new Promise<void>((resolve) => { complete = resolve })).mockResolvedValue(undefined)
    const sendB = vi.fn().mockResolvedValue(undefined)
    const first = flush(sendA)
    await Promise.resolve()
    edit(original, { ...original, textSizeLevel: 3 })
    const second = flush(sendB)
    expect(second).toBe(first)
    complete()
    await Promise.all([first, second])
    expect(sendB).not.toHaveBeenCalled()
    expect(sendA.mock.calls.map(([value]) => value.textSizeLevel)).toEqual([5, 3])
    expect(snapshot()).toMatchObject({ pendingSync: false, preferences: { textSizeLevel: 3 } })
  })

  it('keeps success acknowledged after 200ms and after a process reload', async () => {
    const original = buildPreferences()
    edit(original, { ...original, textSizeLevel: 3 })
    await flush(async () => {})
    await vi.advanceTimersByTimeAsync(200)
    expect(snapshot().pendingSync).toBe(false)
    vi.resetModules()
    const reloaded = await import('./live-phone-demo.account-preferences')
    expect(reloaded.readCachedAccountPreferencesSnapshot(identity, false)?.pendingSync).toBe(false)
  })

  it('does not turn a no-op stale room update into a pending write', async () => {
    const original = buildPreferences()
    edit(original, { ...original, textSizeLevel: 3 })
    await flush(async () => {})
    edit(original, original)
    expect(snapshot()).toMatchObject({ pendingSync: false, preferences: { textSizeLevel: 3 } })
  })

  it('rejects a stale GET even when the newer local edit has already synced', async () => {
    const original = buildPreferences()
    preferencesModule.writeCachedAccountPreferences(identity, original)
    const startedSavedAt = snapshot().savedAt
    edit(original, { ...original, textSizeLevel: 3 })
    await flush(async () => {})
    expect(preferencesModule.reconcileAccountPreferencesHydration({
      identity, preferences: original, startedSavedAt, isLegacyNamespace: false,
    })).toMatchObject({ pendingSync: false, preferences: { textSizeLevel: 3 } })
  })

  it('preserves durable unsent preferences on a fresh room hydration', () => {
    const original = buildPreferences()
    edit(original, { ...original, textSizeLevel: 3 })
    expect(preferencesModule.reconcileAccountPreferencesHydration({
      identity, preferences: original, startedSavedAt: snapshot().savedAt, isLegacyNamespace: false,
    })).toMatchObject({ pendingSync: true, preferences: { textSizeLevel: 3 } })
  })

  it('accepts a fresh server snapshot when no local changes occurred', () => {
    const original = buildPreferences()
    preferencesModule.writeCachedAccountPreferences(identity, original)
    expect(preferencesModule.reconcileAccountPreferencesHydration({
      identity, preferences: { ...original, textSizeLevel: 2 }, startedSavedAt: snapshot().savedAt, isLegacyNamespace: false,
    })).toMatchObject({ pendingSync: false, preferences: { textSizeLevel: 2 } })
  })

  it('keeps an early settings edit without replacing a new account model seeded by the server', () => {
    const local = { ...buildPreferences(), translationModel: 'gemini-2.5-flash-lite' as const }
    const server = { ...local, translationModel: 'gpt-6-luna' as const }
    edit(local, { ...local, textSizeLevel: 3 })

    expect(preferencesModule.reconcileAccountPreferencesHydration({
      identity, preferences: server, startedSavedAt: null, isLegacyNamespace: false,
      preserveLocalTranslationModel: false,
    })).toMatchObject({
      pendingSync: true,
      preferences: { textSizeLevel: 3, translationModel: 'gpt-6-luna' },
    })
  })

  it('preserves a model explicitly chosen during a new account hydration', () => {
    const local = { ...buildPreferences(), translationModel: 'gemini-2.5-flash-lite' as const }
    const server = { ...local, translationModel: 'gpt-6-luna' as const }
    edit(local, { ...local, translationModel: 'qwen/qwen3.5-9b' })

    expect(preferencesModule.reconcileAccountPreferencesHydration({
      identity, preferences: server, startedSavedAt: null, isLegacyNamespace: false,
      preserveLocalTranslationModel: true,
    })).toMatchObject({
      pendingSync: true,
      preferences: { translationModel: 'qwen/qwen3.5-9b' },
    })
  })

  it('takes the server TTS model on a new account hydration unless the user picked one', () => {
    const local = { ...buildPreferences(), ttsModel: 'inworld-tts-1.5-mini' as const }
    const server = { ...local, ttsModel: 'gemini-3.8-flash-tts' as const }
    edit(local, { ...local, textSizeLevel: 3 })

    expect(preferencesModule.reconcileAccountPreferencesHydration({
      identity, preferences: server, startedSavedAt: null, isLegacyNamespace: false,
      preserveLocalTranslationModel: true,
      preserveLocalTtsModel: false,
    })).toMatchObject({
      pendingSync: true,
      preferences: { textSizeLevel: 3, ttsModel: 'gemini-3.8-flash-tts', translationModel: 'qwen/qwen3.5-9b' },
    })
  })

  it('preserves a TTS model explicitly chosen during a new account hydration', () => {
    const local = { ...buildPreferences(), ttsModel: 'inworld-tts-1.5-mini' as const }
    const server = { ...local, ttsModel: 'gemini-3.8-flash-tts' as const, translationModel: 'gpt-6-luna' as const }
    edit(local, { ...local, ttsModel: 'gemini-3.8-flash-lite-tts' })

    expect(preferencesModule.reconcileAccountPreferencesHydration({
      identity, preferences: server, startedSavedAt: null, isLegacyNamespace: false,
      preserveLocalTranslationModel: false,
      preserveLocalTtsModel: true,
    })).toMatchObject({
      pendingSync: true,
      preferences: { ttsModel: 'gemini-3.8-flash-lite-tts', translationModel: 'gpt-6-luna' },
    })
  })

  it('keeps a never-picked (null) TTS model null through the cache and a reload', async () => {
    const original = { ...buildPreferences(), ttsModel: null }
    preferencesModule.writeCachedAccountPreferences(identity, original)
    edit(original, { ...original, speakerEnabled: true })
    expect(snapshot()).toMatchObject({ pendingSync: true, preferences: { speakerEnabled: true, ttsModel: null } })
    const send = vi.fn().mockResolvedValue(undefined)
    await flush(send)
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ speakerEnabled: true, ttsModel: null }))
    vi.resetModules()
    const reloaded = await import('./live-phone-demo.account-preferences')
    expect(reloaded.readCachedAccountPreferencesSnapshot(identity, false)?.preferences.ttsModel).toBeNull()
  })

  it('treats picking the displayed default from null as an edit and retries it until it syncs', async () => {
    const original = { ...buildPreferences(), ttsModel: null }
    preferencesModule.writeCachedAccountPreferences(identity, original)
    edit(original, { ...original, ttsModel: 'gemini-3.8-flash-tts' })
    expect(snapshot()).toMatchObject({ pendingSync: true, preferences: { ttsModel: 'gemini-3.8-flash-tts' } })

    const send = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(undefined)
    await expect(flush(send)).rejects.toThrow('offline')
    vi.resetModules()
    const reloaded = await import('./live-phone-demo.account-preferences')
    expect(reloaded.readCachedAccountPreferencesSnapshot(identity, false)).toMatchObject({
      pendingSync: true,
      preferences: { ttsModel: 'gemini-3.8-flash-tts' },
    })
    await reloaded.flushCachedAccountPreferences({ identity, isLegacyNamespace: false, send })
    expect(send).toHaveBeenLastCalledWith(expect.objectContaining({ ttsModel: 'gemini-3.8-flash-tts' }))
    expect(reloaded.buildAccountPreferencesPatchBody(send.mock.lastCall![0], { includeTtsModel: true }).ttsModel)
      .toBe('gemini-3.8-flash-tts')
    expect(reloaded.readCachedAccountPreferencesSnapshot(identity, false)?.pendingSync).toBe(false)
  })

  it('takes a null server TTS model on a new account hydration unless the user picked one', () => {
    const local = { ...buildPreferences(), ttsModel: null }
    edit(local, { ...local, textSizeLevel: 3 })
    expect(preferencesModule.reconcileAccountPreferencesHydration({
      identity, preferences: { ...local, ttsModel: null }, startedSavedAt: null, isLegacyNamespace: false,
      preserveLocalTtsModel: false,
    }).preferences.ttsModel).toBeNull()
  })

  it('does not share an active writer across accounts', async () => {
    const otherIdentity = { ...identity, userId: 'other-account' }
    preferencesModule.writeCachedAccountPreferences(identity, buildPreferences(), { pendingSync: true })
    preferencesModule.writeCachedAccountPreferences(otherIdentity, buildPreferences(), { pendingSync: true })
    let complete!: () => void
    const first = flush(() => new Promise<void>((resolve) => { complete = resolve }))
    await Promise.resolve()
    const sendOther = vi.fn().mockResolvedValue(undefined)
    await preferencesModule.flushCachedAccountPreferences({ identity: otherIdentity, isLegacyNamespace: false, send: sendOther })
    expect(sendOther).toHaveBeenCalledTimes(1)
    complete()
    await first
  })

  it('isolates preferences by account and API namespace', () => {
    preferencesModule.writeCachedAccountPreferences({
      apiNamespace: 'android/v2.0.0',
      userId: 'user-a',
    }, buildPreferences())

    expect(preferencesModule.readCachedAccountPreferences({
      apiNamespace: 'android/v2.0.0',
      userId: 'user-b',
    }, false)).toBeNull()
    expect(preferencesModule.readCachedAccountPreferences({
      apiNamespace: 'ios/v2.0.0',
      userId: 'user-a',
    }, false)).toBeNull()
  })
})
