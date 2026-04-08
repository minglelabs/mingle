import { describe, expect, it } from 'vitest'
import { DEFAULT_SONIOX_SILENCE_MS } from './live-phone-demo.preferences'
import {
  buildHydratedAccountPreferences,
  serializeAccountPreferencesSyncState,
  shouldScheduleAccountPreferencesSync,
  type LivePhoneDemoAccountPreferences,
} from './live-phone-demo.account-preferences'

describe('buildHydratedAccountPreferences', () => {
  it('hydrates both text size and silence from the server response', () => {
    expect(buildHydratedAccountPreferences({
      textSizeLevel: 4,
      sonioxManualFinalizeSilenceMs: 1200,
      translationModel: 'qwen/qwen3.5-9b',
      adBannerPosition: 'bottom',
      inputMode: 'text',
      speakerEnabled: true,
      echoAllowed: false,
    }, false)).toEqual({
      textSizeLevel: 4,
      sonioxManualFinalizeSilenceMs: 1200,
      translationModel: 'qwen/qwen3.5-9b',
      adBannerPosition: 'bottom',
      inputMode: 'text',
      speakerEnabled: false,
      echoAllowed: true,
    })
  })

  it('keeps server text size while forcing legacy silence namespaces to the default', () => {
    expect(buildHydratedAccountPreferences({
      textSizeLevel: 5,
      sonioxManualFinalizeSilenceMs: 2500,
      translationModel: 'unsupported-model',
      adBannerPosition: 'invalid',
      inputMode: 'unsupported',
      speakerEnabled: 'invalid',
      echoAllowed: 'invalid',
    }, true)).toEqual({
      textSizeLevel: 5,
      sonioxManualFinalizeSilenceMs: DEFAULT_SONIOX_SILENCE_MS,
      translationModel: 'gemini-2.5-flash-lite',
      adBannerPosition: 'bottom',
      inputMode: 'voice',
      speakerEnabled: false,
      echoAllowed: true,
    })
  })

  it('keeps newly supported translation models during hydration', () => {
    expect(buildHydratedAccountPreferences({
      textSizeLevel: 3,
      sonioxManualFinalizeSilenceMs: 800,
      translationModel: 'gemma-4-31b-it',
      adBannerPosition: 'top',
    }, false)).toEqual({
      textSizeLevel: 3,
      sonioxManualFinalizeSilenceMs: 800,
      translationModel: 'gemma-4-31b-it',
      adBannerPosition: 'top',
      inputMode: 'voice',
      speakerEnabled: false,
      echoAllowed: true,
    })
  })
})

describe('shouldScheduleAccountPreferencesSync', () => {
  it('does not schedule sync before hydration finishes', () => {
    expect(shouldScheduleAccountPreferencesSync({
      allowSync: true,
      hydratedGeneration: 0,
      requestedHydrationGeneration: 1,
      currentPreferences: {
        textSizeLevel: 3,
        sonioxManualFinalizeSilenceMs: 500,
        translationModel: 'gemini-2.5-flash-lite',
        adBannerPosition: null,
        inputMode: 'voice',
        speakerEnabled: false,
        echoAllowed: true,
      },
      lastSyncedStateKey: null,
    })).toBe(false)
  })

  it('does not schedule sync when the current preferences match the last synced state', () => {
    const currentPreferences: LivePhoneDemoAccountPreferences = {
      textSizeLevel: 2,
      sonioxManualFinalizeSilenceMs: 500,
      translationModel: 'gemini-2.5-flash-lite',
      adBannerPosition: 'top',
      inputMode: 'text',
      speakerEnabled: true,
      echoAllowed: false,
    }

    expect(shouldScheduleAccountPreferencesSync({
      allowSync: true,
      hydratedGeneration: 1,
      requestedHydrationGeneration: 1,
      currentPreferences,
      lastSyncedStateKey: serializeAccountPreferencesSyncState(currentPreferences),
    })).toBe(false)
  })

  it('schedules sync when hydrated preferences diverge from the last synced state', () => {
    expect(shouldScheduleAccountPreferencesSync({
      allowSync: true,
      hydratedGeneration: 3,
      requestedHydrationGeneration: 3,
      currentPreferences: {
        textSizeLevel: 4,
        sonioxManualFinalizeSilenceMs: 700,
        translationModel: 'qwen/qwen3.5-9b',
        adBannerPosition: 'bottom',
        inputMode: 'text',
        speakerEnabled: true,
        echoAllowed: false,
      },
      lastSyncedStateKey: serializeAccountPreferencesSyncState({
        textSizeLevel: 2,
        sonioxManualFinalizeSilenceMs: 500,
        translationModel: 'gemini-2.5-flash-lite',
        adBannerPosition: 'top',
        inputMode: 'voice',
        speakerEnabled: false,
        echoAllowed: true,
      }),
    })).toBe(true)
  })

  it('does not schedule sync when preference syncing is disabled', () => {
    expect(shouldScheduleAccountPreferencesSync({
      allowSync: false,
      hydratedGeneration: 1,
      requestedHydrationGeneration: 1,
      currentPreferences: {
        textSizeLevel: 4,
        sonioxManualFinalizeSilenceMs: 700,
        translationModel: 'qwen/qwen3.5-9b',
        adBannerPosition: 'bottom',
        inputMode: 'text',
        speakerEnabled: true,
        echoAllowed: false,
      },
      lastSyncedStateKey: null,
    })).toBe(false)
  })
})
