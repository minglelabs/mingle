#!/usr/bin/env node
// Drives the Mingle app on a connected iPhone or Android phone (or, as a fallback, an iOS Simulator) for the
// /qa skill, through Appium XCUITest / UiAutomator2 (the same real-device paths as scripts/mobile-ui-qa.mjs).
// One Appium server and one session stay open across calls, so each command is a quick WebDriver request.
//
//   node scripts/qa-agent-device.mjs devices                    # connected iPhones and Android phones
//   node scripts/qa-agent-device.mjs servers                    # is this worktree's devbox reachable from the phone?
//   node scripts/qa-agent-device.mjs build [--sim|--android]    # Release + QA bridge build (test ads, local URLs)
//   node scripts/qa-agent-device.mjs install [--sim|--android] [--fresh]  # install + launch
//   node scripts/qa-agent-device.mjs prepare-wda                # compile WebDriverAgent locally (no install)
//   node scripts/qa-agent-device.mjs start [--sim|--android] [--udid U|--serial S]  # Appium + a session
//   node scripts/qa-agent-device.mjs screenshot <file.png>
//   node scripts/qa-agent-device.mjs tap <x> <y>
//   node scripts/qa-agent-device.mjs long-press <x> <y> [ms]
//   node scripts/qa-agent-device.mjs swipe <x1> <y1> <x2> <y2> [ms]   # iOS back: start at x=2
//   node scripts/qa-agent-device.mjs back                       # Android system back
//   node scripts/qa-agent-device.mjs type <text>                # into the focused field
//   node scripts/qa-agent-device.mjs alert <accept|dismiss|text>  # iOS alerts / Android permission dialogs
//   node scripts/qa-agent-device.mjs snapshot                   # WebView QA bridge state
//   node scripts/qa-agent-device.mjs eval '<expression>'        # synchronous, JSON-serialisable
//   node scripts/qa-agent-device.mjs app <launch|terminate|state>
//   node scripts/qa-agent-device.mjs logs [--grep TEXT]         # syslog / logcat lines since the last call
//   node scripts/qa-agent-device.mjs stop                       # end the session and the Appium server
//
// Coordinates are WebView CSS pixels on both platforms (iOS points; Android device px / devicePixelRatio),
// printed by `start` and `screenshot`. Screenshots stay in device pixels.
// Only the QA account and local devbox are ever used; nothing here talks to production.

import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { setTimeout as delay } from 'node:timers/promises';

const APP_ROOT = path.resolve(import.meta.dirname, '..');
const REPO_ROOT = path.resolve(APP_ROOT, '..');
const LOCAL_DIR = path.join(APP_ROOT, 'qa/agent/local');
const STATE_PATH = path.join(LOCAL_DIR, 'device-session.json');
const APPIUM_LOG_PATH = path.join(LOCAL_DIR, 'appium.log');
const BUNDLE_ID = 'com.minglelabs.mingle.rn';
const DEFAULT_APPIUM_PORT = Number(process.env.MINGLE_QA_APPIUM_PORT || 4724);
const DEFAULT_TEAM_ID = process.env.MINGLE_UI_QA_IOS_XCODE_ORG_ID || '3RFBMN8TKZ';
const APPLE_SILICON_NODE22_BIN = '/opt/homebrew/opt/node@22/bin/node';
// The WDA bundle id earlier mobile-ui-qa and STT sessions signed successfully under the team above.
const WDA_BUNDLE_ID = process.env.MINGLE_UI_QA_IOS_UPDATED_WDA_BUNDLE_ID || 'com.minglelabs.mingle.rn.WebDriverAgentRunner';
const WDA_DERIVED_DATA = path.join(REPO_ROOT, '.devbox-cache/ios/qa-agent-wda');
const SNAPSHOT_EXPRESSION = `(() => {
  const active = document.activeElement;
  const visible = (element) => {
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  };
  return {
    url: location.href,
    title: document.title,
    nativeQaBridgeEnabled: window.__MINGLE_NATIVE_QA_BRIDGE_ENABLED__ === true,
    liveDemo: window.__MINGLE_QA__?.getLiveDemoSnapshot?.() ?? null,
    conversationList: window.__MINGLE_CONVERSATION_LIST_QA__?.getConversationListSnapshot?.() ?? null,
    activeElement: active && active !== document.body ? {
      tag: active.tagName.toLowerCase(),
      dataQa: active.getAttribute('data-qa'),
      valueLength: typeof active.value === 'string' ? active.value.length : null,
    } : null,
    alerts: [...document.querySelectorAll('[role="alert"], [role="status"], [aria-live]')]
      .filter(visible)
      .map((element) => element.textContent.trim())
      .filter(Boolean)
      .slice(0, 5),
    viewport: {
      width: window.innerWidth,
      height: window.innerHeight,
      visualHeight: window.visualViewport ? Math.round(window.visualViewport.height) : null,
    },
  };
})()`;

function fail(message) {
  throw new Error(message);
}

function readState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
  } catch {
    return null;
  }
}

function writeState(state) {
  fs.mkdirSync(LOCAL_DIR, { recursive: true });
  fs.writeFileSync(STATE_PATH, `${JSON.stringify(state, null, 2)}\n`);
}

function readOption(args, name) {
  const index = args.indexOf(name);
  if (index === -1) return '';
  const [, value = ''] = args.splice(index, 2);
  return value;
}

function mainWorktreeAppRoot() {
  try {
    const porcelain = execFileSync('git', ['worktree', 'list', '--porcelain'], { cwd: APP_ROOT, encoding: 'utf8' });
    const mainWorktree = /^worktree (.+)$/m.exec(porcelain)?.[1];
    return mainWorktree ? path.join(mainWorktree, 'mingle-app') : '';
  } catch {
    return '';
  }
}

// The XCUITest and UiAutomator2 drivers live in an APPIUM_HOME that scripts/mobile-ui-qa.mjs maintains.
// A worktree usually has none, so fall back to the main checkout's.
function resolveAppiumHome(driver = 'appium-xcuitest-driver') {
  const candidates = [process.env.MINGLE_QA_APPIUM_HOME, path.join(APP_ROOT, '.appium'), path.join(mainWorktreeAppRoot(), '.appium')];
  const found = candidates.find((candidate) => candidate && fs.existsSync(path.join(candidate, 'node_modules', driver)));
  if (!found) fail(`No Appium home with ${driver}. Run \`pnpm test:qa:ui:ios\` (or \`appium driver install uiautomator2\`) once in the main checkout, or set MINGLE_QA_APPIUM_HOME.`);
  return found;
}

function resolveAppiumBin() {
  const candidates = [path.join(APP_ROOT, 'node_modules/appium/index.js'), path.join(mainWorktreeAppRoot(), 'node_modules/appium/index.js')];
  const found = candidates.find((candidate) => fs.existsSync(candidate));
  if (!found) fail('appium is not installed; run pnpm install in mingle-app.');
  return found;
}

function devboxEnv() {
  const envPath = path.join(REPO_ROOT, '.devbox.env');
  if (!fs.existsSync(envPath)) fail('missing .devbox.env; run scripts/devbox init');
  return Object.fromEntries(fs.readFileSync(envPath, 'utf8')
    .split('\n')
    .map((line) => /^([A-Z0-9_]+)=(.*)$/.exec(line))
    .filter(Boolean)
    .map(([, key, value]) => [key, value]));
}

// Hardware UDIDs of connected iPhones, from usbmux (what WDA and Appium use).
function listDevices() {
  const ids = execFileSync('idevice_id', ['-l'], { encoding: 'utf8' }).split('\n').map((line) => line.trim()).filter(Boolean);
  return ids.map((udid) => {
    let name = '';
    let version = '';
    try {
      name = execFileSync('ideviceinfo', ['-u', udid, '-k', 'DeviceName'], { encoding: 'utf8' }).trim();
      version = execFileSync('ideviceinfo', ['-u', udid, '-k', 'ProductVersion'], { encoding: 'utf8' }).trim();
    } catch {
      // Locked or not trusted yet; the UDID is still usable for listing.
    }
    return { udid, name, version };
  });
}

// Serials of Android phones that adb lists as ready (`device`, not `unauthorized` or `offline`).
function listAndroidDevices() {
  let output = '';
  try {
    output = execFileSync('adb', ['devices', '-l'], { encoding: 'utf8' });
  } catch {
    return [];
  }
  return output.split('\n').slice(1)
    .map((line) => /^(\S+)\s+device\b(.*)$/.exec(line.trim()))
    .filter(Boolean)
    .map(([, serial, rest]) => ({ serial, model: /model:(\S+)/.exec(rest)?.[1] ?? '' }));
}

function resolveAndroidSerial(requested) {
  if (requested) return requested;
  const state = readState();
  if (state?.platform === 'android' && state.udid) return state.udid;
  const devices = listAndroidDevices();
  if (devices.length === 0) fail('No Android phone connected (adb devices lists none in the `device` state). Unlock it and accept USB debugging.');
  if (devices.length > 1) fail(`Several Android phones are connected (${devices.map((device) => device.serial).join(', ')}); pass --serial.`);
  return devices[0].serial;
}

function adb(serial, ...args) {
  return execFileSync('adb', ['-s', serial, ...args], { encoding: 'utf8' }).trim();
}

function resolveUdid(requested) {
  if (requested) return requested;
  const state = readState();
  if (state?.udid && state.platform !== 'android') return state.udid;
  const devices = listDevices();
  if (devices.length === 0) fail('No iPhone connected over USB (idevice_id -l is empty).');
  if (devices.length > 1) fail(`Several iPhones are connected (${devices.map((device) => device.udid).join(', ')}); pass --udid.`);
  return devices[0].udid;
}

// Simulator fallback (allowed when the phone is not connected or is busy): one QA device,
// created on demand from the newest installed iOS runtime. The runtime itself is never touched.
const SIM_NAME = process.env.MINGLE_QA_SIM_NAME || 'Mingle QA iPhone 17';
const SIM_DEVICE_TYPE = 'com.apple.CoreSimulator.SimDeviceType.iPhone-17';

function simctlJson(...args) {
  return JSON.parse(execFileSync('xcrun', ['simctl', 'list', ...args, '-j'], { encoding: 'utf8' }));
}

function ensureSimulator() {
  const { devices } = simctlJson('devices', 'available');
  let device = Object.values(devices).flat().find((candidate) => candidate.name === SIM_NAME);
  if (!device) {
    const runtime = simctlJson('runtimes').runtimes.filter((entry) => entry.platform === 'iOS' && entry.isAvailable).pop()
      || fail('No iOS simulator runtime is installed.');
    const udid = execFileSync('xcrun', ['simctl', 'create', SIM_NAME, SIM_DEVICE_TYPE, runtime.identifier], { encoding: 'utf8' }).trim();
    device = { udid, state: 'Shutdown' };
  }
  if (device.state !== 'Booted') execFileSync('xcrun', ['simctl', 'boot', device.udid], { stdio: 'ignore' });
  execFileSync('xcrun', ['simctl', 'bootstatus', device.udid, '-b'], { stdio: 'ignore' });
  return device.udid;
}

function isSimulatorUdid(udid) {
  const { devices } = simctlJson('devices');
  return Object.values(devices).flat().some((device) => device.udid === udid);
}

async function appium(state, method, route, body) {
  const url = `http://127.0.0.1:${state.port}${route.replace(':session', state.sessionId)}`;
  const response = await fetch(url, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) fail(`${method} ${route} failed (${response.status}): ${payload?.value?.message || JSON.stringify(payload).slice(0, 300)}`);
  return payload.value;
}

function requireSession() {
  const state = readState();
  if (!state?.sessionId) fail('No QA device session; run `node scripts/qa-agent-device.mjs start` first.');
  return state;
}

async function isAppiumUp(port) {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/status`);
    return response.ok;
  } catch {
    return false;
  }
}

async function startAppium(port, driver) {
  if (await isAppiumUp(port)) return null;
  fs.mkdirSync(LOCAL_DIR, { recursive: true });
  const nodeBin = fs.existsSync(APPLE_SILICON_NODE22_BIN) ? APPLE_SILICON_NODE22_BIN : process.execPath;
  const log = fs.openSync(APPIUM_LOG_PATH, 'a');
  // UiAutomator2 needs a chromedriver that matches the phone's WebView; let it fetch one.
  const child = spawn(nodeBin, [
    resolveAppiumBin(), '--address', '127.0.0.1', '--port', String(port), '--log-level', 'info',
    '--allow-insecure', 'uiautomator2:chromedriver_autodownload',
  ], {
    env: {
      ...process.env,
      APPIUM_HOME: resolveAppiumHome(driver),
      // UiAutomator2 refuses to start without an SDK path; agent shells often lack the profile export.
      ANDROID_HOME: process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || path.join(process.env.HOME || '', 'Library/Android/sdk'),
    },
    detached: true,
    stdio: ['ignore', log, log],
  });
  child.unref();
  for (let waited = 0; waited < 60_000; waited += 1000) {
    if (await isAppiumUp(port)) return child.pid;
    await delay(1000);
  }
  fail(`Appium did not start on port ${port}; see ${APPIUM_LOG_PATH}`);
}

// Commands take coordinates in the WebView's CSS pixels on every platform (iOS points already are).
// Android gestures and window sizes are in device pixels, so they are scaled by `state.scale`.
const toDevice = (state, value) => Math.round(value * (state.scale || 1));

async function windowSize(state) {
  const rect = await appium(state, 'GET', '/session/:session/window/rect');
  const scale = state.scale || 1;
  return { width: Math.round(rect.width / scale), height: Math.round(rect.height / scale) };
}

async function cmdStartAndroid(args) {
  const serial = resolveAndroidSerial(readOption(args, '--serial'));
  const port = Number(readOption(args, '--port')) || DEFAULT_APPIUM_PORT;
  const previous = readState();
  if (previous?.sessionId && previous.udid === serial && await isAppiumUp(previous.port)) {
    try {
      const size = await windowSize(previous);
      console.log(JSON.stringify({ reused: true, udid: serial, target: 'android', sessionId: previous.sessionId, points: size }));
      return;
    } catch {
      // Stale session; create a new one below.
    }
  }
  const appiumPid = await startAppium(port, 'appium-uiautomator2-driver');
  const capabilities = {
    platformName: 'Android',
    'appium:automationName': 'UiAutomator2',
    'appium:udid': serial,
    'appium:appPackage': BUNDLE_ID,
    'appium:appActivity': '.MainActivity',
    'appium:noReset': true,
    'appium:newCommandTimeout': 3600,
    'appium:chromedriverAutodownload': true,
    'appium:ensureWebviewsHavePages': true,
    'appium:webviewDevtoolsPort': 9543,
    'appium:uiautomator2ServerInstallTimeout': 120_000,
    'appium:adbExecTimeout': 60_000,
  };
  const response = await fetch(`http://127.0.0.1:${port}/session`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ capabilities: { alwaysMatch: capabilities, firstMatch: [{}] } }),
  });
  const payload = await response.json();
  if (!response.ok) fail(`Session start failed: ${payload?.value?.message || JSON.stringify(payload).slice(0, 500)}\nAppium log: ${APPIUM_LOG_PATH}`);
  const state = {
    platform: 'android', udid: serial, simulator: false, port, sessionId: payload.value.sessionId,
    appiumPid: appiumPid ?? previous?.appiumPid ?? null, logCursor: new Date().toISOString(), scale: 1,
  };
  // Device pixels per CSS pixel, from the WebView itself (it accounts for display-size overrides).
  try {
    const ratio = await inWebView(state, () => appium(state, 'POST', '/session/:session/execute/sync', { script: 'return window.devicePixelRatio;', args: [] }));
    if (Number(ratio) > 0) state.scale = Number(ratio);
  } catch {
    const density = Number(/(\d+)\s*$/.exec(adb(serial, 'shell', 'wm', 'density'))?.[1]);
    if (density > 0) state.scale = density / 160;
  }
  writeState(state);
  console.log(JSON.stringify({ udid: serial, target: 'android', sessionId: state.sessionId, scale: state.scale, points: await windowSize(state) }));
}

async function cmdStart(args) {
  if (args.includes('--android')) return cmdStartAndroid(args);
  const sim = args.includes('--sim');
  const udid = sim ? ensureSimulator() : resolveUdid(readOption(args, '--udid'));
  const simulator = sim || isSimulatorUdid(udid);
  const port = Number(readOption(args, '--port')) || DEFAULT_APPIUM_PORT;
  const previous = readState();
  if (previous?.sessionId && previous.udid === udid && await isAppiumUp(previous.port)) {
    try {
      const size = await windowSize(previous);
      console.log(JSON.stringify({ reused: true, udid, sessionId: previous.sessionId, points: size }));
      return;
    } catch {
      // Stale session; create a new one below.
    }
  }
  const appiumPid = await startAppium(port);
  const capabilities = {
    platformName: 'iOS',
    'appium:automationName': 'XCUITest',
    'appium:udid': udid,
    'appium:bundleId': BUNDLE_ID,
    'appium:noReset': true,
    'appium:newCommandTimeout': 3600,
    'appium:includeSafariInWebviews': false,
    'appium:webviewConnectTimeout': 20_000,
    'appium:wdaLaunchTimeout': 180_000,
    'appium:wdaConnectionTimeout': 180_000,
  };
  if (!simulator) {
    capabilities['appium:xcodeOrgId'] = DEFAULT_TEAM_ID;
    capabilities['appium:xcodeSigningId'] = process.env.MINGLE_UI_QA_IOS_XCODE_SIGNING_ID || 'Apple Development';
    capabilities['appium:updatedWDABundleId'] = WDA_BUNDLE_ID;
  }
  if (!simulator && fs.existsSync(path.join(WDA_DERIVED_DATA, 'Build/Products'))) {
    // Built by `prepare-wda`, so the session start only installs and launches it.
    capabilities['appium:derivedDataPath'] = WDA_DERIVED_DATA;
    capabilities['appium:usePrebuiltWDA'] = true;
  }
  const response = await fetch(`http://127.0.0.1:${port}/session`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ capabilities: { alwaysMatch: capabilities, firstMatch: [{}] } }),
  });
  const payload = await response.json();
  if (!response.ok) fail(`Session start failed: ${payload?.value?.message || JSON.stringify(payload).slice(0, 500)}\nAppium log: ${APPIUM_LOG_PATH}`);
  const state = { platform: 'ios', udid, simulator, port, sessionId: payload.value.sessionId, appiumPid: appiumPid ?? previous?.appiumPid ?? null, logCursor: new Date().toISOString() };
  writeState(state);
  console.log(JSON.stringify({ udid, target: simulator ? 'simulator' : 'phone', sessionId: state.sessionId, points: await windowSize(state) }));
}

async function cmdScreenshot(args) {
  const file = args[0] || fail('screenshot needs an output path');
  const state = requireSession();
  const base64 = await appium(state, 'GET', '/session/:session/screenshot');
  fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  fs.writeFileSync(file, Buffer.from(base64, 'base64'));
  console.log(JSON.stringify({ file, points: await windowSize(state) }));
}

function pointerActions(steps) {
  return {
    actions: [{
      type: 'pointer',
      id: 'finger1',
      parameters: { pointerType: 'touch' },
      actions: steps,
    }],
  };
}

async function performPointer(steps) {
  const state = requireSession();
  await appium(state, 'POST', '/session/:session/actions', pointerActions(steps));
  await appium(state, 'DELETE', '/session/:session/actions').catch(() => {});
}

async function cmdTap(args, holdMs = 60) {
  const [x, y] = args.map(Number);
  if (!Number.isFinite(x) || !Number.isFinite(y)) fail('tap needs x y');
  const state = requireSession();
  await performPointer([
    { type: 'pointerMove', duration: 0, x: toDevice(state, x), y: toDevice(state, y) },
    { type: 'pointerDown', button: 0 },
    { type: 'pause', duration: holdMs },
    { type: 'pointerUp', button: 0 },
  ]);
  console.log(JSON.stringify({ tapped: [x, y], holdMs }));
}

async function cmdSwipe(args) {
  const [x1, y1, x2, y2, ms = 350] = args.map(Number);
  if (![x1, y1, x2, y2].every(Number.isFinite)) fail('swipe needs x1 y1 x2 y2 [ms]');
  const state = requireSession();
  await performPointer([
    { type: 'pointerMove', duration: 0, x: toDevice(state, x1), y: toDevice(state, y1) },
    { type: 'pointerDown', button: 0 },
    { type: 'pause', duration: 50 },
    { type: 'pointerMove', duration: Math.round(ms), x: toDevice(state, x2), y: toDevice(state, y2) },
    { type: 'pointerUp', button: 0 },
  ]);
  console.log(JSON.stringify({ swiped: [x1, y1, x2, y2], ms }));
}

async function cmdType(args) {
  const text = args.join(' ');
  if (!text) fail('type needs text');
  const state = requireSession();
  const active = await appium(state, 'GET', '/session/:session/element/active');
  const elementId = active?.['element-6066-11e4-a52e-4f735466cecf'] || active?.ELEMENT || fail('No focused field to type into.');
  await appium(state, 'POST', `/session/:session/element/${elementId}/value`, { text });
  console.log(JSON.stringify({ typedLength: text.length }));
}

// Android runtime-permission dialogs are not WebDriver alerts; they are permissioncontroller views.
const ANDROID_PERMISSION_BUTTONS = {
  accept: [
    'com.android.permissioncontroller:id/permission_allow_foreground_only_button',
    'com.android.permissioncontroller:id/permission_allow_button',
    'com.android.packageinstaller:id/permission_allow_button',
    'android:id/button1',
  ],
  dismiss: [
    'com.android.permissioncontroller:id/permission_deny_button',
    'com.android.packageinstaller:id/permission_deny_button',
    'android:id/button2',
  ],
};

async function findAndroidElement(state, ids) {
  for (const id of ids) {
    const found = await appium(state, 'POST', '/session/:session/element', { using: 'id', value: id }).catch(() => null);
    const elementId = found?.['element-6066-11e4-a52e-4f735466cecf'] || found?.ELEMENT;
    if (elementId) return { id, elementId };
  }
  return null;
}

async function cmdAlertAndroid(state, action) {
  const message = await findAndroidElement(state, ['com.android.permissioncontroller:id/permission_message', 'android:id/message']);
  const text = message ? await appium(state, 'GET', `/session/:session/element/${message.elementId}/text`).catch(() => null) : null;
  if (action === 'text') {
    console.log(JSON.stringify({ alert: text }));
    return;
  }
  const button = await findAndroidElement(state, ANDROID_PERMISSION_BUTTONS[action]);
  if (!button) fail(`No ${action} button on screen (dialog text: ${text ?? 'none'}).`);
  await appium(state, 'POST', `/session/:session/element/${button.elementId}/click`, {});
  console.log(JSON.stringify({ alert: action, button: button.id, text }));
}

async function cmdAlert(args) {
  const state = requireSession();
  const action = args[0] || 'text';
  if (state.platform === 'android') {
    if (!['accept', 'dismiss', 'text'].includes(action)) fail('alert takes accept, dismiss or text');
    await cmdAlertAndroid(state, action);
    return;
  }
  if (action === 'text') {
    console.log(JSON.stringify({ alert: await appium(state, 'GET', '/session/:session/alert/text').catch(() => null) }));
    return;
  }
  if (!['accept', 'dismiss'].includes(action)) fail('alert takes accept, dismiss or text');
  await appium(state, 'POST', `/session/:session/alert/${action}`, {});
  console.log(JSON.stringify({ alert: action }));
}

const AD_PAGE_PATTERN = /doubleclick\.net|googlesyndication|googleads|about:blank/;

async function selectAndroidAppWindow(state) {
  const handles = await appium(state, 'GET', '/session/:session/window/handles').catch(() => []);
  let fallback = null;
  for (const handle of handles) {
    await appium(state, 'POST', '/session/:session/window', { handle }).catch(() => {});
    const url = await appium(state, 'GET', '/session/:session/url').catch(() => '');
    if (!AD_PAGE_PATTERN.test(url)) return;
    fallback ??= handle;
  }
  if (fallback) fail('Only ad WebView pages are open; is the app page loaded?');
}

async function inWebView(state, run) {
  const contexts = await appium(state, 'GET', '/session/:session/contexts');
  const names = contexts.map((context) => (typeof context === 'string' ? context : context.id));
  const webview = names.filter((name) => name.startsWith('WEBVIEW')).pop() || fail(`No WebView context (got ${names.join(', ')}). Is the app in front, and built with the QA bridge?`);
  await appium(state, 'POST', '/session/:session/context', { name: webview });
  // Android: every WebView in the app process (the AdMob banner's included) is a window of one
  // chromedriver context, so pick the app page, not the ad page.
  if (state.platform === 'android') await selectAndroidAppWindow(state);
  try {
    return await run();
  } finally {
    await appium(state, 'POST', '/session/:session/context', { name: 'NATIVE_APP' }).catch(() => {});
  }
}

async function cmdEval(expression) {
  if (!expression) fail('eval needs an expression');
  const state = requireSession();
  const result = await inWebView(state, () => appium(state, 'POST', '/session/:session/execute/sync', {
    script: `return JSON.stringify({ mingleQaResult: (${expression}) });`,
    args: [],
  }));
  const parsed = typeof result === 'string' ? JSON.parse(result) : result;
  console.log(JSON.stringify({ result: parsed?.mingleQaResult ?? null }, null, 2));
}

async function cmdApp(args) {
  const state = requireSession();
  const action = args[0] || 'state';
  const command = { launch: 'mobile: activateApp', terminate: 'mobile: terminateApp', state: 'mobile: queryAppState' }[action];
  if (!command) fail('app takes launch, terminate or state');
  const target = state.platform === 'android' ? { appId: BUNDLE_ID } : { bundleId: BUNDLE_ID };
  const value = await appium(state, 'POST', '/session/:session/execute/sync', { script: command, args: [target] });
  console.log(JSON.stringify({ app: action, value }));
}

async function cmdLogs(args) {
  const state = requireSession();
  const grep = readOption(args, '--grep');
  const type = state.platform === 'android' ? 'logcat' : 'syslog';
  const entries = await appium(state, 'POST', '/session/:session/se/log', { type })
    .catch(() => appium(state, 'POST', '/session/:session/log', { type }));
  // Android: the app's JS console arrives as ReactNativeJS, WebView console as chromium.
  const relevant = state.platform === 'android'
    ? (line) => /mingle|ReactNativeJS|chromium|AndroidRuntime/i.test(line)
    : (line) => line.includes('mingle') || line.includes('Mingle');
  const lines = (entries || [])
    .map((entry) => `${new Date(entry.timestamp).toISOString()} ${entry.message}`)
    .filter(relevant)
    .filter((line) => !grep || line.includes(grep));
  console.log(lines.slice(-300).join('\n'));
}

async function cmdStop() {
  const state = readState();
  if (state?.sessionId) await appium(state, 'DELETE', '/session/:session').catch(() => {});
  if (state?.appiumPid) {
    try {
      process.kill(state.appiumPid, 'SIGTERM');
    } catch {
      // Already gone.
    }
  }
  fs.rmSync(STATE_PATH, { force: true });
  console.log(JSON.stringify({ stopped: true }));
}

// devbox does not persist the LAN host in .devbox.env; `scripts/devbox up --host <ip>` writes it into
// the iOS runtime xcconfig, which is the source of truth here. MINGLE_QA_DEVBOX_HOST overrides it.
function resolveDevboxHost() {
  if (process.env.MINGLE_QA_DEVBOX_HOST) return process.env.MINGLE_QA_DEVBOX_HOST;
  try {
    const xcconfig = fs.readFileSync(path.join(APP_ROOT, 'rn/ios/devbox.runtime.xcconfig'), 'utf8');
    const host = /^NEXT_PUBLIC_SITE_HOST = ([^:\s]+)/m.exec(xcconfig)?.[1];
    if (host) return host;
  } catch {
    // No xcconfig yet.
  }
  return '127.0.0.1';
}

async function cmdServers() {
  const env = devboxEnv();
  const host = resolveDevboxHost();
  const webUrl = `http://${host}:${env.DEVBOX_WEB_PORT}`;
  let webStatus = 0;
  try {
    webStatus = (await fetch(`${webUrl}/`, { redirect: 'manual', signal: AbortSignal.timeout(10_000) })).status;
  } catch {
    webStatus = 0;
  }
  let sttListening = false;
  try {
    execFileSync('nc', ['-z', '-G', '3', host, env.DEVBOX_STT_PORT], { stdio: 'ignore', timeout: 5000 });
    sttListening = true;
  } catch {
    sttListening = false;
  }
  const reachableFromPhone = host !== '127.0.0.1' && host !== 'localhost';
  const ok = webStatus >= 200 && webStatus < 400 && sttListening && reachableFromPhone;
  console.log(JSON.stringify({ host, webUrl, webStatus, sttPort: Number(env.DEVBOX_STT_PORT), sttListening, reachableFromPhone, ok }));
  if (!ok) process.exitCode = 1;
}

// Compiles WebDriverAgent for the phone without installing it, so signing problems surface early and
// `start` does not have to build it.
function cmdPrepareWda() {
  const project = path.join(resolveAppiumHome(), 'node_modules/appium-xcuitest-driver/node_modules/appium-webdriveragent/WebDriverAgent.xcodeproj');
  if (!fs.existsSync(project)) fail(`WebDriverAgent project not found at ${project}`);
  execFileSync('xcodebuild', [
    '-project', project,
    '-scheme', 'WebDriverAgentRunner',
    '-destination', 'generic/platform=iOS',
    '-derivedDataPath', WDA_DERIVED_DATA,
    '-allowProvisioningUpdates',
    `DEVELOPMENT_TEAM=${DEFAULT_TEAM_ID}`,
    `PRODUCT_BUNDLE_IDENTIFIER=${WDA_BUNDLE_ID}`,
    'build-for-testing', '-quiet',
  ], { stdio: ['ignore', 'inherit', 'inherit'] });
  console.log(JSON.stringify({ wdaDerivedData: WDA_DERIVED_DATA, bundleId: WDA_BUNDLE_ID }));
}

// Google's published AdMob test banner unit for iOS. QA builds must never request production ads.
const ADMOB_TEST_BANNER_UNIT_IOS = 'ca-app-pub-3940256099942544/2934735716';
const qaDerivedData = (sim) => path.join(REPO_ROOT, sim ? '.devbox-cache/ios/qa-agent-sim' : '.devbox-cache/ios/qa-agent-device');
const QA_XCCONFIG = path.join(REPO_ROOT, '.devbox-cache/ios/qa-agent-device.runtime.xcconfig');
const qaAppPath = (sim) => path.join(qaDerivedData(sim), `Build/Products/Release-${sim ? 'iphonesimulator' : 'iphoneos'}/mingle.app`);

// Release build with the QA bridge on: the JS bundle is embedded (no Metro), the WebView is inspectable,
// every web and fallback URL points at this worktree's devbox, and ads use Google's test units.
function cmdBuild(args) {
  if (args.includes('--android')) return cmdBuildAndroid();
  const sim = args.includes('--sim');
  const QA_APP_PATH = qaAppPath(sim);
  const host = resolveDevboxHost();
  if (host === '127.0.0.1' || host === 'localhost') {
    fail('devbox points at 127.0.0.1, which the phone cannot reach. Restart it with scripts/devbox up --profile local --host <Mac LAN IP>.');
  }
  const runtime = fs.readFileSync(path.join(APP_ROOT, 'rn/ios/devbox.runtime.xcconfig'), 'utf8');
  const value = (key) => new RegExp(`^${key} = (.*)$`, 'm').exec(runtime)?.[1] ?? fail(`${key} missing from devbox.runtime.xcconfig`);
  const qaConfig = runtime
    .replace(/^NEXT_PUBLIC_RN_QA_BRIDGE_ENABLED = .*$/m, 'NEXT_PUBLIC_RN_QA_BRIDGE_ENABLED = 1')
    .replace(/^MINGLE_LEGACY_SITE_URL = .*$/m, `MINGLE_LEGACY_SITE_URL = ${value('NEXT_PUBLIC_SITE_URL')}`)
    .replace(/^MINGLE_LEGACY_WS_URL = .*$/m, `MINGLE_LEGACY_WS_URL = ${value('NEXT_PUBLIC_WS_URL')}`)
    .replace(/^NEXT_PUBLIC_RN_ADMOB_BANNER_UNIT_ID_IOS = .*$/m, `NEXT_PUBLIC_RN_ADMOB_BANNER_UNIT_ID_IOS = ${ADMOB_TEST_BANNER_UNIT_IOS}`);
  // Agent shells that already run inside a macOS sandbox cannot start swift-plugin-server's own sandbox,
  // so Swift macros (e.g. @TaskLocal in the openiap pod) fail to expand. Opt in to build without it.
  const macroSandboxOff = process.env.MINGLE_QA_SWIFT_DISABLE_SANDBOX === '1'
    ? '\nOTHER_SWIFT_FLAGS = $(inherited) -D COCOAPODS -disable-sandbox\n'
    : '';
  fs.mkdirSync(path.dirname(QA_XCCONFIG), { recursive: true });
  fs.writeFileSync(QA_XCCONFIG, qaConfig + macroSandboxOff);
  execFileSync('xcodebuild', [
    '-allowProvisioningUpdates',
    '-workspace', path.join(APP_ROOT, 'rn/ios/mingle.xcworkspace'),
    '-scheme', 'mingle',
    '-configuration', 'Release',
    '-destination', sim ? 'generic/platform=iOS Simulator' : 'generic/platform=iOS',
    '-derivedDataPath', qaDerivedData(sim),
    '-xcconfig', QA_XCCONFIG,
    'build', '-quiet',
  ], {
    cwd: path.join(APP_ROOT, 'rn/ios'),
    env: { ...process.env, NEXT_PUBLIC_API_NAMESPACE: value('NEXT_PUBLIC_API_NAMESPACE') },
    stdio: ['ignore', 'inherit', 'inherit'],
  });
  const plist = (key) => {
    try {
      return execFileSync('plutil', ['-extract', key, 'raw', path.join(QA_APP_PATH, 'Info.plist')], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    } catch {
      return '';
    }
  };
  const built = {
    app: QA_APP_PATH,
    webUrl: plist('MingleWebAppBaseURL'),
    fallbackUrl: plist('MingleLegacyWebAppBaseURL'),
    qaBridge: plist('MingleQaBridgeEnabled'),
    bannerUnit: plist('MingleAdBannerUnitIdIos'),
    admobApp: plist('GADApplicationIdentifier'),
  };
  // 2.3.0 removed the legacy fallback URL; check it only on builds that still carry one.
  const fallbackOk = !built.fallbackUrl || built.fallbackUrl.includes(host);
  if (built.qaBridge !== '1' || !built.webUrl.includes(host) || !fallbackOk) fail(`QA build is misconfigured: ${JSON.stringify(built)}`);
  console.log(JSON.stringify(built));
}

// Google's published AdMob test banner unit for Android.
const ADMOB_TEST_BANNER_UNIT_ANDROID = 'ca-app-pub-3940256099942544/6300978111';
const ANDROID_RN_API_NAMESPACE = 'android/v2.3.0';
const QA_APK_PATH = path.join(APP_ROOT, 'rn/android/app/build/outputs/apk/release/app-release.apk');

// gradle reads the upload keystore from <worktree>/.credentials/android. A worktree has none, so
// link the main checkout's (gitignored) instead of signing with the debug key, which would not
// install over a build signed by the main checkout.
function ensureAndroidCredentials() {
  const local = path.join(REPO_ROOT, '.credentials');
  if (fs.existsSync(local)) return 'worktree';
  const mainRoot = mainWorktreeAppRoot() ? path.dirname(mainWorktreeAppRoot()) : '';
  const shared = mainRoot && path.join(mainRoot, '.credentials');
  if (!shared || shared === local || !fs.existsSync(path.join(shared, 'android'))) return 'debug-key';
  fs.symlinkSync(shared, local, 'dir');
  return 'main-checkout';
}

// Release APK with the QA bridge on: JS bundle embedded, WebView inspectable, web and STT URLs at
// this worktree's devbox, test ads. Uses the same devbox host as the iOS QA build.
function cmdBuildAndroid() {
  const host = resolveDevboxHost();
  if (host === '127.0.0.1' || host === 'localhost') {
    fail('devbox points at 127.0.0.1, which the phone cannot reach. Restart it with scripts/devbox up --profile local --host <Mac LAN IP>.');
  }
  const runtime = fs.readFileSync(path.join(APP_ROOT, 'rn/ios/devbox.runtime.xcconfig'), 'utf8');
  // xcconfig escapes "//" as "/$()/" so it is not read as a comment.
  const value = (key) => (new RegExp(`^${key} = (.*)$`, 'm').exec(runtime)?.[1] ?? fail(`${key} missing from devbox.runtime.xcconfig`)).replaceAll('/$()/', '//');
  const siteUrl = value('NEXT_PUBLIC_SITE_URL');
  const wsUrl = value('NEXT_PUBLIC_WS_URL');
  const signing = ensureAndroidCredentials();
  execFileSync('./gradlew', ['assembleRelease', '-q'], {
    cwd: path.join(APP_ROOT, 'rn/android'),
    env: {
      ...process.env,
      NEXT_PUBLIC_SITE_URL: siteUrl,
      NEXT_PUBLIC_WS_URL: wsUrl,
      NEXT_PUBLIC_API_NAMESPACE: ANDROID_RN_API_NAMESPACE,
      RN_QA_BRIDGE_ENABLED: '1',
      RN_ADMOB_BANNER_UNIT_ID_ANDROID: ADMOB_TEST_BANNER_UNIT_ANDROID,
    },
    stdio: ['ignore', 'inherit', 'inherit'],
  });
  if (!fs.existsSync(QA_APK_PATH)) fail(`gradle finished but ${QA_APK_PATH} is missing`);
  // BuildConfig strings are compiled into the dex; check the devbox URL and test unit made it in.
  const dex = execFileSync('unzip', ['-p', QA_APK_PATH, 'classes*.dex'], { maxBuffer: 512 * 1024 * 1024 }).toString('latin1');
  // An http devbox needs cleartext allowed, or the WebView shows net::ERR_CLEARTEXT_NOT_PERMITTED.
  let cleartext = null;
  const buildTools = path.join(process.env.ANDROID_HOME || path.join(process.env.HOME || '', 'Library/Android/sdk'), 'build-tools');
  const aapt = fs.existsSync(buildTools)
    ? fs.readdirSync(buildTools).sort().reverse().map((version) => path.join(buildTools, version, 'aapt')).find((candidate) => fs.existsSync(candidate))
    : null;
  if (aapt) {
    const manifest = execFileSync(aapt, ['dump', 'xmltree', QA_APK_PATH, 'AndroidManifest.xml'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    cleartext = /usesCleartextTraffic\([^)]*\)=\(type 0x12\)0xffffffff/.test(manifest);
  }
  const built = {
    apk: QA_APK_PATH,
    siteUrl,
    wsUrl,
    webUrlInApk: dex.includes(siteUrl),
    testBannerUnit: dex.includes(ADMOB_TEST_BANNER_UNIT_ANDROID),
    cleartext,
    signing,
  };
  const cleartextOk = !siteUrl.startsWith('http://') || cleartext !== false;
  if (!built.webUrlInApk || !built.testBannerUnit || !cleartextOk) fail(`Android QA build is misconfigured: ${JSON.stringify(built)}`);
  console.log(JSON.stringify(built));
}

// adb install -r keeps the app's data. A build signed with another key cannot replace it;
// --fresh uninstalls first, which wipes the app's local data (login, onboarding).
function cmdInstallAndroid(args) {
  if (!fs.existsSync(QA_APK_PATH)) fail('No Android QA build yet; run `node scripts/qa-agent-device.mjs build --android` first.');
  const serial = resolveAndroidSerial(readOption(args, '--serial'));
  const fresh = args.includes('--fresh');
  if (fresh) {
    try {
      adb(serial, 'uninstall', BUNDLE_ID);
    } catch {
      // Not installed.
    }
  }
  try {
    adb(serial, 'install', '-r', QA_APK_PATH);
  } catch (error) {
    const output = `${error.stdout ?? ''}${error.stderr ?? ''}`;
    if (/INSTALL_FAILED_UPDATE_INCOMPATIBLE|signatures do not match/i.test(output)) {
      fail('The installed app is signed with a different key. Rerun with --fresh (wipes the app data) after confirming with the owner.');
    }
    throw error;
  }
  adb(serial, 'shell', 'monkey', '-p', BUNDLE_ID, '-c', 'android.intent.category.LAUNCHER', '1');
  console.log(JSON.stringify({ installed: QA_APK_PATH, udid: serial, target: 'android', fresh }));
}

// Installs the QA build and launches it. --fresh uninstalls first, which wipes the app's local data.
function cmdInstall(args) {
  if (args.includes('--android')) return cmdInstallAndroid(args);
  const sim = args.includes('--sim');
  const appPath = qaAppPath(sim);
  if (!fs.existsSync(appPath)) fail(`No QA build yet; run \`node scripts/qa-agent-device.mjs build${sim ? ' --sim' : ''}\` first.`);
  const fresh = args.includes('--fresh');
  if (sim) {
    const udid = ensureSimulator();
    if (fresh) {
      try {
        execFileSync('xcrun', ['simctl', 'uninstall', udid, BUNDLE_ID], { stdio: 'ignore' });
      } catch {
        // Not installed.
      }
    }
    execFileSync('xcrun', ['simctl', 'install', udid, appPath], { stdio: 'ignore' });
    for (const service of ['microphone', 'photos']) {
      try {
        execFileSync('xcrun', ['simctl', 'privacy', udid, 'grant', service, BUNDLE_ID], { stdio: 'ignore' });
      } catch {
        // Older runtimes lack some services.
      }
    }
    execFileSync('xcrun', ['simctl', 'launch', udid, BUNDLE_ID], { stdio: 'ignore' });
    console.log(JSON.stringify({ installed: appPath, udid, target: 'simulator', fresh }));
    return;
  }
  const udid = resolveUdid(readOption(args, '--udid'));
  if (fresh) {
    try {
      execFileSync('xcrun', ['devicectl', 'device', 'uninstall', 'app', '--device', udid, BUNDLE_ID], { stdio: 'ignore' });
    } catch {
      // Not installed.
    }
  }
  execFileSync('xcrun', ['devicectl', 'device', 'install', 'app', '--device', udid, appPath], { stdio: 'ignore' });
  execFileSync('xcrun', ['devicectl', 'device', 'process', 'launch', '--device', udid, BUNDLE_ID], { stdio: 'ignore' });
  console.log(JSON.stringify({ installed: appPath, udid, target: 'phone', fresh }));
}

async function main() {
  const [command = 'help', ...args] = process.argv.slice(2);
  switch (command) {
    case 'devices': console.log(JSON.stringify({ ios: listDevices(), android: listAndroidDevices() }, null, 2)); break;
    case 'back': {
      const state = requireSession();
      if (state.platform !== 'android') fail('back is the Android system back; on iOS swipe from x=2.');
      await appium(state, 'POST', '/session/:session/back', {});
      console.log(JSON.stringify({ back: true }));
      break;
    }
    case 'servers': await cmdServers(); break;
    case 'build': cmdBuild(args); break;
    case 'prepare-wda': cmdPrepareWda(); break;
    case 'install': cmdInstall(args); break;
    case 'start': await cmdStart(args); break;
    case 'screenshot': await cmdScreenshot(args); break;
    case 'tap': await cmdTap(args); break;
    case 'long-press': await cmdTap(args.slice(0, 2), Number(args[2]) || 800); break;
    case 'swipe': await cmdSwipe(args); break;
    case 'type': await cmdType(args); break;
    case 'alert': await cmdAlert(args); break;
    case 'snapshot': await cmdEval(SNAPSHOT_EXPRESSION); break;
    case 'eval': await cmdEval(args.join(' ')); break;
    case 'app': await cmdApp(args); break;
    case 'logs': await cmdLogs(args); break;
    case 'stop': await cmdStop(); break;
    default:
      console.log(fs.readFileSync(new URL(import.meta.url), 'utf8').split('\n').slice(1, 26).join('\n'));
      process.exitCode = command === 'help' ? 0 : 2;
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
