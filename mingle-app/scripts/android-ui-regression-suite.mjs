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
    id: 'android-native-ui-bridge-contracts',
    title: 'Android native UI bridge contracts',
    issueAtoms: ['019d4cae#11', '019d4cae#12', '019d4cae#13', '019d4cae#14', '019d4cae#15'],
    files: ['src/components/LivePhoneDemo/live-phone-demo.native-ui.logic.test.ts'],
  },
  {
    id: 'android-native-navigation-history-contracts',
    title: 'Android native navigation bridge keeps back availability on the current history entry',
    issueAtoms: ['2026-dev-validation#3'],
    files: ['src/lib/native-navigation-bridge.test.ts'],
  },
  {
    id: 'android-conversation-list-history-contracts',
    title: 'Conversation-list search history stays in sync with native back expectations',
    issueAtoms: ['2026-dev-validation#4'],
    files: ['src/components/conversation-list.logic.test.ts'],
  },
  {
    id: 'android-conversation-list-summary-contracts',
    title: 'Conversation-list preview, ordering, and active badge summaries stay stable',
    issueAtoms: ['019d4cae#27', '019d4cae#28', '019d4cae#34', '019d4cae#35', '019d4cae#36', '019d4cae#54'],
    files: ['src/components/conversation-list.logic.test.ts'],
  },
  {
    id: 'android-conversation-row-action-contracts',
    title: 'Conversation-row long-press actions stay touch-safe and position correctly',
    issueAtoms: ['019d4cae#58', '019d4cae#59', '019d4cae#67'],
    files: ['src/components/conversation-list.logic.test.ts'],
  },
  {
    id: 'android-conversation-route-contracts',
    title: 'Conversation routes keep previews, hydration, delete, and soft-delete visibility aligned',
    issueAtoms: ['019d4cae#27', '019d4cae#28', '019d4cae#32', '019d4cae#60', '019d4cae#61'],
    files: [
      'src/app/api/conversations/route.test.ts',
      'src/app/api/conversations/[conversationId]/route.test.ts',
      'src/lib/app-conversations.test.ts',
    ],
  },
  {
    id: 'android-versioned-mobile-route-contracts',
    title: 'Versioned conversation and feedback route aliases stay wired for the shipping mobile lines',
    issueAtoms: ['019d4cae#60', '019d4cae#69'],
    files: [
      'src/app/api/namespace-routing.contract.test.ts',
      'src/app/api/feedback.namespace-routing.test.ts',
    ],
  },
  {
    id: 'android-scroll-platform-contracts',
    title: 'Android live-demo scroll contracts',
    issueAtoms: ['019c6f40#1', '019c6f40#2', '019c756e#1', '019d18f2#1'],
    files: ['src/components/LivePhoneDemo/live-phone-demo.scroll.logic.test.ts'],
  },
  {
    id: 'android-composer-layout-contracts',
    title: 'Android composer layout contracts',
    issueAtoms: ['019d4cae#9', '019d4cae#10', '019d6d6d#1', '019d6d99#1'],
    files: ['src/components/LivePhoneDemo/live-phone-demo.composer.logic.test.ts'],
  },
  {
    id: 'android-preference-hydration-contracts',
    title: 'Android preference hydration contracts',
    issueAtoms: ['019d4cae#23', '019d4cae#32', '019d2a13#1', '019d2a3f#1'],
    files: [
      'src/components/LivePhoneDemo/live-phone-demo.preferences.test.ts',
      'src/components/LivePhoneDemo/live-phone-demo.account-preferences.test.ts',
    ],
  },
  {
    id: 'android-locale-catalog-contracts',
    title: 'Android locale catalog contracts',
    issueAtoms: ['019d4cae#21', '019d4cae#22', '019c95e8#2', '019c95e8#3', '019ca08b#5', '019ca08b#6'],
    files: ['src/i18n/config.test.ts', 'src/i18n/get-dictionary.test.ts'],
  },
  {
    id: 'android-localized-surface-copy-contracts',
    title: 'Android localized surface copy contracts',
    issueAtoms: ['019d4cae#21', '019d4cae#22', '019c95e8#1', '019c95e8#2', '019c95e8#3', '019ca08b#5', '019ca08b#6', '019ca08b#7'],
    files: [
      'src/components/LivePhoneDemo/live-phone-demo.feedback-copy.test.ts',
      'src/components/LivePhoneDemo/live-phone-demo.delete-copy.test.ts',
      'src/components/LivePhoneDemo/live-phone-demo.copy-actions.test.ts',
      'src/components/LivePhoneDemo/live-phone-demo.tts-actions.test.ts',
      'src/components/LivePhoneDemo/live-phone-demo.app-update.logic.test.ts',
    ],
  },
  {
    id: 'android-bubble-structure-contracts',
    title: 'Android bubble structure contracts',
    issueAtoms: ['019c6f40#3', '019c992c#1', '019d09c4#1'],
    files: [
      'src/components/LivePhoneDemo/chat-bubble.test.ts',
      'src/components/LivePhoneDemo/chat-bubble.timestamp.test.ts',
      'src/components/LivePhoneDemo/translation-bubble-row.test.ts',
    ],
  },
  {
    id: 'android-copy-affordance-contracts',
    title: 'Android copy affordance contracts',
    issueAtoms: ['019d09c4#1', '019d5714#1'],
    files: [
      'src/components/LivePhoneDemo/copyable-bubble-surface.test.ts',
      'src/components/LivePhoneDemo/copyable-bubble-surface.logic.test.ts',
      'src/components/LivePhoneDemo/live-phone-demo.copy.test.ts',
    ],
  },
  {
    id: 'android-speaker-avatar-contracts',
    title: 'Android speaker avatar contracts',
    issueAtoms: ['019d162b#1'],
    files: ['src/components/LivePhoneDemo/speaker-avatar.test.ts'],
  },
  {
    id: 'android-auth-gate-contracts',
    title: 'Android auth gate contracts',
    issueAtoms: ['019ca08b#1', '019ca08b#2', '019ca08b#4'],
    files: ['src/components/mingle-home.auth-contract.test.ts'],
  },
  {
    id: 'android-native-auth-route-contracts',
    title: 'Android native auth route contracts',
    issueAtoms: ['019ca08b#3'],
    files: [
      'src/lib/native-auth-bridge.test.ts',
      'src/app/[locale]/auth/signin/page.test.ts',
      'src/app/[locale]/auth/native/page.test.ts',
    ],
  },
  {
    id: 'android-menu-chrome-contracts',
    title: 'Android menu chrome contracts',
    issueAtoms: ['019c95e8#1', '019c95e8#4', '019c95e8#5', '019d0514#1', '019d2f95#1', '019d2f95#2', '019d2f95#3', '019d43a3#1'],
    files: ['src/components/LivePhoneDemo/live-phone-demo.chrome-contract.test.ts'],
  },
  {
    id: 'android-shared-stt-restore-contracts',
    title: 'Android shared STT restore contracts',
    issueAtoms: ['019c992c#2', '019d19a3#1', '019d4cae#50', '019d4cae#51', '019d4cae#52', '019d4cae#53', '019d4cae#55', '019d4cae#78', '019d4eba#1', '019d4f37#1'],
    files: ['src/components/LivePhoneDemo/use-realtime-stt.logic.test.ts'],
  },
  {
    id: 'android-native-stt-reconcile-contracts',
    title: 'Android native STT reconcile contracts',
    issueAtoms: ['2026-android-real-device#1', '019d19a3#1', '019d4cae#52', '019d4cae#54', '019d4cae#55', '019d4eba#1', '019d4f37#1'],
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
    issueAtoms: ['2026-android-real-device#1', '019d4eba#1', '019d4f37#1'],
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

  if (result.code !== 0 && results.length === 0) {
    const combinedOutput = [stderr, stdout].filter(Boolean).join('\n').trim();
    results.push({
      kind: 'real-device',
      id: 'android-real-device-session',
      title: 'Android real-device QA session',
      issueAtoms: [],
      status: 'failed',
      error: combinedOutput || 'Android real-device QA exited before producing a platform report.',
      details: {
        reportJsonPath,
        reportMarkdownPath: reportMarkdownMatch?.[1] || '',
      },
      screenshotPath: '',
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
