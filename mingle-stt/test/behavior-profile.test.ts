import test from 'node:test';
import assert from 'node:assert/strict';

import {
    isLegacyMingleSttReleaseVariant,
    parseMingleSttReleaseVariant,
    resolveMingleSttBehaviorProfileForReleaseVariant,
    resolveMingleSttBehaviorProfile,
    resolveMingleSttReleaseVariant,
} from '../behavior-profile';
import { resolveMingleSttReleaseRuntime } from '../release-runtime';
import type { MingleSttClientConfig } from '../release-runtime';

test('legacy namespaces stay on the 1.0.11 STT profile', () => {
    assert.equal(resolveMingleSttBehaviorProfile('ios/v1.0.11'), 'legacy_1_0_11');
    assert.equal(resolveMingleSttBehaviorProfile('android/v1.0.7'), 'legacy_1_0_11');
    assert.equal(resolveMingleSttBehaviorProfile(''), 'legacy_1_0_11');
});

test('modern namespaces use the matching STT profile label', () => {
    assert.equal(resolveMingleSttBehaviorProfile('ios/v1.1.0'), 'v1_1_0');
    assert.equal(resolveMingleSttBehaviorProfile('ios/v1.1.1'), 'v1_1_1');
    assert.equal(resolveMingleSttBehaviorProfile('android/v1.1.1'), 'v1_1_1');
    assert.equal(resolveMingleSttBehaviorProfile('ios/v1.1.2'), 'v1_1_2');
    assert.equal(resolveMingleSttBehaviorProfile('android/v1.1.2'), 'v1_1_2');
    assert.equal(resolveMingleSttBehaviorProfile('android/v1.2.0'), 'v1_1_2');
});

test('release variants stay explicit for ios/android namespace releases', () => {
    assert.equal(resolveMingleSttReleaseVariant(''), 'legacy_default_v1_0_11');
    assert.equal(parseMingleSttReleaseVariant('default_v1_1_0'), 'default_v1_1_0');
    assert.equal(parseMingleSttReleaseVariant('default_v1_1_1'), 'default_v1_1_1');
    assert.equal(parseMingleSttReleaseVariant('default_v1_1_2'), 'default_v1_1_2');
    assert.equal(resolveMingleSttReleaseVariant('ios/v1.0.11'), 'ios_v1_0_11');
    assert.equal(resolveMingleSttReleaseVariant('android/v1.0.7'), 'android_v1_0_11');
    assert.equal(resolveMingleSttReleaseVariant('ios/v1.1.0'), 'ios_v1_1_0');
    assert.equal(resolveMingleSttReleaseVariant('android/v1.1.0'), 'android_v1_1_0');
    assert.equal(resolveMingleSttReleaseVariant('ios/v1.1.1'), 'ios_v1_1_1');
    assert.equal(resolveMingleSttReleaseVariant('android/v1.1.1'), 'android_v1_1_1');
    assert.equal(resolveMingleSttReleaseVariant('ios/v1.1.2'), 'ios_v1_1_2');
    assert.equal(resolveMingleSttReleaseVariant('android/v1.1.2'), 'android_v1_1_2');
    assert.equal(isLegacyMingleSttReleaseVariant('ios_v1_0_11'), true);
    assert.equal(isLegacyMingleSttReleaseVariant('ios_v1_1_0'), false);
});

test('release runtimes stay pinned to the resolved release variant', () => {
    const legacyRuntime = resolveMingleSttReleaseRuntime('ios_v1_0_11');
    assert.deepEqual(
        legacyRuntime.buildReadyPayload({
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
            finalizedTurn: { text: 'hello', language: 'en' },
        }),
        {
            release_variant: 'android_v1_1_0',
            behavior_profile: 'v1_1_0',
            finalized: true,
            final_turn: { text: 'hello', language: 'en' },
        },
    );

    const defaultV110Runtime = resolveMingleSttReleaseRuntime('default_v1_1_0');
    assert.equal(defaultV110Runtime.behaviorLine, 'v1_1_0');
    assert.equal(resolveMingleSttBehaviorProfileForReleaseVariant('default_v1_1_0'), 'v1_1_0');

    const defaultV111Runtime = resolveMingleSttReleaseRuntime('default_v1_1_1');
    assert.equal(defaultV111Runtime.behaviorLine, 'v1_1_1');
    assert.equal(resolveMingleSttBehaviorProfileForReleaseVariant('default_v1_1_1'), 'v1_1_1');

    const iosV112Runtime = resolveMingleSttReleaseRuntime('ios_v1_1_2');
    assert.equal(iosV112Runtime.behaviorLine, 'v1_1_2');
    assert.deepEqual(
        iosV112Runtime.buildReadyPayload({
            sonioxLanguageHintsEnabled: false,
        }),
        {
            status: 'ready',
            release_variant: 'ios_v1_1_2',
            behavior_profile: 'v1_1_2',
            soniox_language_hints_enabled: false,
        },
    );
    assert.equal(resolveMingleSttBehaviorProfileForReleaseVariant('ios_v1_1_2'), 'v1_1_2');
});

test('release runtime owns provider startup dispatch', () => {
    const runtime = resolveMingleSttReleaseRuntime('ios_v1_1_0');
    const calls: string[] = [];
    const config: MingleSttClientConfig = {
        sample_rate: 16_000,
        languages: ['en'],
        stt_model: 'deepgram-multi',
    };

    runtime.startConnectionForModel({
        config,
        starters: {
            startGladia: () => calls.push('gladia'),
            startDeepgram: () => calls.push('deepgram'),
            startDeepgramMulti: () => calls.push('deepgram-multi'),
            startFireworks: () => calls.push('fireworks'),
            startSoniox: () => calls.push('soniox'),
        },
    });

    assert.deepEqual(calls, ['deepgram-multi']);
});

test('release runtime owns non-soniox stop lifecycle handling', () => {
    const runtime = resolveMingleSttReleaseRuntime('android_v1_0_11');
    let sonioxStopRequested = true;
    let providerClosed = false;
    let clientCloseScheduled = false;
    let speakerStatesDisposed = false;
    let ackData: ReturnType<typeof runtime.buildStopRecordingAckData> | null = null;

    runtime.handleStopRecording({
        pendingText: ' hello ',
        pendingLanguage: 'en',
        currentModel: 'gladia',
        lifecycle: {
            setSonioxStopRequested: (nextValue) => {
                sonioxStopRequested = nextValue;
            },
            finalizePendingTurnFromProvider: null,
            sendForcedFinalTurn: (rawText, rawLanguage) => ({
                text: rawText.trim(),
                language: rawLanguage,
            }),
            closeProviderSocket: () => {
                providerClosed = true;
            },
            sendStopRecordingAck: (data) => {
                ackData = data;
            },
            scheduleClientCloseAfterAck: () => {
                clientCloseScheduled = true;
            },
            disposeSpeakerStates: () => {
                speakerStatesDisposed = true;
            },
        },
    });

    assert.equal(sonioxStopRequested, false);
    assert.equal(providerClosed, true);
    assert.equal(clientCloseScheduled, true);
    assert.equal(speakerStatesDisposed, true);
    assert.deepEqual(ackData, {
        release_variant: 'android_v1_0_11',
        behavior_profile: 'legacy_1_0_11',
        finalized: true,
        final_turn: { text: 'hello', language: 'en' },
    });
});

test('release runtime owns soniox stop lifecycle handling', async () => {
    const runtime = resolveMingleSttReleaseRuntime('ios_v1_1_0');
    let sonioxStopRequested = false;
    let finalizeCalls = 0;
    let providerClosed = false;
    let speakerStatesDisposed = false;
    let ackData: ReturnType<typeof runtime.buildStopRecordingAckData> | null = null;

    runtime.handleStopRecording({
        pendingText: '',
        pendingLanguage: 'unknown',
        currentModel: 'soniox',
        lifecycle: {
            setSonioxStopRequested: (nextValue) => {
                sonioxStopRequested = nextValue;
            },
            finalizePendingTurnFromProvider: async () => {
                finalizeCalls += 1;
                return null;
            },
            sendForcedFinalTurn: () => null,
            closeProviderSocket: () => {
                providerClosed = true;
            },
            sendStopRecordingAck: (data) => {
                ackData = data;
            },
            scheduleClientCloseAfterAck: () => undefined,
            disposeSpeakerStates: () => {
                speakerStatesDisposed = true;
            },
        },
    });

    await new Promise((resolve) => setImmediate(resolve));

    assert.equal(sonioxStopRequested, true);
    assert.equal(finalizeCalls, 1);
    assert.equal(providerClosed, true);
    assert.equal(speakerStatesDisposed, false);
    assert.deepEqual(ackData, {
        release_variant: 'ios_v1_1_0',
        behavior_profile: 'v1_1_0',
        finalized: false,
        final_turn: null,
    });
});

test('release runtime waits for soniox provider finalization before ack', async () => {
    const runtime = resolveMingleSttReleaseRuntime('ios_v1_1_0');
    let ackData: ReturnType<typeof runtime.buildStopRecordingAckData> | null = null;
    let providerClosed = false;

    runtime.handleStopRecording({
        pendingText: '',
        pendingLanguage: 'unknown',
        currentModel: 'soniox',
        lifecycle: {
            setSonioxStopRequested: () => undefined,
            finalizePendingTurnFromProvider: async () => {
                await new Promise((resolve) => setImmediate(resolve));
                return { text: 'final words', language: 'en', speaker: '1' };
            },
            sendForcedFinalTurn: () => null,
            closeProviderSocket: () => {
                providerClosed = true;
            },
            sendStopRecordingAck: (data) => {
                ackData = data;
            },
            scheduleClientCloseAfterAck: () => undefined,
            disposeSpeakerStates: () => undefined,
        },
    });

    assert.equal(ackData, null);

    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));

    assert.equal(providerClosed, true);
    assert.deepEqual(ackData, {
        release_variant: 'ios_v1_1_0',
        behavior_profile: 'v1_1_0',
        finalized: true,
        final_turn: { text: 'final words', language: 'en', speaker: '1' },
    });
});

test('release runtime falls back to client pending text when soniox provider has no turn', async () => {
    const runtime = resolveMingleSttReleaseRuntime('ios_v1_1_0');
    let ackData: ReturnType<typeof runtime.buildStopRecordingAckData> | null = null;

    runtime.handleStopRecording({
        pendingText: ' fallback words ',
        pendingLanguage: 'en',
        currentModel: 'soniox',
        lifecycle: {
            setSonioxStopRequested: () => undefined,
            finalizePendingTurnFromProvider: async () => null,
            sendForcedFinalTurn: (rawText, rawLanguage) => ({
                text: rawText.trim(),
                language: rawLanguage,
            }),
            closeProviderSocket: () => undefined,
            sendStopRecordingAck: (data) => {
                ackData = data;
            },
            scheduleClientCloseAfterAck: () => undefined,
            disposeSpeakerStates: () => undefined,
        },
    });

    await new Promise((resolve) => setImmediate(resolve));

    assert.deepEqual(ackData, {
        release_variant: 'ios_v1_1_0',
        behavior_profile: 'v1_1_0',
        finalized: true,
        final_turn: { text: 'fallback words', language: 'en' },
    });
});
