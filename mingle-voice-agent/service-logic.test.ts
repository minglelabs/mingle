import assert from 'node:assert/strict';
import { test } from 'node:test';
import { addUsage, buildUsageReport, roomsNeedingInterpreter, toHttpUrl, type InterpreterUsage } from './service-logic';

test('only voice rooms with a human get an interpreter', () => {
    const picked = roomsNeedingInterpreter([
        { name: 'voice-chan-1-abc', participantIdentities: ['user-1'] },
        { name: 'voice-chan-2-abc', participantIdentities: ['interpreter-voice-chan-2-abc'] },
        { name: 'voice-chan-3-abc', participantIdentities: [] },
        { name: 'poc', participantIdentities: ['user-2'] },
        { name: 'voice-chan-4-abc', participantIdentities: ['interpreter-voice-chan-4-abc', 'user-4'] },
    ]);
    assert.deepEqual(picked, ['voice-chan-1-abc', 'voice-chan-4-abc']);
});

test('usage adds per language and per listener, and ignores empty plays', () => {
    const usage: InterpreterUsage = { totalMs: 0, byLang: {}, byListener: {} };
    addUsage(usage, 'ja', ['user-2', 'user-3'], 1200);
    addUsage(usage, 'en', ['user-4'], 800);
    addUsage(usage, 'ja', ['user-2'], 500);
    addUsage(usage, 'ja', ['user-2'], 0);
    assert.deepEqual(usage, {
        totalMs: 2500,
        byLang: { ja: 1700, en: 800 },
        byListener: { 'user-2': 1700, 'user-3': 1200, 'user-4': 800 },
    });
});

test('usage report copies numbers and stamps ISO times', () => {
    const usage: InterpreterUsage = { totalMs: 900, byLang: { ko: 900 }, byListener: { 'user-1': 900 } };
    const report = buildUsageReport({
        room: 'voice-chan-1-abc',
        startedAtMs: Date.UTC(2026, 9, 31, 12, 0, 0),
        endedAtMs: Date.UTC(2026, 9, 31, 12, 5, 0),
        usage,
        stats: { segments: 3, interpreted: 2, echoSuppressed: 1, errors: 0 },
    });
    usage.byLang.ko = 0;
    assert.equal(report.interpretedMs, 900);
    assert.deepEqual(report.byLang, { ko: 900 });
    assert.equal(report.startedAt, '2026-10-31T12:00:00.000Z');
    assert.equal(report.endedAt, '2026-10-31T12:05:00.000Z');
});

test('LiveKit ws urls become http urls for the room service', () => {
    assert.equal(toHttpUrl('wss://voice.minglelabs.app'), 'https://voice.minglelabs.app');
    assert.equal(toHttpUrl('ws://127.0.0.1:7880'), 'http://127.0.0.1:7880');
});
