import { describe, expect, it } from 'vitest'
import {
  DEFAULT_SONIOX_ENDPOINT_MAX_DELAY_MS,
  DEFAULT_SONIOX_ENDPOINT_TUNING_STEP,
  DEFAULT_SONIOX_SILENCE_MS,
} from './live-phone-demo.preferences'
import {
  buildAccountPreferencesPatchBody,
  buildHydratedAccountPreferences,
  normalizeSonioxEndpointMaxDelayPreference,
  normalizeSonioxManualFinalizeSilencePreference,
  resolveAccountPreferencesSyncRetryDelayMs,
  serializeAccountPreferencesSyncState,
  shouldApplyAccountPreferencesHydration,
  shouldRetryAccountPreferencesSync,
  shouldScheduleAccountPreferencesSync,
  shouldSendTranslationModelPreference,
  shouldSendTtsModelPreference,
  resolveRequestTtsModel,
  type LivePhoneDemoAccountPreferences,
} from './live-phone-demo.account-preferences'

describe('buildHydratedAccountPreferences', () => {
  it('hydrates both text size and silence from the server response', () => {
    expect(buildHydratedAccountPreferences({
      textSizeLevel: 4,
      sonioxManualFinalizeSilenceMs: 1200,
      sonioxEndpointMaxDelayMs: 1800,
      sonioxEndpointTuningStep: 4,
      translationModel: 'gpt-6-luna',
      adBannerPosition: 'bottom',
      inputMode: 'text',
      speakerEnabled: true,
      echoAllowed: false,
      bubbleDisplayMode: 'expanded',
    }, false)).toEqual({
      textSizeLevel: 4,
      sonioxManualFinalizeSilenceMs: 1200,
      sonioxEndpointMaxDelayMs: 1800,
      sonioxEndpointTuningStep: 4,
      translationModel: 'gpt-6-luna',
      ttsModel: null,
      adBannerPosition: 'bottom',
      inputMode: 'text',
      speakerEnabled: true,
      echoAllowed: false,
      bubbleDisplayMode: 'expanded',
      sttSegmentationMode: null,
    })
  })

  it('keeps server text size while forcing legacy silence namespaces to the default', () => {
    expect(buildHydratedAccountPreferences({
      textSizeLevel: 5,
      sonioxManualFinalizeSilenceMs: 2500,
      sonioxEndpointMaxDelayMs: 2500,
      sonioxEndpointTuningStep: 0,
      translationModel: 'unsupported-model',
      adBannerPosition: 'invalid',
      inputMode: 'unsupported',
      speakerEnabled: 'invalid',
      echoAllowed: 'invalid',
    }, true)).toEqual({
      textSizeLevel: 5,
      sonioxManualFinalizeSilenceMs: DEFAULT_SONIOX_SILENCE_MS,
      sonioxEndpointMaxDelayMs: DEFAULT_SONIOX_ENDPOINT_MAX_DELAY_MS,
      sonioxEndpointTuningStep: DEFAULT_SONIOX_ENDPOINT_TUNING_STEP,
      translationModel: 'gpt-6-luna',
      ttsModel: null,
      adBannerPosition: 'bottom',
      inputMode: 'voice',
      speakerEnabled: false,
      echoAllowed: true,
      bubbleDisplayMode: 'expanded',
      sttSegmentationMode: null,
    })
  })

  it('keeps newly supported translation models during hydration', () => {
    expect(buildHydratedAccountPreferences({
      textSizeLevel: 3,
      sonioxManualFinalizeSilenceMs: 800,
      sonioxEndpointMaxDelayMs: 1400,
      sonioxEndpointTuningStep: 1,
      translationModel: 'gpt-6-luna',
      adBannerPosition: 'top',
    }, false)).toEqual({
      textSizeLevel: 3,
      sonioxManualFinalizeSilenceMs: 800,
      sonioxEndpointMaxDelayMs: 1400,
      sonioxEndpointTuningStep: 1,
      translationModel: 'gpt-6-luna',
      ttsModel: null,
      adBannerPosition: 'top',
      inputMode: 'voice',
      speakerEnabled: false,
      echoAllowed: true,
      bubbleDisplayMode: 'expanded',
      sttSegmentationMode: null,
    })
  })

  it('hydrates a stored TTS model and keeps null (no default fallback) for missing or invalid values', () => {
    expect(buildHydratedAccountPreferences({ ttsModel: 'gemini-3.8-flash-lite-tts' }, false).ttsModel)
      .toBe('gemini-3.8-flash-lite-tts')
    expect(buildHydratedAccountPreferences({ ttsModel: 'inworld-tts-1.5-mini' }, false).ttsModel)
      .toBe('inworld-tts-1.5-mini')
    expect(buildHydratedAccountPreferences({ ttsModel: ' GEMINI-3.8-FLASH-TTS ' }, true).ttsModel)
      .toBe('gemini-3.8-flash-tts')
    expect(buildHydratedAccountPreferences({ ttsModel: null }, false).ttsModel).toBeNull()
    expect(buildHydratedAccountPreferences({ ttsModel: 'gemini' }, false).ttsModel).toBeNull()
    expect(buildHydratedAccountPreferences({ ttsModel: 3 }, false).ttsModel).toBeNull()
    // Cache records written before ttsModel existed.
    expect(buildHydratedAccountPreferences({ translationModel: 'gpt-6-luna' }, false).ttsModel)
      .toBeNull()
  })

  it('normalizes a stored STT segmentation mode during hydration', () => {
    expect(buildHydratedAccountPreferences({
      textSizeLevel: 3,
      sonioxManualFinalizeSilenceMs: 800,
      translationModel: 'gpt-6-luna',
      adBannerPosition: 'top',
      sttSegmentationMode: ' FIN ',
    }, false).sttSegmentationMode).toBe('fin')
  })
})

describe('normalize Soniox timing preferences', () => {
  it('allows Fin silence up to 5000ms and keeps End delay capped at 3000ms', () => {
    expect(normalizeSonioxManualFinalizeSilencePreference(5000)).toBe(5000)
    expect(normalizeSonioxManualFinalizeSilencePreference(6000)).toBe(5000)
    expect(normalizeSonioxEndpointMaxDelayPreference(5000)).toBe(3000)
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
        sonioxEndpointMaxDelayMs: 2000,
        sonioxEndpointTuningStep: DEFAULT_SONIOX_ENDPOINT_TUNING_STEP,
        translationModel: 'gemini-2.5-flash-lite',
        adBannerPosition: null,
        inputMode: 'voice',
        speakerEnabled: false,
        echoAllowed: true,
        bubbleDisplayMode: 'expanded',
        sttSegmentationMode: null,
      },
      lastSyncedStateKey: null,
    })).toBe(false)
  })

  it('does not schedule sync when the current preferences match the last synced state', () => {
    const currentPreferences: LivePhoneDemoAccountPreferences = {
      textSizeLevel: 2,
      sonioxManualFinalizeSilenceMs: 500,
      sonioxEndpointMaxDelayMs: 2000,
      sonioxEndpointTuningStep: DEFAULT_SONIOX_ENDPOINT_TUNING_STEP,
      translationModel: 'gemini-2.5-flash-lite',
      adBannerPosition: 'top',
      inputMode: 'text',
      speakerEnabled: true,
      echoAllowed: false,
      bubbleDisplayMode: 'collapsed',
      sttSegmentationMode: null,
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
        sonioxEndpointMaxDelayMs: 1200,
        sonioxEndpointTuningStep: 3,
        translationModel: 'gpt-6-luna',
        adBannerPosition: 'bottom',
        inputMode: 'text',
        speakerEnabled: true,
        echoAllowed: false,
        bubbleDisplayMode: 'expanded',
        sttSegmentationMode: null,
      },
      lastSyncedStateKey: serializeAccountPreferencesSyncState({
        textSizeLevel: 2,
        sonioxManualFinalizeSilenceMs: 500,
        sonioxEndpointMaxDelayMs: 2000,
        sonioxEndpointTuningStep: DEFAULT_SONIOX_ENDPOINT_TUNING_STEP,
        translationModel: 'gemini-2.5-flash-lite',
        adBannerPosition: 'top',
        inputMode: 'voice',
        speakerEnabled: false,
        echoAllowed: true,
        bubbleDisplayMode: 'collapsed',
        sttSegmentationMode: null,
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
        sonioxEndpointMaxDelayMs: 1200,
        sonioxEndpointTuningStep: 3,
        translationModel: 'gpt-6-luna',
        adBannerPosition: 'bottom',
        inputMode: 'text',
        speakerEnabled: true,
        echoAllowed: false,
        bubbleDisplayMode: 'collapsed',
        sttSegmentationMode: null,
      },
      lastSyncedStateKey: null,
    })).toBe(false)
  })
})

describe('account preference sync retry', () => {
  it('backs off retries with a bounded delay', () => {
    expect(resolveAccountPreferencesSyncRetryDelayMs(1)).toBe(2_000)
    expect(resolveAccountPreferencesSyncRetryDelayMs(2)).toBe(4_000)
    expect(resolveAccountPreferencesSyncRetryDelayMs(10)).toBe(60_000)
  })

  it('only retries pending preferences while syncing is enabled and mounted', () => {
    expect(shouldRetryAccountPreferencesSync({
      allowSync: true,
      pendingSync: true,
      mounted: true,
    })).toBe(true)
    expect(shouldRetryAccountPreferencesSync({
      allowSync: false,
      pendingSync: true,
      mounted: true,
    })).toBe(false)
    expect(shouldRetryAccountPreferencesSync({
      allowSync: true,
      pendingSync: false,
      mounted: true,
    })).toBe(false)
    expect(shouldRetryAccountPreferencesSync({
      allowSync: true,
      pendingSync: true,
      mounted: false,
    })).toBe(false)
  })
})

describe('shouldApplyAccountPreferencesHydration', () => {
  it('accepts a server snapshot only when no local edit happened after the request began', () => {
    expect(shouldApplyAccountPreferencesHydration({
      hydrationStartedAtLocalRevision: 4,
      currentLocalRevision: 4,
    })).toBe(true)

    expect(shouldApplyAccountPreferencesHydration({
      hydrationStartedAtLocalRevision: 4,
      currentLocalRevision: 5,
    })).toBe(false)
  })
})

describe('resolveRequestTtsModel', () => {
  const hydrated = {
    allowSync: true,
    requestedHydrationGeneration: 1,
    successfulHydrationGeneration: 1,
    userSelectedSinceHydrationStart: false,
  }

  it('omits a never-picked (null) model from TTS requests so the server default applies', () => {
    expect(resolveRequestTtsModel(null, hydrated)).toBeUndefined()
    expect(resolveRequestTtsModel(undefined, hydrated)).toBeUndefined()
    expect(resolveRequestTtsModel(null, { ...hydrated, allowSync: false })).toBeUndefined()
    expect(resolveRequestTtsModel(null, { ...hydrated, userSelectedSinceHydrationStart: true })).toBeUndefined()
  })

  it('sends an explicit choice under the shouldSendTtsModelPreference gating', () => {
    expect(resolveRequestTtsModel('inworld-tts-1.5-mini', hydrated)).toBe('inworld-tts-1.5-mini')
    expect(resolveRequestTtsModel('gemini-3.8-flash-tts', { ...hydrated, successfulHydrationGeneration: 0 }))
      .toBeUndefined()
    expect(resolveRequestTtsModel('gemini-3.8-flash-tts', {
      ...hydrated,
      successfulHydrationGeneration: 0,
      userSelectedSinceHydrationStart: true,
    })).toBe('gemini-3.8-flash-tts')
  })
})

describe('shouldSendTtsModelPreference', () => {
  it('follows the translation model send rule', () => {
    const base = {
      allowSync: true,
      requestedHydrationGeneration: 1,
      successfulHydrationGeneration: 0,
      userSelectedSinceHydrationStart: false,
    }
    expect(shouldSendTtsModelPreference(base)).toBe(false)
    expect(shouldSendTtsModelPreference({ ...base, successfulHydrationGeneration: 1 })).toBe(true)
    expect(shouldSendTtsModelPreference({ ...base, userSelectedSinceHydrationStart: true })).toBe(true)
    expect(shouldSendTtsModelPreference({ ...base, allowSync: false })).toBe(true)
  })
})

describe('serializeAccountPreferencesSyncState', () => {
  it('changes when only the TTS model changes', () => {
    const preferences = buildHydratedAccountPreferences({}, false)
    expect(serializeAccountPreferencesSyncState(preferences)).not.toBe(
      serializeAccountPreferencesSyncState({ ...preferences, ttsModel: 'gemini-3.8-flash-tts' }),
    )
  })
})

describe('shouldSendTranslationModelPreference', () => {
  it('does not send the local default before server preferences hydrate', () => {
    expect(shouldSendTranslationModelPreference({
      allowSync: true,
      requestedHydrationGeneration: 1,
      successfulHydrationGeneration: 0,
      userSelectedSinceHydrationStart: false,
    })).toBe(false)
  })

  it('sends the hydrated server model after a successful preference fetch', () => {
    expect(shouldSendTranslationModelPreference({
      allowSync: true,
      requestedHydrationGeneration: 2,
      successfulHydrationGeneration: 2,
      userSelectedSinceHydrationStart: false,
    })).toBe(true)
  })

  it('keeps the DB fallback when preference fetching completes with an error', () => {
    expect(shouldSendTranslationModelPreference({
      allowSync: true,
      requestedHydrationGeneration: 2,
      successfulHydrationGeneration: 1,
      userSelectedSinceHydrationStart: false,
    })).toBe(false)
  })

  it('sends a model selected by the user even before server hydration succeeds', () => {
    expect(shouldSendTranslationModelPreference({
      allowSync: true,
      requestedHydrationGeneration: 2,
      successfulHydrationGeneration: 1,
      userSelectedSinceHydrationStart: true,
    })).toBe(true)
  })

  it('sends the current model when account preference sync is disabled', () => {
    expect(shouldSendTranslationModelPreference({
      allowSync: false,
      requestedHydrationGeneration: 0,
      successfulHydrationGeneration: 0,
      userSelectedSinceHydrationStart: false,
    })).toBe(true)
  })
})

describe('buildAccountPreferencesPatchBody', () => {
  it('omits an unhydrated default model while syncing another setting', () => {
    const preferences = buildHydratedAccountPreferences({ translationModel: 'gemini-2.5-flash-lite' }, false)
    const body = buildAccountPreferencesPatchBody(preferences, { includeTranslationModel: false })
    expect(body).not.toHaveProperty('translationModel')
    expect(body.textSizeLevel).toBe(preferences.textSizeLevel)
  })

  it('omits a null ttsModel after a speaker or text-size change even when TTS models are included', () => {
    const preferences = buildHydratedAccountPreferences({ ttsModel: null }, false)
    expect(preferences.ttsModel).toBeNull()
    for (const edited of [
      { ...preferences, speakerEnabled: !preferences.speakerEnabled },
      { ...preferences, textSizeLevel: 5 },
    ]) {
      expect(buildAccountPreferencesPatchBody(edited, { includeTtsModel: true })).not.toHaveProperty('ttsModel')
    }
  })

  it('includes ttsModel after an explicit selection', () => {
    const preferences = buildHydratedAccountPreferences({ ttsModel: null }, false)
    const selected = { ...preferences, ttsModel: 'gemini-3.8-flash-tts' as const, speakerEnabled: true }
    const body = buildAccountPreferencesPatchBody(selected, { includeTtsModel: true })
    expect(body.ttsModel).toBe('gemini-3.8-flash-tts')
    expect(body.speakerEnabled).toBe(true)
  })

  it('sends ttsModel only when explicitly included (Legacy passes no options)', () => {
    const preferences = buildHydratedAccountPreferences({ ttsModel: 'gemini-3.8-flash-tts' }, false)
    expect(buildAccountPreferencesPatchBody(preferences)).not.toHaveProperty('ttsModel')
    expect(buildAccountPreferencesPatchBody(preferences, { includeTtsModel: false })).not.toHaveProperty('ttsModel')
    expect(buildAccountPreferencesPatchBody(preferences, { includeTtsModel: true }).ttsModel)
      .toBe('gemini-3.8-flash-tts')
  })

  it('includes audio flags alongside the rest of the persisted preferences', () => {
    expect(buildAccountPreferencesPatchBody({
      textSizeLevel: 4,
      sonioxManualFinalizeSilenceMs: 700,
      sonioxEndpointMaxDelayMs: 1200,
      sonioxEndpointTuningStep: 3,
      translationModel: 'gpt-6-luna',
      adBannerPosition: 'bottom',
      inputMode: 'text',
      speakerEnabled: true,
      echoAllowed: false,
      bubbleDisplayMode: 'collapsed',
      sttSegmentationMode: null,
    })).toEqual({
      textSizeLevel: 4,
      sonioxManualFinalizeSilenceMs: 700,
      sonioxEndpointMaxDelayMs: 1200,
      sonioxEndpointTuningStep: 3,
      translationModel: 'gpt-6-luna',
      adBannerPosition: 'bottom',
      inputMode: 'text',
      speakerEnabled: true,
      echoAllowed: false,
      bubbleDisplayMode: 'collapsed',
      sttSegmentationMode: null,
    })
  })
})
