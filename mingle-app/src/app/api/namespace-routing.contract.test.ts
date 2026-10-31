import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { getPathMatch } from 'next/dist/shared/lib/router/utils/path-match'
import { describe, expect, it } from 'vitest'

import nextConfig from '../../../next.config.mjs'

import { POST as postLegacyLogClientEvent } from '@/app/api/log/client-event/route'
import { POST as postLegacyTranslateFinalize } from '@/app/api/translate/finalize/route'
import { POST as postLegacyTtsInworld } from '@/app/api/tts/inworld/route'
import { POST as postLegacyClientVersionPolicy } from '@/app/api/client/version-policy/route'
import { postAndroidClientVersionPolicyForAndroidV1_0_10 } from '@/server/api/controllers/android/v1.0.10/client-version-policy-controller'
import { postAndroidClientVersionPolicyForAndroidV1_1_0 } from '@/server/api/controllers/android/v1.1.0/client-version-policy-controller'
import { postLogClientEventForAndroidV1_0_0 } from '@/server/api/controllers/android/v1.0.0/log-client-event-controller'
import { postLogClientEventForAndroidV1_0_2 } from '@/server/api/controllers/android/v1.0.2/log-client-event-controller'
import { postLogClientEventForAndroidV1_0_3 } from '@/server/api/controllers/android/v1.0.3/log-client-event-controller'
import { postLogClientEventForAndroidV1_0_4 } from '@/server/api/controllers/android/v1.0.4/log-client-event-controller'
import { postLogClientEventForAndroidV1_0_5 } from '@/server/api/controllers/android/v1.0.5/log-client-event-controller'
import { postLogClientEventForAndroidV1_0_6 } from '@/server/api/controllers/android/v1.0.6/log-client-event-controller'
import { postLogClientEventForAndroidV1_0_7 } from '@/server/api/controllers/android/v1.0.7/log-client-event-controller'
import { postLogClientEventForAndroidV1_0_8 } from '@/server/api/controllers/android/v1.0.8/log-client-event-controller'
import { postLogClientEventForAndroidV1_0_9 } from '@/server/api/controllers/android/v1.0.9/log-client-event-controller'
import { postLogClientEventForAndroidV1_0_10 } from '@/server/api/controllers/android/v1.0.10/log-client-event-controller'
import { postLogClientEventForAndroidV1_0_11 } from '@/server/api/controllers/android/v1.0.11/log-client-event-controller'
import { postLogClientEventForAndroidV1_1_0 } from '@/server/api/controllers/android/v1.1.0/log-client-event-controller'
import { postTranslateFinalizeForAndroidV1_0_0 } from '@/server/api/controllers/android/v1.0.0/translate-finalize-controller'
import { postTranslateFinalizeForAndroidV1_0_2 } from '@/server/api/controllers/android/v1.0.2/translate-finalize-controller'
import { postTranslateFinalizeForAndroidV1_0_3 } from '@/server/api/controllers/android/v1.0.3/translate-finalize-controller'
import { postTranslateFinalizeForAndroidV1_0_4 } from '@/server/api/controllers/android/v1.0.4/translate-finalize-controller'
import { postTranslateFinalizeForAndroidV1_0_5 } from '@/server/api/controllers/android/v1.0.5/translate-finalize-controller'
import { postTranslateFinalizeForAndroidV1_0_6 } from '@/server/api/controllers/android/v1.0.6/translate-finalize-controller'
import { postTranslateFinalizeForAndroidV1_0_7 } from '@/server/api/controllers/android/v1.0.7/translate-finalize-controller'
import { postTranslateFinalizeForAndroidV1_0_8 } from '@/server/api/controllers/android/v1.0.8/translate-finalize-controller'
import { postTranslateFinalizeForAndroidV1_0_9 } from '@/server/api/controllers/android/v1.0.9/translate-finalize-controller'
import { postTranslateFinalizeForAndroidV1_0_10 } from '@/server/api/controllers/android/v1.0.10/translate-finalize-controller'
import { postTranslateFinalizeForAndroidV1_0_11 } from '@/server/api/controllers/android/v1.0.11/translate-finalize-controller'
import { postTranslateFinalizeForAndroidV1_1_0 } from '@/server/api/controllers/android/v1.1.0/translate-finalize-controller'
import { postTtsInworldForAndroidV1_0_0 } from '@/server/api/controllers/android/v1.0.0/tts-inworld-controller'
import { postTtsInworldForAndroidV1_0_2 } from '@/server/api/controllers/android/v1.0.2/tts-inworld-controller'
import { postTtsInworldForAndroidV1_0_3 } from '@/server/api/controllers/android/v1.0.3/tts-inworld-controller'
import { postTtsInworldForAndroidV1_0_4 } from '@/server/api/controllers/android/v1.0.4/tts-inworld-controller'
import { postTtsInworldForAndroidV1_0_5 } from '@/server/api/controllers/android/v1.0.5/tts-inworld-controller'
import { postTtsInworldForAndroidV1_0_6 } from '@/server/api/controllers/android/v1.0.6/tts-inworld-controller'
import { postTtsInworldForAndroidV1_0_7 } from '@/server/api/controllers/android/v1.0.7/tts-inworld-controller'
import { postTtsInworldForAndroidV1_0_8 } from '@/server/api/controllers/android/v1.0.8/tts-inworld-controller'
import { postTtsInworldForAndroidV1_0_9 } from '@/server/api/controllers/android/v1.0.9/tts-inworld-controller'
import { postTtsInworldForAndroidV1_0_10 } from '@/server/api/controllers/android/v1.0.10/tts-inworld-controller'
import { postTtsInworldForAndroidV1_0_11 } from '@/server/api/controllers/android/v1.0.11/tts-inworld-controller'
import { postTtsInworldForAndroidV1_1_0 } from '@/server/api/controllers/android/v1.1.0/tts-inworld-controller'
import { postIosClientVersionPolicyForIosV1_0_0 } from '@/server/api/controllers/ios/v1.0.0/client-version-policy-controller'
import { postIosClientVersionPolicyForIosV1_0_2 } from '@/server/api/controllers/ios/v1.0.2/client-version-policy-controller'
import { postIosClientVersionPolicyForIosV1_0_3 } from '@/server/api/controllers/ios/v1.0.3/client-version-policy-controller'
import { postIosClientVersionPolicyForIosV1_0_4 } from '@/server/api/controllers/ios/v1.0.4/client-version-policy-controller'
import { postIosClientVersionPolicyForIosV1_0_5 } from '@/server/api/controllers/ios/v1.0.5/client-version-policy-controller'
import { postIosClientVersionPolicyForIosV1_0_6 } from '@/server/api/controllers/ios/v1.0.6/client-version-policy-controller'
import { postIosClientVersionPolicyForIosV1_0_7 } from '@/server/api/controllers/ios/v1.0.7/client-version-policy-controller'
import { postIosClientVersionPolicyForIosV1_0_8 } from '@/server/api/controllers/ios/v1.0.8/client-version-policy-controller'
import { postIosClientVersionPolicyForIosV1_0_9 } from '@/server/api/controllers/ios/v1.0.9/client-version-policy-controller'
import { postIosClientVersionPolicyForIosV1_0_10 } from '@/server/api/controllers/ios/v1.0.10/client-version-policy-controller'
import { postIosClientVersionPolicyForIosV1_0_11 } from '@/server/api/controllers/ios/v1.0.11/client-version-policy-controller'
import { postIosClientVersionPolicyForIosV1_1_0 } from '@/server/api/controllers/ios/v1.1.0/client-version-policy-controller'
import { postLogClientEventForIosV1_0_0 } from '@/server/api/controllers/ios/v1.0.0/log-client-event-controller'
import { postLogClientEventForIosV1_0_2 } from '@/server/api/controllers/ios/v1.0.2/log-client-event-controller'
import { postLogClientEventForIosV1_0_3 } from '@/server/api/controllers/ios/v1.0.3/log-client-event-controller'
import { postLogClientEventForIosV1_0_4 } from '@/server/api/controllers/ios/v1.0.4/log-client-event-controller'
import { postLogClientEventForIosV1_0_5 } from '@/server/api/controllers/ios/v1.0.5/log-client-event-controller'
import { postLogClientEventForIosV1_0_6 } from '@/server/api/controllers/ios/v1.0.6/log-client-event-controller'
import { postLogClientEventForIosV1_0_7 } from '@/server/api/controllers/ios/v1.0.7/log-client-event-controller'
import { postLogClientEventForIosV1_0_8 } from '@/server/api/controllers/ios/v1.0.8/log-client-event-controller'
import { postLogClientEventForIosV1_0_9 } from '@/server/api/controllers/ios/v1.0.9/log-client-event-controller'
import { postLogClientEventForIosV1_0_10 } from '@/server/api/controllers/ios/v1.0.10/log-client-event-controller'
import { postLogClientEventForIosV1_0_11 } from '@/server/api/controllers/ios/v1.0.11/log-client-event-controller'
import { postLogClientEventForIosV1_1_0 } from '@/server/api/controllers/ios/v1.1.0/log-client-event-controller'
import { postTranslateFinalizeForIosV1_0_0 } from '@/server/api/controllers/ios/v1.0.0/translate-finalize-controller'
import { postTranslateFinalizeForIosV1_0_2 } from '@/server/api/controllers/ios/v1.0.2/translate-finalize-controller'
import { postTranslateFinalizeForIosV1_0_3 } from '@/server/api/controllers/ios/v1.0.3/translate-finalize-controller'
import { postTranslateFinalizeForIosV1_0_4 } from '@/server/api/controllers/ios/v1.0.4/translate-finalize-controller'
import { postTranslateFinalizeForIosV1_0_5 } from '@/server/api/controllers/ios/v1.0.5/translate-finalize-controller'
import { postTranslateFinalizeForIosV1_0_6 } from '@/server/api/controllers/ios/v1.0.6/translate-finalize-controller'
import { postTranslateFinalizeForIosV1_0_7 } from '@/server/api/controllers/ios/v1.0.7/translate-finalize-controller'
import { postTranslateFinalizeForIosV1_0_8 } from '@/server/api/controllers/ios/v1.0.8/translate-finalize-controller'
import { postTranslateFinalizeForIosV1_0_9 } from '@/server/api/controllers/ios/v1.0.9/translate-finalize-controller'
import { postTranslateFinalizeForIosV1_0_10 } from '@/server/api/controllers/ios/v1.0.10/translate-finalize-controller'
import { postTranslateFinalizeForIosV1_0_11 } from '@/server/api/controllers/ios/v1.0.11/translate-finalize-controller'
import { postTranslateFinalizeForIosV1_1_0 } from '@/server/api/controllers/ios/v1.1.0/translate-finalize-controller'
import { postTtsInworldForIosV1_0_0 } from '@/server/api/controllers/ios/v1.0.0/tts-inworld-controller'
import { postTtsInworldForIosV1_0_2 } from '@/server/api/controllers/ios/v1.0.2/tts-inworld-controller'
import { postTtsInworldForIosV1_0_3 } from '@/server/api/controllers/ios/v1.0.3/tts-inworld-controller'
import { postTtsInworldForIosV1_0_4 } from '@/server/api/controllers/ios/v1.0.4/tts-inworld-controller'
import { postTtsInworldForIosV1_0_5 } from '@/server/api/controllers/ios/v1.0.5/tts-inworld-controller'
import { postTtsInworldForIosV1_0_6 } from '@/server/api/controllers/ios/v1.0.6/tts-inworld-controller'
import { postTtsInworldForIosV1_0_7 } from '@/server/api/controllers/ios/v1.0.7/tts-inworld-controller'
import { postTtsInworldForIosV1_0_8 } from '@/server/api/controllers/ios/v1.0.8/tts-inworld-controller'
import { postTtsInworldForIosV1_0_9 } from '@/server/api/controllers/ios/v1.0.9/tts-inworld-controller'
import { postTtsInworldForIosV1_0_10 } from '@/server/api/controllers/ios/v1.0.10/tts-inworld-controller'
import { postTtsInworldForIosV1_0_11 } from '@/server/api/controllers/ios/v1.0.11/tts-inworld-controller'
import { postTtsInworldForIosV1_1_0 } from '@/server/api/controllers/ios/v1.1.0/tts-inworld-controller'
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

  it('keeps iOS v1.0.7 controller code identical to legacy controllers', () => {
    expect(postTranslateFinalizeForIosV1_0_7).toBe(postTranslateFinalizeForLegacy)
    expect(postTtsInworldForIosV1_0_7).toBe(postTtsInworldForLegacy)
    expect(postLogClientEventForIosV1_0_7).toBe(postLogClientEventForLegacy)
    expect(postIosClientVersionPolicyForIosV1_0_7).toBe(postIosClientVersionPolicyForLegacy)
  })

  it('keeps iOS v1.0.8 controller code identical to legacy controllers', () => {
    expect(postTranslateFinalizeForIosV1_0_8).toBe(postTranslateFinalizeForLegacy)
    expect(postTtsInworldForIosV1_0_8).toBe(postTtsInworldForLegacy)
    expect(postLogClientEventForIosV1_0_8).toBe(postLogClientEventForLegacy)
    expect(postIosClientVersionPolicyForIosV1_0_8).toBe(postIosClientVersionPolicyForLegacy)
  })

  it('keeps iOS v1.0.9 controller code identical to legacy controllers', () => {
    expect(postTranslateFinalizeForIosV1_0_9).toBe(postTranslateFinalizeForLegacy)
    expect(postTtsInworldForIosV1_0_9).toBe(postTtsInworldForLegacy)
    expect(postLogClientEventForIosV1_0_9).toBe(postLogClientEventForLegacy)
    expect(postIosClientVersionPolicyForIosV1_0_9).toBe(postIosClientVersionPolicyForLegacy)
  })

  it('keeps iOS v1.0.11 controller code identical to legacy controllers', () => {
    expect(postTranslateFinalizeForIosV1_0_11).toBe(postTranslateFinalizeForLegacy)
    expect(postTtsInworldForIosV1_0_11).toBe(postTtsInworldForLegacy)
    expect(postLogClientEventForIosV1_0_11).toBe(postLogClientEventForLegacy)
    expect(postIosClientVersionPolicyForIosV1_0_11).toBe(postIosClientVersionPolicyForLegacy)
  })

  it('keeps iOS v1.1.0 inherited endpoints aligned with v1.0.10', () => {
    expect(postTranslateFinalizeForIosV1_1_0).toBe(postTranslateFinalizeForIosV1_0_10)
    expect(postTtsInworldForIosV1_1_0).toBe(postTtsInworldForIosV1_0_10)
    expect(postLogClientEventForIosV1_1_0).toBe(postLogClientEventForIosV1_0_10)
    expect(postIosClientVersionPolicyForIosV1_1_0).toBe(postIosClientVersionPolicyForIosV1_0_10)
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

  it('keeps Android v1.0.6 controller code identical to legacy controllers', () => {
    expect(postTranslateFinalizeForAndroidV1_0_6).toBe(postTranslateFinalizeForLegacy)
    expect(postTtsInworldForAndroidV1_0_6).toBe(postTtsInworldForLegacy)
    expect(postLogClientEventForAndroidV1_0_6).toBe(postLogClientEventForLegacy)
  })

  it('keeps Android v1.0.7 controller code identical to legacy controllers', () => {
    expect(postTranslateFinalizeForAndroidV1_0_7).toBe(postTranslateFinalizeForLegacy)
    expect(postTtsInworldForAndroidV1_0_7).toBe(postTtsInworldForLegacy)
    expect(postLogClientEventForAndroidV1_0_7).toBe(postLogClientEventForLegacy)
  })

  it('keeps Android v1.0.8 controller code identical to legacy controllers', () => {
    expect(postTranslateFinalizeForAndroidV1_0_8).toBe(postTranslateFinalizeForLegacy)
    expect(postTtsInworldForAndroidV1_0_8).toBe(postTtsInworldForLegacy)
    expect(postLogClientEventForAndroidV1_0_8).toBe(postLogClientEventForLegacy)
  })

  it('keeps Android v1.0.9 controller code identical to legacy controllers', () => {
    expect(postTranslateFinalizeForAndroidV1_0_9).toBe(postTranslateFinalizeForLegacy)
    expect(postTtsInworldForAndroidV1_0_9).toBe(postTtsInworldForLegacy)
    expect(postLogClientEventForAndroidV1_0_9).toBe(postLogClientEventForLegacy)
  })

  it('keeps Android v1.0.11 controller code identical to legacy controllers', () => {
    expect(postTranslateFinalizeForAndroidV1_0_11).toBe(postTranslateFinalizeForLegacy)
    expect(postTtsInworldForAndroidV1_0_11).toBe(postTtsInworldForLegacy)
    expect(postLogClientEventForAndroidV1_0_11).toBe(postLogClientEventForLegacy)
  })

  it('keeps Android v1.1.0 inherited endpoints aligned with v1.0.10', () => {
    expect(postTranslateFinalizeForAndroidV1_1_0).toBe(postTranslateFinalizeForAndroidV1_0_10)
    expect(postTtsInworldForAndroidV1_1_0).toBe(postTtsInworldForAndroidV1_0_10)
    expect(postLogClientEventForAndroidV1_1_0).toBe(postLogClientEventForAndroidV1_0_10)
    expect(postAndroidClientVersionPolicyForAndroidV1_1_0).toBe(postAndroidClientVersionPolicyForAndroidV1_0_10)
  })
})

type Rewrite = { source: string, destination: string }

async function loadRewrites(): Promise<Rewrite[]> {
  const rewrites = await nextConfig.rewrites?.()
  if (!Array.isArray(rewrites)) throw new Error('next.config rewrites() must return a flat array')
  return rewrites as Rewrite[]
}

// Same matcher options Next applies to `rewrites()` sources.
function matches(rule: Rewrite, pathname: string) {
  return getPathMatch(rule.source, { removeUnnamedParams: true, strict: true })(pathname)
}

const LEGACY_VERSION_POLICY_DESTINATION = '/api/:platform/v2.2.0/client/version-policy'

describe('pre-2.2.0 namespaces after their route trees were removed', () => {
  it('rewrites every pre-2.2.0 version-policy call to the v2.2.0 handler', async () => {
    const rewrites = await loadRewrites()
    const rule = rewrites.find((r) => r.destination === LEGACY_VERSION_POLICY_DESTINATION)
    expect(rule, 'legacy version-policy rewrite').toBeDefined()
    // First rule, so no broader alias can claim these paths before it.
    expect(rewrites[0]).toBe(rule)

    for (const [platform, version] of [
      ['ios', 'v1.0.0'], ['ios', 'v1.1.4'], ['ios', 'v2.0.4'], ['ios', 'v2.1.0'],
      ['android', 'v1.0.1'], ['android', 'v2.0.0'], ['android', 'v2.1.1'],
    ]) {
      expect(matches(rule!, `/api/${platform}/${version}/client/version-policy`))
        .toMatchObject({ platform, version })
    }
  })

  it('leaves supported namespaces and every other pre-2.2.0 path alone', async () => {
    const rule = (await loadRewrites()).find((r) => r.destination === LEGACY_VERSION_POLICY_DESTINATION)!
    for (const pathname of [
      '/api/ios/v2.2.0/client/version-policy',
      '/api/ios/v2.2.1/client/version-policy',
      '/api/android/v2.3.0/client/version-policy',
      '/api/ios/v2.3.1/client/version-policy',
      '/api/ios/v1.1.0/conversations',
      '/api/android/v2.1.0/feed',
      '/api/client/version-policy',
    ]) {
      expect(matches(rule, pathname), pathname).toBe(false)
    }
  })

  it('only aliases namespaces onto route trees that still exist', async () => {
    const apiRoot = fileURLToPath(new URL('.', import.meta.url))
    for (const { source, destination } of await loadRewrites()) {
      const match = destination.match(/^\/api\/(ios|android|:platform)\/(v[\d.]+)/)
      if (!match) continue
      for (const platform of match[1] === ':platform' ? ['ios', 'android'] : [match[1]]) {
        expect(existsSync(`${apiRoot}${platform}/${match[2]}`), `${source} -> ${destination}`).toBe(true)
      }
    }
  })
})
