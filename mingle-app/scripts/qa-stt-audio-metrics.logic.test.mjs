import assert from 'node:assert/strict';
import test from 'node:test';

import {
  encodePcm16MonoWav,
  evaluateFixtureRun,
  levenshteinDistance,
  parsePcm16MonoWav,
  parseSttAudioMetricsArgs,
  readGoldenManifest,
  readInjectionTimeline,
  renderSttAudioMarkdownReport,
  scoreTranscript,
  selectTurnsForWindow,
  summarizeRun,
  tokenizeTranscript,
  trimPcm16WavSilence,
} from './qa-stt-audio-metrics.logic.mjs';

test('golden manifest has unique ids, a transcript, and a reference translation per fixture', async () => {
  const manifest = await readGoldenManifest();
  const languages = new Set(manifest.fixtures.map((fixture) => fixture.language));
  for (const language of ['ko', 'en', 'ja', 'zh', 'es']) {
    assert.ok(languages.has(language), `missing ${language} fixture`);
    assert.ok(manifest.generator.voices[language], `missing ${language} voice`);
  }
  for (const fixture of manifest.fixtures) {
    assert.ok(Object.keys(fixture.translations).length > 0, `${fixture.id} has no reference translation`);
  }
});

test('parseSttAudioMetricsArgs reads flags over environment defaults', () => {
  const options = parseSttAudioMetricsArgs(
    ['--platform', 'android', '--fixtures', 'a, b', '--trailing-silence-ms', '2500', '--skip-db'],
    { MINGLE_UI_QA_APPIUM_PORT: '4777', DATABASE_URL: 'postgres://example' },
  );
  assert.equal(options.platform, 'android');
  assert.deepEqual(options.fixtureIds, ['a', 'b']);
  assert.equal(options.trailingSilenceMs, 2500);
  assert.equal(options.appiumPort, 4777);
  assert.equal(options.databaseUrl, 'postgres://example');
  assert.equal(options.skipDb, true);
});

test('levenshteinDistance counts insertions, deletions and substitutions', () => {
  assert.equal(levenshteinDistance([], ['a']), 1);
  assert.equal(levenshteinDistance(['a', 'b', 'c'], ['a', 'c']), 1);
  assert.equal(levenshteinDistance(Array.from('kitten'), Array.from('sitting')), 3);
});

test('tokenizeTranscript ignores punctuation, case and (for characters) spacing', () => {
  assert.deepEqual(tokenizeTranscript('Hello, World!', 'word'), ['hello', 'world']);
  assert.deepEqual(tokenizeTranscript('안녕 하세요.', 'character'), Array.from('안녕하세요'));
  assert.deepEqual(tokenizeTranscript('这个多少钱？', 'character'), Array.from('这个多少钱'));
});

test('scoreTranscript uses CER for Korean and keeps the closest accepted alternative for English', () => {
  const korean = scoreTranscript({ language: 'ko', transcript: '지하철역까지 걸어서 얼마나 걸려요?' }, '지하철 역까지 걸어서 얼마나 걸려요');
  assert.equal(korean.primaryMetric, 'cer');
  assert.equal(korean.cer, 0);
  assert.equal(korean.wer, null);

  const english = scoreTranscript({
    language: 'en',
    transcript: "Let's move the meeting to three o'clock tomorrow.",
    acceptedTranscripts: ["Let's move the meeting to 3 o'clock tomorrow."],
  }, "let's move the meeting to 3 o'clock tomorrow");
  assert.equal(english.primaryMetric, 'wer');
  assert.equal(english.wer, 0);
  assert.equal(english.reference, "Let's move the meeting to 3 o'clock tomorrow.");

  const wrong = scoreTranscript({ language: 'en', transcript: 'a table for two' }, 'a cable for two');
  assert.equal(wrong.wer, 0.25);
});

test('trimPcm16WavSilence keeps the speech plus a margin and round-trips the WAV format', () => {
  const sampleRate = 1000;
  const samples = new Int16Array(1000);
  for (let index = 300; index < 600; index += 1) samples[index] = index % 2 ? 8000 : -8000;
  const trimmed = trimPcm16WavSilence(encodePcm16MonoWav(samples, sampleRate), { marginMs: 10 });
  const parsed = parsePcm16MonoWav(trimmed.wav);
  assert.equal(parsed.sampleRate, sampleRate);
  assert.equal(parsed.samples.length, 320);
  assert.equal(trimmed.durationMs, 320);
});

test('readInjectionTimeline reports the latest phase timestamps for one fixture', () => {
  const timeline = readInjectionTimeline([
    { phase: 'armed', fixtureId: 'old', atMs: 1 },
    { phase: 'armed', fixtureId: 'ko', atMs: 100 },
    { phase: 'started', fixtureId: 'ko', atMs: 110 },
    { phase: 'speech_started', fixtureId: 'ko', atMs: 610 },
    { phase: 'speech_ended', fixtureId: 'ko', atMs: 2610 },
    { phase: 'finished', fixtureId: 'ko', atMs: 5610 },
  ], 'ko', 50);
  assert.deepEqual(timeline, {
    armedAtMs: 100,
    startedAtMs: 110,
    speechStartedAtMs: 610,
    speechEndedAtMs: 2610,
    finishedAtMs: 5610,
    error: null,
  });
});

test('evaluateFixtureRun scores merged turns and measures latency from the end of speech', () => {
  const fixture = {
    id: 'ko-greeting-01',
    language: 'ko',
    transcript: '안녕하세요, 만나서 반갑습니다.',
    translations: { en: 'Hello, nice to meet you.' },
  };
  const turns = selectTurnsForWindow([
    { createdAtMs: 500, sourceText: 'earlier turn', sourceLanguage: 'en', translations: {} },
    { createdAtMs: 3200, translatedAtMs: 3900, sourceText: '안녕하세요', sourceLanguage: 'ko', translations: { en: 'Hello' } },
    { createdAtMs: 3400, translatedAtMs: 4100, sourceText: '만나서 반갑습니다', sourceLanguage: 'ko', translations: { en: 'nice to meet you.' } },
  ], { startMs: 1000, endMs: null });
  const result = evaluateFixtureRun({
    fixture,
    timeline: { speechEndedAtMs: 3000, error: null },
    turns,
    observed: { translationObservedAtMs: 4250 },
  });
  assert.equal(result.status, 'passed');
  assert.equal(result.turnCount, 2);
  assert.equal(result.transcript.cer, 0);
  assert.equal(result.languageMatched, true);
  assert.equal(result.translations.en.text, 'Hello nice to meet you.');
  assert.equal(result.translations.en.reference, 'Hello, nice to meet you.');
  assert.deepEqual(result.latencyMs, {
    speechEndToSttFinalized: 400,
    speechEndToTranslationLogged: 1100,
    speechEndToTranslationObserved: 1250,
  });
});

test('evaluateFixtureRun fails a fixture that produced no transcript', () => {
  const result = evaluateFixtureRun({
    fixture: { id: 'en', language: 'en', transcript: 'hello' },
    timeline: { speechEndedAtMs: null, error: null },
    turns: [],
    observed: null,
  });
  assert.equal(result.status, 'failed');
  assert.ok(result.problems.includes('no_transcript'));
  assert.ok(result.problems.includes('speech_end_not_reported'));
});

test('summarizeRun and the markdown report aggregate per-language results', () => {
  const results = [
    { fixtureId: 'a', language: 'ko', status: 'passed', problems: [], translations: {}, transcript: { cer: 0.1, wer: null, hypothesis: 'x' }, latencyMs: { speechEndToSttFinalized: 400, speechEndToTranslationLogged: 1000, speechEndToTranslationObserved: null } },
    { fixtureId: 'b', language: 'en', status: 'warning', problems: ['no_translation'], translations: {}, transcript: { cer: 0, wer: 0.2, hypothesis: 'y' }, latencyMs: { speechEndToSttFinalized: 600, speechEndToTranslationLogged: null, speechEndToTranslationObserved: null } },
  ];
  const summary = summarizeRun(results);
  assert.equal(summary.passed, 1);
  assert.equal(summary.warnings, 1);
  assert.equal(summary.meanCer, 0.05);
  assert.equal(summary.meanWer, 0.2);
  assert.equal(summary.medianSpeechEndToSttFinalizedMs, 500);
  assert.equal(summary.byLanguage.ko.meanCer, 0.1);
  const markdown = renderSttAudioMarkdownReport({
    startedAt: 'now', platform: 'ios', deviceLabel: 'sim', turnSource: 'app_event_logs', summary, results,
  });
  assert.match(markdown, /\| a \| passed \| 10\.0% \|/);
});
