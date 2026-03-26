import { describe, expect, it } from 'vitest'

import { POST as postLegacyLogClientEvent } from '@/app/api/log/client-event/route'
import { POST as postLegacyTranslateFinalize } from '@/app/api/translate/finalize/route'
import { POST as postLegacyTtsInworld } from '@/app/api/tts/inworld/route'
import { POST as postLegacyClientVersionPolicy } from '@/app/api/client/version-policy/route'
import { POST as postAndroidV100ClientVersionPolicy } from '@/app/api/android/v1.0.0/client/version-policy/route'
import { POST as postAndroidV102ClientVersionPolicy } from '@/app/api/android/v1.0.2/client/version-policy/route'
import { POST as postAndroidV103ClientVersionPolicy } from '@/app/api/android/v1.0.3/client/version-policy/route'
import { POST as postAndroidV104ClientVersionPolicy } from '@/app/api/android/v1.0.4/client/version-policy/route'
import { POST as postAndroidV105ClientVersionPolicy } from '@/app/api/android/v1.0.5/client/version-policy/route'
import { POST as postAndroidV100LogClientEvent } from '@/app/api/android/v1.0.0/log/client-event/route'
import { POST as postAndroidV102LogClientEvent } from '@/app/api/android/v1.0.2/log/client-event/route'
import { POST as postAndroidV103LogClientEvent } from '@/app/api/android/v1.0.3/log/client-event/route'
import { POST as postAndroidV104LogClientEvent } from '@/app/api/android/v1.0.4/log/client-event/route'
import { POST as postAndroidV105LogClientEvent } from '@/app/api/android/v1.0.5/log/client-event/route'
import { POST as postAndroidV100TranslateFinalize } from '@/app/api/android/v1.0.0/translate/finalize/route'
import { POST as postAndroidV102TranslateFinalize } from '@/app/api/android/v1.0.2/translate/finalize/route'
import { POST as postAndroidV103TranslateFinalize } from '@/app/api/android/v1.0.3/translate/finalize/route'
import { POST as postAndroidV104TranslateFinalize } from '@/app/api/android/v1.0.4/translate/finalize/route'
import { POST as postAndroidV105TranslateFinalize } from '@/app/api/android/v1.0.5/translate/finalize/route'
import { POST as postAndroidV100TtsInworld } from '@/app/api/android/v1.0.0/tts/inworld/route'
import { POST as postAndroidV102TtsInworld } from '@/app/api/android/v1.0.2/tts/inworld/route'
import { POST as postAndroidV103TtsInworld } from '@/app/api/android/v1.0.3/tts/inworld/route'
import { POST as postAndroidV104TtsInworld } from '@/app/api/android/v1.0.4/tts/inworld/route'
import { POST as postAndroidV105TtsInworld } from '@/app/api/android/v1.0.5/tts/inworld/route'
import { POST as postIosV100ClientVersionPolicy } from '@/app/api/ios/v1.0.0/client/version-policy/route'
import { POST as postIosV102ClientVersionPolicy } from '@/app/api/ios/v1.0.2/client/version-policy/route'
import { POST as postIosV103ClientVersionPolicy } from '@/app/api/ios/v1.0.3/client/version-policy/route'
import { POST as postIosV104ClientVersionPolicy } from '@/app/api/ios/v1.0.4/client/version-policy/route'
import { POST as postIosV105ClientVersionPolicy } from '@/app/api/ios/v1.0.5/client/version-policy/route'
import { POST as postIosV106ClientVersionPolicy } from '@/app/api/ios/v1.0.6/client/version-policy/route'
import { POST as postIosV100LogClientEvent } from '@/app/api/ios/v1.0.0/log/client-event/route'
import { POST as postIosV102LogClientEvent } from '@/app/api/ios/v1.0.2/log/client-event/route'
import { POST as postIosV103LogClientEvent } from '@/app/api/ios/v1.0.3/log/client-event/route'
import { POST as postIosV104LogClientEvent } from '@/app/api/ios/v1.0.4/log/client-event/route'
import { POST as postIosV105LogClientEvent } from '@/app/api/ios/v1.0.5/log/client-event/route'
import { POST as postIosV106LogClientEvent } from '@/app/api/ios/v1.0.6/log/client-event/route'
import { POST as postIosV100TranslateFinalize } from '@/app/api/ios/v1.0.0/translate/finalize/route'
import { POST as postIosV102TranslateFinalize } from '@/app/api/ios/v1.0.2/translate/finalize/route'
import { POST as postIosV103TranslateFinalize } from '@/app/api/ios/v1.0.3/translate/finalize/route'
import { POST as postIosV104TranslateFinalize } from '@/app/api/ios/v1.0.4/translate/finalize/route'
import { POST as postIosV105TranslateFinalize } from '@/app/api/ios/v1.0.5/translate/finalize/route'
import { POST as postIosV106TranslateFinalize } from '@/app/api/ios/v1.0.6/translate/finalize/route'
import { POST as postIosV100TtsInworld } from '@/app/api/ios/v1.0.0/tts/inworld/route'
import { POST as postIosV102TtsInworld } from '@/app/api/ios/v1.0.2/tts/inworld/route'
import { POST as postIosV103TtsInworld } from '@/app/api/ios/v1.0.3/tts/inworld/route'
import { POST as postIosV104TtsInworld } from '@/app/api/ios/v1.0.4/tts/inworld/route'
import { POST as postIosV105TtsInworld } from '@/app/api/ios/v1.0.5/tts/inworld/route'
import { POST as postIosV106TtsInworld } from '@/app/api/ios/v1.0.6/tts/inworld/route'
import { postAndroidClientVersionPolicyForAndroidV1_0_0 } from '@/server/api/controllers/android/v1.0.0/client-version-policy-controller'
import { postAndroidClientVersionPolicyForAndroidV1_0_2 } from '@/server/api/controllers/android/v1.0.2/client-version-policy-controller'
import { postAndroidClientVersionPolicyForAndroidV1_0_3 } from '@/server/api/controllers/android/v1.0.3/client-version-policy-controller'
import { postAndroidClientVersionPolicyForAndroidV1_0_4 } from '@/server/api/controllers/android/v1.0.4/client-version-policy-controller'
import { postAndroidClientVersionPolicyForAndroidV1_0_5 } from '@/server/api/controllers/android/v1.0.5/client-version-policy-controller'
import { postLogClientEventForAndroidV1_0_0 } from '@/server/api/controllers/android/v1.0.0/log-client-event-controller'
import { postLogClientEventForAndroidV1_0_2 } from '@/server/api/controllers/android/v1.0.2/log-client-event-controller'
import { postLogClientEventForAndroidV1_0_3 } from '@/server/api/controllers/android/v1.0.3/log-client-event-controller'
import { postLogClientEventForAndroidV1_0_4 } from '@/server/api/controllers/android/v1.0.4/log-client-event-controller'
import { postLogClientEventForAndroidV1_0_5 } from '@/server/api/controllers/android/v1.0.5/log-client-event-controller'
import { postTranslateFinalizeForAndroidV1_0_0 } from '@/server/api/controllers/android/v1.0.0/translate-finalize-controller'
import { postTranslateFinalizeForAndroidV1_0_2 } from '@/server/api/controllers/android/v1.0.2/translate-finalize-controller'
import { postTranslateFinalizeForAndroidV1_0_3 } from '@/server/api/controllers/android/v1.0.3/translate-finalize-controller'
import { postTranslateFinalizeForAndroidV1_0_4 } from '@/server/api/controllers/android/v1.0.4/translate-finalize-controller'
import { postTranslateFinalizeForAndroidV1_0_5 } from '@/server/api/controllers/android/v1.0.5/translate-finalize-controller'
import { postTtsInworldForAndroidV1_0_0 } from '@/server/api/controllers/android/v1.0.0/tts-inworld-controller'
import { postTtsInworldForAndroidV1_0_2 } from '@/server/api/controllers/android/v1.0.2/tts-inworld-controller'
import { postTtsInworldForAndroidV1_0_3 } from '@/server/api/controllers/android/v1.0.3/tts-inworld-controller'
import { postTtsInworldForAndroidV1_0_4 } from '@/server/api/controllers/android/v1.0.4/tts-inworld-controller'
import { postTtsInworldForAndroidV1_0_5 } from '@/server/api/controllers/android/v1.0.5/tts-inworld-controller'
import { postIosClientVersionPolicyForIosV1_0_0 } from '@/server/api/controllers/ios/v1.0.0/client-version-policy-controller'
import { postIosClientVersionPolicyForIosV1_0_2 } from '@/server/api/controllers/ios/v1.0.2/client-version-policy-controller'
import { postIosClientVersionPolicyForIosV1_0_3 } from '@/server/api/controllers/ios/v1.0.3/client-version-policy-controller'
import { postIosClientVersionPolicyForIosV1_0_4 } from '@/server/api/controllers/ios/v1.0.4/client-version-policy-controller'
import { postIosClientVersionPolicyForIosV1_0_5 } from '@/server/api/controllers/ios/v1.0.5/client-version-policy-controller'
import { postIosClientVersionPolicyForIosV1_0_6 } from '@/server/api/controllers/ios/v1.0.6/client-version-policy-controller'
import { postLogClientEventForIosV1_0_0 } from '@/server/api/controllers/ios/v1.0.0/log-client-event-controller'
import { postLogClientEventForIosV1_0_2 } from '@/server/api/controllers/ios/v1.0.2/log-client-event-controller'
import { postLogClientEventForIosV1_0_3 } from '@/server/api/controllers/ios/v1.0.3/log-client-event-controller'
import { postLogClientEventForIosV1_0_4 } from '@/server/api/controllers/ios/v1.0.4/log-client-event-controller'
import { postLogClientEventForIosV1_0_5 } from '@/server/api/controllers/ios/v1.0.5/log-client-event-controller'
import { postLogClientEventForIosV1_0_6 } from '@/server/api/controllers/ios/v1.0.6/log-client-event-controller'
import { postTranslateFinalizeForIosV1_0_0 } from '@/server/api/controllers/ios/v1.0.0/translate-finalize-controller'
import { postTranslateFinalizeForIosV1_0_2 } from '@/server/api/controllers/ios/v1.0.2/translate-finalize-controller'
import { postTranslateFinalizeForIosV1_0_3 } from '@/server/api/controllers/ios/v1.0.3/translate-finalize-controller'
import { postTranslateFinalizeForIosV1_0_4 } from '@/server/api/controllers/ios/v1.0.4/translate-finalize-controller'
import { postTranslateFinalizeForIosV1_0_5 } from '@/server/api/controllers/ios/v1.0.5/translate-finalize-controller'
import { postTranslateFinalizeForIosV1_0_6 } from '@/server/api/controllers/ios/v1.0.6/translate-finalize-controller'
import { postTtsInworldForIosV1_0_0 } from '@/server/api/controllers/ios/v1.0.0/tts-inworld-controller'
import { postTtsInworldForIosV1_0_2 } from '@/server/api/controllers/ios/v1.0.2/tts-inworld-controller'
import { postTtsInworldForIosV1_0_3 } from '@/server/api/controllers/ios/v1.0.3/tts-inworld-controller'
import { postTtsInworldForIosV1_0_4 } from '@/server/api/controllers/ios/v1.0.4/tts-inworld-controller'
import { postTtsInworldForIosV1_0_5 } from '@/server/api/controllers/ios/v1.0.5/tts-inworld-controller'
import { postTtsInworldForIosV1_0_6 } from '@/server/api/controllers/ios/v1.0.6/tts-inworld-controller'
import { postClientVersionPolicyForLegacy } from '@/server/api/controllers/legacy/client-version-policy-controller'
import { postIosClientVersionPolicyForLegacy } from '@/server/api/controllers/legacy/ios-client-version-policy-controller'
import { postLogClientEventForLegacy } from '@/server/api/controllers/legacy/log-client-event-controller'
import { postTranslateFinalizeForLegacy } from '@/server/api/controllers/legacy/translate-finalize-controller'
import { postTtsInworldForLegacy } from '@/server/api/controllers/legacy/tts-inworld-controller'

describe('mingle-app namespace route wiring', () => {
  it('maps legacy routes to legacy controllers', () => {
    expect(postLegacyTranslateFinalize).toBe(postTranslateFinalizeForLegacy)
    expect(postLegacyTtsInworld).toBe(postTtsInworldForLegacy)
    expect(postLegacyLogClientEvent).toBe(postLogClientEventForLegacy)
    expect(postLegacyClientVersionPolicy).toBe(postClientVersionPolicyForLegacy)
  })

  it('maps /android/v1.0.0 routes to Android v1.0.0 controllers', () => {
    expect(postAndroidV100TranslateFinalize).toBe(postTranslateFinalizeForAndroidV1_0_0)
    expect(postAndroidV100TtsInworld).toBe(postTtsInworldForAndroidV1_0_0)
    expect(postAndroidV100LogClientEvent).toBe(postLogClientEventForAndroidV1_0_0)
    expect(postAndroidV100ClientVersionPolicy).toBe(postAndroidClientVersionPolicyForAndroidV1_0_0)
  })

  it('maps /android/v1.0.2 routes to Android v1.0.2 controllers', () => {
    expect(postAndroidV102TranslateFinalize).toBe(postTranslateFinalizeForAndroidV1_0_2)
    expect(postAndroidV102TtsInworld).toBe(postTtsInworldForAndroidV1_0_2)
    expect(postAndroidV102LogClientEvent).toBe(postLogClientEventForAndroidV1_0_2)
    expect(postAndroidV102ClientVersionPolicy).toBe(postAndroidClientVersionPolicyForAndroidV1_0_2)
  })

  it('maps /android/v1.0.3 routes to Android v1.0.3 controllers', () => {
    expect(postAndroidV103TranslateFinalize).toBe(postTranslateFinalizeForAndroidV1_0_3)
    expect(postAndroidV103TtsInworld).toBe(postTtsInworldForAndroidV1_0_3)
    expect(postAndroidV103LogClientEvent).toBe(postLogClientEventForAndroidV1_0_3)
    expect(postAndroidV103ClientVersionPolicy).toBe(postAndroidClientVersionPolicyForAndroidV1_0_3)
  })

  it('maps /android/v1.0.4 routes to Android v1.0.4 controllers', () => {
    expect(postAndroidV104TranslateFinalize).toBe(postTranslateFinalizeForAndroidV1_0_4)
    expect(postAndroidV104TtsInworld).toBe(postTtsInworldForAndroidV1_0_4)
    expect(postAndroidV104LogClientEvent).toBe(postLogClientEventForAndroidV1_0_4)
    expect(postAndroidV104ClientVersionPolicy).toBe(postAndroidClientVersionPolicyForAndroidV1_0_4)
  })

  it('maps /android/v1.0.5 routes to Android v1.0.5 controllers', () => {
    expect(postAndroidV105TranslateFinalize).toBe(postTranslateFinalizeForAndroidV1_0_5)
    expect(postAndroidV105TtsInworld).toBe(postTtsInworldForAndroidV1_0_5)
    expect(postAndroidV105LogClientEvent).toBe(postLogClientEventForAndroidV1_0_5)
    expect(postAndroidV105ClientVersionPolicy).toBe(postAndroidClientVersionPolicyForAndroidV1_0_5)
  })

  it('maps /ios/v1.0.0 routes to iOS v1.0.0 controllers', () => {
    expect(postIosV100TranslateFinalize).toBe(postTranslateFinalizeForIosV1_0_0)
    expect(postIosV100TtsInworld).toBe(postTtsInworldForIosV1_0_0)
    expect(postIosV100LogClientEvent).toBe(postLogClientEventForIosV1_0_0)
    expect(postIosV100ClientVersionPolicy).toBe(postIosClientVersionPolicyForIosV1_0_0)
  })

  it('maps /ios/v1.0.2 routes to iOS v1.0.2 controllers', () => {
    expect(postIosV102TranslateFinalize).toBe(postTranslateFinalizeForIosV1_0_2)
    expect(postIosV102TtsInworld).toBe(postTtsInworldForIosV1_0_2)
    expect(postIosV102LogClientEvent).toBe(postLogClientEventForIosV1_0_2)
    expect(postIosV102ClientVersionPolicy).toBe(postIosClientVersionPolicyForIosV1_0_2)
  })

  it('maps /ios/v1.0.3 routes to iOS v1.0.3 controllers', () => {
    expect(postIosV103TranslateFinalize).toBe(postTranslateFinalizeForIosV1_0_3)
    expect(postIosV103TtsInworld).toBe(postTtsInworldForIosV1_0_3)
    expect(postIosV103LogClientEvent).toBe(postLogClientEventForIosV1_0_3)
    expect(postIosV103ClientVersionPolicy).toBe(postIosClientVersionPolicyForIosV1_0_3)
  })

  it('maps /ios/v1.0.4 routes to iOS v1.0.4 controllers', () => {
    expect(postIosV104TranslateFinalize).toBe(postTranslateFinalizeForIosV1_0_4)
    expect(postIosV104TtsInworld).toBe(postTtsInworldForIosV1_0_4)
    expect(postIosV104LogClientEvent).toBe(postLogClientEventForIosV1_0_4)
    expect(postIosV104ClientVersionPolicy).toBe(postIosClientVersionPolicyForIosV1_0_4)
  })

  it('maps /ios/v1.0.5 routes to iOS v1.0.5 controllers', () => {
    expect(postIosV105TranslateFinalize).toBe(postTranslateFinalizeForIosV1_0_5)
    expect(postIosV105TtsInworld).toBe(postTtsInworldForIosV1_0_5)
    expect(postIosV105LogClientEvent).toBe(postLogClientEventForIosV1_0_5)
    expect(postIosV105ClientVersionPolicy).toBe(postIosClientVersionPolicyForIosV1_0_5)
  })

  it('maps /ios/v1.0.6 routes to iOS v1.0.6 controllers', () => {
    expect(postIosV106TranslateFinalize).toBe(postTranslateFinalizeForIosV1_0_6)
    expect(postIosV106TtsInworld).toBe(postTtsInworldForIosV1_0_6)
    expect(postIosV106LogClientEvent).toBe(postLogClientEventForIosV1_0_6)
    expect(postIosV106ClientVersionPolicy).toBe(postIosClientVersionPolicyForIosV1_0_6)
  })

  it('keeps iOS v1.0.0 controller code identical to legacy controllers', () => {
    expect(postTranslateFinalizeForIosV1_0_0).toBe(postTranslateFinalizeForLegacy)
    expect(postTtsInworldForIosV1_0_0).toBe(postTtsInworldForLegacy)
    expect(postLogClientEventForIosV1_0_0).toBe(postLogClientEventForLegacy)
    expect(postIosClientVersionPolicyForIosV1_0_0).toBe(postIosClientVersionPolicyForLegacy)
  })

  it('keeps iOS v1.0.2 controller code identical to legacy controllers', () => {
    expect(postTranslateFinalizeForIosV1_0_2).toBe(postTranslateFinalizeForLegacy)
    expect(postTtsInworldForIosV1_0_2).toBe(postTtsInworldForLegacy)
    expect(postLogClientEventForIosV1_0_2).toBe(postLogClientEventForLegacy)
    expect(postIosClientVersionPolicyForIosV1_0_2).toBe(postIosClientVersionPolicyForLegacy)
  })

  it('keeps iOS v1.0.3 controller code identical to legacy controllers', () => {
    expect(postTranslateFinalizeForIosV1_0_3).toBe(postTranslateFinalizeForLegacy)
    expect(postTtsInworldForIosV1_0_3).toBe(postTtsInworldForLegacy)
    expect(postLogClientEventForIosV1_0_3).toBe(postLogClientEventForLegacy)
    expect(postIosClientVersionPolicyForIosV1_0_3).toBe(postIosClientVersionPolicyForLegacy)
  })

  it('keeps iOS v1.0.4 controller code identical to legacy controllers', () => {
    expect(postTranslateFinalizeForIosV1_0_4).toBe(postTranslateFinalizeForLegacy)
    expect(postTtsInworldForIosV1_0_4).toBe(postTtsInworldForLegacy)
    expect(postLogClientEventForIosV1_0_4).toBe(postLogClientEventForLegacy)
    expect(postIosClientVersionPolicyForIosV1_0_4).toBe(postIosClientVersionPolicyForLegacy)
  })

  it('keeps iOS v1.0.5 controller code identical to legacy controllers', () => {
    expect(postTranslateFinalizeForIosV1_0_5).toBe(postTranslateFinalizeForLegacy)
    expect(postTtsInworldForIosV1_0_5).toBe(postTtsInworldForLegacy)
    expect(postLogClientEventForIosV1_0_5).toBe(postLogClientEventForLegacy)
    expect(postIosClientVersionPolicyForIosV1_0_5).toBe(postIosClientVersionPolicyForLegacy)
  })

  it('keeps iOS v1.0.6 controller code identical to legacy controllers', () => {
    expect(postTranslateFinalizeForIosV1_0_6).toBe(postTranslateFinalizeForLegacy)
    expect(postTtsInworldForIosV1_0_6).toBe(postTtsInworldForLegacy)
    expect(postLogClientEventForIosV1_0_6).toBe(postLogClientEventForLegacy)
    expect(postIosClientVersionPolicyForIosV1_0_6).toBe(postIosClientVersionPolicyForLegacy)
  })

  it('keeps Android v1.0.0 controller code identical to legacy controllers', () => {
    expect(postTranslateFinalizeForAndroidV1_0_0).toBe(postTranslateFinalizeForLegacy)
    expect(postTtsInworldForAndroidV1_0_0).toBe(postTtsInworldForLegacy)
    expect(postLogClientEventForAndroidV1_0_0).toBe(postLogClientEventForLegacy)
  })

  it('keeps Android v1.0.2 controller code identical to legacy controllers', () => {
    expect(postTranslateFinalizeForAndroidV1_0_2).toBe(postTranslateFinalizeForLegacy)
    expect(postTtsInworldForAndroidV1_0_2).toBe(postTtsInworldForLegacy)
    expect(postLogClientEventForAndroidV1_0_2).toBe(postLogClientEventForLegacy)
  })

  it('keeps Android v1.0.3 controller code identical to legacy controllers', () => {
    expect(postTranslateFinalizeForAndroidV1_0_3).toBe(postTranslateFinalizeForLegacy)
    expect(postTtsInworldForAndroidV1_0_3).toBe(postTtsInworldForLegacy)
    expect(postLogClientEventForAndroidV1_0_3).toBe(postLogClientEventForLegacy)
  })

  it('keeps Android v1.0.4 controller code identical to legacy controllers', () => {
    expect(postTranslateFinalizeForAndroidV1_0_4).toBe(postTranslateFinalizeForLegacy)
    expect(postTtsInworldForAndroidV1_0_4).toBe(postTtsInworldForLegacy)
    expect(postLogClientEventForAndroidV1_0_4).toBe(postLogClientEventForLegacy)
  })

  it('keeps Android v1.0.5 controller code identical to legacy controllers', () => {
    expect(postTranslateFinalizeForAndroidV1_0_5).toBe(postTranslateFinalizeForLegacy)
    expect(postTtsInworldForAndroidV1_0_5).toBe(postTtsInworldForLegacy)
    expect(postLogClientEventForAndroidV1_0_5).toBe(postLogClientEventForLegacy)
  })
})
