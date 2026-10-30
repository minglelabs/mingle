#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { spawn } from 'node:child_process';

const APP_ROOT = path.resolve(import.meta.dirname, '..');
const REPORT_ROOT = path.resolve(APP_ROOT, 'qa/mobile-ui/reports');
const UI_UX_HISTORY_PATH = path.resolve(APP_ROOT, 'docs/ui-ux-codex-thread-history.md');

const VITEST_TARGETS = [
  {
    id: 'ios-webview-layout-contracts',
    title: 'iOS WebView layout and gesture contracts',
    issueAtoms: ['2026-real-device#2', '019d4cae#5', '019d4cae#43'],
    files: ['src/lib/rn-webview-layout.test.ts'],
  },
  {
    id: 'ios-conversation-list-history-contracts',
    title: 'Conversation-list search history stays in sync with native back expectations',
    issueAtoms: ['2026-dev-validation#4'],
    files: ['src/components/conversation-list.logic.test.ts'],
  },
  {
    id: 'ios-conversation-list-summary-contracts',
    title: 'Conversation-list preview, ordering, and active badge summaries stay stable',
    issueAtoms: ['019d4cae#27', '019d4cae#28', '019d4cae#34', '019d4cae#35', '019d4cae#36', '019d4cae#54'],
    files: ['src/components/conversation-list.logic.test.ts'],
  },
  {
    id: 'ios-conversation-row-action-contracts',
    title: 'Conversation-row long-press actions stay touch-safe and position correctly',
    issueAtoms: ['019d4cae#58', '019d4cae#59', '019d4cae#67'],
    files: ['src/components/conversation-list.logic.test.ts'],
  },
  {
    id: 'ios-conversation-route-contracts',
    title: 'Conversation routes keep previews, hydration, delete, and soft-delete visibility aligned',
    issueAtoms: ['019d4cae#27', '019d4cae#28', '019d4cae#32', '019d4cae#60', '019d4cae#61'],
    files: [
      'src/app/api/conversations/route.test.ts',
      'src/app/api/conversations/[conversationId]/route.test.ts',
      'src/lib/app-conversations.test.ts',
    ],
  },
  {
    id: 'ios-versioned-mobile-route-contracts',
    title: 'Versioned conversation and feedback route aliases stay wired for the shipping mobile lines',
    issueAtoms: ['019d4cae#60', '019d4cae#69'],
    files: [
      'src/app/api/namespace-routing.contract.test.ts',
      'src/app/api/feedback.namespace-routing.test.ts',
    ],
  },
  {
    id: 'ios-native-ui-bridge-contracts',
    title: 'iOS native UI bridge and top-tap contracts',
    issueAtoms: ['019d4cae#8', '019d4cae#11', '019d4cae#12', '019d4cae#13', '019d4cae#14', '019d4cae#15', '019d4cae#45'],
    files: ['src/components/LivePhoneDemo/live-phone-demo.native-ui.logic.test.ts'],
  },
  {
    id: 'ios-scroll-platform-contracts',
    title: 'iOS scroll auto-follow and platform detection contracts',
    issueAtoms: ['019c6f40#1', '019c6f40#2', '019c756e#1'],
    files: ['src/components/LivePhoneDemo/live-phone-demo.scroll.logic.test.ts'],
  },
  {
    id: 'ios-composer-layout-contracts',
    title: 'iOS composer sizing and locale copy contracts',
    issueAtoms: ['019d4cae#9', '019d4cae#10', '019d4cae#21', '019d4cae#22'],
    files: ['src/components/LivePhoneDemo/live-phone-demo.composer.logic.test.ts'],
  },
  {
    id: 'ios-preference-hydration-contracts',
    title: 'Hydrated preference and account state contracts',
    issueAtoms: ['019d4cae#23', '019d4cae#32', '019d2a13#1', '019d2a3f#1'],
    files: [
      'src/components/LivePhoneDemo/live-phone-demo.preferences.test.ts',
      'src/components/LivePhoneDemo/live-phone-demo.account-preferences.test.ts',
    ],
  },
  {
    id: 'ios-locale-catalog-contracts',
    title: 'Locale catalog and dictionary coverage',
    issueAtoms: ['019d4cae#22', '019c95e8#2', '019c95e8#3', '019ca08b#5', '019ca08b#6'],
    files: [
      'src/i18n/config.test.ts',
      'src/i18n/get-dictionary.test.ts',
    ],
  },
  {
    id: 'ios-localized-surface-copy-contracts',
    title: 'Localized live-demo menu, feedback, delete, copy, and TTS labels',
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
    id: 'ios-bubble-structure-contracts',
    title: 'Utterance bubble structure, translation-final UI, and timestamp layout',
    issueAtoms: ['019c6f40#3', '019c992c#1', '019d09c4#1'],
    files: [
      'src/components/LivePhoneDemo/chat-bubble.test.ts',
      'src/components/LivePhoneDemo/chat-bubble.timestamp.test.ts',
      'src/components/LivePhoneDemo/translation-bubble-row.test.ts',
    ],
  },
  {
    id: 'ios-copy-affordance-contracts',
    title: 'Copy surfaces stay lightweight and touch-safe',
    issueAtoms: ['019d09c4#1', '019d5714#1'],
    files: [
      'src/components/LivePhoneDemo/copyable-bubble-surface.test.ts',
      'src/components/LivePhoneDemo/copyable-bubble-surface.logic.test.ts',
      'src/components/LivePhoneDemo/live-phone-demo.copy.test.ts',
    ],
  },
  {
    id: 'ios-speaker-avatar-contracts',
    title: 'Speaker avatar assignment stays deterministic and trimmed',
    issueAtoms: ['019d162b#1'],
    files: [
      'src/components/LivePhoneDemo/speaker-avatar.test.ts',
    ],
  },
  {
    id: 'ios-auth-gate-contracts',
    title: 'Auth gate safe-area, terms-step, and loading contracts',
    issueAtoms: ['019ca08b#1', '019ca08b#2', '019ca08b#4'],
    files: [
      'src/components/mingle-home.auth-contract.test.ts',
    ],
  },
  {
    id: 'ios-native-auth-route-contracts',
    title: 'Native Apple and Google auth routes stay on the intended iOS path',
    issueAtoms: ['019ca08b#3'],
    files: [
      'src/lib/native-auth-bridge.test.ts',
      'src/app/[locale]/auth/signin/page.test.ts',
      'src/app/[locale]/auth/native/page.test.ts',
    ],
  },
  {
    id: 'ios-menu-chrome-contracts',
    title: 'Top-right dropdown cues and drawer chrome stay visually stable',
    issueAtoms: ['019c95e8#4', '019c95e8#5', '019d0514#1', '019d2f95#1', '019d2f95#2', '019d2f95#3', '019d43a3#1'],
    files: [
      'src/components/LivePhoneDemo/live-phone-demo.chrome-contract.test.ts',
    ],
  },
  {
    id: 'ios-native-mic-recovery-contracts',
    title: 'Speaker-isolated STT finalization and native mic recovery stay retryable',
    issueAtoms: ['019c992c#2', '019d4cae#41', '019d4cae#42', '019d4cae#48', '019d4cae#49', '019d4cae#50', '019d4cae#51', '019d4cae#52', '019d4cae#53', '019d4cae#55', '019d4caf#1'],
    files: [
      'src/components/LivePhoneDemo/use-realtime-stt.logic.test.ts',
    ],
  },
];

const APPIUM_CASE_METADATA = {
  'qa-bridge-hydrates-live-demo': {
    title: 'Cloudflare/devbox iPhone WebView hydrates the real live-demo UI',
    issueAtoms: ['2026-real-device#1', '2026-real-device#2'],
  },
  'banner-position-updates-insets': {
    title: 'Banner position updates native content insets',
    issueAtoms: ['019d4cae#11', '019d4cae#12', '019d4cae#13', '019d4cae#14', '019d4cae#15'],
  },
  'bottom-anchor-restores-after-storage-hydration': {
    title: 'Hydrated transcript restores the bottom anchor',
    issueAtoms: ['019d4cae#23', '019d4cae#32'],
  },
  'composer-roundtrip-restores-compact-bottom-bar': {
    title: 'Composer round-trip restores the compact bottom bar',
    issueAtoms: ['019d4cae#9', '019d4cae#10'],
  },
  'menu-label-matches-korean-locale': {
    title: 'Visible menu label follows the Korean locale',
    issueAtoms: ['019d4cae#21', '019d4cae#22', '019c95e8#2', '019c95e8#3', '019ca08b#5', '019ca08b#6'],
  },
  'menu-chrome-keeps-dropdown-cue-and-stable-overlay': {
    title: 'Top-right dropdown cue and drawer overlay stay stable on the real iPhone surface',
    issueAtoms: ['019c95e8#4', '019c95e8#5', '019d0514#1', '019d2f95#1', '019d2f95#2', '019d2f95#3', '019d43a3#1'],
  },
  'permission-denial-recovers-to-idle': {
    title: 'Mic permission denial returns the UI to idle',
    issueAtoms: ['019d4cae#41', '019d4cae#42'],
  },
  'empty-state-keeps-single-start-control': {
    title: 'Empty-state onboarding keeps a single start control and guidance arrow',
    issueAtoms: ['019d29d5#1'],
  },
};

function parseArgs(argv) {
  const options = {
    iosRealUdid: process.env.MINGLE_UI_QA_IOS_REAL_UDID || process.env.MINGLE_UI_QA_IOS_UDID || '',
    iosSimUdid: process.env.MINGLE_UI_QA_IOS_SIM_UDID || '',
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    const next = argv[index + 1];
    switch (token) {
      case '--ios-real-udid':
        options.iosRealUdid = next || options.iosRealUdid;
        index += 1;
        break;
      case '--ios-sim-udid':
        options.iosSimUdid = next || options.iosSimUdid;
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

async function resolveBootedIosSimulatorUdid() {
  const result = await runCommand('xcrun', ['simctl', 'list', 'devices', 'available', '-j']);
  if (result.code !== 0) {
    throw new Error(`Failed to list iOS simulators.\n${result.stdout}\n${result.stderr}`);
  }

  const payload = JSON.parse(result.stdout || '{}');
  for (const runtimeDevices of Object.values(payload.devices || {})) {
    for (const device of runtimeDevices) {
      if (device.state === 'Booted' && device.isAvailable && String(device.name || '').includes('iPhone')) {
        return device.udid;
      }
    }
  }

  throw new Error('No booted iPhone simulator was found. Boot a simulator or pass --ios-sim-udid.');
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

function extractReportJsonPath(output) {
  const match = output.match(/"reportJsonPath"\s*:\s*"([^"]+)"/);
  return match ? match[1] : '';
}

function extractReportMarkdownPath(output) {
  const match = output.match(/"reportMarkdownPath"\s*:\s*"([^"]+)"/);
  return match ? match[1] : '';
}

async function countHistoricalIssueAtoms() {
  const text = await fs.readFile(UI_UX_HISTORY_PATH, 'utf8');
  return text
    .split('\n')
    .filter((line) => /^\d+\.\s+\*\*/.test(line.trim()))
    .length;
}

async function runVitestTarget(target) {
  const command = ['exec', 'vitest', 'run', ...target.files];
  const result = await runCommand('pnpm', command, { cwd: APP_ROOT });
  const combinedOutput = `${result.stdout}\n${result.stderr}`.trim();
  return {
    id: target.id,
    title: target.title,
    issueAtoms: target.issueAtoms,
    mode: 'vitest',
    status: result.code === 0 ? 'passed' : 'failed',
    command: `pnpm ${command.join(' ')}`,
    details: {
      files: target.files,
      outputTail: combinedOutput.split('\n').slice(-20).join('\n'),
    },
  };
}

async function runIosAppiumTargets({ deviceKind, udid }) {
  const label = deviceKind === 'real-device' ? 'real-device' : 'simulator';
  const result = await runCommand('node', ['scripts/mobile-ui-qa.mjs', '--platform', 'ios', '--', '--ios-udid', udid], {
    cwd: APP_ROOT,
  });
  const combinedOutput = `${result.stdout}\n${result.stderr}`;
  const reportJsonPath = extractReportJsonPath(combinedOutput);
  const reportMarkdownPath = extractReportMarkdownPath(combinedOutput);

  if (!reportJsonPath) {
    return [{
      id: `${label}-session-start`,
      title: `iOS ${label} QA session start`,
      issueAtoms: [],
      mode: label,
      status: 'failed',
      command: `node scripts/mobile-ui-qa.mjs --platform ios -- --ios-udid ${udid}`,
      details: {
        outputTail: combinedOutput.split('\n').slice(-40).join('\n'),
      },
    }];
  }

  const report = JSON.parse(await fs.readFile(reportJsonPath, 'utf8'));
  const platformReport = report.platforms.find((entry) => entry.platform === 'ios');
  if (!platformReport) {
    return [{
      id: `${label}-report-missing`,
      title: `iOS ${label} QA report parse`,
      issueAtoms: [],
      mode: label,
      status: 'failed',
      command: `node scripts/mobile-ui-qa.mjs --platform ios -- --ios-udid ${udid}`,
      details: {
        reportJsonPath,
        outputTail: combinedOutput.split('\n').slice(-40).join('\n'),
      },
    }];
  }

  return platformReport.results.map((caseResult) => {
    const metadata = APPIUM_CASE_METADATA[caseResult.id] || {
      title: caseResult.id,
      issueAtoms: [],
    };

    return {
      id: `${caseResult.id}-${label}`,
      title: metadata.title,
      issueAtoms: metadata.issueAtoms,
      mode: label,
      status: caseResult.status,
      command: `node scripts/mobile-ui-qa.mjs --platform ios -- --ios-udid ${udid}`,
      details: {
        deviceLabel: platformReport.deviceLabel,
        sourceCaseId: caseResult.id,
        reportJsonPath,
        reportMarkdownPath: reportMarkdownPath || null,
        resultDetails: caseResult.details || null,
        error: caseResult.error || null,
      },
    };
  });
}

function renderMarkdownReport(report) {
  const lines = [
    '# iOS UI Regression Suite Report',
    '',
    `- Timestamp: ${report.timestamp}`,
    `- Historical issue atoms in docs: ${report.historicalIssueAtomCount}`,
    `- Automated iOS regression validations executed: ${report.summary.total}`,
    `- Summary: ${report.summary.passed}/${report.summary.total} passed, ${report.summary.failed} failed, ${report.summary.skipped} skipped`,
    '',
    '## Targets',
    '',
  ];

  for (const target of report.targets) {
    lines.push(`### ${target.id}`);
    lines.push('');
    lines.push(`- Title: ${target.title}`);
    lines.push(`- Mode: ${target.mode}`);
    lines.push(`- Status: ${target.status}`);
    lines.push(`- Historical issue atoms: ${target.issueAtoms.length > 0 ? target.issueAtoms.join(', ') : '(supporting coverage only)'}`);
    lines.push(`- Command: \`${target.command}\``);
    lines.push('');
    lines.push('```json');
    lines.push(JSON.stringify(target.details ?? null, null, 2));
    lines.push('```');
    lines.push('');
  }

  return `${lines.join('\n').trim()}\n`;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const targets = [];
  const reportDir = path.join(REPORT_ROOT, timestamp());
  await ensureDir(reportDir);
  const historicalIssueAtomCount = await countHistoricalIssueAtoms();

  for (const target of VITEST_TARGETS) {
    targets.push(await runVitestTarget(target));
  }

  if (options.iosRealUdid) {
    targets.push(...await runIosAppiumTargets({
      deviceKind: 'real-device',
      udid: options.iosRealUdid,
    }));
  } else {
    targets.push({
      id: 'ios-real-device-suite',
      title: 'Physical iPhone regression suite',
      issueAtoms: [],
      mode: 'real-device',
      status: 'skipped',
      command: 'node scripts/mobile-ui-qa.mjs --platform ios -- --ios-udid <physical-udid>',
      details: {
        reason: 'No physical iPhone UDID was provided.',
      },
    });
  }

  const simulatorUdid = options.iosSimUdid || await resolveBootedIosSimulatorUdid();
  targets.push(...await runIosAppiumTargets({
    deviceKind: 'simulator',
    udid: simulatorUdid,
  }));

  const report = {
    timestamp: new Date().toISOString(),
    historicalIssueAtomCount,
    summary: summarizeTargets(targets),
    targets,
  };

  const reportJsonPath = path.join(reportDir, 'ios-regression-suite.json');
  const reportMarkdownPath = path.join(reportDir, 'ios-regression-suite.md');
  await fs.writeFile(reportJsonPath, JSON.stringify(report, null, 2));
  await fs.writeFile(reportMarkdownPath, renderMarkdownReport(report));

  const hasFailure = report.summary.failed > 0;
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
