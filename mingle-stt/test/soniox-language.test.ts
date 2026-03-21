import assert from 'node:assert/strict';
import test from 'node:test';
import {
    buildSonioxDebugTokenRuns,
    formatSonioxDebugTokenRun,
    getNextTurnDetectedLang,
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
