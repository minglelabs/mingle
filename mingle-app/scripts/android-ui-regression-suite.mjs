#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { spawn } from 'node:child_process';

const APP_ROOT = path.resolve(import.meta.dirname, '..');
const REPORT_ROOT = path.resolve(APP_ROOT, 'qa/mobile-ui/reports');
const UI_UX_HISTORY_PATH = path.resolve(APP_ROOT, '../docs/ui-ux-codex-thread-history.md');

const VITEST_TARGETS = [
  {
    id: 'android-native-stt-reconcile-contracts',
    title: 'Android native STT reconcile contracts',
    issueAtoms: ['019d19a3#1', '019d4eba#1', '019d4f37#1'],
    files: ['src/components/LivePhoneDemo/live-phone-demo.android-stt-reconcile.test.ts'],
  },
];

const APPIUM_CASE_METADATA = {
  'qa-bridge-hydrates-live-demo': {
    title: 'Android live-demo QA bridge hydrates a locale-scoped route on a real device',
    issueAtoms: ['2026-real-device#1', '2026-real-device#2'],
  },
  'banner-position-updates-insets': {
    title: 'Android banner position updates native content insets',
    issueAtoms: ['019d4cae#11', '019d4cae#12', '019d4cae#13', '019d4cae#14', '019d4cae#15'],
  },
  'bottom-anchor-restores-after-storage-hydration': {
    title: 'Android hydrated transcript restores the bottom anchor',
    issueAtoms: ['019d4cae#23', '019d4cae#32'],
  },
  'composer-roundtrip-restores-compact-bottom-bar': {
    title: 'Android composer round-trip restores the compact bottom bar',
    issueAtoms: ['019d4cae#9', '019d4cae#10'],
  },
  'empty-state-keeps-single-start-control': {
    title: 'Android empty-state onboarding keeps a single start control',
    issueAtoms: ['019d29d5#1'],
  },
  'hardware-back-closes-history-overlay': {
    title: 'Android hardware back closes the history-driven overlay state',
    issueAtoms: ['019d4cae#4'],
  },
  'native-remount-restores-running-mic-state': {
    title: 'Android native/WebView remount restores the running mic state',
    issueAtoms: ['019d4eba#1', '019d4f37#1'],
  },
};

function parseArgs(argv) {
  const options = {
    androidSerial: process.env.MINGLE_UI_QA_ANDROID_SERIAL || '',
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    const next = argv[index + 1];
    switch (token) {
      case '--android-serial':
        options.androidSerial = next || options.androidSerial;
        index += 1;
        break;
      default:
        break;
    }
  }

  return options;
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

async function ensureDir(target) {
  await fs.mkdir(target, { recursive: true });
}

async function runCommand(command, args, options = {}) {
  return await new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: options.cwd || APP_ROOT,
      env: {
        ...process.env,
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
    child.on('close', (code) => {
      resolve({
        code: code ?? 1,
        stdout,
        stderr,
      });
    });
  });
}

function summarizeTargets(targets) {
  const summary = {
    total: targets.length,
    passed: 0,
    failed: 0,
    skipped: 0,
  };

  for (const target of targets) {
    if (target.status === 'passed') {
      summary.passed += 1;
      continue;
    }
    if (target.status === 'skipped') {
      summary.skipped += 1;
      continue;
    }
    summary.failed += 1;
  }

  return summary;
}

async function runVitestTargets() {
  const results = [];

  for (const target of VITEST_TARGETS) {
    const command = ['vitest', 'run', ...target.files];
    const result = await runCommand('pnpm', command);
    results.push({
      kind: 'contract',
      id: target.id,
      title: target.title,
      issueAtoms: target.issueAtoms,
      status: result.code === 0 ? 'passed' : 'failed',
      stdout: result.stdout.trim(),
      stderr: result.stderr.trim(),
    });
  }

  return results;
}

async function runAndroidAppiumTargets(androidSerial) {
  const args = ['scripts/mobile-ui-qa.mjs', '--platform', 'android'];
  if (androidSerial) {
    args.push('--android-serial', androidSerial);
  }

  const result = await runCommand('node', args, { cwd: APP_ROOT });
  const stdout = result.stdout.trim();
  const stderr = result.stderr.trim();
  const reportMatch = stdout.match(/"reportJsonPath":\s*"([^"]+)"/);
  const reportMarkdownMatch = stdout.match(/"reportMarkdownPath":\s*"([^"]+)"/);
  const reportJsonPath = reportMatch?.[1] || '';
  const report = reportJsonPath
    ? JSON.parse(await fs.readFile(reportJsonPath, 'utf8'))
    : null;
  const platformReport = report?.platforms?.find?.((entry) => entry.platform === 'android') || null;
  const results = [];

  for (const entry of platformReport?.results || []) {
    const metadata = APPIUM_CASE_METADATA[entry.id] || {
      title: entry.id,
      issueAtoms: [],
    };
    results.push({
      kind: 'real-device',
      id: entry.id,
      title: metadata.title,
      issueAtoms: metadata.issueAtoms,
      status: entry.status,
      error: entry.error || '',
      details: entry.details || null,
      screenshotPath: entry.screenshotPath || '',
    });
  }

  return {
    results,
    runExitCode: result.code,
    stdout,
    stderr,
    reportJsonPath,
    reportMarkdownPath: reportMarkdownMatch?.[1] || '',
  };
}

function renderMarkdown({ summary, contractTargets, appiumTargets, appiumRun }) {
  const lines = [
    '# Android UI Regression Suite',
    '',
    `- Source: ${UI_UX_HISTORY_PATH}`,
    `- Summary: ${summary.passed}/${summary.total} passed, ${summary.failed} failed, ${summary.skipped} skipped`,
    '',
    '## Contract targets',
    '',
  ];

  for (const target of contractTargets) {
    lines.push(`### ${target.id}`);
    lines.push('');
    lines.push(`- Status: ${target.status}`);
    lines.push(`- Title: ${target.title}`);
    lines.push(`- Issue atoms: ${target.issueAtoms.join(', ') || '(none mapped)'}`);
    if (target.status !== 'passed') {
      lines.push('- stderr:');
      lines.push('```');
      lines.push(target.stderr || target.stdout || '(no output)');
      lines.push('```');
    }
    lines.push('');
  }

  lines.push('## Real-device targets');
  lines.push('');
  for (const target of appiumTargets) {
    lines.push(`### ${target.id}`);
    lines.push('');
    lines.push(`- Status: ${target.status}`);
    lines.push(`- Title: ${target.title}`);
    lines.push(`- Issue atoms: ${target.issueAtoms.join(', ') || '(none mapped)'}`);
    if (target.error) {
      lines.push(`- Error: ${target.error}`);
    }
    if (target.screenshotPath) {
      lines.push(`- Screenshot: ${target.screenshotPath}`);
    }
    if (target.details) {
      lines.push('');
      lines.push('```json');
      lines.push(JSON.stringify(target.details, null, 2));
      lines.push('```');
    }
    lines.push('');
  }

  if (appiumRun.reportMarkdownPath) {
    lines.push('## Raw Android QA report');
    lines.push('');
    lines.push(`- Report: ${appiumRun.reportMarkdownPath}`);
    lines.push('');
  }

  return `${lines.join('\n').trim()}\n`;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const reportDir = path.join(REPORT_ROOT, timestamp());
  await ensureDir(reportDir);

  const contractTargets = await runVitestTargets();
  const appiumRun = await runAndroidAppiumTargets(options.androidSerial);
  const allTargets = [...contractTargets, ...appiumRun.results];
  const summary = summarizeTargets(allTargets);

  const report = {
    source: UI_UX_HISTORY_PATH,
    summary,
    contractTargets,
    appiumTargets: appiumRun.results,
    appiumReportJsonPath: appiumRun.reportJsonPath,
    appiumReportMarkdownPath: appiumRun.reportMarkdownPath,
  };

  const reportJsonPath = path.join(reportDir, 'android-regression-suite.json');
  const reportMarkdownPath = path.join(reportDir, 'android-regression-suite.md');
  await fs.writeFile(reportJsonPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await fs.writeFile(reportMarkdownPath, renderMarkdown({
    summary,
    contractTargets,
    appiumTargets: appiumRun.results,
    appiumRun,
  }), 'utf8');

  const output = {
    reportJsonPath,
    reportMarkdownPath,
    summary,
    hasFailure: summary.failed > 0,
  };
  console.log(JSON.stringify(output, null, 2));

  if (summary.failed > 0 || appiumRun.runExitCode !== 0) {
    process.exit(1);
  }
}

await main();
