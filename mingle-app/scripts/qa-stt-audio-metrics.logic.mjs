// Pure helpers for the QA audio-injection STT/translation metrics run
// (scripts/qa-stt-audio-metrics.mjs) and the golden audio generator
// (scripts/qa-audio-golden.mjs). Nothing here touches a device or network.

import fs from 'node:fs/promises';
import path from 'node:path';

export const APP_ROOT = path.resolve(import.meta.dirname, '..');
export const GOLDEN_MANIFEST_PATH = path.join(APP_ROOT, 'test-fixtures/audio/golden/manifest.json');
export const GOLDEN_AUDIO_DIR = path.join(APP_ROOT, 'test-fixtures/audio/local/golden');
export const STT_AUDIO_REPORT_ROOT = path.join(APP_ROOT, 'qa/mobile-ui/reports/stt-audio');

// Scripts without spaces between words are scored per character; the rest per word.
const CHARACTER_SCORED_LANGUAGES = new Set(['ko', 'ja', 'zh', 'th', 'yue']);

export const DEFAULT_STT_AUDIO_METRICS_OPTIONS = Object.freeze({
  platform: 'ios',
  iosUdid: '',
  androidSerial: '',
  appiumPort: 4723,
  reuseAppium: false,
  fixturePort: 4599,
  fixtureHost: '',
  fixtureIds: [],
  leadingSilenceMs: 500,
  trailingSilenceMs: 3000,
  turnTimeoutMs: 30_000,
  databaseUrl: '',
  skipDb: false,
  evaluateRun: '',
});

export async function readGoldenManifest(manifestPath = GOLDEN_MANIFEST_PATH) {
  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  if (!Array.isArray(manifest?.fixtures) || manifest.fixtures.length === 0) {
    throw new Error(`Golden manifest has no fixtures: ${manifestPath}`);
  }
  const seen = new Set();
  for (const fixture of manifest.fixtures) {
    if (!fixture?.id || !fixture.language || !fixture.transcript) {
      throw new Error(`Golden fixture is missing id/language/transcript: ${JSON.stringify(fixture)}`);
    }
    if (seen.has(fixture.id)) throw new Error(`Duplicate golden fixture id: ${fixture.id}`);
    seen.add(fixture.id);
  }
  return manifest;
}

export function parseSttAudioMetricsArgs(argv, env = process.env) {
  const options = {
    ...DEFAULT_STT_AUDIO_METRICS_OPTIONS,
    iosUdid: env.MINGLE_UI_QA_IOS_UDID || '',
    androidSerial: env.MINGLE_UI_QA_ANDROID_SERIAL || '',
    appiumPort: Number(env.MINGLE_UI_QA_APPIUM_PORT || DEFAULT_STT_AUDIO_METRICS_OPTIONS.appiumPort),
    reuseAppium: env.MINGLE_UI_QA_REUSE_APPIUM === '1',
    databaseUrl: env.MINGLE_QA_DATABASE_URL || env.DATABASE_URL || '',
    fixtureIds: [],
  };
  const readNumber = (value, fallback) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
  };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    const next = argv[index + 1];
    switch (token) {
      case '--platform':
        options.platform = next === 'android' ? 'android' : 'ios';
        index += 1;
        break;
      case '--ios-udid':
        options.iosUdid = next || '';
        index += 1;
        break;
      case '--android-serial':
        options.androidSerial = next || '';
        index += 1;
        break;
      case '--appium-port':
        options.appiumPort = readNumber(next, options.appiumPort);
        index += 1;
        break;
      case '--reuse-appium':
        options.reuseAppium = true;
        break;
      case '--fixture-port':
        options.fixturePort = readNumber(next, options.fixturePort);
        index += 1;
        break;
      case '--fixture-host':
        options.fixtureHost = next || '';
        index += 1;
        break;
      case '--fixtures':
        options.fixtureIds = String(next || '').split(',').map((id) => id.trim()).filter(Boolean);
        index += 1;
        break;
      case '--leading-silence-ms':
        options.leadingSilenceMs = readNumber(next, options.leadingSilenceMs);
        index += 1;
        break;
      case '--trailing-silence-ms':
        options.trailingSilenceMs = readNumber(next, options.trailingSilenceMs);
        index += 1;
        break;
      case '--turn-timeout-ms':
        options.turnTimeoutMs = readNumber(next, options.turnTimeoutMs);
        index += 1;
        break;
      case '--database-url':
        options.databaseUrl = next || '';
        index += 1;
        break;
      case '--skip-db':
        options.skipDb = true;
        break;
      case '--evaluate-run':
        options.evaluateRun = next || '';
        index += 1;
        break;
      default:
        break;
    }
  }
  return options;
}

// ---------------------------------------------------------------------------
// WAV helpers (16-bit PCM mono only: the golden generator writes that format)

export function parsePcm16MonoWav(buffer) {
  if (buffer.length < 12 || buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error('Not a RIFF/WAVE file.');
  }
  let offset = 12;
  let format = null;
  let data = null;
  while (offset + 8 <= buffer.length) {
    const chunkId = buffer.toString('ascii', offset, offset + 4);
    const chunkSize = buffer.readUInt32LE(offset + 4);
    const body = offset + 8;
    if (chunkId === 'fmt ') {
      format = {
        audioFormat: buffer.readUInt16LE(body),
        channels: buffer.readUInt16LE(body + 2),
        sampleRate: buffer.readUInt32LE(body + 4),
        bitsPerSample: buffer.readUInt16LE(body + 14),
      };
    } else if (chunkId === 'data') {
      data = buffer.subarray(body, Math.min(buffer.length, body + chunkSize));
    }
    offset = body + chunkSize + (chunkSize % 2);
  }
  if (!format || !data) throw new Error('WAV is missing fmt/data chunks.');
  if (format.audioFormat !== 1 || format.bitsPerSample !== 16 || format.channels !== 1) {
    throw new Error(`Expected 16-bit PCM mono WAV, got ${JSON.stringify(format)}.`);
  }
  const samples = new Int16Array(data.length / 2);
  for (let index = 0; index < samples.length; index += 1) {
    samples[index] = data.readInt16LE(index * 2);
  }
  return { sampleRate: format.sampleRate, samples };
}

export function encodePcm16MonoWav(samples, sampleRate) {
  const dataBytes = samples.length * 2;
  const buffer = Buffer.alloc(44 + dataBytes);
  buffer.write('RIFF', 0, 'ascii');
  buffer.writeUInt32LE(36 + dataBytes, 4);
  buffer.write('WAVE', 8, 'ascii');
  buffer.write('fmt ', 12, 'ascii');
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36, 'ascii');
  buffer.writeUInt32LE(dataBytes, 40);
  for (let index = 0; index < samples.length; index += 1) {
    buffer.writeInt16LE(samples[index], 44 + index * 2);
  }
  return buffer;
}

/** Cuts leading/trailing silence so the file's end marks the end of speech. */
export function trimPcm16WavSilence(buffer, { thresholdDbfs = -45, marginMs = 40 } = {}) {
  const { sampleRate, samples } = parsePcm16MonoWav(buffer);
  const threshold = Math.round(32768 * 10 ** (thresholdDbfs / 20));
  let first = 0;
  while (first < samples.length && Math.abs(samples[first]) < threshold) first += 1;
  let last = samples.length - 1;
  while (last > first && Math.abs(samples[last]) < threshold) last -= 1;
  if (first >= samples.length) {
    throw new Error('Audio contains no sample above the silence threshold.');
  }
  const margin = Math.round((marginMs / 1000) * sampleRate);
  const start = Math.max(0, first - margin);
  const end = Math.min(samples.length, last + 1 + margin);
  const trimmed = samples.subarray(start, end);
  return {
    wav: encodePcm16MonoWav(trimmed, sampleRate),
    durationMs: Math.round((trimmed.length / sampleRate) * 1000),
  };
}

// ---------------------------------------------------------------------------
// Transcript scoring

export function baseLanguage(language) {
  return String(language || '').trim().toLowerCase().split(/[-_]/)[0] || '';
}

export function scoringUnitFor(language) {
  return CHARACTER_SCORED_LANGUAGES.has(baseLanguage(language)) ? 'character' : 'word';
}

export function normalizeTranscript(text) {
  return String(text || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\p{P}\p{S}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function tokenizeTranscript(text, unit) {
  const normalized = normalizeTranscript(text);
  if (!normalized) return [];
  if (unit === 'character') return Array.from(normalized.replace(/\s+/g, ''));
  return normalized.split(' ');
}

export function levenshteinDistance(reference, hypothesis) {
  if (reference.length === 0) return hypothesis.length;
  if (hypothesis.length === 0) return reference.length;
  let previous = Array.from({ length: hypothesis.length + 1 }, (_, index) => index);
  for (let row = 1; row <= reference.length; row += 1) {
    const current = [row];
    for (let column = 1; column <= hypothesis.length; column += 1) {
      const substitution = previous[column - 1] + (reference[row - 1] === hypothesis[column - 1] ? 0 : 1);
      current[column] = Math.min(previous[column] + 1, current[column - 1] + 1, substitution);
    }
    previous = current;
  }
  return previous[hypothesis.length];
}

export function errorRate(reference, hypothesis, unit) {
  const referenceTokens = tokenizeTranscript(reference, unit);
  const hypothesisTokens = tokenizeTranscript(hypothesis, unit);
  const distance = levenshteinDistance(referenceTokens, hypothesisTokens);
  return {
    distance,
    referenceLength: referenceTokens.length,
    rate: distance / Math.max(1, referenceTokens.length),
  };
}

/**
 * Scores a recognized transcript against the fixture's transcript and its
 * accepted alternatives (number spellings, punctuation), keeping the closest.
 * CER is always reported; WER only for word-scored languages.
 */
export function scoreTranscript(fixture, hypothesis) {
  const references = [fixture.transcript, ...(fixture.acceptedTranscripts || [])].filter(Boolean);
  const unit = scoringUnitFor(fixture.language);
  let best = null;
  for (const reference of references) {
    const cer = errorRate(reference, hypothesis, 'character');
    const wer = unit === 'word' ? errorRate(reference, hypothesis, 'word') : null;
    const primary = unit === 'word' ? wer.rate : cer.rate;
    if (!best || primary < best.primaryRate) {
      best = { reference, cer: cer.rate, wer: wer ? wer.rate : null, primaryRate: primary };
    }
  }
  return {
    unit,
    primaryMetric: unit === 'word' ? 'wer' : 'cer',
    reference: best.reference,
    hypothesis,
    cer: roundRate(best.cer),
    wer: best.wer === null ? null : roundRate(best.wer),
  };
}

function roundRate(value) {
  return Math.round(value * 10_000) / 10_000;
}

// ---------------------------------------------------------------------------
// Turn matching and latency

/** Latest injection timeline for one fixture, as reported by the native layer. */
export function readInjectionTimeline(events, fixtureId, sinceMs = 0) {
  const relevant = (Array.isArray(events) ? events : [])
    .filter((event) => event && event.fixtureId === fixtureId && Number(event.atMs) >= sinceMs);
  const pick = (phase) => {
    const matches = relevant.filter((event) => event.phase === phase);
    return matches.length > 0 ? Number(matches[matches.length - 1].atMs) : null;
  };
  const error = relevant.find((event) => event.phase === 'error');
  return {
    armedAtMs: pick('armed'),
    startedAtMs: pick('started'),
    speechStartedAtMs: pick('speech_started'),
    speechEndedAtMs: pick('speech_ended'),
    finishedAtMs: pick('finished'),
    error: error ? String(error.message || 'injection_error') : null,
  };
}

/**
 * Selects the persisted turns recognized from one fixture: finalized turns of
 * the run's session that were created after the fixture's speech started and
 * before the next fixture was armed.
 */
export function selectTurnsForWindow(turns, { startMs, endMs }) {
  return (Array.isArray(turns) ? turns : [])
    .filter((turn) => turn.createdAtMs >= startMs && (endMs === null || turn.createdAtMs < endMs))
    .sort((left, right) => left.createdAtMs - right.createdAtMs);
}

function latency(fromMs, toMs) {
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs)) return null;
  return Math.round(toMs - fromMs);
}

export function evaluateFixtureRun({ fixture, timeline, turns, observed }) {
  const sourceText = turns.map((turn) => turn.sourceText).filter(Boolean).join(' ').trim()
    || (observed?.originalText ?? '');
  const lastTurn = turns.length > 0 ? turns[turns.length - 1] : null;
  const score = sourceText ? scoreTranscript(fixture, sourceText) : null;
  const detectedLanguages = [...new Set(turns.map((turn) => turn.sourceLanguage).filter(Boolean))];
  const translations = lastTurn?.translations && Object.keys(lastTurn.translations).length > 0
    ? mergeTurnTranslations(turns)
    : (observed?.translations ?? {});
  const translationAtMs = turns.length > 0 && turns.every((turn) => turn.translatedAtMs)
    ? Math.max(...turns.map((turn) => turn.translatedAtMs))
    : null;
  const result = {
    fixtureId: fixture.id,
    language: fixture.language,
    status: 'passed',
    problems: [],
    transcript: score,
    detectedLanguages,
    languageMatched: detectedLanguages.length === 0
      ? null
      : detectedLanguages.every((language) => baseLanguage(language) === baseLanguage(fixture.language)),
    turnCount: turns.length,
    // Rooms list every member language; the "translation" into the source's
    // own language is the original text again, so it is not reported.
    translations: Object.fromEntries(Object.entries(translations)
      .filter(([language]) => baseLanguage(language) !== baseLanguage(fixture.language))
      .map(([language, text]) => [language, {
        text,
        reference: fixture.translations?.[language] ?? fixture.translations?.[baseLanguage(language)] ?? null,
      }])),
    latencyMs: {
      speechEndToSttFinalized: latency(timeline.speechEndedAtMs, lastTurn?.createdAtMs),
      speechEndToTranslationLogged: latency(timeline.speechEndedAtMs, translationAtMs),
      speechEndToTranslationObserved: latency(timeline.speechEndedAtMs, observed?.translationObservedAtMs),
    },
    timeline,
  };
  if (timeline.error) result.problems.push(`injection_error: ${timeline.error}`);
  if (timeline.speechEndedAtMs === null) result.problems.push('speech_end_not_reported');
  if (!score) result.problems.push('no_transcript');
  if (turns.length === 0) result.problems.push('no_persisted_turn');
  if (result.languageMatched === false) result.problems.push(`language_mismatch: ${detectedLanguages.join(',')}`);
  if (Object.keys(translations).length === 0) result.problems.push('no_translation');
  if (result.problems.length > 0) {
    result.status = result.problems.some((problem) => problem === 'no_transcript' || problem.startsWith('injection_error'))
      ? 'failed'
      : 'warning';
  }
  return result;
}

function mergeTurnTranslations(turns) {
  const merged = {};
  for (const turn of turns) {
    for (const [language, text] of Object.entries(turn.translations || {})) {
      merged[language] = merged[language] ? `${merged[language]} ${text}` : text;
    }
  }
  return merged;
}

export function summarizeRun(results) {
  const numbers = (values) => values.filter((value) => Number.isFinite(value));
  const mean = (values) => (values.length === 0 ? null : roundRate(values.reduce((sum, value) => sum + value, 0) / values.length));
  const median = (values) => {
    if (values.length === 0) return null;
    const sorted = [...values].sort((left, right) => left - right);
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[middle] : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
  };
  const byLanguage = {};
  for (const result of results) {
    const key = baseLanguage(result.language);
    byLanguage[key] ??= [];
    byLanguage[key].push(result);
  }
  return {
    fixtures: results.length,
    passed: results.filter((result) => result.status === 'passed').length,
    warnings: results.filter((result) => result.status === 'warning').length,
    failed: results.filter((result) => result.status === 'failed').length,
    meanCer: mean(numbers(results.map((result) => result.transcript?.cer))),
    meanWer: mean(numbers(results.map((result) => result.transcript?.wer))),
    medianSpeechEndToSttFinalizedMs: median(numbers(results.map((result) => result.latencyMs.speechEndToSttFinalized))),
    medianSpeechEndToTranslationLoggedMs: median(numbers(results.map((result) => result.latencyMs.speechEndToTranslationLogged))),
    medianSpeechEndToTranslationObservedMs: median(numbers(results.map((result) => result.latencyMs.speechEndToTranslationObserved))),
    byLanguage: Object.fromEntries(Object.entries(byLanguage).map(([language, items]) => [language, {
      fixtures: items.length,
      meanCer: mean(numbers(items.map((item) => item.transcript?.cer))),
      meanWer: mean(numbers(items.map((item) => item.transcript?.wer))),
    }])),
  };
}

function formatMs(value) {
  return Number.isFinite(value) ? `${value} ms` : '—';
}

function formatRate(value) {
  return Number.isFinite(value) ? `${(value * 100).toFixed(1)}%` : '—';
}

function escapeCell(value) {
  return String(value ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

export function renderSttAudioMarkdownReport(report) {
  const { summary } = report;
  const lines = [
    '# STT Audio Injection Metrics',
    '',
    `- Run: ${report.startedAt} · ${report.platform} · ${report.deviceLabel || 'unknown device'}`,
    `- Fixtures: ${summary.fixtures} (passed ${summary.passed}, warnings ${summary.warnings}, failed ${summary.failed})`,
    `- Mean CER: ${formatRate(summary.meanCer)} · Mean WER (word languages): ${formatRate(summary.meanWer)}`,
    `- Median speech end → STT finalized: ${formatMs(summary.medianSpeechEndToSttFinalizedMs)}`,
    `- Median speech end → translation logged (app_event_logs): ${formatMs(summary.medianSpeechEndToTranslationLoggedMs)}`,
    `- Median speech end → translation observed in WebView: ${formatMs(summary.medianSpeechEndToTranslationObservedMs)}`,
    `- Turns source: ${report.turnSource}`,
    '',
    '| Fixture | Status | CER | WER | STT final | Translation (DB) | Translation (UI) | Recognized | Problems |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- |',
  ];
  for (const result of report.results) {
    lines.push(`| ${[
      result.fixtureId,
      result.status,
      formatRate(result.transcript?.cer),
      formatRate(result.transcript?.wer),
      formatMs(result.latencyMs.speechEndToSttFinalized),
      formatMs(result.latencyMs.speechEndToTranslationLogged),
      formatMs(result.latencyMs.speechEndToTranslationObserved),
      result.transcript?.hypothesis ?? '',
      result.problems.join('; '),
    ].map(escapeCell).join(' | ')} |`);
  }
  lines.push('', '## Translations', '');
  for (const result of report.results) {
    for (const [language, translation] of Object.entries(result.translations)) {
      lines.push(`- **${result.fixtureId} → ${language}**: ${translation.text}${translation.reference ? `  \n  reference: ${translation.reference}` : ''}`);
    }
  }
  lines.push('');
  return lines.join('\n');
}
