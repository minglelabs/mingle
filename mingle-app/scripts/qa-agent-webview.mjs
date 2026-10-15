#!/usr/bin/env node
// Reads state from the Mingle app's WKWebView on a booted iOS Simulator through the
// Web Inspector socket, without starting Appium or WebDriverAgent. Used by the /qa skill.
//
//   node scripts/qa-agent-webview.mjs pages    [--udid UDID] [--bundle-id ID]
//   node scripts/qa-agent-webview.mjs snapshot [--udid UDID] [--bundle-id ID] [--page URL_PART]
//   node scripts/qa-agent-webview.mjs eval     [--udid UDID] [--bundle-id ID] [--page URL_PART] '<expression>'
//
// The WebView is inspectable only in Debug builds or builds made with the QA bridge on
// (NEXT_PUBLIC_RN_QA_BRIDGE_ENABLED = 1). `--bundle-id com.apple.mobilesafari` also works,
// which is handy for checking the helper itself.
//
// `eval` takes a synchronous expression; its value must be JSON-serialisable.
// The Web Inspector client is appium-remote-debugger from the Appium install that
// scripts/mobile-ui-qa.mjs maintains under mingle-app/.appium (this checkout first,
// then the main worktree). Set MINGLE_QA_REMOTE_DEBUGGER_PATH to override.

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import process from 'node:process';

const DEFAULT_BUNDLE_ID = 'com.minglelabs.mingle.rn';
const APP_ROOT = path.resolve(import.meta.dirname, '..');
const REMOTE_DEBUGGER_SUBPATH = '.appium/node_modules/appium-xcuitest-driver/node_modules/appium-remote-debugger';
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

function parseArgs(argv) {
  const options = { command: argv[0] || 'snapshot', udid: '', bundleId: DEFAULT_BUNDLE_ID, page: '', expression: '', verbose: false };
  for (let index = 1; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--udid') options.udid = argv[++index] || '';
    else if (token === '--bundle-id') options.bundleId = argv[++index] || DEFAULT_BUNDLE_ID;
    else if (token === '--page') options.page = argv[++index] || '';
    else if (token === '--verbose') options.verbose = true;
    else options.expression = options.expression ? `${options.expression} ${token}` : token;
  }
  return options;
}

function resolveRemoteDebuggerPath() {
  const candidates = [process.env.MINGLE_QA_REMOTE_DEBUGGER_PATH, path.join(APP_ROOT, REMOTE_DEBUGGER_SUBPATH)];
  try {
    const porcelain = execFileSync('git', ['worktree', 'list', '--porcelain'], { cwd: APP_ROOT, encoding: 'utf8' });
    const mainWorktree = /^worktree (.+)$/m.exec(porcelain)?.[1];
    if (mainWorktree) candidates.push(path.join(mainWorktree, 'mingle-app', REMOTE_DEBUGGER_SUBPATH));
  } catch {
    // Not a git checkout; rely on the other candidates.
  }
  const found = candidates.find((candidate) => candidate && fs.existsSync(path.join(candidate, 'package.json')));
  if (!found) {
    throw new Error('appium-remote-debugger not found. Run `pnpm test:qa:ui:ios` once in the main checkout to install Appium, or set MINGLE_QA_REMOTE_DEBUGGER_PATH.');
  }
  return found;
}

// Returns the target simulator's UDID and iOS version (the Web Inspector framing depends on it).
function resolveBootedSimulator(requested) {
  const { devices } = JSON.parse(execFileSync('xcrun', ['simctl', 'list', 'devices', 'booted', '-j'], { encoding: 'utf8' }));
  const booted = Object.entries(devices).flatMap(([runtime, list]) => list
    .filter((device) => device.state === 'Booted')
    .map((device) => ({ udid: device.udid, platformVersion: /iOS-(\d+)-(\d+)/.exec(runtime)?.slice(1).join('.') || '' })));
  if (requested) {
    const match = booted.find((device) => device.udid === requested);
    if (!match) throw new Error(`simulator ${requested} is not booted`);
    return match;
  }
  if (booted.length === 0) throw new Error('no booted simulator; boot one or pass --udid');
  if (booted.length > 1) throw new Error(`several simulators are booted (${booted.map((device) => device.udid).join(', ')}); pass --udid`);
  return booted[0];
}

// Same lookup as appium-ios-simulator: launchd_sim records are grouped by PID per simulator.
function resolveWebInspectorSocket(udid) {
  const stdout = execFileSync('lsof', ['-aUc', 'launchd_sim'], { encoding: 'utf8' });
  const pid = new RegExp(`([0-9]{1,5}).+${udid}`).exec(stdout)?.[1];
  const socketPath = pid ? new RegExp(`${pid}.+\\s+(\\S+com\\.apple\\.webinspectord_sim\\.socket)`).exec(stdout)?.[1] : '';
  if (!socketPath) throw new Error(`Web Inspector socket not found for simulator ${udid}; is it booted?`);
  return socketPath;
}

function createLogger(verbose) {
  const write = (level) => (...args) => {
    if (verbose || level === 'error') console.error(`[remote-debugger:${level}]`, ...args);
  };
  const logger = {};
  for (const level of ['debug', 'info', 'warn', 'error', 'verbose', 'silly', 'http']) logger[level] = write(level);
  logger.errorWithException = write('error');
  logger.errorAndThrow = (message) => { throw new Error(message); };
  return logger;
}

function choosePage(pages, urlPart) {
  const usable = pages.filter((page) => page.url && page.url !== 'about:blank');
  if (urlPart) return usable.find((page) => page.url.includes(urlPart)) || null;
  return usable.find((page) => page.isKey) || usable[0] || null;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (!['pages', 'snapshot', 'eval'].includes(options.command)) {
    throw new Error(`unknown command: ${options.command} (expected pages, snapshot or eval)`);
  }
  if (options.command === 'eval' && !options.expression) throw new Error('eval needs an expression');

  const require = createRequire(import.meta.url);
  const { createRemoteDebugger } = require(resolveRemoteDebuggerPath());
  const { udid, platformVersion } = resolveBootedSimulator(options.udid);
  const remote = createRemoteDebugger({
    udid,
    platformVersion,
    bundleId: options.bundleId,
    isSafari: options.bundleId === 'com.apple.mobilesafari',
    socketPath: resolveWebInspectorSocket(udid),
    pageLoadMs: 1000,
    garbageCollectOnExecute: false,
    log: createLogger(options.verbose),
  }, false);

  try {
    await remote.connect(5000);
    const pages = await remote.selectApp(undefined, 10, true);
    if (options.command === 'pages') {
      console.log(JSON.stringify({ udid, bundleId: options.bundleId, pages }, null, 2));
      return;
    }
    const page = choosePage(pages, options.page);
    if (!page) throw new Error(`no inspectable page for ${options.bundleId}. Is the app in the foreground, and was it built with the QA bridge?`);
    const [appIdKey, pageIdKey] = String(page.id).split('.').map((part) => Number.parseInt(part, 10));
    await remote.selectPage(appIdKey, pageIdKey, true);
    const expression = options.command === 'snapshot' ? SNAPSHOT_EXPRESSION : options.expression;
    const raw = await remote.execute(`JSON.stringify({ mingleQaResult: (${expression}) })`);
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    console.log(JSON.stringify({ udid, page: { url: page.url, title: page.title }, result: parsed?.mingleQaResult ?? null }, null, 2));
  } finally {
    await remote.disconnect().catch(() => {});
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
