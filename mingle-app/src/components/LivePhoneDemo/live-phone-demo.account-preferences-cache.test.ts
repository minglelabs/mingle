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
