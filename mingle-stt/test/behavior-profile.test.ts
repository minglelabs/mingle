import test from 'node:test';
import assert from 'node:assert/strict';

import {
    isLegacyMingleSttReleaseVariant,
    resolveMingleSttBehaviorProfile,
    resolveMingleSttReleaseVariant,
} from '../behavior-profile';
import { resolveMingleSttReleaseRuntime } from '../release-runtime';

test('legacy namespaces stay on the 1.0.11 STT profile', () => {
    assert.equal(resolveMingleSttBehaviorProfile('ios/v1.0.11'), 'legacy_1_0_11');
    assert.equal(resolveMingleSttBehaviorProfile('android/v1.0.7'), 'legacy_1_0_11');
    assert.equal(resolveMingleSttBehaviorProfile(''), 'legacy_1_0_11');
});

test('1.1.0 namespaces use the new STT profile', () => {
    assert.equal(resolveMingleSttBehaviorProfile('ios/v1.1.0'), 'v1_1_0');
    assert.equal(resolveMingleSttBehaviorProfile('android/v1.2.0'), 'v1_1_0');
});

test('release variants stay explicit for ios/android 1.0.11 and 1.1.0', () => {
    assert.equal(resolveMingleSttReleaseVariant(''), 'legacy_default_v1_0_11');
    assert.equal(resolveMingleSttReleaseVariant('ios/v1.0.11'), 'ios_v1_0_11');
    assert.equal(resolveMingleSttReleaseVariant('android/v1.0.7'), 'android_v1_0_11');
    assert.equal(resolveMingleSttReleaseVariant('ios/v1.1.0'), 'ios_v1_1_0');
    assert.equal(resolveMingleSttReleaseVariant('android/v1.1.0'), 'android_v1_1_0');
    assert.equal(isLegacyMingleSttReleaseVariant('ios_v1_0_11'), true);
    assert.equal(isLegacyMingleSttReleaseVariant('ios_v1_1_0'), false);
});

test('release runtimes stay pinned to the resolved release variant', () => {
    const legacyRuntime = resolveMingleSttReleaseRuntime('ios_v1_0_11');
    assert.deepEqual(
        legacyRuntime.buildReadyPayload({
            behaviorProfile: 'legacy_1_0_11',
            sonioxLanguageHintsEnabled: true,
        }),
        {
            status: 'ready',
            release_variant: 'ios_v1_0_11',
            behavior_profile: 'legacy_1_0_11',
            soniox_language_hints_enabled: true,
        },
    );

    const modernRuntime = resolveMingleSttReleaseRuntime('android_v1_1_0');
    assert.deepEqual(
        modernRuntime.buildStopRecordingAckData({
            behaviorProfile: 'v1_1_0',
            finalizedTurn: { text: 'hello', language: 'en' },
        }),
        {
            release_variant: 'android_v1_1_0',
            behavior_profile: 'v1_1_0',
            finalized: true,
            final_turn: { text: 'hello', language: 'en' },
        },
    );
});
