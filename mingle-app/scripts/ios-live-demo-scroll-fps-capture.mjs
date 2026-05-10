#!/usr/bin/env node

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

import { remote } from 'webdriverio';

import {
  IOS_SCROLL_FPS_CAPTURE_CHAT_SCROLL_SELECTOR,
  IOS_SCROLL_FPS_CAPTURE_GLOBAL_KEY,
  IOS_SCROLL_FPS_CAPTURE_MEASUREMENT_SEARCH_PARAM,
  IOS_SCROLL_FPS_CAPTURE_MEASUREMENT_STORAGE_KEY,
  IOS_SCROLL_FPS_CAPTURE_REFERENCE_DEVICE,
  IOS_SCROLL_FPS_CAPTURE_UTTERANCE_COUNT,
  buildMarkdownReport,
  evaluateFpsRun,
  isIphone12ClassViewport,
  parseIosScrollFpsCaptureArgs,
  resolveTouchScrollGesturePlan,
  summarizeCaptureRuns,
  summarizeFrameIntervals,
} from './ios-live-demo-scroll-fps-capture.logic.mjs';

const IOS_BUNDLE_ID = 'com.minglelabs.mingle.rn';
const APP_ROOT = path.resolve(import.meta.dirname, '..');
const REPORT_ROOT = path.resolve(APP_ROOT, 'qa/mobile-ui/reports');
const APPIUM_HOME = path.resolve(APP_ROOT, '.appium');
const APPIUM_BIN = path.resolve(APP_ROOT, 'node_modules/appium/index.js');
const APPIUM_CLI_CWD = path.resolve(process.env.TMPDIR || '/tmp', 'mingle-appium-cli');
const APPLE_SILICON_NODE22_BIN = '/opt/homebrew/opt/node@22/bin/node';
const APPIUM_XCUITEST_DRIVER = 'xcuitest@10.43.1';

function usage() {
  return `
Usage: node scripts/ios-live-demo-scroll-fps-capture.mjs --ios-udid <PHYSICAL_IOS_UDID>

Recommended devbox entrypoint:
  scripts/devbox qa --ios-scroll-fps --ios-real-udid <PHYSICAL_IOS_UDID>

Options:
  --ios-udid UDID              Physical iPhone UDID.
  --appium-port PORT           Appium port. Default: 4723.
  --reuse-appium               Reuse an already-running Appium server.
  --runs N                     Repeat captures. Default: 3.
  --gesture-count N            Touch-scroll gestures per run. Default: 6.
  --gesture-duration-ms N      Duration for each touch gesture. Default: 700.
  --gesture-pause-ms N         Pause after each gesture. Default: 250.
  --min-average-fps N          Per-run pass budget. Default: 55.
  --allow-simulator            Development-only escape hatch; physical iPhone is required by default.
`.trim();
}

function assert(condition, message, details = undefined) {
  if (!condition) {
    const error = new Error(message);
    error.details = details;
    throw error;
  }
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

async function ensureDir(target) {
  await fs.mkdir(target, { recursive: true });
}

async function pathExists(target) {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

function parseNodeVersion(versionString) {
  const normalized = String(versionString).trim().replace(/^v/, '');
  const [major = '0', minor = '0', patch = '0'] = normalized.split('.');
  return {
    major: Number(major),
    minor: Number(minor),
    patch: Number(patch),
  };
}

function isAppium3CompatibleNode(versionString) {
  const version = parseNodeVersion(versionString);
  if (version.major > 24) return true;
  if (version.major === 24) return true;
  if (version.major === 22) return version.minor >= 12;
  if (version.major === 20) return version.minor > 19 || (version.minor === 19 && version.patch >= 0);
  return false;
}

async function runCommand(command, args, options = {}) {
  return await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd || APP_ROOT,
      env: {
        ...process.env,
        APPIUM_HOME,
        ...(options.env || {}),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }
      reject(new Error(`${command} ${args.join(' ')} failed with code ${code}\n${stdout}\n${stderr}`));
    });
  });
}

async function resolveAppiumNodeBinary() {
  const candidates = [
    process.env.MINGLE_UI_QA_APPIUM_NODE_BINARY || '',
    process.execPath,
    APPLE_SILICON_NODE22_BIN,
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (!(await pathExists(candidate))) continue;
    try {
      const result = await runCommand(candidate, ['-v']);
      if (isAppium3CompatibleNode(result.stdout.trim())) return candidate;
    } catch {
      continue;
    }
  }

  throw new Error(`No Node.js runtime compatible with Appium 3 was found. Current process uses ${process.version}; install Node 22.12+ or set MINGLE_UI_QA_APPIUM_NODE_BINARY.`);
}

async function runAppiumCommand(args) {
  await ensureDir(APPIUM_CLI_CWD);
  const nodeBinary = await resolveAppiumNodeBinary();
  return await runCommand(nodeBinary, [APPIUM_BIN, ...args], { cwd: APPIUM_CLI_CWD });
}

async function ensureXcuitestDriver() {
  const listed = await runAppiumCommand(['driver', 'list', '--installed', '--json']);
  const installedDrivers = JSON.parse(listed.stdout || '{}');
  const [, expectedVersion] = APPIUM_XCUITEST_DRIVER.split('@');
  const installedDriver = installedDrivers.xcuitest;

  if (installedDriver?.installed && installedDriver.version === expectedVersion) return;
  if (installedDriver?.installed) {
    await runAppiumCommand(['driver', 'uninstall', 'xcuitest']);
  }
  await runAppiumCommand(['driver', 'install', APPIUM_XCUITEST_DRIVER]);
}

async function isAppiumReady(port) {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/status`);
    return response.ok;
  } catch {
    return false;
  }
}

async function waitFor(test, description, timeoutMs = 30000, intervalMs = 500) {
  const startedAt = Date.now();
  let lastError = null;

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const result = await test();
      if (result) return result;
    } catch (error) {
      lastError = error;
    }
    await delay(intervalMs);
  }

  const suffix = lastError ? `\nLast error: ${lastError.message}` : '';
  throw new Error(`Timed out while waiting for ${description}.${suffix}`);
}

async function startAppiumServer(port) {
  if (await isAppiumReady(port)) return null;
  const nodeBinary = await resolveAppiumNodeBinary();
  await ensureDir(APPIUM_CLI_CWD);

  const child = spawn(nodeBinary, [
    APPIUM_BIN,
    'server',
    '-p',
    String(port),
    '--session-override',
  ], {
    cwd: APPIUM_CLI_CWD,
    env: {
      ...process.env,
      APPIUM_HOME,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let stderr = '';
  child.stderr.on('data', (chunk) => {
    stderr += chunk.toString();
  });

  await waitFor(() => isAppiumReady(port), 'Appium server startup', 45000, 1000);
  return {
    child,
    stderrRef: () => stderr,
  };
}

async function isIosSimulator(udid) {
  try {
    const result = await runCommand('xcrun', ['simctl', 'getenv', udid, 'SIMULATOR_UDID']);
    return result.stdout.trim() === udid;
  } catch {
    return false;
  }
}

async function readIosDeviceLine(udid) {
  try {
    const result = await runCommand('xcrun', ['xctrace', 'list', 'devices']);
    return result.stdout
      .split('\n')
      .map((line) => line.trim())
      .find((line) => line.includes(udid)) || '';
  } catch {
    return '';
  }
}

async function createIosSession(options) {
  const iosXcodeConfigFile = options.iosSimulator
    ? ''
    : await ensureIosRealDeviceXcodeConfig();
  const capabilities = {
    platformName: 'iOS',
    'appium:automationName': 'XCUITest',
    'appium:udid': options.iosUdid,
    'appium:bundleId': IOS_BUNDLE_ID,
    'appium:noReset': true,
    'appium:newCommandTimeout': 180,
    'appium:includeSafariInWebviews': true,
    'appium:language': process.env.MINGLE_UI_QA_IOS_LANGUAGE || 'ko',
    'appium:locale': process.env.MINGLE_UI_QA_IOS_LOCALE || 'ko_KR',
  };

  if (process.env.MINGLE_UI_QA_IOS_XCODE_ORG_ID) {
    capabilities['appium:xcodeOrgId'] = process.env.MINGLE_UI_QA_IOS_XCODE_ORG_ID;
  }
  if (process.env.MINGLE_UI_QA_IOS_XCODE_SIGNING_ID) {
    capabilities['appium:xcodeSigningId'] = process.env.MINGLE_UI_QA_IOS_XCODE_SIGNING_ID;
  }
  if (process.env.MINGLE_UI_QA_IOS_UPDATED_WDA_BUNDLE_ID) {
    capabilities['appium:updatedWDABundleId'] = process.env.MINGLE_UI_QA_IOS_UPDATED_WDA_BUNDLE_ID;
  }
  if (iosXcodeConfigFile) {
    capabilities['appium:xcodeConfigFile'] = iosXcodeConfigFile;
  }
  if (process.env.MINGLE_UI_QA_IOS_WDA_LOCAL_PORT) {
    capabilities['appium:wdaLocalPort'] = Number(process.env.MINGLE_UI_QA_IOS_WDA_LOCAL_PORT);
  }
  if (process.env.MINGLE_UI_QA_IOS_SHOW_XCODE_LOG === '1') {
    capabilities['appium:showXcodeLog'] = true;
  }

  return await remote({
    hostname: '127.0.0.1',
    port: options.appiumPort,
    path: '/',
    capabilities,
  });
}

async function ensureIosRealDeviceXcodeConfig() {
  const lines = [];

  if (process.env.MINGLE_UI_QA_IOS_XCODE_ORG_ID) {
    lines.push(`DEVELOPMENT_TEAM = ${process.env.MINGLE_UI_QA_IOS_XCODE_ORG_ID}`);
  }
  if (process.env.MINGLE_UI_QA_IOS_XCODE_SIGNING_ID) {
    lines.push(`CODE_SIGN_IDENTITY = ${process.env.MINGLE_UI_QA_IOS_XCODE_SIGNING_ID}`);
  }
  if (process.env.MINGLE_UI_QA_IOS_DISABLE_RESERVED_IDENTIFIER_WARNINGS !== '0') {
    lines.push('WARNING_CFLAGS = $(inherited) -Wno-error=reserved-identifier -Wno-reserved-identifier');
  }

  if (lines.length === 0) return '';

  const configDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mingle-ios-scroll-fps-wda-'));
  const configPath = path.join(configDir, 'wda-signing.xcconfig');
  await fs.writeFile(configPath, `${lines.join('\n')}\n`);
  return configPath;
}

async function safeDeleteSession(driver) {
  if (!driver) return;
  try {
    await driver.deleteSession();
  } catch {
    // Preserve the original run result.
  }
}

async function switchToWebView(driver) {
  return await waitFor(async () => {
    const contexts = await driver.getContexts({ returnDetailedContexts: true });
    const target = contexts.find((context) => {
      if (!context || typeof context !== 'object') return false;
      if (!('id' in context) || typeof context.id !== 'string' || !context.id.startsWith('WEBVIEW')) return false;
      if ('url' in context && typeof context.url === 'string' && /qa=1/.test(context.url)) return true;
      return context.bundleId === IOS_BUNDLE_ID;
    });
    if (!target) return null;

    try {
      await driver.switchContext({ url: /qa=1/ });
    } catch {
      await driver.switchContext(target.id);
    }
    return target.id;
  }, 'the QA iOS WebView context', 60000, 1000);
}

async function switchToNative(driver) {
  const contexts = await driver.getContexts();
  const nativeContext = contexts.find((context) => String(context) === 'NATIVE_APP');
  assert(nativeContext, 'NATIVE_APP context was not available.');
  await driver.switchContext(String(nativeContext));
}

async function getQaSnapshot(driver) {
  return await driver.execute(() => window.__MINGLE_QA__?.getLiveDemoSnapshot?.() ?? null);
}

async function getConversationListQaSnapshot(driver) {
  return await driver.execute(() => window.__MINGLE_CONVERSATION_LIST_QA__?.getConversationListSnapshot?.() ?? null);
}

async function getQaDiagnostics(driver) {
  try {
    return await driver.execute(() => ({
      href: window.location.href,
      readyState: document.readyState,
      hasQaBridge: Boolean(window.__MINGLE_QA__?.getLiveDemoSnapshot),
      hasConversationListQaBridge: Boolean(window.__MINGLE_CONVERSATION_LIST_QA__?.getConversationListSnapshot),
      bodyPreview: (document.body?.innerText || '').slice(0, 240),
    }));
  } catch (error) {
    return {
      diagnosticsError: error instanceof Error ? error.message : String(error),
    };
  }
}

async function waitForQaBridge(driver, timeoutMs = 45000) {
  try {
    return await waitFor(async () => {
      const snapshot = await getQaSnapshot(driver);
      return snapshot?.routePathname ? snapshot : null;
    }, 'the LivePhoneDemo QA bridge', timeoutMs, 1000);
  } catch (error) {
    if (error instanceof Error) {
      error.details = await getQaDiagnostics(driver);
    }
    throw error;
  }
}

async function invokeQaMethod(driver, methodName, ...args) {
  return await driver.execute((nextMethodName, nextArgs) => {
    const candidate = window.__MINGLE_QA__?.[nextMethodName];
    if (typeof candidate !== 'function') return null;
    return candidate(...nextArgs);
  }, methodName, args);
}

async function invokeConversationListQaAsyncMethod(driver, methodName, ...args) {
  return await driver.executeAsync((nextMethodName, nextArgs, done) => {
    const candidate = window.__MINGLE_CONVERSATION_LIST_QA__?.[nextMethodName];
    if (typeof candidate !== 'function') {
      done(null);
      return;
    }

    Promise.resolve()
      .then(() => candidate(...nextArgs))
      .then((result) => done(result))
      .catch((error) => {
        done({
          __qaError: error instanceof Error ? error.message : String(error),
        });
      });
  }, methodName, args);
}

async function ensureConversationRoom(driver) {
  try {
    return await waitForQaBridge(driver, 5000);
  } catch {
    const listSnapshot = await waitFor(async () => {
      const snapshot = await getConversationListQaSnapshot(driver);
      return snapshot?.routePathname ? snapshot : null;
    }, 'the conversation-list QA bridge', 30000, 1000);
    const ensuredRoom = await invokeConversationListQaAsyncMethod(driver, 'ensureConversationRoom');
    assert(ensuredRoom?.conversationId, 'The conversation-list QA bridge could not open a conversation room.', {
      listSnapshot,
      ensuredRoom,
    });
    return await waitForQaBridge(driver, 45000);
  }
}

async function reloadCurrentPage(driver) {
  await driver.execute(() => {
    window.location.reload();
  });
  await waitForQaBridge(driver);
}

async function disableScrollHandlerInstrumentation(driver) {
  const initial = await driver.execute((storageKey, searchParam) => {
    let urlChanged = false;
    try {
      window.localStorage.removeItem(storageKey);
    } catch {
      // Ignore storage failures; verification below will catch an active counter.
    }

    try {
      const nextUrl = new URL(window.location.href);
      if (nextUrl.searchParams.has(searchParam)) {
        nextUrl.searchParams.delete(searchParam);
        window.history.replaceState(window.history.state, '', nextUrl.toString());
        urlChanged = true;
      }
    } catch {
      // Ignore malformed URL edge cases; verification below will catch an active counter.
    }

    return {
      urlChanged,
      href: window.location.href,
      storageValue: window.localStorage.getItem(storageKey),
      measurement: window.__MINGLE_QA__?.getLiveDemoChatScrollHandlerMeasurement?.() ?? null,
    };
  }, IOS_SCROLL_FPS_CAPTURE_MEASUREMENT_STORAGE_KEY, IOS_SCROLL_FPS_CAPTURE_MEASUREMENT_SEARCH_PARAM);

  if (initial.urlChanged || initial.measurement !== null || initial.storageValue !== null) {
    await reloadCurrentPage(driver);
  }

  const verified = await driver.execute((storageKey, searchParam) => ({
    href: window.location.href,
    storageValue: window.localStorage.getItem(storageKey),
    hasMeasurementParam: new URL(window.location.href).searchParams.has(searchParam),
    measurement: window.__MINGLE_QA__?.getLiveDemoChatScrollHandlerMeasurement?.() ?? null,
  }), IOS_SCROLL_FPS_CAPTURE_MEASUREMENT_STORAGE_KEY, IOS_SCROLL_FPS_CAPTURE_MEASUREMENT_SEARCH_PARAM);

  assert(verified.measurement === null, 'The app scroll-handler instrumentation counter is still active.', verified);
  assert(verified.storageValue === null, 'The app scroll-handler measurement storage key was not cleared.', verified);
  assert(verified.hasMeasurementParam === false, 'The app scroll-handler measurement query parameter was not cleared.', verified);

  return verified;
}

async function seedScrollPerformanceScenario(driver) {
  await invokeQaMethod(driver, 'resetUiState');
  const seededCount = await invokeQaMethod(driver, 'seedScrollPerformanceHistory');
  assert(seededCount === IOS_SCROLL_FPS_CAPTURE_UTTERANCE_COUNT, 'The QA bridge did not seed the 500-utterance scroll performance scenario.', {
    seededCount,
  });

  const snapshot = await waitFor(async () => {
    const next = await getQaSnapshot(driver);
    return next?.utteranceCount === IOS_SCROLL_FPS_CAPTURE_UTTERANCE_COUNT
      && next.chatScrollHeight > next.chatClientHeight
      ? next
      : null;
  }, 'the 500-utterance scroll performance scenario to render', 30000, 500);

  const geometry = await driver.execute((selector) => {
    const scroll = document.querySelector(selector);
    if (!(scroll instanceof HTMLElement)) return null;
    scroll.scrollTop = scroll.scrollHeight;
    scroll.dispatchEvent(new Event('scroll', { bubbles: true }));
    const rect = scroll.getBoundingClientRect();
    return {
      windowScrollY: Math.round(window.scrollY || 0),
      scrollTop: Math.round(scroll.scrollTop),
      scrollHeight: Math.round(scroll.scrollHeight),
      clientHeight: Math.round(scroll.clientHeight),
      scrollRect: {
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      },
      overflowY: window.getComputedStyle(scroll).overflowY,
    };
  }, IOS_SCROLL_FPS_CAPTURE_CHAT_SCROLL_SELECTOR);

  assert(geometry?.scrollHeight > geometry?.clientHeight, 'The chat DOM scroll container was not scrollable after seeding.', {
    snapshot,
    geometry,
  });
  await delay(500);

  return {
    snapshot,
    geometry,
  };
}

async function readScrollGeometry(driver) {
  return await driver.execute((selector) => {
    const scroll = document.querySelector(selector);
    if (!(scroll instanceof HTMLElement)) return null;
    const rect = scroll.getBoundingClientRect();
    return {
      windowScrollY: Math.round(window.scrollY || 0),
      scrollTop: Math.round(scroll.scrollTop),
      scrollHeight: Math.round(scroll.scrollHeight),
      clientHeight: Math.round(scroll.clientHeight),
      scrollRect: {
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      },
      overflowY: window.getComputedStyle(scroll).overflowY,
    };
  }, IOS_SCROLL_FPS_CAPTURE_CHAT_SCROLL_SELECTOR);
}

async function startRafCapture(driver, durationMs) {
  return await driver.execute((globalKey, nextDurationMs) => {
    const state = {
      status: 'running',
      durationMs: nextDurationMs,
      startedAtMs: performance.now(),
      completedAtMs: null,
      frameTimestampsMs: [],
      visibilityState: document.visibilityState,
      devicePixelRatio: window.devicePixelRatio,
      result: null,
    };
    window[globalKey] = state;

    const tick = (timestampMs) => {
      state.frameTimestampsMs.push(timestampMs);
      if (performance.now() - state.startedAtMs >= nextDurationMs) {
        state.status = 'complete';
        state.completedAtMs = performance.now();
        state.result = {
          status: state.status,
          durationMs: state.durationMs,
          startedAtMs: state.startedAtMs,
          completedAtMs: state.completedAtMs,
          frameTimestampsMs: state.frameTimestampsMs,
          visibilityState: state.visibilityState,
          devicePixelRatio: state.devicePixelRatio,
        };
        return;
      }
      window.requestAnimationFrame(tick);
    };

    window.requestAnimationFrame(tick);
    return {
      durationMs: state.durationMs,
      startedAtMs: state.startedAtMs,
      visibilityState: state.visibilityState,
      devicePixelRatio: state.devicePixelRatio,
    };
  }, IOS_SCROLL_FPS_CAPTURE_GLOBAL_KEY, durationMs);
}

async function readCompletedRafCapture(driver, timeoutMs) {
  return await waitFor(async () => {
    return await driver.execute((globalKey) => {
      const state = window[globalKey];
      return state?.status === 'complete' ? state.result : null;
    }, IOS_SCROLL_FPS_CAPTURE_GLOBAL_KEY);
  }, 'the rAF FPS capture to complete', timeoutMs, 250);
}

async function performTouchScrollGestures(driver, gesturePlan) {
  await switchToNative(driver);

  for (let index = 0; index < gesturePlan.gestureCount; index += 1) {
    await driver.performActions([{
      type: 'pointer',
      id: `scroll-fps-finger-${index}`,
      parameters: { pointerType: gesturePlan.pointerType },
      actions: [
        { type: 'pointerMove', duration: 0, x: gesturePlan.x, y: gesturePlan.startY },
        { type: 'pointerDown', button: 0 },
        { type: 'pause', duration: 90 },
        { type: 'pointerMove', duration: gesturePlan.gestureDurationMs, x: gesturePlan.x, y: gesturePlan.endY },
        { type: 'pointerUp', button: 0 },
      ],
    }]);
    await driver.releaseActions();
    await delay(gesturePlan.gesturePauseMs);
  }
}

async function captureRun(driver, runIndex, options, nativeWindowRect) {
  await switchToWebView(driver);
  const seeded = await seedScrollPerformanceScenario(driver);
  const beforeGeometry = await readScrollGeometry(driver);
  const gesturePlan = resolveTouchScrollGesturePlan({
    nativeWindowRect,
    scrollRect: beforeGeometry.scrollRect,
    gestureCount: options.gestureCount,
    gestureDurationMs: options.gestureDurationMs,
    gesturePauseMs: options.gesturePauseMs,
  });
  const captureStart = await startRafCapture(driver, options.captureDurationMs);

  await performTouchScrollGestures(driver, gesturePlan);
  await switchToWebView(driver);

  const rawCapture = await readCompletedRafCapture(driver, options.captureDurationMs + 5000);
  const afterGeometry = await readScrollGeometry(driver);
  const metrics = summarizeFrameIntervals(rawCapture.frameTimestampsMs, {
    targetFps: options.targetFps,
  });
  const evaluation = evaluateFpsRun(metrics, {
    minAverageFps: options.minAverageFps,
  });
  const measurement = await invokeQaMethod(driver, 'getLiveDemoChatScrollHandlerMeasurement');
  const scrollDeltaPx = Math.round(beforeGeometry.scrollTop - afterGeometry.scrollTop);
  const windowScrollDeltaPx = Math.round(afterGeometry.windowScrollY - beforeGeometry.windowScrollY);

  assert(measurement === null, 'The final FPS capture ran while app scroll-handler instrumentation was active.', {
    runIndex,
    measurement,
  });
  assert(scrollDeltaPx > 0, 'The native touch gestures did not move the inner chat DOM scroll container toward older messages.', {
    runIndex,
    beforeGeometry,
    afterGeometry,
    gesturePlan,
  });
  assert(Math.abs(windowScrollDeltaPx) <= 1, 'The page window scrolled instead of leaving scrolling to the inner chat DOM container.', {
    runIndex,
    beforeGeometry,
    afterGeometry,
    windowScrollDeltaPx,
  });

  return {
    runIndex,
    seededSnapshot: seeded.snapshot,
    captureStart,
    gesturePlan,
    beforeGeometry,
    afterGeometry,
    scrollDeltaPx,
    windowScrollDeltaPx,
    rawFrameCount: rawCapture.frameTimestampsMs.length,
    metrics,
    evaluation,
  };
}

async function main() {
  const options = parseIosScrollFpsCaptureArgs(process.argv.slice(2), process.env);
  if (options.help) {
    console.log(usage());
    return;
  }

  assert(options.iosUdid, 'A physical iPhone UDID is required. Use `scripts/devbox qa --ios-scroll-fps --ios-real-udid <UDID>`.');
  const simulator = await isIosSimulator(options.iosUdid);
  options.iosSimulator = simulator;
  assert(options.allowSimulator || !simulator, 'The scroll FPS capture must run on a physical iPhone by default.', {
    iosUdid: options.iosUdid,
  });

  await ensureDir(APPIUM_HOME);
  await ensureDir(REPORT_ROOT);
  await ensureXcuitestDriver();

  const appiumHandle = options.reuseAppium ? null : await startAppiumServer(options.appiumPort);
  const reportDir = path.join(REPORT_ROOT, `ios-scroll-fps-${timestamp()}`);
  await ensureDir(reportDir);

  let driver = null;
  try {
    driver = await createIosSession(options);
    await switchToWebView(driver);
    await ensureConversationRoom(driver);
    const instrumentationState = await disableScrollHandlerInstrumentation(driver);
    await switchToNative(driver);
    const nativeWindowRect = await driver.getWindowRect();
    await switchToWebView(driver);
    const deviceLine = await readIosDeviceLine(options.iosUdid);
    const viewportMatchesReferenceDevice = isIphone12ClassViewport(nativeWindowRect);
    const runs = [];

    for (let runIndex = 1; runIndex <= options.runs; runIndex += 1) {
      runs.push(await captureRun(driver, runIndex, options, nativeWindowRect));
    }

    const summary = summarizeCaptureRuns(runs, {
      minAverageFps: options.minAverageFps,
    });
    const report = {
      timestamp: new Date().toISOString(),
      referenceDevice: IOS_SCROLL_FPS_CAPTURE_REFERENCE_DEVICE,
      deviceLabel: deviceLine || `ios:${options.iosUdid}`,
      iosUdid: options.iosUdid,
      nativeWindowRect,
      viewportMatchesReferenceDevice,
      utteranceCount: IOS_SCROLL_FPS_CAPTURE_UTTERANCE_COUNT,
      instrumentationOff: true,
      instrumentationState,
      options,
      summary,
      runs,
    };

    const reportJsonPath = path.join(reportDir, 'ios-live-demo-scroll-fps.json');
    const reportMarkdownPath = path.join(reportDir, 'ios-live-demo-scroll-fps.md');
    await fs.writeFile(reportJsonPath, JSON.stringify(report, null, 2));
    await fs.writeFile(reportMarkdownPath, buildMarkdownReport(report));

    console.log(JSON.stringify({
      reportJsonPath,
      reportMarkdownPath,
      summary,
      viewportMatchesReferenceDevice,
      hasFailure: !summary.pass,
    }, null, 2));

    if (!summary.pass) {
      process.exitCode = 1;
    }
  } finally {
    await safeDeleteSession(driver);
    if (appiumHandle?.child) {
      appiumHandle.child.kill('SIGTERM');
      if (appiumHandle.stderrRef()?.trim()) {
        await fs.writeFile(path.join(reportDir, 'appium-stderr.log'), appiumHandle.stderrRef());
      }
    }
  }
}

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  if (error?.details) {
    console.error(JSON.stringify(error.details, null, 2));
  }
  process.exitCode = 1;
}
