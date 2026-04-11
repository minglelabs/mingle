#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { spawn } from 'node:child_process';
import { X509Certificate } from 'node:crypto';
import os from 'node:os';
import process from 'node:process';

import { remote } from 'webdriverio';

const APP_PACKAGE = 'com.minglelabs.mingle.rn';
const APP_ACTIVITY = '.MainActivity';
const IOS_BUNDLE_ID = 'com.minglelabs.mingle.rn';
const DEFAULT_APPIUM_PORT = 4723;
const DEFAULT_ANDROID_DEVICE_METRO_PORT = 8081;
const DEFAULT_ANDROID_HOST_METRO_PORT = 9558;
const DEFAULT_ANDROID_WEB_PORT = 4558;
const DEFAULT_IOS_HOST_METRO_PORT = 9558;
const DEFAULT_IOS_SIMULATOR_PACKAGER_HOST = '127.0.0.1';
const APP_ROOT = path.resolve(import.meta.dirname, '..');
const REPORT_ROOT = path.resolve(import.meta.dirname, '../qa/mobile-ui/reports');
const APPIUM_HOME = path.resolve(import.meta.dirname, '../.appium');
const APPIUM_BIN = path.resolve(APP_ROOT, 'node_modules/appium/index.js');
const WDA_PROJECT_PATH = path.resolve(
  APP_ROOT,
  '.appium/node_modules/appium-xcuitest-driver/node_modules/appium-webdriveragent/WebDriverAgent.xcodeproj',
);
const APPIUM_CLI_CWD = path.resolve(process.env.TMPDIR || '/tmp', 'mingle-appium-cli');
const CHROMEDRIVER_DIR = path.join(APPIUM_HOME, 'chromedrivers');
const CHROMEDRIVER_MAPPING_FILE = path.join(APPIUM_HOME, 'chromedriver-mapping.json');
const DEFAULT_IOS_LOCALE = 'ko_KR';
const DEFAULT_IOS_LANGUAGE = 'ko';
const APPLE_SILICON_NODE22_BIN = '/opt/homebrew/opt/node@22/bin/node';
const APPIUM_DRIVER_PACKAGES = {
  uiautomator2: 'uiautomator2@7.1.2',
  xcuitest: 'xcuitest@10.43.1',
};
const KEYBOARD_OPEN_SELECTOR = '[data-qa="live-demo-keyboard-open"], [data-qa="live-demo-keyboard-toggle"][aria-label="텍스트 입력 열기"]';
const KEYBOARD_CLOSE_SELECTOR = '[data-qa="live-demo-keyboard-close"], [data-qa="live-demo-keyboard-toggle"][aria-label="텍스트 입력 닫기"]';

function parseArgs(argv) {
  const options = {
    platform: 'all',
    androidSerial: process.env.MINGLE_UI_QA_ANDROID_SERIAL || '',
    iosUdid: process.env.MINGLE_UI_QA_IOS_UDID || '',
    iosLocale: process.env.MINGLE_UI_QA_IOS_LOCALE || DEFAULT_IOS_LOCALE,
    iosLanguage: process.env.MINGLE_UI_QA_IOS_LANGUAGE || DEFAULT_IOS_LANGUAGE,
    iosXcodeOrgId: process.env.MINGLE_UI_QA_IOS_XCODE_ORG_ID || '',
    iosXcodeSigningId: process.env.MINGLE_UI_QA_IOS_XCODE_SIGNING_ID || '',
    iosUpdatedWdaBundleId: process.env.MINGLE_UI_QA_IOS_UPDATED_WDA_BUNDLE_ID || '',
    iosDisableReservedIdentifierWarnings: process.env.MINGLE_UI_QA_IOS_DISABLE_RESERVED_IDENTIFIER_WARNINGS !== '0',
    iosShowXcodeLog: process.env.MINGLE_UI_QA_IOS_SHOW_XCODE_LOG === '1',
    iosWdaLocalPort: Number(process.env.MINGLE_UI_QA_IOS_WDA_LOCAL_PORT || 0),
    appiumPort: Number(process.env.MINGLE_UI_QA_APPIUM_PORT || DEFAULT_APPIUM_PORT),
    reuseAppium: process.env.MINGLE_UI_QA_REUSE_APPIUM === '1',
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    const next = argv[index + 1];
    switch (token) {
      case '--platform':
        options.platform = next || options.platform;
        index += 1;
        break;
      case '--android-serial':
        options.androidSerial = next || '';
        index += 1;
        break;
      case '--ios-udid':
        options.iosUdid = next || '';
        index += 1;
        break;
      case '--ios-locale':
        options.iosLocale = next || options.iosLocale;
        index += 1;
        break;
      case '--ios-language':
        options.iosLanguage = next || options.iosLanguage;
        index += 1;
        break;
      case '--appium-port':
        options.appiumPort = Number(next || options.appiumPort);
        index += 1;
        break;
      case '--reuse-appium':
        options.reuseAppium = true;
        break;
      default:
        break;
    }
  }

  return options;
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
  if (version.major === 20) {
    return version.minor > 19 || (version.minor === 19 && version.patch >= 0);
  }
  return false;
}

let cachedAppiumNodeBinary = '';

async function resolveAppiumNodeBinary() {
  if (cachedAppiumNodeBinary) return cachedAppiumNodeBinary;

  const candidates = [
    process.execPath,
    process.env.MINGLE_UI_QA_APPIUM_NODE_BINARY || '',
    APPLE_SILICON_NODE22_BIN,
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (!(await pathExists(candidate))) continue;
    try {
      const versionCheck = await runCommand(candidate, ['-v']);
      if (isAppium3CompatibleNode(versionCheck.stdout.trim())) {
        cachedAppiumNodeBinary = candidate;
        return cachedAppiumNodeBinary;
      }
    } catch {
      continue;
    }
  }

  throw new Error(
    `No Node.js runtime compatible with Appium 3 was found. Current process uses ${process.version}; install Node 22.12+ or set MINGLE_UI_QA_APPIUM_NODE_BINARY.`,
  );
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

async function runAppiumCommand(args) {
  await ensureDir(APPIUM_CLI_CWD);
  const nodeBinary = await resolveAppiumNodeBinary();
  return await runCommand(nodeBinary, [APPIUM_BIN, ...args], { cwd: APPIUM_CLI_CWD });
}

async function pathExists(target) {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

async function resolveAndroidSdkRoot() {
  const candidates = [
    process.env.ANDROID_HOME,
    process.env.ANDROID_SDK_ROOT,
    path.join(process.env.HOME || '', 'Library/Android/sdk'),
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (await pathExists(candidate)) return candidate;
  }

  return '';
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

async function ensureAppiumDriver(driverName) {
  const listed = await runAppiumCommand(['driver', 'list', '--installed', '--json']);
  const installedDrivers = JSON.parse(listed.stdout || '{}');
  const packageName = APPIUM_DRIVER_PACKAGES[driverName] || driverName;
  const [, expectedVersion = ''] = packageName.split('@');
  const installedDriver = installedDrivers[driverName];

  if (installedDriver?.installed && (!expectedVersion || installedDriver.version === expectedVersion)) {
    return;
  }

  if (installedDriver?.installed) {
    await runAppiumCommand(['driver', 'uninstall', driverName]);
  }

  if (APPIUM_DRIVER_PACKAGES[driverName]) {
    await runAppiumCommand([
      'driver',
      'install',
      packageName,
    ]);
    return;
  }

  await runAppiumCommand(['driver', 'install', driverName]);
}

async function isAppiumReady(port) {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/status`);
    return response.ok;
  } catch {
    return false;
  }
}

async function startAppiumServer(port) {
  if (await isAppiumReady(port)) return null;
  await ensureDir(APPIUM_CLI_CWD);
  const androidSdkRoot = await resolveAndroidSdkRoot();
  const nodeBinary = await resolveAppiumNodeBinary();

  const child = spawn(nodeBinary, [
    APPIUM_BIN,
    'server',
    '-p',
    String(port),
    '--session-override',
    '--allow-insecure',
    '*:chromedriver_autodownload',
  ], {
    cwd: APPIUM_CLI_CWD,
    env: {
      ...process.env,
      APPIUM_HOME,
      ...(androidSdkRoot ? {
        ANDROID_HOME: androidSdkRoot,
        ANDROID_SDK_ROOT: androidSdkRoot,
      } : {}),
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

async function findInstalledAndroidSerial() {
  const result = await runCommand('adb', ['devices', '-l']);
  const serialLine = result.stdout
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line && !line.startsWith('List of devices attached') && /\bdevice\b/.test(line));
  return serialLine ? serialLine.split(/\s+/)[0] : '';
}

async function ensureAdbReverse(serial, devicePort, hostPort) {
  await runCommand('adb', [
    '-s',
    serial,
    'reverse',
    `tcp:${devicePort}`,
    `tcp:${hostPort}`,
  ]);
}

async function prepareAndroidDevice(serial) {
  const metroHostPort = Number(process.env.MINGLE_UI_QA_ANDROID_METRO_HOST_PORT || DEFAULT_ANDROID_HOST_METRO_PORT);
  const webHostPort = Number(process.env.MINGLE_UI_QA_ANDROID_WEB_HOST_PORT || DEFAULT_ANDROID_WEB_PORT);

  await ensureAdbReverse(serial, DEFAULT_ANDROID_DEVICE_METRO_PORT, metroHostPort);
  await ensureAdbReverse(serial, DEFAULT_ANDROID_WEB_PORT, webHostPort);
}

async function createAndroidSession(options) {
  const serial = options.androidSerial || await findInstalledAndroidSerial();
  assert(serial, 'No Android device was detected for the mobile UI QA run.');
  await ensureDir(CHROMEDRIVER_DIR);
  await prepareAndroidDevice(serial);

  const driver = await remote({
    hostname: '127.0.0.1',
    port: options.appiumPort,
    path: '/',
    capabilities: {
      platformName: 'Android',
      'appium:automationName': 'UiAutomator2',
      'appium:deviceName': serial,
      'appium:udid': serial,
      'appium:appPackage': APP_PACKAGE,
      'appium:appActivity': APP_ACTIVITY,
      'appium:noReset': true,
      'appium:newCommandTimeout': 180,
      'appium:chromedriverExecutableDir': CHROMEDRIVER_DIR,
      'appium:chromedriverChromeMappingFile': CHROMEDRIVER_MAPPING_FILE,
    },
  });

  return { driver, deviceLabel: `android:${serial}` };
}

async function createIosSession(options) {
  assert(options.iosUdid, 'An iOS simulator/device UDID is required for iOS mobile UI QA.');

  const iosRealDevice = !(await isIosSimulator(options.iosUdid));
  const iosXcodeConfigFile = iosRealDevice
    ? await ensureIosRealDeviceXcodeConfig(options)
    : '';

  const capabilities = {
    platformName: 'iOS',
    'appium:automationName': 'XCUITest',
    'appium:udid': options.iosUdid,
    'appium:bundleId': IOS_BUNDLE_ID,
    'appium:noReset': true,
    'appium:newCommandTimeout': 180,
    'appium:language': options.iosLanguage,
    'appium:locale': options.iosLocale,
    'appium:includeSafariInWebviews': true,
  };

  if (options.iosXcodeOrgId) {
    capabilities['appium:xcodeOrgId'] = options.iosXcodeOrgId;
  }

  if (options.iosXcodeSigningId) {
    capabilities['appium:xcodeSigningId'] = options.iosXcodeSigningId;
  }

  if (options.iosUpdatedWdaBundleId) {
    capabilities['appium:updatedWDABundleId'] = options.iosUpdatedWdaBundleId;
  }

  if (iosXcodeConfigFile) {
    capabilities['appium:xcodeConfigFile'] = iosXcodeConfigFile;
  }

  if (options.iosShowXcodeLog) {
    capabilities['appium:showXcodeLog'] = true;
  }

  if (options.iosWdaLocalPort > 0) {
    capabilities['appium:wdaLocalPort'] = options.iosWdaLocalPort;
  }

  const driver = await remote({
    hostname: '127.0.0.1',
    port: options.appiumPort,
    path: '/',
    capabilities,
  });

  return { driver, deviceLabel: `ios:${options.iosUdid}` };
}

async function isIosSimulator(udid) {
  try {
    const result = await runCommand('xcrun', ['simctl', 'getenv', udid, 'SIMULATOR_UDID']);
    return result.stdout.trim() === udid;
  } catch {
    return false;
  }
}

async function prepareIosSimulator(udid) {
  const metroPort = String(Number(process.env.MINGLE_UI_QA_IOS_METRO_HOST_PORT || DEFAULT_IOS_HOST_METRO_PORT));
  const jsLocation = `${DEFAULT_IOS_SIMULATOR_PACKAGER_HOST}:${metroPort}`;

  try {
    await runCommand('xcrun', ['simctl', 'terminate', udid, IOS_BUNDLE_ID]);
  } catch {
    // Ignore if the app is not running.
  }

  await runCommand('xcrun', ['simctl', 'spawn', udid, 'defaults', 'write', IOS_BUNDLE_ID, 'RCT_jsLocation', jsLocation]);
  await runCommand('xcrun', ['simctl', 'spawn', udid, 'defaults', 'write', IOS_BUNDLE_ID, 'RCT_packager_scheme', 'http']);
  await runCommand('xcrun', ['simctl', 'launch', udid, IOS_BUNDLE_ID], {
    env: {
      SIMCTL_CHILD_RCT_METRO_PORT: metroPort,
    },
  });
  await delay(3000);
}

async function ensureIosRealDeviceXcodeConfig(options) {
  const lines = [];

  if (options.iosXcodeOrgId) {
    lines.push(`DEVELOPMENT_TEAM = ${options.iosXcodeOrgId}`);
  }

  if (options.iosXcodeSigningId) {
    lines.push(`CODE_SIGN_IDENTITY = ${options.iosXcodeSigningId}`);
  }

  if (options.iosDisableReservedIdentifierWarnings) {
    lines.push('WARNING_CFLAGS = $(inherited) -Wno-error=reserved-identifier -Wno-reserved-identifier');
  }

  if (lines.length === 0) {
    return '';
  }

  const configDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mingle-ios-wda-'));
  const configPath = path.join(configDir, 'wda-signing.xcconfig');
  await fs.writeFile(configPath, `${lines.join('\n')}\n`);
  return configPath;
}

function parseCodeSigningIdentityRefs(output) {
  return output
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/^\d+\)\s+(?<hash>[A-F0-9]{40})\s+"(?<label>Apple [^"]+)"(?:\s+\((?<status>[^)]+)\))?$/);
      if (!match?.groups?.label || !match.groups.hash) return null;
      return {
        hash: match.groups.hash,
        label: match.groups.label,
        status: match.groups.status || '',
      };
    })
    .filter(Boolean);
}

function parseTeamIdFromCertificateSubject(subject) {
  const match = subject.match(/^OU=(?<teamId>[A-Z0-9]{10})$/m);
  return match?.groups?.teamId || '';
}

function parseCodeSigningCertificates(output) {
  return [...output.matchAll(/SHA-1 hash:\s*(?<hash>[A-F0-9]{40})\n(?<pem>-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----)/g)]
    .map((match) => {
      const hash = match.groups?.hash || '';
      const pem = match.groups?.pem || '';
      if (!hash || !pem) return null;

      try {
        const certificate = new X509Certificate(pem);
        return {
          hash,
          label: certificate.subject.match(/^CN=(?<label>[^\n]+)$/m)?.groups?.label || '',
          subject: certificate.subject,
          teamId: parseTeamIdFromCertificateSubject(certificate.subject),
        };
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

async function listCodeSigningIdentities() {
  const [identityResult, certificateResult] = await Promise.all([
    runCommand('security', ['find-identity', '-v', '-p', 'codesigning']),
    runCommand('security', [
      'find-certificate',
      '-a',
      '-Z',
      '-p',
      '-c',
      'Apple Development',
      `${process.env.HOME}/Library/Keychains/login.keychain-db`,
    ]),
  ]);

  const identityRefs = parseCodeSigningIdentityRefs(identityResult.stdout);
  const certificatesByHash = new Map(
    parseCodeSigningCertificates(certificateResult.stdout).map((certificate) => [certificate.hash, certificate]),
  );

  return identityRefs.map((identityRef) => {
    const certificate = certificatesByHash.get(identityRef.hash);
    const fallbackTeamId = identityRef.label.match(/\((?<teamId>[A-Z0-9]{10})\)$/)?.groups?.teamId || '';

    return {
      hash: identityRef.hash,
      label: identityRef.label,
      status: identityRef.status,
      subject: certificate?.subject || '',
      teamId: certificate?.teamId || fallbackTeamId,
    };
  });
}

async function getIosDeviceListingState(udid) {
  const result = await runCommand('xcrun', ['xctrace', 'list', 'devices']);
  let section = '';

  for (const rawLine of result.stdout.split('\n')) {
    const line = rawLine.trim();
    if (line === '== Devices ==') {
      section = 'devices';
      continue;
    }
    if (line === '== Devices Offline ==') {
      section = 'offline';
      continue;
    }
    if (line.startsWith('==')) {
      section = '';
      continue;
    }
    if (!line.includes(udid)) continue;
    return {
      state: section || 'unknown',
      line,
    };
  }

  return {
    state: 'missing',
    line: '',
  };
}

async function buildIosRealDeviceWdaArgs(options) {
  const args = [
    '-project',
    WDA_PROJECT_PATH,
    '-scheme',
    'WebDriverAgentRunner',
    '-destination',
    `id=${options.iosUdid}`,
    '-allowProvisioningUpdates',
  ];

  const iosXcodeConfigFile = await ensureIosRealDeviceXcodeConfig(options);
  if (iosXcodeConfigFile) {
    args.push('-xcconfig', iosXcodeConfigFile);
  }

  if (options.iosXcodeOrgId) {
    args.push(`DEVELOPMENT_TEAM=${options.iosXcodeOrgId}`);
  }

  if (options.iosXcodeSigningId) {
    args.push(`CODE_SIGN_IDENTITY=${options.iosXcodeSigningId}`);
  }

  if (options.iosUpdatedWdaBundleId) {
    args.push(`PRODUCT_BUNDLE_IDENTIFIER=${options.iosUpdatedWdaBundleId}`);
  }

  args.push('test');
  return args;
}

function extractIosRealDeviceIssues(output) {
  const patterns = [
    /PLA Update available:[^\n]*/gi,
    /Provisioning profile "[^"]+" doesn't include signing certificate "[^"]+"\./gi,
    /No Account for Team "[^"]+"\./gi,
    /No profiles for '[^']+' were found:[^\n]*/gi,
    /No signing certificate "[^"]+" found:[^\n]*/gi,
    /conflicting provisioning settings\.[^\n]*/gi,
  ];

  return [...new Set(patterns.flatMap((pattern) => output.match(pattern) || []))];
}

async function collectIosRealDeviceDiagnostics(options, originalError) {
  const identities = await listCodeSigningIdentities();
  const deviceState = await getIosDeviceListingState(options.iosUdid);
  const matchingDevelopmentIdentities = identities.filter((identity) => {
    return identity.label.startsWith('Apple Development') && identity.teamId === options.iosXcodeOrgId;
  });

  const diagnostics = {
    udid: options.iosUdid,
    requestedTeamId: options.iosXcodeOrgId || null,
    requestedSigningId: options.iosXcodeSigningId || null,
    requestedUpdatedWdaBundleId: options.iosUpdatedWdaBundleId || null,
    deviceState,
    matchingDevelopmentIdentities,
    availableDevelopmentTeams: [...new Set(
      identities
        .filter((identity) => identity.label.startsWith('Apple Development'))
        .map((identity) => identity.teamId)
        .filter(Boolean),
    )],
    originalError: originalError instanceof Error ? originalError.message : String(originalError),
    wdaBuild: null,
    issues: [],
  };

  if (!options.iosXcodeOrgId) {
    diagnostics.issues.push('`MINGLE_UI_QA_IOS_XCODE_ORG_ID` is not set for the real-device run.');
  }

  if (!options.iosUpdatedWdaBundleId) {
    diagnostics.issues.push('`MINGLE_UI_QA_IOS_UPDATED_WDA_BUNDLE_ID` is not set for the real-device run.');
  }

  if (deviceState.state === 'offline') {
    diagnostics.issues.push(`The target iPhone appears offline to Xcode: ${deviceState.line}`);
  }

  if (options.iosXcodeOrgId && matchingDevelopmentIdentities.length === 0) {
    diagnostics.issues.push(
      `No Apple Development signing identity for team ${options.iosXcodeOrgId} is installed in the local keychain.`,
    );
  }

  const wdaArgs = await buildIosRealDeviceWdaArgs(options);
  diagnostics.wdaBuild = {
    command: 'xcodebuild',
    args: wdaArgs,
  };

  try {
    const result = await runCommand('xcodebuild', wdaArgs);
    diagnostics.wdaBuild.stdout = result.stdout;
    diagnostics.wdaBuild.stderr = result.stderr;
  } catch (error) {
    const output = error instanceof Error ? error.message : String(error);
    diagnostics.wdaBuild.error = output;
    diagnostics.issues.push(...extractIosRealDeviceIssues(output));
  }

  diagnostics.issues = [...new Set(diagnostics.issues)];
  return diagnostics;
}

function formatIosRealDeviceSessionError(error, diagnostics) {
  const messageLines = [
    error instanceof Error ? error.message : String(error),
    '',
    'Real-device WDA diagnostics:',
  ];

  for (const issue of diagnostics.issues) {
    messageLines.push(`- ${issue}`);
  }

  if (diagnostics.deviceState?.state && diagnostics.deviceState.state !== 'devices') {
    messageLines.push(`- Xcode device state: ${diagnostics.deviceState.state}`);
  }

  if (diagnostics.availableDevelopmentTeams.length > 0) {
    messageLines.push(`- Local Apple Development teams: ${diagnostics.availableDevelopmentTeams.join(', ')}`);
  }

  const wrapped = new Error(messageLines.join('\n'));
  wrapped.details = diagnostics;
  return wrapped;
}

async function switchToWebView(driver) {
  const platformName = String(driver.capabilities.platformName || '').toLowerCase();
  const isAndroid = platformName === 'android';

  return await waitFor(async () => {
    const contexts = await driver.getContexts({
      returnDetailedContexts: true,
      ...(isAndroid
        ? {
            filterByCurrentAndroidApp: true,
            returnAndroidDescriptionData: true,
            waitForWebviewMs: 5000,
            androidWebviewConnectTimeout: 15000,
            androidWebviewConnectionRetryTime: 1000,
          }
        : {}),
    });

    const exactTarget = contexts.find((context) => {
      if (!context || typeof context !== 'object') return false;
      if (!('id' in context) || typeof context.id !== 'string' || !context.id.startsWith('WEBVIEW')) {
        return false;
      }
      if (!('url' in context) || typeof context.url !== 'string') return false;
      if (!/qa=1/.test(context.url)) return false;
      if (!isAndroid) return true;
      return context.packageName === APP_PACKAGE;
    });

    const fallbackIosTarget = !isAndroid
      ? contexts.find((context) => {
          if (!context || typeof context !== 'object') return false;
          if (!('id' in context) || typeof context.id !== 'string' || !context.id.startsWith('WEBVIEW')) {
            return false;
          }
          if (!('bundleId' in context) || typeof context.bundleId !== 'string') return false;
          return context.bundleId === IOS_BUNDLE_ID;
        })
      : null;

    const target = exactTarget ?? fallbackIosTarget;
    if (!target) return null;

    if (isAndroid) {
      await driver.switchContext({
        appIdentifier: APP_PACKAGE,
        url: /qa=1/,
        androidWebviewConnectTimeout: 15000,
        androidWebviewConnectionRetryTime: 1000,
      });
    } else {
      await driver.switchContext({ url: /qa=1/ });
    }

    return target.id;
  }, 'a QA WebView context', 60000, 1000);
}

async function switchToNative(driver) {
  const contexts = await driver.getContexts();
  const nativeContext = contexts.find((context) => String(context) === 'NATIVE_APP');
  assert(nativeContext, 'NATIVE_APP context was not available.');
  await driver.switchContext(String(nativeContext));
}

async function dismissIosAlertIfPresent(driver, timeoutMs = 8000) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    try {
      await driver.dismissAlert();
      return true;
    } catch {
      await delay(1000);
    }
  }

  return false;
}

async function getPersistedUtteranceCount(driver) {
  return await driver.execute(() => {
    try {
      const raw = window.localStorage.getItem('mingle_demo_utterances');
      if (!raw) return 0;
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.length : 0;
    } catch {
      return 0;
    }
  });
}

async function getQaSnapshot(driver) {
  return await driver.execute(() => {
    return window.__MINGLE_QA__?.getLiveDemoSnapshot?.() ?? null;
  });
}

async function invokeQaMethod(driver, methodName, ...args) {
  return await driver.execute((nextMethodName, nextArgs) => {
    const qaWindow = window.__MINGLE_QA__;
    const candidate = qaWindow?.[nextMethodName];
    if (typeof candidate !== 'function') return null;
    return candidate(...nextArgs);
  }, methodName, args);
}

async function seedPersistedHistoryForQa(driver, count = 48) {
  return await invokeQaMethod(driver, 'seedPersistedHistory', count) ?? 0;
}

async function getQaDiagnostics(driver) {
  try {
    return await driver.execute(() => {
      const bodyText = document.body?.innerText || '';
      return {
        href: window.location.href,
        title: document.title,
        readyState: document.readyState,
        hasQaBridge: Boolean(window.__MINGLE_QA__?.getLiveDemoSnapshot),
        bodyPreview: bodyText.slice(0, 240),
      };
    });
  } catch (error) {
    return {
      diagnosticsError: error instanceof Error ? error.message : String(error),
    };
  }
}

async function waitForQaBridge(driver) {
  try {
    return await waitFor(async () => {
      const snapshot = await getQaSnapshot(driver);
      return snapshot && snapshot.routePathname ? snapshot : null;
    }, 'the QA bridge to become available', 45000, 1000);
  } catch (error) {
    if (error instanceof Error) {
      error.details = await getQaDiagnostics(driver);
    }
    throw error;
  }
}

async function ensureMenuOpen(driver) {
  const snapshot = await getQaSnapshot(driver);
  if (snapshot?.menuOpen) return snapshot;

  await invokeQaMethod(driver, 'setMenuOpen', true);
  try {
    return await waitFor(async () => {
      const next = await getQaSnapshot(driver);
      return next?.menuOpen ? next : null;
    }, 'the menu panel to open', 5000, 500);
  } catch {
    await clickQaElement(driver, '[data-qa="live-demo-menu-button"]', 'the menu button');
    return await waitFor(async () => {
      const next = await getQaSnapshot(driver);
      return next?.menuOpen ? next : null;
    }, 'the menu panel to open', 15000, 500);
  }
}

async function waitForQaElement(driver, selector, description, timeoutMs = 15000) {
  return await waitFor(async () => {
    const element = await driver.$(selector);
    return await element.isExisting() ? element : null;
  }, description, timeoutMs, 500);
}

async function waitForVisibleDomElement(driver, selector, description, timeoutMs = 15000) {
  return await waitFor(async () => {
    return await driver.execute((targetSelector) => {
      const target = document.querySelector(targetSelector);
      if (!(target instanceof HTMLElement)) return false;
      const style = window.getComputedStyle(target);
      const rect = target.getBoundingClientRect();
      return style.display !== 'none'
        && style.visibility !== 'hidden'
        && Number(style.opacity || '1') > 0
        && rect.width > 0
        && rect.height > 0;
    }, selector);
  }, description, timeoutMs, 500);
}

async function clickQaElement(driver, selector, description) {
  try {
    await waitForVisibleDomElement(driver, selector, description);
    const clicked = await driver.execute((targetSelector) => {
      const target = document.querySelector(targetSelector);
      if (target instanceof HTMLElement) {
        target.click();
        return true;
      }
      return false;
    }, selector);
    if (clicked) {
      return;
    }
  } catch {
    // Fall back to the WebDriver element path below.
  }

  const element = await waitForQaElement(driver, selector, description);

  try {
    await element.click();
    return;
  } catch {
    await driver.execute((targetSelector) => {
      const target = document.querySelector(targetSelector);
      if (target instanceof HTMLElement) {
        target.click();
      }
    }, selector);
  }
}

async function collectQaFailureDetails(driver, extraDetails = {}) {
  return {
    snapshot: await getQaSnapshot(driver),
    diagnostics: await getQaDiagnostics(driver),
    ...extraDetails,
  };
}

async function withQaFailureDetails(driver, runner) {
  try {
    return await runner();
  } catch (error) {
    if (error instanceof Error) {
      error.details = await collectQaFailureDetails(driver, error.details || {});
    }
    throw error;
  }
}

async function resetQaDemoState(driver) {
  const usedQaReset = await driver.execute(() => {
    const keysToRemove = [
      'mingle_demo_utterances',
      'mingle_demo_ad_banner_position',
      'mingle_demo_input_mode',
      'mingle_live_phone_demo_composer_draft_v1',
      'mingle_live_phone_demo_feedback_draft_v1',
    ];

    for (const key of keysToRemove) {
      window.localStorage.removeItem(key);
    }

    window.__MINGLE_QA__?.resetUiState?.();
    return Boolean(window.__MINGLE_QA__?.resetUiState);
  });

  if (!usedQaReset) {
    await reloadCurrentPage(driver);
    return;
  }

  await waitFor(async () => {
    const snapshot = await getQaSnapshot(driver);
    return snapshot
      && snapshot.utteranceCount === 0
      && snapshot.menuOpen === false
      && snapshot.displayedAdBannerPosition === 'bottom'
      && snapshot.isComposerOpen === false
      ? snapshot
      : null;
  }, 'the QA demo state to reset', 15000, 500);

  try {
    await waitFor(async () => {
      return await driver.execute(() => {
        return document.querySelector('[data-qa="live-demo-menu-panel"]') === null;
      });
    }, 'the menu panel DOM to unmount after reset', 4000, 250);
  } catch {
    await reloadCurrentPage(driver);
    await waitFor(async () => {
      const snapshot = await getQaSnapshot(driver);
      return snapshot
        && snapshot.utteranceCount === 0
        && snapshot.menuOpen === false
        && snapshot.displayedAdBannerPosition === 'bottom'
        && snapshot.isComposerOpen === false
        ? snapshot
        : null;
    }, 'the QA demo state to rehydrate after a forced reload', 20000, 500);
  }
}

async function reloadCurrentPage(driver) {
  await driver.execute(() => {
    window.location.reload();
  });
  await waitForQaBridge(driver);
}

async function waitForSeededHistoryHydration(driver, timeoutMs = 20000) {
  let lastSnapshot = null;

  try {
    return await waitFor(async () => {
      const next = await getQaSnapshot(driver);
      lastSnapshot = next;
      return next?.utteranceCount >= 48 ? next : null;
    }, 'seeded history hydration', timeoutMs, 500);
  } catch (error) {
    if (error instanceof Error) {
      error.details = {
        lastSnapshot,
        persistedUtteranceCount: await getPersistedUtteranceCount(driver),
      };
    }
    throw error;
  }
}

async function runCase({ driver, reportDir, platform, caseId, runner }) {
  const screenshotPath = path.join(reportDir, `${platform}-${caseId}.png`);
  try {
    const details = await runner();
    return {
      id: caseId,
      status: 'passed',
      details,
    };
  } catch (error) {
    try {
      await driver.saveScreenshot(screenshotPath);
    } catch {
      // Ignore screenshot failures because the primary result is still the assertion.
    }
    return {
      id: caseId,
      status: 'failed',
      error: error.message,
      details: error.details || null,
      screenshotPath,
    };
  }
}

async function runSharedLiveDemoCases({ driver, reportDir, platform }) {
  const results = [];

  results.push(await runCase({
    driver,
    platform,
    reportDir,
    caseId: 'qa-bridge-hydrates-live-demo',
    runner: async () => {
      await resetQaDemoState(driver);
      const snapshot = await waitForQaBridge(driver);
      assert(snapshot.routePathname === '/ko', 'The QA bridge did not hydrate the Korean live-demo route.', snapshot);
      assert(snapshot.isNativeAppRuntime === true, 'The QA bridge did not report the native runtime.', snapshot);
      assert(snapshot.isStorageHydrated === true, 'The QA bridge did not report a hydrated UI state.', snapshot);
      return snapshot;
    },
  }));

  results.push(await runCase({
    driver,
    platform,
    reportDir,
    caseId: 'banner-position-updates-insets',
    runner: async () => await withQaFailureDetails(driver, async () => {
      await resetQaDemoState(driver);
      await ensureMenuOpen(driver);
      await clickQaElement(driver, '[data-qa="live-demo-ad-banner-top"]', 'the top banner option');
      const topSnapshot = await waitFor(async () => {
        const snapshot = await getQaSnapshot(driver);
        return snapshot?.displayedAdBannerPosition === 'top' && snapshot.nativeBannerLayoutPosition === 'top'
          ? snapshot
          : null;
      }, 'the top banner position to apply', 10000, 500);

      await clickQaElement(driver, '[data-qa="live-demo-ad-banner-bottom"]', 'the bottom banner option');
      const bottomSnapshot = await waitFor(async () => {
        const snapshot = await getQaSnapshot(driver);
        return snapshot?.displayedAdBannerPosition === 'bottom' && snapshot.nativeBannerLayoutPosition === 'bottom'
          ? snapshot
          : null;
      }, 'the bottom banner position to apply', 10000, 500);

      assert(topSnapshot.effectiveNativeTopInsetPx > 0, 'Top banner inset did not become positive.', topSnapshot);
      assert(bottomSnapshot.effectiveNativeBottomBannerInsetPx > 0, 'Bottom banner inset did not become positive.', bottomSnapshot);

      return {
        topSnapshot,
        bottomSnapshot,
      };
    }),
  }));

  results.push(await runCase({
    driver,
    platform,
    reportDir,
    caseId: 'bottom-anchor-restores-after-storage-hydration',
    runner: async () => {
      await resetQaDemoState(driver);
      const seededUtteranceCount = await seedPersistedHistoryForQa(driver, 48);
      assert(seededUtteranceCount >= 48, 'The QA bridge did not seed persisted history.', {
        seededUtteranceCount,
      });

      let snapshot = null;
      try {
        snapshot = await waitForSeededHistoryHydration(driver);
      } catch (error) {
        const persistedUtteranceCount = await getPersistedUtteranceCount(driver);
        if (persistedUtteranceCount < 48) {
          throw error;
        }

        await seedPersistedHistoryForQa(driver, 48);
        snapshot = await waitForSeededHistoryHydration(driver);
      }

      assert(snapshot.chatScrollHeight > snapshot.chatClientHeight, 'Seeded history did not produce a scrollable transcript.', snapshot);
      assert(snapshot.isAtBottom === true, 'Hydrated transcript did not settle at the bottom.', snapshot);
      assert(snapshot.showScrollToBottom === false, 'Scroll-to-bottom affordance stayed visible after hydration.', snapshot);

      return {
        seededUtteranceCount,
        snapshot,
      };
    },
  }));

  results.push(await runCase({
    driver,
    platform,
    reportDir,
    caseId: 'composer-roundtrip-restores-compact-bottom-bar',
    runner: async () => await withQaFailureDetails(driver, async () => {
      await resetQaDemoState(driver);
      const baseline = await getQaSnapshot(driver);
      await clickQaElement(driver, KEYBOARD_OPEN_SELECTOR, 'the keyboard open toggle');

      await waitFor(async () => {
        const snapshot = await getQaSnapshot(driver);
        return snapshot?.isComposerOpen ? snapshot : null;
      }, 'the composer to open', 10000, 500);

      const textarea = await driver.$('[data-qa="live-demo-composer-textarea"]');
      await textarea.setValue('Line 1\nLine 2\nLine 3\nLine 4');

      const expanded = await waitFor(async () => {
        const snapshot = await getQaSnapshot(driver);
        return snapshot?.composerTextareaHeightPx > 36 ? snapshot : null;
      }, 'the composer textarea to expand', 10000, 500);

      await driver.execute(() => {
        const textarea = document.querySelector('[data-qa="live-demo-composer-textarea"]');
        if (textarea instanceof HTMLElement) {
          textarea.blur();
        }
      });
      await clickQaElement(driver, KEYBOARD_CLOSE_SELECTOR, 'the keyboard close toggle');

      const collapsed = await waitFor(async () => {
        const snapshot = await getQaSnapshot(driver);
        return snapshot && !snapshot.isComposerOpen ? snapshot : null;
      }, 'the composer to close', 10000, 500);

      await delay(1200);
      const settled = await getQaSnapshot(driver);

      assert(settled && settled.bottomBarHeightPx <= baseline.bottomBarHeightPx + 10, 'Bottom bar did not return to the compact height after closing the composer.', {
        baseline,
        expanded,
        collapsed,
        settled,
      });

      return {
        baseline,
        expanded,
        collapsed,
        settled,
      };
    }),
  }));

  results.push(await runCase({
    driver,
    platform,
    reportDir,
    caseId: 'empty-state-keeps-single-start-control',
    runner: async () => await withQaFailureDetails(driver, async () => {
      await resetQaDemoState(driver);
      await delay(800);
      const diagnostics = await driver.execute(() => {
        const bodyText = document.body?.innerText || '';
        const isVisible = (node) => {
          if (!(node instanceof HTMLElement)) return false;
          const style = window.getComputedStyle(node);
          const rect = node.getBoundingClientRect();
          return style.display !== 'none'
            && style.visibility !== 'hidden'
            && Number(style.opacity || '1') > 0
            && rect.width > 0
            && rect.height > 0;
        };
        return {
          emptyStateVisible: isVisible(document.querySelector('[data-qa="live-demo-empty-state"]'))
            || bodyText.includes('재생 버튼을 눌러 시작하세요'),
          emptyStateMessage: document.querySelector('[data-qa="live-demo-empty-state-message"]')?.textContent?.trim()
            || (bodyText.includes('재생 버튼을 눌러 시작하세요') ? '재생 버튼을 눌러 시작하세요' : ''),
          emptyStateArrowVisible: isVisible(document.querySelector('[data-qa="live-demo-empty-state-arrow"]')),
          micButtonCount: document.querySelectorAll('[data-qa="live-demo-mic-button"]').length,
          visibleMicButtonCount: Array.from(document.querySelectorAll('[data-qa="live-demo-mic-button"]')).filter(isVisible).length,
          keyboardOpenCount: document.querySelectorAll('[data-qa="live-demo-keyboard-open"], [data-qa="live-demo-keyboard-toggle"][aria-label="텍스트 입력 열기"]').length,
          visibleKeyboardOpenCount: Array.from(document.querySelectorAll('[data-qa="live-demo-keyboard-open"], [data-qa="live-demo-keyboard-toggle"][aria-label="텍스트 입력 열기"]')).filter(isVisible).length,
        };
      });

      assert(diagnostics.emptyStateVisible === true, 'The empty-state guidance was not visible.', diagnostics);
      assert(diagnostics.emptyStateArrowVisible === true, 'The empty-state arrow guidance did not remain visible.', diagnostics);
      assert(diagnostics.visibleMicButtonCount === 1, 'The empty state exposed more than one visible primary start control.', diagnostics);

      return diagnostics;
    }),
  }));

  return results;
}

async function runAndroidCases(driver, reportDir) {
  await switchToWebView(driver);
  await waitForQaBridge(driver);

  return await runSharedLiveDemoCases({
    driver,
    reportDir,
    platform: 'android',
  });
}

async function runIosCases(driver, reportDir, options) {
  await switchToWebView(driver);
  await waitForQaBridge(driver);
  await reloadCurrentPage(driver);
  await waitForQaBridge(driver);

  const iosSimulator = await isIosSimulator(options.iosUdid);
  const results = [];

  if (!iosSimulator) {
    results.push(...await runSharedLiveDemoCases({
      driver,
      reportDir,
      platform: 'ios',
    }));

    results.push(await runCase({
      driver,
      platform: 'ios',
      reportDir,
      caseId: 'menu-chrome-keeps-dropdown-cue-and-stable-overlay',
      runner: async () => await withQaFailureDetails(driver, async () => {
        await resetQaDemoState(driver);
        const before = await driver.execute(() => {
          const header = document.querySelector('[data-qa="live-demo-header"]');
          const headerButtons = header instanceof HTMLElement
            ? Array.from(header.querySelectorAll('button'))
            : [];
          const langButton = document.querySelector('[data-qa="live-demo-language-button"]')
            || headerButtons.find((candidate) => {
              return candidate.getAttribute('aria-haspopup') === 'menu';
            })
            || null;
          const chevron = document.querySelector('[data-qa="live-demo-language-chevron"]')
            || (langButton instanceof HTMLElement
              ? langButton.querySelector('svg')
              : null);
          const buttonStyle = langButton instanceof HTMLElement
            ? window.getComputedStyle(langButton)
            : null;
          const headerRect = header instanceof HTMLElement
            ? header.getBoundingClientRect()
            : null;

          return {
            langButtonExists: Boolean(langButton),
            langChevronVisible: Boolean(chevron),
            langHasPopup: langButton instanceof HTMLElement
              ? langButton.getAttribute('aria-haspopup')
              : null,
            langBorderTopWidthPx: buttonStyle ? Number.parseFloat(buttonStyle.borderTopWidth || '0') : 0,
            langHeightPx: langButton instanceof HTMLElement
              ? Math.round(langButton.getBoundingClientRect().height)
              : 0,
            headerRect: headerRect
              ? {
                  x: Math.round(headerRect.x),
                  y: Math.round(headerRect.y),
                  width: Math.round(headerRect.width),
                  height: Math.round(headerRect.height),
                }
              : null,
            headerButtonCount: headerButtons.length,
          };
        });

        assert(before.langButtonExists, 'The top-right language button did not render.', before);
        assert(before.langChevronVisible, 'The top-right language button lost its dropdown chevron cue.', before);
        assert(before.langHasPopup === 'menu', 'The top-right language button no longer exposes a dropdown menu contract.', before);
        assert(before.langBorderTopWidthPx > 0, 'The top-right language button lost its visible border cue.', before);
        assert(before.langHeightPx >= 38, 'The top-right language button became smaller than the intended affordance height.', before);

        await clickQaElement(driver, '[data-qa="live-demo-menu-button"]', 'the menu button');
        const after = await waitFor(async () => {
          const diagnostics = await driver.execute(() => {
            const header = document.querySelector('[data-qa="live-demo-header"]');
            const panel = document.querySelector('[data-qa="live-demo-menu-panel"]');
            if (!(header instanceof HTMLElement) || !(panel instanceof HTMLElement)) {
              return null;
            }

            const findOverlay = (startNode) => {
              let current = startNode.parentElement;
              while (current) {
                const className = current.className || '';
                if (
                  typeof className === 'string'
                  && className.includes('absolute')
                  && className.includes('inset-0')
                  && className.includes('z-50')
                ) {
                  return current;
                }
                current = current.parentElement;
              }
              return null;
            };

            const headerRect = header.getBoundingClientRect();
            const panelRect = panel.getBoundingClientRect();
            const overlay = findOverlay(panel);
            const panelClassName = panel.className || '';

            return {
              headerRect: {
                x: Math.round(headerRect.x),
                y: Math.round(headerRect.y),
                width: Math.round(headerRect.width),
                height: Math.round(headerRect.height),
              },
              panelRect: {
                x: Math.round(panelRect.x),
                y: Math.round(panelRect.y),
                width: Math.round(panelRect.width),
                height: Math.round(panelRect.height),
              },
              panelRole: panel.getAttribute('role'),
              panelClassName,
              panelHasBorder: typeof panelClassName === 'string'
                && panelClassName.includes('sm:border-x')
                && panelClassName.includes('sm:border-gray-200'),
              overlayClassName: overlay?.className || '',
              overlayAbsolute: overlay instanceof HTMLElement,
              scrollContainerCount: document.querySelectorAll('[class*="overscroll-contain"]').length,
            };
          });

          return diagnostics?.panelRole === 'dialog' ? diagnostics : null;
        }, 'the menu overlay to open', 10000, 500);

        const deltaX = Math.abs((after.headerRect?.x || 0) - (before.headerRect?.x || 0));
        const deltaY = Math.abs((after.headerRect?.y || 0) - (before.headerRect?.y || 0));

        assert(after.panelHasBorder, 'The menu panel lost the restored container border contract.', after);
        assert(after.overlayAbsolute, 'The menu panel no longer lives inside a full-screen overlay layer.', after);
        assert(after.scrollContainerCount >= 2, 'The internal menu surfaces lost their overscroll containment.', after);
        assert(deltaX <= 1 && deltaY <= 1, 'Opening the drawer shifted the underlying header instead of keeping it stable.', {
          before,
          after,
          deltaX,
          deltaY,
        });

        return {
          before,
          after,
          deltaX,
          deltaY,
        };
      }),
    }));
  }

  results.push(await runCase({
    driver,
    platform: 'ios',
    reportDir,
    caseId: 'menu-label-matches-korean-locale',
    runner: async () => {
      await resetQaDemoState(driver);
      await invokeQaMethod(driver, 'setMenuOpen', true);
      const snapshot = await ensureMenuOpen(driver);
      assert(snapshot.uiLocale === 'ko', 'The iOS QA session did not boot with the expected Korean locale.', snapshot);
      assert(snapshot.menuButtonLabel === '메뉴', 'The menu label did not match the Korean locale contract.', snapshot);
      assert(snapshot.documentLanguage.toLowerCase().startsWith('ko'), 'The document language did not match the Korean locale.', snapshot);
      return snapshot;
    },
  }));

  if (iosSimulator) {
    results.push(await runCase({
      driver,
      platform: 'ios',
      reportDir,
      caseId: 'permission-denial-recovers-to-idle',
      runner: async () => {
        await resetQaDemoState(driver);
        await runCommand('xcrun', ['simctl', 'privacy', options.iosUdid, 'revoke', 'microphone', IOS_BUNDLE_ID]);
        await driver.terminateApp(IOS_BUNDLE_ID);
        await driver.activateApp(IOS_BUNDLE_ID);
        await switchToWebView(driver);
        await waitForQaBridge(driver);

        const micButton = await driver.$('[data-qa="live-demo-mic-button"]');
        await micButton.click();
        await switchToNative(driver);
        const alertDismissed = await dismissIosAlertIfPresent(driver);

        await switchToWebView(driver);
        const snapshot = await waitFor(async () => {
          const next = await getQaSnapshot(driver);
          return next?.micVisualState === 'idle' ? next : null;
        }, 'the mic UI to recover back to idle after denial', 15000, 500);

        assert(snapshot.micVisualState === 'idle', 'Mic UI did not return to idle after permission denial.', snapshot);
        return {
          alertDismissed,
          snapshot,
        };
      },
    }));
  }

  return results;
}

function renderMarkdownReport(report) {
  const summary = report.summary || summarizeReport(report);
  const lines = [
    '# Mobile UI QA Report',
    '',
    `- Timestamp: ${report.timestamp}`,
    `- Appium port: ${report.appiumPort}`,
    `- Summary: ${summary.passed}/${summary.total} passed, ${summary.failed} failed, ${summary.skipped} skipped`,
    '',
  ];

  for (const platformReport of report.platforms) {
    lines.push(`## ${platformReport.platform}`);
    lines.push('');
    lines.push(`- Device: ${platformReport.deviceLabel}`);
    lines.push(`- Status: ${platformReport.status}`);
    lines.push(`- Summary: ${platformReport.summary.passed}/${platformReport.summary.total} passed, ${platformReport.summary.failed} failed, ${platformReport.summary.skipped} skipped`);
    lines.push('');
    for (const result of platformReport.results) {
      lines.push(`### ${result.id}`);
      lines.push('');
      lines.push(`- Status: ${result.status}`);
      if (result.error) {
        lines.push(`- Error: ${result.error}`);
      }
      if (result.screenshotPath) {
        lines.push(`- Screenshot: ${result.screenshotPath}`);
      }
      lines.push('');
      lines.push('```json');
      lines.push(JSON.stringify(result.details ?? null, null, 2));
      lines.push('```');
      lines.push('');
    }
  }

  return `${lines.join('\n').trim()}\n`;
}

function summarizeResults(results) {
  const summary = {
    total: results.length,
    passed: 0,
    failed: 0,
    skipped: 0,
  };

  for (const result of results) {
    if (result.status === 'passed') {
      summary.passed += 1;
      continue;
    }

    if (result.status === 'skipped') {
      summary.skipped += 1;
      continue;
    }

    summary.failed += 1;
  }

  return summary;
}

function summarizeReport(report) {
  const summary = {
    total: 0,
    passed: 0,
    failed: 0,
    skipped: 0,
  };

  for (const platformReport of report.platforms) {
    const platformSummary = platformReport.summary || summarizeResults(platformReport.results);
    summary.total += platformSummary.total;
    summary.passed += platformSummary.passed;
    summary.failed += platformSummary.failed;
    summary.skipped += platformSummary.skipped;
  }

  return summary;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  await ensureDir(APPIUM_HOME);
  await ensureDir(REPORT_ROOT);

  await ensureAppiumDriver('xcuitest');
  await ensureAppiumDriver('uiautomator2');

  const appiumHandle = options.reuseAppium ? null : await startAppiumServer(options.appiumPort);
  const reportDir = path.join(REPORT_ROOT, timestamp());
  await ensureDir(reportDir);

  const report = {
    timestamp: new Date().toISOString(),
    appiumPort: options.appiumPort,
    platforms: [],
  };

  try {
    if (options.platform === 'all' || options.platform === 'android') {
      const androidSession = await createAndroidSession(options);
      try {
        const results = await runAndroidCases(androidSession.driver, reportDir);
        report.platforms.push({
          platform: 'android',
          deviceLabel: androidSession.deviceLabel,
          status: results.every((result) => result.status === 'passed') ? 'passed' : 'failed',
          summary: summarizeResults(results),
          results,
        });
      } finally {
        await androidSession.driver.deleteSession();
      }
    }

    if (options.platform === 'all' || options.platform === 'ios') {
      const iosSimulator = await isIosSimulator(options.iosUdid);
      if (iosSimulator) {
        await prepareIosSimulator(options.iosUdid);
      }

      let iosSession = null;
      try {
        iosSession = await createIosSession(options);
        const results = await runIosCases(iosSession.driver, reportDir, options);
        report.platforms.push({
          platform: 'ios',
          deviceLabel: iosSession.deviceLabel,
          status: results.every((result) => result.status === 'passed') ? 'passed' : 'failed',
          summary: summarizeResults(results),
          results,
        });
      } catch (error) {
        const failure = !iosSimulator
          ? formatIosRealDeviceSessionError(error, await collectIosRealDeviceDiagnostics(options, error))
          : error;
        report.platforms.push({
          platform: 'ios',
          deviceLabel: `ios:${options.iosUdid}`,
          status: 'failed',
          summary: summarizeResults([
            {
              id: 'session-start',
              status: 'failed',
            },
          ]),
          results: [
            {
              id: 'session-start',
              status: 'failed',
              error: failure instanceof Error ? failure.message : String(failure),
              details: failure instanceof Error ? failure.details || null : null,
            },
          ],
        });
      } finally {
        if (iosSession) {
          await iosSession.driver.deleteSession();
        }
      }
    }
  } finally {
    if (appiumHandle?.child) {
      appiumHandle.child.kill('SIGTERM');
    }
  }

  report.summary = summarizeReport(report);

  const reportJsonPath = path.join(reportDir, 'report.json');
  const reportMarkdownPath = path.join(reportDir, 'report.md');
  await fs.writeFile(reportJsonPath, JSON.stringify(report, null, 2));
  await fs.writeFile(reportMarkdownPath, renderMarkdownReport(report));

  const hasFailure = report.platforms.some((platform) => platform.status !== 'passed');
  console.log(JSON.stringify({
    reportJsonPath,
    reportMarkdownPath,
    summary: report.summary,
    hasFailure,
  }, null, 2));

  if (hasFailure) {
    process.exitCode = 1;
  }
}

await main();
