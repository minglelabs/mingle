#!/usr/bin/env node
// Drives the Mingle app on a connected physical iPhone for the /qa skill, through Appium
// XCUITest (the same real-device path as scripts/mobile-ui-qa.mjs). One Appium server and
// one session stay open across calls, so each command is a quick WebDriver request.
//
//   node scripts/qa-agent-device.mjs devices                    # connected iPhones (hardware UDIDs)
//   node scripts/qa-agent-device.mjs servers                    # is this worktree's devbox reachable from the phone?
//   node scripts/qa-agent-device.mjs install [--udid U]         # build + install + launch the QA-bridge app (devbox mobile)
//   node scripts/qa-agent-device.mjs start [--udid U]           # start Appium + a session on the phone
//   node scripts/qa-agent-device.mjs screenshot <file.png>
//   node scripts/qa-agent-device.mjs tap <x> <y>
//   node scripts/qa-agent-device.mjs long-press <x> <y> [ms]
//   node scripts/qa-agent-device.mjs swipe <x1> <y1> <x2> <y2> [ms]   # iOS back: start at x=2
//   node scripts/qa-agent-device.mjs type <text>                # into the focused field
//   node scripts/qa-agent-device.mjs alert <accept|dismiss|text>
//   node scripts/qa-agent-device.mjs snapshot                   # WebView QA bridge state
//   node scripts/qa-agent-device.mjs eval '<expression>'        # synchronous, JSON-serialisable
//   node scripts/qa-agent-device.mjs app <launch|terminate|state>
//   node scripts/qa-agent-device.mjs logs [--grep TEXT]         # device syslog lines since the last call
//   node scripts/qa-agent-device.mjs stop                       # end the session and the Appium server
//
// Coordinates are in points (the phone's logical resolution, printed by `start` and `screenshot`).
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

// The XCUITest driver lives in an APPIUM_HOME that scripts/mobile-ui-qa.mjs maintains.
// A worktree usually has none, so fall back to the main checkout's.
function resolveAppiumHome() {
  const candidates = [process.env.MINGLE_QA_APPIUM_HOME, path.join(APP_ROOT, '.appium'), path.join(mainWorktreeAppRoot(), '.appium')];
  const found = candidates.find((candidate) => candidate && fs.existsSync(path.join(candidate, 'node_modules/appium-xcuitest-driver')));
  if (!found) fail('No Appium home with the XCUITest driver. Run `pnpm test:qa:ui:ios` once in the main checkout, or set MINGLE_QA_APPIUM_HOME.');
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

function resolveUdid(requested) {
  if (requested) return requested;
  const state = readState();
  if (state?.udid) return state.udid;
  const devices = listDevices();
  if (devices.length === 0) fail('No iPhone connected over USB (idevice_id -l is empty).');
  if (devices.length > 1) fail(`Several iPhones are connected (${devices.map((device) => device.udid).join(', ')}); pass --udid.`);
  return devices[0].udid;
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

async function startAppium(port) {
  if (await isAppiumUp(port)) return null;
  fs.mkdirSync(LOCAL_DIR, { recursive: true });
  const nodeBin = fs.existsSync(APPLE_SILICON_NODE22_BIN) ? APPLE_SILICON_NODE22_BIN : process.execPath;
  const log = fs.openSync(APPIUM_LOG_PATH, 'a');
  const child = spawn(nodeBin, [resolveAppiumBin(), '--address', '127.0.0.1', '--port', String(port), '--log-level', 'info'], {
    env: { ...process.env, APPIUM_HOME: resolveAppiumHome() },
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

async function windowSize(state) {
  const rect = await appium(state, 'GET', '/session/:session/window/rect');
  return { width: rect.width, height: rect.height };
}

async function cmdStart(args) {
  const udid = resolveUdid(readOption(args, '--udid'));
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
    'appium:xcodeOrgId': DEFAULT_TEAM_ID,
    'appium:xcodeSigningId': process.env.MINGLE_UI_QA_IOS_XCODE_SIGNING_ID || 'Apple Development',
    'appium:includeSafariInWebviews': false,
    'appium:webviewConnectTimeout': 20_000,
    'appium:wdaLaunchTimeout': 180_000,
    'appium:wdaConnectionTimeout': 180_000,
  };
  if (process.env.MINGLE_UI_QA_IOS_UPDATED_WDA_BUNDLE_ID) {
    capabilities['appium:updatedWDABundleId'] = process.env.MINGLE_UI_QA_IOS_UPDATED_WDA_BUNDLE_ID;
  }
  const response = await fetch(`http://127.0.0.1:${port}/session`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ capabilities: { alwaysMatch: capabilities, firstMatch: [{}] } }),
  });
  const payload = await response.json();
  if (!response.ok) fail(`Session start failed: ${payload?.value?.message || JSON.stringify(payload).slice(0, 500)}\nAppium log: ${APPIUM_LOG_PATH}`);
  const state = { udid, port, sessionId: payload.value.sessionId, appiumPid: appiumPid ?? previous?.appiumPid ?? null, logCursor: new Date().toISOString() };
  writeState(state);
  console.log(JSON.stringify({ udid, sessionId: state.sessionId, points: await windowSize(state) }));
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
  await performPointer([
    { type: 'pointerMove', duration: 0, x: Math.round(x), y: Math.round(y) },
    { type: 'pointerDown', button: 0 },
    { type: 'pause', duration: holdMs },
    { type: 'pointerUp', button: 0 },
  ]);
  console.log(JSON.stringify({ tapped: [x, y], holdMs }));
}

async function cmdSwipe(args) {
  const [x1, y1, x2, y2, ms = 350] = args.map(Number);
  if (![x1, y1, x2, y2].every(Number.isFinite)) fail('swipe needs x1 y1 x2 y2 [ms]');
  await performPointer([
    { type: 'pointerMove', duration: 0, x: Math.round(x1), y: Math.round(y1) },
    { type: 'pointerDown', button: 0 },
    { type: 'pause', duration: 50 },
    { type: 'pointerMove', duration: Math.round(ms), x: Math.round(x2), y: Math.round(y2) },
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

async function cmdAlert(args) {
  const state = requireSession();
  const action = args[0] || 'text';
  if (action === 'text') {
    console.log(JSON.stringify({ alert: await appium(state, 'GET', '/session/:session/alert/text').catch(() => null) }));
    return;
  }
  if (!['accept', 'dismiss'].includes(action)) fail('alert takes accept, dismiss or text');
  await appium(state, 'POST', `/session/:session/alert/${action}`, {});
  console.log(JSON.stringify({ alert: action }));
}

async function inWebView(state, run) {
  const contexts = await appium(state, 'GET', '/session/:session/contexts');
  const names = contexts.map((context) => (typeof context === 'string' ? context : context.id));
  const webview = names.filter((name) => name.startsWith('WEBVIEW')).pop() || fail(`No WebView context (got ${names.join(', ')}). Is the app in front, and built with the QA bridge?`);
  await appium(state, 'POST', '/session/:session/context', { name: webview });
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
  const value = await appium(state, 'POST', '/session/:session/execute/sync', { script: command, args: [{ bundleId: BUNDLE_ID }] });
  console.log(JSON.stringify({ app: action, value }));
}

async function cmdLogs(args) {
  const state = requireSession();
  const grep = readOption(args, '--grep');
  const entries = await appium(state, 'POST', '/session/:session/se/log', { type: 'syslog' })
    .catch(() => appium(state, 'POST', '/session/:session/log', { type: 'syslog' }));
  const lines = (entries || [])
    .map((entry) => `${new Date(entry.timestamp).toISOString()} ${entry.message}`)
    .filter((line) => line.includes('mingle') || line.includes('Mingle'))
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

async function cmdServers() {
  const env = devboxEnv();
  const host = env.DEVBOX_LOCAL_HOST || '127.0.0.1';
  const webUrl = `http://${host}:${env.DEVBOX_WEB_PORT}`;
  let webStatus = 0;
  try {
    webStatus = (await fetch(`${webUrl}/`, { redirect: 'manual', signal: AbortSignal.timeout(10_000) })).status;
  } catch {
    webStatus = 0;
  }
  let sttListening = false;
  try {
    execFileSync('nc', ['-z', host, env.DEVBOX_STT_PORT], { stdio: 'ignore' });
    sttListening = true;
  } catch {
    sttListening = false;
  }
  const reachableFromPhone = host !== '127.0.0.1' && host !== 'localhost';
  const ok = webStatus >= 200 && webStatus < 400 && sttListening && reachableFromPhone;
  console.log(JSON.stringify({ host, webUrl, webStatus, sttPort: Number(env.DEVBOX_STT_PORT), sttListening, reachableFromPhone, ok }));
  if (!ok) process.exitCode = 1;
}

function cmdInstall(args) {
  const udid = resolveUdid(readOption(args, '--udid'));
  const env = devboxEnv();
  if (!env.DEVBOX_LOCAL_HOST || env.DEVBOX_LOCAL_HOST === '127.0.0.1') {
    fail('devbox points at 127.0.0.1, which the phone cannot reach. Run `scripts/devbox profile --profile local --host <Mac LAN IP>` and restart devbox first.');
  }
  // Release build with the QA bridge: the JS bundle is embedded, so no Metro server is needed,
  // and the WebView is inspectable for snapshots.
  execFileSync(path.join(REPO_ROOT, 'scripts/devbox'), ['mobile', '--platform', 'ios', '--ios-udid', udid, '--qa-bridge'], {
    cwd: REPO_ROOT,
    stdio: 'inherit',
  });
}

async function main() {
  const [command = 'help', ...args] = process.argv.slice(2);
  switch (command) {
    case 'devices': console.log(JSON.stringify(listDevices(), null, 2)); break;
    case 'servers': await cmdServers(); break;
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
      console.log(fs.readFileSync(new URL(import.meta.url), 'utf8').split('\n').slice(1, 22).join('\n'));
      process.exitCode = command === 'help' ? 0 : 2;
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
