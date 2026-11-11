import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  nextId,
  parseConstraints,
  relevantConstraints,
  renderEntry,
  validateConstraints,
} from './agent-constraints.logic.mjs';
import { globsMayOverlap, unitLane, validatePlan, waves, workerBrief, writerConflicts } from './agent-plan.logic.mjs';

const unit = (id, allowed, extra = {}) => ({ id, allowed, check: ['pnpm test'], ...extra });

test('plan validation', () => {
  assert.deepEqual(validatePlan({ request: 'x', units: [unit('a', ['docs/a.md'])] }), []);
  const errors = validatePlan({
    request: '',
    units: [
      { id: 'Bad Id', allowed: [], check: [] },
      unit('b', ['**']),
      unit('c', ['x'], { depends_on: ['nope'], device_qa: 'tablet' }),
    ],
  });
  assert.ok(errors.some((e) => e.startsWith('request')));
  assert.ok(errors.some((e) => e.includes('units[0].id')));
  assert.ok(errors.some((e) => e.includes('units[0].allowed')));
  assert.ok(errors.some((e) => e.includes('units[0].check')));
  assert.ok(errors.some((e) => e.includes("'**' allows everything")));
  assert.ok(errors.some((e) => e.includes("unknown unit 'nope'")));
  assert.ok(errors.some((e) => e.includes('device_qa')));
});

test('waves: independent units run together, dependencies wait', () => {
  const plan = {
    request: 'x',
    units: [unit('api', ['a.ts']), unit('ui', ['b.tsx'], { depends_on: ['api'] }), unit('docs', ['c.md'])],
  };
  assert.deepEqual(waves(plan), [['api', 'docs'], ['ui']]);
  const cycle = { request: 'x', units: [unit('a', ['a'], { depends_on: ['b'] }), unit('b', ['b'], { depends_on: ['a'] })] };
  assert.ok(validatePlan(cycle).some((e) => e.includes('dependency cycle')));
});

test('writers in the same wave must not share files', () => {
  assert.ok(globsMayOverlap('mingle-app/src/components/**', 'mingle-app/src/components/A.tsx'));
  assert.ok(globsMayOverlap('a/b.ts', 'a/b.ts'));
  assert.ok(!globsMayOverlap('a/b.ts', 'a/c.ts'));
  assert.ok(!globsMayOverlap('mingle-app/src/lib/**', 'mingle-app/src/components/**'));
  const plan = {
    request: 'x',
    units: [unit('a', ['mingle-app/src/components/**']), unit('b', ['mingle-app/src/components/A.tsx'])],
  };
  assert.equal(writerConflicts(plan).length, 1);
  plan.units[1].depends_on = ['a'];
  assert.equal(writerConflicts(plan).length, 0);
});

test('unit lane comes from its allowed globs', () => {
  assert.equal(unitLane(unit('a', ['mingle-app/src/components/A*.tsx'])), 'L1');
  assert.equal(unitLane(unit('a', ['mingle-app/src/lib/x.ts', 'docs/**'])), 'L2');
  assert.equal(unitLane(unit('a', ['mingle-app/prisma/**'])), 'L3');
});

const SAMPLE = `# Title

### C1 First
- scope: mingle-app/rn/ios/**/*Echo*
- rule: Do X.
- source: e6327151
- added: 2026-10-31

### C2 Second
- scope: mingle-app/src/components/**, \`mingle-app/src/lib/**\`
- rule: Do Y.
- source: #404
- added: 2026-10-31

## Other heading
- scope: ignored
`;

test('constraints parse and validate', () => {
  const entries = parseConstraints(SAMPLE);
  assert.equal(entries.length, 2);
  assert.deepEqual(entries[1].scope, ['mingle-app/src/components/**', 'mingle-app/src/lib/**']);
  assert.deepEqual(validateConstraints(entries), []);
  const bad = parseConstraints('### C1 A\n- scope: x\n- rule: y\n- source: Nam said so\n- added: today\n### C1 B\n');
  const errors = validateConstraints(bad);
  assert.ok(errors.some((e) => e.includes('source needs')));
  assert.ok(errors.some((e) => e.includes('added must')));
  assert.ok(errors.some((e) => e.includes('duplicate id')));
  assert.ok(errors.some((e) => e.includes('scope is empty')));
  assert.equal(nextId(entries), 'C3');
  assert.ok(renderEntry({ id: 'C3', title: 't', scope: ['a/**'], rule: 'r', source: '#1', added: '2026-11-01' }).startsWith('### C3 t'));
});

test('constraints that apply to a unit', () => {
  const entries = parseConstraints(SAMPLE);
  const ids = (paths) => relevantConstraints(entries, paths).map((c) => c.id);
  assert.deepEqual(ids(['mingle-app/rn/ios/mingle/MingleTranslationEchoCanceller.swift']), ['C1']);
  assert.deepEqual(ids(['mingle-app/rn/**']), ['C1']);
  assert.deepEqual(ids(['mingle-app/src/components/ChatBubble.tsx']), ['C2']);
  assert.deepEqual(ids(['docs/a.md']), []);
});

test('the repo constraints file is valid', () => {
  const text = readFileSync(new URL('../docs/agent-constraints.md', import.meta.url), 'utf8');
  const entries = parseConstraints(text);
  assert.ok(entries.length > 0);
  assert.deepEqual(validateConstraints(entries), []);
});

test('worker brief carries scope, check, attempt cap and constraints', () => {
  const plan = { request: 'Right-align own messages', units: [unit('bubble', ['mingle-app/src/components/ChatBubble.tsx'], { device_qa: 'android' })] };
  const brief = workerBrief(plan, 'bubble', parseConstraints(SAMPLE));
  assert.match(brief, /mingle-app\/src\/components\/ChatBubble\.tsx/);
  assert.match(brief, /`pnpm test`/);
  assert.match(brief, /At most 3 attempts/);
  assert.match(brief, /C2: Do Y\./);
  assert.match(brief, /device QA: android/);
  assert.throws(() => workerBrief(plan, 'nope'), /not in plan/);
});
