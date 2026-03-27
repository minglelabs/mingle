import { describe, expect, it } from 'vitest'
import { DEFAULT_SONIOX_SILENCE_MS } from './live-phone-demo.preferences'
import {
  buildHydratedAccountPreferences,
  serializeAccountPreferencesSyncState,
  shouldScheduleAccountPreferencesSync,
} from './live-phone-demo.account-preferences'

describe('buildHydratedAccountPreferences', () => {
  it('hydrates both text size and silence from the server response', () => {
    expect(buildHydratedAccountPreferences({
      textSizeLevel: 4,
      sonioxManualFinalizeSilenceMs: 1200,
      translationModel: 'qwen/qwen3.5-9b',
    }, false)).toEqual({
      textSizeLevel: 4,
      sonioxManualFinalizeSilenceMs: 1200,
      translationModel: 'qwen/qwen3.5-9b',
    })
  })

  it('keeps server text size while forcing legacy silence namespaces to the default', () => {
    expect(buildHydratedAccountPreferences({
      textSizeLevel: 5,
      sonioxManualFinalizeSilenceMs: 2500,
      translationModel: 'qwen/qwen3.5-flash-02-23',
    }, true)).toEqual({
      textSizeLevel: 5,
      sonioxManualFinalizeSilenceMs: DEFAULT_SONIOX_SILENCE_MS,
      translationModel: 'qwen/qwen3.5-flash-02-23',
    })
  })
})

describe('shouldScheduleAccountPreferencesSync', () => {
  it('does not schedule sync before hydration finishes', () => {
    expect(shouldScheduleAccountPreferencesSync({
      showAccountActions: true,
      hydratedGeneration: 0,
      requestedHydrationGeneration: 1,
      currentPreferences: {
        textSizeLevel: 3,
        sonioxManualFinalizeSilenceMs: 500,
        translationModel: 'gemini-2.5-flash-lite',
      },
      lastSyncedStateKey: null,
    })).toBe(false)
  })

  it('does not schedule sync when the current preferences match the last synced state', () => {
    const currentPreferences = {
      textSizeLevel: 2,
      sonioxManualFinalizeSilenceMs: 500,
      translationModel: 'gemini-2.5-flash-lite',
    }

    expect(shouldScheduleAccountPreferencesSync({
      showAccountActions: true,
      hydratedGeneration: 1,
      requestedHydrationGeneration: 1,
      currentPreferences,
      lastSyncedStateKey: serializeAccountPreferencesSyncState(currentPreferences),
    })).toBe(false)
  })

  it('schedules sync when hydrated preferences diverge from the last synced state', () => {
    expect(shouldScheduleAccountPreferencesSync({
      showAccountActions: true,
      hydratedGeneration: 3,
      requestedHydrationGeneration: 3,
      currentPreferences: {
        textSizeLevel: 4,
        sonioxManualFinalizeSilenceMs: 700,
        translationModel: 'qwen/qwen3.5-9b',
      },
      lastSyncedStateKey: serializeAccountPreferencesSyncState({
        textSizeLevel: 2,
        sonioxManualFinalizeSilenceMs: 500,
        translationModel: 'gemini-2.5-flash-lite',
      }),
    })).toBe(true)
  })
})
