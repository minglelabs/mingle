import assert from 'node:assert/strict';
import test from 'node:test';
import {
    buildSonioxFinalizeRequestCohort,
    buildSonioxDebugTokenRuns,
    buildSonioxPendingSignature,
    formatSonioxDebugTokenRun,
    getNextTurnDetectedLang,
    hasPendingSonioxTurnText,
    mergeDetectedLang,
    shouldUseTokenLanguageForCurrentTurn,
} from '../soniox-language';

test('new non-carry turns reset detectedLang to unknown', () => {
    assert.equal(getNextTurnDetectedLang('ja', ''), 'unknown');
    assert.equal(getNextTurnDetectedLang('ko', '   '), 'unknown');
});

test('carry turns keep the previous turn detectedLang as the next-turn seed', () => {
    assert.equal(getNextTurnDetectedLang('ja', 'carry text'), 'ja');
    assert.equal(getNextTurnDetectedLang('unknown', 'carry text'), 'unknown');
});

test('turn-watermark-excluded tokens never update detectedLang', () => {
    assert.equal(shouldUseTokenLanguageForCurrentTurn({
        includeByTurnWatermark: false,
        isFinalToken: false,
        includeByProviderFinalizedWatermark: true,
    }), false);
});

test('already-consumed final token retransmits never update detectedLang', () => {
    assert.equal(shouldUseTokenLanguageForCurrentTurn({
        includeByTurnWatermark: true,
        isFinalToken: true,
        includeByProviderFinalizedWatermark: false,
    }), false);
});

test('accepted current-turn tokens update detectedLang', () => {
    assert.equal(shouldUseTokenLanguageForCurrentTurn({
        includeByTurnWatermark: true,
        isFinalToken: false,
        includeByProviderFinalizedWatermark: false,
    }), true);
    assert.equal(mergeDetectedLang('unknown', 'ko'), 'ko');
    assert.equal(mergeDetectedLang('ja', 'unknown'), 'ja');
});

test('raw Soniox debug token grouping preserves contiguous language runs', () => {
    const runs = buildSonioxDebugTokenRuns([
        { text: '안녕하세요 ', is_final: false, speaker: '1', language: 'ko' },
        { text: 'how ', is_final: false, speaker: '1', language: 'en' },
        { text: 'are you?', is_final: false, speaker: '1', language: 'en' },
        { text: '<fin>', is_final: true, speaker: '1', language: 'ko' },
        { text: '안녕하세요 ', is_final: true, speaker: '1', language: 'ko' },
        { text: 'how ', is_final: true, speaker: '1', language: 'en' },
        { text: 'are you?', is_final: true, speaker: '1', language: 'en' },
    ]);

    assert.deepEqual(runs, [
        { isFinal: false, speaker: '1', language: 'ko', text: '안녕하세요 ' },
        { isFinal: false, speaker: '1', language: 'en', text: 'how are you?' },
        { isFinal: true, speaker: '1', language: 'ko', text: '안녕하세요 ' },
        { isFinal: true, speaker: '1', language: 'en', text: 'how are you?' },
    ]);
    assert.equal(
        formatSonioxDebugTokenRun(runs[0]),
        'is_final=false, speaker=1, language=ko, text=안녕하세요 ',
    );
});

test('raw Soniox debug token grouping splits finality and ignores endpoint metadata', () => {
    const runs = buildSonioxDebugTokenRuns([
        { text: '...차이가', is_final: true, speaker: '1', language: 'ko' },
        { text: ' 많이', is_final: false, speaker: '1', language: 'ko' },
        { text: '<end>', is_final: true },
    ]);

    assert.deepEqual(runs, [
        { isFinal: true, speaker: '1', language: 'ko', text: '...차이가' },
        { isFinal: false, speaker: '1', language: 'ko', text: ' 많이' },
    ]);
});

test('endpoint flush includes any speaker that still has pending text', () => {
    assert.equal(hasPendingSonioxTurnText('personal computer would'), true);
    assert.equal(hasPendingSonioxTurnText('personal computer would <fin>'), true);
    assert.equal(hasPendingSonioxTurnText(' <fin> '), false);
    assert.equal(hasPendingSonioxTurnText('   '), false);
});

test('global finalize signature tracks only pending speaker snapshots', () => {
    assert.equal(buildSonioxPendingSignature([
        {
            speaker: '2',
            currentSnapshotText: 'エミ',
            currentSnapshotEndMs: 120,
            detectedLang: 'ja',
        },
        {
            speaker: '1',
            currentSnapshotText: '  ',
            currentSnapshotEndMs: 80,
            detectedLang: 'ja',
        },
    ]), '2\u001fエミ');
});

test('global finalize cohort captures request-time pending speakers only', () => {
    assert.deepEqual(buildSonioxFinalizeRequestCohort([
        {
            speaker: '2',
            currentSnapshotText: 'エミ',
            currentSnapshotEndMs: 120,
            detectedLang: 'ja',
        },
        {
            speaker: '1',
            currentSnapshotText: '意味ライズ',
            currentSnapshotEndMs: 220,
            detectedLang: 'ja',
        },
        {
            speaker: '4',
            currentSnapshotText: ' <fin> ',
            currentSnapshotEndMs: 330,
            detectedLang: 'ko',
        },
    ]), [
        {
            speaker: '1',
            snapshotText: '意味ライズ',
            snapshotTextLen: '意味ライズ'.length,
            snapshotEndMs: 220,
            detectedLang: 'ja',
        },
        {
            speaker: '2',
            snapshotText: 'エミ',
            snapshotTextLen: 'エミ'.length,
            snapshotEndMs: 120,
            detectedLang: 'ja',
        },
    ]);
});

test('global finalize cohort can target only speakers idle long enough', () => {
    assert.deepEqual(buildSonioxFinalizeRequestCohort([
        {
            speaker: '2',
            currentSnapshotText: ' 비가 내',
            currentSnapshotEndMs: 120,
            detectedLang: 'ko',
            lastProgressAtMs: 9_000,
        },
        {
            speaker: '1',
            currentSnapshotText: '夜の空が',
            currentSnapshotEndMs: 220,
            detectedLang: 'ja',
            lastProgressAtMs: 9_700,
        },
        {
            speaker: '3',
            currentSnapshotText: 'actively changing',
            currentSnapshotEndMs: 330,
            detectedLang: 'en',
            lastProgressAtMs: 10_100,
        },
    ], { idleBeforeMs: 9_500 }), [
        {
            speaker: '2',
            snapshotText: ' 비가 내',
            snapshotTextLen: ' 비가 내'.length,
            snapshotEndMs: 120,
            detectedLang: 'ko',
        },
    ]);
});
