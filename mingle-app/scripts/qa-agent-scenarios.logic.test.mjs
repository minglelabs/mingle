import assert from 'node:assert/strict';
import test from 'node:test';

import {
  extractHistoryHeadings,
  extractTasteIds,
  globToRegExp,
  parseScenarioMarkdown,
  selectScenarios,
  validateScenario,
} from './qa-agent-scenarios.logic.mjs';

const SCENARIO = `---
id: composer-photo-attach
title: Attaching a photo keeps the keyboard open
priority: P0
environment: device
tags: [composer, keyboard]
taste: [T1, T10]
paths:
  - mingle-app/src/components/LivePhoneDemo/ConversationImageComposer.tsx
  - mingle-app/src/app/api/conversations/[conversationId]/recall/**
history:
  - P2 2026-09-18 Native bottom banner obscured the attachment tooltip
  - 2026-09-28 - Voice-mode photo tap stopped STT (mic ping took the taps)
---

## Steps
`;

test('parseScenarioMarkdown reads scalars, inline lists and block lists', () => {
  const { data, body } = parseScenarioMarkdown(SCENARIO);

  assert.equal(data.id, 'composer-photo-attach');
  assert.equal(data.priority, 'P0');
  assert.deepEqual(data.tags, ['composer', 'keyboard']);
  assert.equal(data.paths.length, 2);
  assert.equal(data.history[0], 'P2 2026-09-18 Native bottom banner obscured the attachment tooltip');
  assert.match(body, /## Steps/);
});

test('globToRegExp keeps route brackets literal and separates * from **', () => {
  assert.ok(globToRegExp('mingle-app/src/app/api/conversations/[conversationId]/recall/**')
    .test('mingle-app/src/app/api/conversations/[conversationId]/recall/route.ts'));
  assert.ok(globToRegExp('mingle-app/src/components/conversation-list*.ts*')
    .test('mingle-app/src/components/conversation-list.logic.ts'));
  assert.ok(!globToRegExp('mingle-app/src/*.ts').test('mingle-app/src/lib/translator.ts'));
  assert.ok(globToRegExp('mingle-stt/**').test('mingle-stt/src/server/index.ts'));
});

test('selectScenarios returns matched scenarios by priority and reports uncovered app files', () => {
  const scenarios = [
    { id: 'b-p1', priority: 'P1', paths: ['mingle-app/src/components/slide-surface.tsx'] },
    { id: 'a-p0', priority: 'P0', paths: ['mingle-app/src/components/LivePhoneDemo/**'] },
  ];
  const { selected, uncovered } = selectScenarios(scenarios, [
    'mingle-app/src/components/slide-surface.tsx',
    'mingle-app/src/components/LivePhoneDemo/ChatBubble.tsx',
    'mingle-app/src/components/my-page.tsx',
    'mingle-app/src/components/my-page.native-app-update-card.test.ts',
    'docs/ui-ux-codex-thread-history.md',
  ]);

  assert.deepEqual(selected.map((scenario) => scenario.id), ['a-p0', 'b-p1']);
  assert.deepEqual(selected[0].matchedFiles, ['mingle-app/src/components/LivePhoneDemo/ChatBubble.tsx']);
  assert.deepEqual(uncovered, ['mingle-app/src/components/my-page.tsx']);
});

test('validateScenario accepts P2 and parenthetical history references and flags dead globs', () => {
  const { data } = parseScenarioMarkdown(SCENARIO);
  const context = {
    trackedFiles: ['mingle-app/src/components/LivePhoneDemo/ConversationImageComposer.tsx'],
    historyHeadings: extractHistoryHeadings([
      '## 2026-09-18 Native bottom banner obscured the attachment tooltip',
      '## 2026-09-28 - Voice-mode photo tap stopped STT; keyboard-mode photo pick closed the keyboard',
    ].join('\n')),
    tasteIds: extractTasteIds('### T1. Keyboard\n### T10. Overlays\n'),
    fileName: 'composer-photo-attach.md',
  };

  assert.deepEqual(validateScenario(data, context), [
    'composer-photo-attach.md: path glob matches no tracked file: mingle-app/src/app/api/conversations/[conversationId]/recall/**',
  ]);
});

test('validateScenario reports a wrong file name, an unknown taste rule and a missing history heading', () => {
  const problems = validateScenario({
    id: 'x',
    title: 'X',
    priority: 'P0',
    environment: 'phone',
    tags: ['a'],
    taste: ['T99'],
    paths: ['a.ts'],
    history: ['2026-01-01 - Never happened', 'No history entry yet. New feature'],
  }, {
    trackedFiles: ['a.ts'],
    historyHeadings: [],
    tasteIds: new Set(['T1']),
    fileName: 'y.md',
  });

  assert.deepEqual(problems, [
    'y.md: file name must be x.md',
    'y.md: environment must be one of device, assisted, manual-only',
    'y.md: unknown taste rule T99',
    'y.md: history heading not found: 2026-01-01 - Never happened',
  ]);
});
