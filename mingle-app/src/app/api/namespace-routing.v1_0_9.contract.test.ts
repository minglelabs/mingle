import { describe, expect, it } from 'vitest'

import { POST as postAndroidV109ClientVersionPolicy } from '@/app/api/android/v1.0.9/client/version-policy/route'
import { POST as postAndroidV109LogClientEvent } from '@/app/api/android/v1.0.9/log/client-event/route'
import { POST as postAndroidV109TranslateFinalize } from '@/app/api/android/v1.0.9/translate/finalize/route'
import { POST as postAndroidV109TtsInworld } from '@/app/api/android/v1.0.9/tts/inworld/route'
import { POST as postIosV109ClientVersionPolicy } from '@/app/api/ios/v1.0.9/client/version-policy/route'
import { POST as postIosV109LogClientEvent } from '@/app/api/ios/v1.0.9/log/client-event/route'
import { POST as postIosV109TranslateFinalize } from '@/app/api/ios/v1.0.9/translate/finalize/route'
import { POST as postIosV109TtsInworld } from '@/app/api/ios/v1.0.9/tts/inworld/route'
import { postAndroidClientVersionPolicyForAndroidV1_0_9 } from '@/server/api/controllers/android/v1.0.9/client-version-policy-controller'
import { postLogClientEventForAndroidV1_0_9 } from '@/server/api/controllers/android/v1.0.9/log-client-event-controller'
import { postTranslateFinalizeForAndroidV1_0_9 } from '@/server/api/controllers/android/v1.0.9/translate-finalize-controller'
import { postTtsInworldForAndroidV1_0_9 } from '@/server/api/controllers/android/v1.0.9/tts-inworld-controller'
import { postIosClientVersionPolicyForIosV1_0_9 } from '@/server/api/controllers/ios/v1.0.9/client-version-policy-controller'
import { postLogClientEventForIosV1_0_9 } from '@/server/api/controllers/ios/v1.0.9/log-client-event-controller'
import { postTranslateFinalizeForIosV1_0_9 } from '@/server/api/controllers/ios/v1.0.9/translate-finalize-controller'
import { postTtsInworldForIosV1_0_9 } from '@/server/api/controllers/ios/v1.0.9/tts-inworld-controller'
import { postTranslateFinalizeForLegacy } from '@/server/api/controllers/legacy/translate-finalize-controller'
import { postTtsInworldForLegacy } from '@/server/api/controllers/legacy/tts-inworld-controller'
import { postLogClientEventForLegacy } from '@/server/api/controllers/legacy/log-client-event-controller'
import { postIosClientVersionPolicyForLegacy } from '@/server/api/controllers/legacy/ios-client-version-policy-controller'

describe('mingle-app v1.0.9 namespace route wiring', () => {
  it('maps /android/v1.0.9 routes to Android v1.0.9 controllers', () => {
    expect(postAndroidV109TranslateFinalize).toBe(postTranslateFinalizeForAndroidV1_0_9)
    expect(postAndroidV109TtsInworld).toBe(postTtsInworldForAndroidV1_0_9)
    expect(postAndroidV109LogClientEvent).toBe(postLogClientEventForAndroidV1_0_9)
    expect(postAndroidV109ClientVersionPolicy).toBe(postAndroidClientVersionPolicyForAndroidV1_0_9)
  })

  it('maps /ios/v1.0.9 routes to iOS v1.0.9 controllers', () => {
    expect(postIosV109TranslateFinalize).toBe(postTranslateFinalizeForIosV1_0_9)
    expect(postIosV109TtsInworld).toBe(postTtsInworldForIosV1_0_9)
    expect(postIosV109LogClientEvent).toBe(postLogClientEventForIosV1_0_9)
    expect(postIosV109ClientVersionPolicy).toBe(postIosClientVersionPolicyForIosV1_0_9)
  })

  it('keeps iOS v1.0.9 controller code identical to legacy controllers', () => {
    expect(postTranslateFinalizeForIosV1_0_9).toBe(postTranslateFinalizeForLegacy)
    expect(postTtsInworldForIosV1_0_9).toBe(postTtsInworldForLegacy)
    expect(postLogClientEventForIosV1_0_9).toBe(postLogClientEventForLegacy)
    expect(postIosClientVersionPolicyForIosV1_0_9).toBe(postIosClientVersionPolicyForLegacy)
  })

  it('keeps Android v1.0.9 controller code identical to legacy controllers', () => {
    expect(postTranslateFinalizeForAndroidV1_0_9).toBe(postTranslateFinalizeForLegacy)
    expect(postTtsInworldForAndroidV1_0_9).toBe(postTtsInworldForLegacy)
    expect(postLogClientEventForAndroidV1_0_9).toBe(postLogClientEventForLegacy)
  })
})
