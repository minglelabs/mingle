#!/usr/bin/env node

// Plays golden audio fixtures through the app's real STT path and reports
// recognition accuracy (CER/WER against the manifest transcript) and
// end-of-speech → translation latency.
//
// The app must be a QA-bridge build (`scripts/devbox ... --qa-bridge`): the
// native STT module then replaces microphone samples with the fixture while
// keeping the microphone's real-time pace and chunking. Timings come from the
// native injection events (speech end) and app_event_logs (turn finalized,
// translation logged), with the WebView-observed translation time as a
// cross-check.
//
// Usage:
//   pnpm test:qa:stt-audio -- --ios-udid <simulator-udid> [--fixtures ko-greeting-01,en-meeting-01]
//   pnpm test:qa:stt-audio -- --platform android [--android-serial <serial>]
//   pnpm test:qa:stt-audio -- --evaluate-run <report-dir>/run.json   # re-score a saved run

import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import process from 'node:process';
import { setTimeout as delay } from 'node:timers/promises';

import {
  APP_PACKAGE,
  IOS_BUNDLE_ID,
  createAndroidSession,
  createIosSession,
  ensureAppiumDriver,
  ensureConversationRoom,
  isIosSimulator,
  parseMobileUiQaArgs,
  runCommand,
  safeDeleteSession,
  startAppiumServer,
  switchToNative,
  switchToWebView,
  waitFor,
} from './mobile-ui-qa.mjs';
import { generateGoldenAudio } from './qa-audio-golden.mjs';
import {
  GOLDEN_AUDIO_DIR,
  STT_AUDIO_REPORT_ROOT,
  evaluateFixtureRun,
  parseSttAudioMetricsArgs,
  readGoldenManifest,
  readInjectionTimeline,
  renderSttAudioMarkdownReport,
  selectTurnsForWindow,
  summarizeRun,
} from './qa-stt-audio-metrics.logic.mjs';

const MIC_BUTTON_SELECTOR = '[data-qa="live-demo-mic-button"]';

function log(message) {
  console.log(`[stt-audio] ${message}`);
}

function startFixtureServer(port, host) {
  const server = http.createServer(async (request, response) => {
    const name = decodeURIComponent(new URL(request.url || '/', 'http://localhost').pathname.slice(1));
    if (request.method !== 'GET' || !/^[a-z0-9-]+\.wav$/i.test(name)) {
      response.writeHead(404).end();
      return;
    }
    try {
      const body = await fs.readFile(path.join(GOLDEN_AUDIO_DIR, name));
      response.writeHead(200, { 'Content-Type': 'audio/wav', 'Content-Length': body.length }).end(body);
    } catch {
      response.writeHead(404).end();
    }
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => resolve(server));
  });
}

async function readQa(driver, script, ...args) {
  return await driver.execute(script, ...args);
}

async function getSnapshot(driver) {
  return await readQa(driver, () => window.__MINGLE_QA__?.getLiveDemoSnapshot?.() ?? null);
}

async function getInjectionEvents(driver) {
  return await readQa(driver, () => window.__MINGLE_QA__?.getQaAudioInjectionEvents?.() ?? []);
}

async function getRecentUtterances(driver, limit) {
  return await readQa(driver, (count) => window.__MINGLE_QA__?.getRecentUtterances?.(count) ?? [], limit);
}

async function clickVisibleMicButton(driver) {
  const index = await readQa(driver, (selector) => {
    const buttons = Array.from(document.querySelectorAll(selector));
    return buttons.findIndex((button) => {
      const rect = button.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && !button.disabled;
    });
  }, MIC_BUTTON_SELECTOR);
  if (index < 0) throw new Error('No visible, enabled mic button in the conversation room.');
  const buttons = await driver.$$(MIC_BUTTON_SELECTOR);
  await buttons[index].click();
}

// First mic use on a physical iPhone shows the microphone permission alert.
async function acceptIosPermissionAlertIfPresent(driver, timeoutMs = 4_000) {
  if (String(driver.capabilities.platformName || '').toLowerCase() !== 'ios') return false;
  await switchToNative(driver);
  let accepted = false;
  const startedAt = Date.now();
  while (!accepted && Date.now() - startedAt < timeoutMs) {
    try {
      await driver.acceptAlert();
      accepted = true;
    } catch {
      await delay(500);
    }
  }
  await switchToWebView(driver);
  if (accepted) log('accepted an iOS permission alert');
  return accepted;
}

async function ensureMicRunning(driver) {
  const snapshot = await getSnapshot(driver);
  if (snapshot?.micVisualState === 'running') return snapshot;
  if (snapshot?.micVisualState !== 'connecting') {
    await clickVisibleMicButton(driver);
    const permission = await readQa(driver, () => window.__MINGLE_LAST_NATIVE_MIC_PERMISSION ?? null);
    if (permission !== 'granted') await acceptIosPermissionAlertIfPresent(driver);
  }
  return await waitFor(async () => {
    const next = await getSnapshot(driver);
    if (next?.micVisualState === 'error') throw new Error('Mic entered the error state.');
    return next?.micVisualState === 'running' ? next : null;
  }, 'the mic to reach the running state', 30_000, 250);
}

async function stopMic(driver) {
  const snapshot = await getSnapshot(driver);
  if (snapshot?.micVisualState === 'running' || snapshot?.micVisualState === 'connecting') {
    await clickVisibleMicButton(driver);
  }
}

/**
 * Arms one fixture on the running session and waits until it finished playing
 * and its recognized turn shows a translation in the WebView (or the turn
 * timeout passes). Returns what the WebView showed for later cross-checks.
 */
async function playFixture(driver, fixture, options, fixtureBaseUrl) {
  const knownUtteranceIds = new Set((await getRecentUtterances(driver, 50)).map((utterance) => utterance.id));
  const requestedAtMs = Date.now();
  const posted = await readQa(driver, (injection) => window.__MINGLE_QA__?.qaInjectAudio?.(injection) ?? false, {
    fixtureId: fixture.id,
    url: `${fixtureBaseUrl}/${fixture.id}.wav`,
    leadingSilenceMs: options.leadingSilenceMs,
    trailingSilenceMs: options.trailingSilenceMs,
  });
  if (!posted) throw new Error('window.__MINGLE_QA__.qaInjectAudio is unavailable (is this a QA-bridge build?).');

  const armed = await waitFor(async () => {
    const timeline = readInjectionTimeline(await getInjectionEvents(driver), fixture.id, requestedAtMs - 1_000);
    if (timeline.error) throw new Error(`Injection failed: ${timeline.error}`);
    return timeline.armedAtMs ? timeline : null;
  }, `fixture ${fixture.id} to be armed`, 20_000, 200);
  log(`${fixture.id}: armed at ${new Date(armed.armedAtMs).toISOString()}`);

  let observed = null;
  const deadline = Date.now() + options.leadingSilenceMs + options.trailingSilenceMs + options.turnTimeoutMs + 10_000;
  while (Date.now() < deadline) {
    const timeline = readInjectionTimeline(await getInjectionEvents(driver), fixture.id, requestedAtMs - 1_000);
    const fresh = (await getRecentUtterances(driver, 20)).filter((utterance) => !knownUtteranceIds.has(utterance.id));
    const translated = fresh.length > 0 && fresh.every((utterance) => (
      Object.values(utterance.translations || {}).some((text) => String(text).trim())
      && utterance.translationStatus === null
    ));
    if (translated && !observed) {
      observed = {
        utteranceIds: fresh.map((utterance) => utterance.id),
        originalText: fresh.map((utterance) => utterance.originalText).join(' ').trim(),
        originalLanguages: [...new Set(fresh.map((utterance) => utterance.originalLang))],
        translations: Object.assign({}, ...fresh.map((utterance) => utterance.translations)),
        translationObservedAtMs: Date.now(),
      };
    }
    if (timeline.finishedAtMs && observed) break;
    if (timeline.finishedAtMs && Date.now() - timeline.finishedAtMs > options.turnTimeoutMs) break;
    await delay(150);
  }
  if (!observed) log(`${fixture.id}: no translated turn appeared in the WebView`);
  return { requestedAtMs, observed };
}

async function loadTurnsFromDb({ databaseUrl, sessionKey, sinceMs }) {
  const { PrismaClient } = await import('@prisma/client');
  const prisma = new PrismaClient({ datasourceUrl: databaseUrl });
  try {
    // Plain reads only: this may point at a shared dev database.
    const rows = await prisma.appEventLog.findMany({
      where: {
        sessionKey,
        eventType: 'stt_turn_finalized',
        createdAt: { gte: new Date(sinceMs) },
      },
      orderBy: { createdAt: 'asc' },
      select: {
        createdAt: true,
        metadata: true,
        message: {
          select: {
            sourceLanguage: true,
            contents: { select: { contentType: true, language: true, text: true, createdAt: true } },
          },
        },
      },
    });
    return rows.map((row) => {
      const metadata = row.metadata && typeof row.metadata === 'object' ? row.metadata : {};
      const contents = row.message?.contents ?? [];
      const source = contents.find((content) => content.contentType === 'SOURCE');
      const translated = contents.filter((content) => content.contentType === 'TRANSLATION_FINAL');
      const translations = translated.length > 0
        ? Object.fromEntries(translated.map((content) => [content.language, content.text]))
        : (metadata.translations && typeof metadata.translations === 'object' ? metadata.translations : {});
      return {
        createdAtMs: row.createdAt.getTime(),
        // Translation rows are inserted when the translation is persisted.
        // Rows rewritten by raw SQL carry the database's local time in
        // updated_at (Asia/Seoul on dev), so it is not used for timing.
        translatedAtMs: translated.length > 0
          ? Math.max(...translated.map((content) => content.createdAt.getTime()))
          : null,
        sourceText: source?.text ?? '',
        sourceLanguage: row.message?.sourceLanguage || metadata.sourceLanguage || '',
        translations,
      };
    });
  } finally {
    await prisma.$disconnect();
  }
}

async function evaluateRun(run, options) {
  let turns = null;
  let turnSource = 'webview (no database)';
  if (!options.skipDb && options.databaseUrl && run.sessionKey) {
    try {
      turns = await loadTurnsFromDb({
        databaseUrl: options.databaseUrl,
        sessionKey: run.sessionKey,
        sinceMs: run.startedAtMs - 5_000,
      });
      turnSource = 'app_event_logs';
    } catch (error) {
      log(`database read failed, falling back to WebView text: ${error instanceof Error ? error.message : error}`);
    }
  } else if (!options.skipDb) {
    log('no DATABASE_URL / --database-url: scoring the WebView transcript only (no app_event_logs latency).');
  }

  const results = run.fixtures.map((played, index) => {
    const timeline = readInjectionTimeline(run.injectionEvents, played.fixture.id, played.requestedAtMs - 1_000);
    const next = run.fixtures[index + 1];
    const windowStart = (timeline.speechStartedAtMs ?? timeline.armedAtMs ?? played.requestedAtMs) - 500;
    const windowEnd = next ? next.requestedAtMs : null;
    const fixtureTurns = turns ? selectTurnsForWindow(turns, { startMs: windowStart, endMs: windowEnd }) : [];
    return evaluateFixtureRun({ fixture: played.fixture, timeline, turns: fixtureTurns, observed: played.observed });
  });
  return {
    startedAt: new Date(run.startedAtMs).toISOString(),
    platform: run.platform,
    deviceLabel: run.deviceLabel,
    sessionKey: run.sessionKey,
    conversationId: run.conversationId,
    turnSource,
    summary: summarizeRun(results),
    results,
  };
}

async function writeReport(reportDir, report) {
  await fs.mkdir(reportDir, { recursive: true });
  await fs.writeFile(path.join(reportDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  await fs.writeFile(path.join(reportDir, 'report.md'), renderSttAudioMarkdownReport(report));
  log(`report: ${path.relative(process.cwd(), path.join(reportDir, 'report.md'))}`);
  console.log(JSON.stringify(report.summary, null, 2));
}

async function recordRun(options, fixtures) {
  const isIos = options.platform === 'ios';
  const simulator = isIos && options.iosUdid ? await isIosSimulator(options.iosUdid) : false;
  if (isIos && !options.iosUdid) throw new Error('--ios-udid (or MINGLE_UI_QA_IOS_UDID) is required for iOS.');
  if (isIos && !simulator && !options.fixtureHost) {
    throw new Error('A physical iPhone cannot reach 127.0.0.1 on this Mac: pass --fixture-host <this Mac\'s LAN IP>.');
  }

  await generateGoldenAudio({ ids: fixtures.map((fixture) => fixture.id) });
  const bindHost = options.fixtureHost ? '0.0.0.0' : '127.0.0.1';
  const fixtureServer = await startFixtureServer(options.fixturePort, bindHost);
  const fixtureBaseUrl = `http://${options.fixtureHost || '127.0.0.1'}:${options.fixturePort}`;
  log(`serving ${path.relative(process.cwd(), GOLDEN_AUDIO_DIR)} at ${fixtureBaseUrl}`);

  let appiumHandle = null;
  let session = null;
  try {
    if (!isIos) {
      const serialArgs = options.androidSerial ? ['-s', options.androidSerial] : [];
      await runCommand('adb', [...serialArgs, 'reverse', `tcp:${options.fixturePort}`, `tcp:${options.fixturePort}`]);
      await runCommand('adb', [...serialArgs, 'shell', 'pm', 'grant', APP_PACKAGE, 'android.permission.RECORD_AUDIO']).catch(() => undefined);
    } else if (simulator) {
      // The injected audio replaces the microphone's samples, but capture
      // still runs, so the simulator needs microphone permission.
      await runCommand('xcrun', ['simctl', 'privacy', options.iosUdid, 'grant', 'microphone', IOS_BUNDLE_ID]);
    }

    await ensureAppiumDriver(isIos ? 'xcuitest' : 'uiautomator2');
    appiumHandle = options.reuseAppium ? null : await startAppiumServer(options.appiumPort);
    // Signing, locale and WDA settings follow the regular mobile UI QA env vars.
    const sessionOptions = {
      ...parseMobileUiQaArgs([]),
      iosUdid: options.iosUdid,
      androidSerial: options.androidSerial,
      appiumPort: options.appiumPort,
    };
    session = isIos ? await createIosSession(sessionOptions) : await createAndroidSession(sessionOptions);
    const { driver } = session;
    await switchToWebView(driver);
    const room = await ensureConversationRoom(driver);
    log(`conversation ${room.conversationId || '(solo)'} sessionKey=${room.sessionKey}`);

    await readQa(driver, () => {
      window.__MINGLE_QA_AUDIO_INJECTION_EVENTS__ = [];
      return true;
    });
    const startedAtMs = Date.now();
    await ensureMicRunning(driver);
    log('mic running');

    const played = [];
    for (const fixture of fixtures) {
      const result = await playFixture(driver, fixture, options, fixtureBaseUrl);
      played.push({ fixture, ...result });
      log(`${fixture.id}: ${result.observed ? `"${result.observed.originalText}"` : 'no transcript'}`);
    }

    const injectionEvents = await getInjectionEvents(driver);
    await stopMic(driver);
    await readQa(driver, () => window.__MINGLE_QA__?.qaClearAudioInjection?.() ?? false);
    // Let the last turn's translation update reach the server before reading it.
    await delay(2_000);

    return {
      startedAtMs,
      platform: options.platform,
      deviceLabel: session.deviceLabel,
      sessionKey: room.sessionKey,
      conversationId: room.conversationId,
      fixtureBaseUrl,
      options: {
        leadingSilenceMs: options.leadingSilenceMs,
        trailingSilenceMs: options.trailingSilenceMs,
        turnTimeoutMs: options.turnTimeoutMs,
      },
      injectionEvents,
      fixtures: played,
    };
  } finally {
    await safeDeleteSession(session?.driver);
    appiumHandle?.child?.kill('SIGTERM');
    fixtureServer.close();
  }
}

async function main() {
  const options = parseSttAudioMetricsArgs(process.argv.slice(2));

  if (options.evaluateRun) {
    const runPath = path.resolve(options.evaluateRun);
    const run = JSON.parse(await fs.readFile(runPath, 'utf8'));
    await writeReport(path.dirname(runPath), await evaluateRun(run, options));
    return;
  }

  const manifest = await readGoldenManifest();
  const fixtures = options.fixtureIds.length > 0
    ? options.fixtureIds.map((id) => {
        const fixture = manifest.fixtures.find((candidate) => candidate.id === id);
        if (!fixture) throw new Error(`Unknown fixture id: ${id}`);
        return fixture;
      })
    : manifest.fixtures;

  const reportDir = path.join(STT_AUDIO_REPORT_ROOT, new Date().toISOString().replace(/[:.]/g, '-'));
  const run = await recordRun(options, fixtures);
  await fs.mkdir(reportDir, { recursive: true });
  await fs.writeFile(path.join(reportDir, 'run.json'), `${JSON.stringify(run, null, 2)}\n`);
  const report = await evaluateRun(run, options);
  await writeReport(reportDir, report);
  if (report.summary.failed > 0) process.exitCode = 1;
}

await main();
