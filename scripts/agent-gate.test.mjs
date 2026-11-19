import assert from 'node:assert/strict';
import test from 'node:test';
import {
  brokenDocLinks,
  buildReturnPacket,
  checkScope,
  classifyChange,
  rollbackStats,
  classifyFile,
  decide,
  detectMigrationAndEnv,
  evaluateCi,
  matchesGlob,
  parseEnvExampleKeys,
} from './agent-gate.logic.mjs';

const lane = (p, patch) => classifyFile(p, patch).lane;

test('glob matching', () => {
  assert.ok(matchesGlob('docs/a/b.md', 'docs/**'));
  assert.ok(matchesGlob('a.md', '**/*.md'));
  assert.ok(matchesGlob('x/y/a.md', '**/*.md'));
  assert.ok(matchesGlob('mingle-app/src/app/[locale]/page.tsx', 'mingle-app/src/app/[locale]/**'));
  assert.ok(!matchesGlob('mingle-app/src/app/xlocale/page.tsx', 'mingle-app/src/app/[locale]/**'));
  assert.ok(!matchesGlob('src/a/b.ts', 'src/*.ts'));
});

test('closed lane: migrations, env, deploy, native, prod data, store, money, gate', () => {
  assert.equal(lane('mingle-app/prisma/migrations/2026_x/migration.sql'), 'L3');
  assert.equal(lane('mingle-app/prisma/schema.prisma'), 'L3');
  assert.equal(lane('mingle-app/.env.example'), 'L3');
  assert.equal(lane('railway.json'), 'L3');
  assert.equal(lane('Dockerfile.railway'), 'L3');
  assert.equal(lane('mingle-app/rn/App.tsx'), 'L3');
  assert.equal(lane('mingle-app/rn/__tests__/runtimeContract.test.ts'), 'L3');
  assert.equal(lane('mingle-app/scripts/seed-starter-engagement.mts'), 'L3');
  assert.equal(lane('mingle-app/scripts/backfill-operator-interest-languages.mjs'), 'L3');
  assert.equal(lane('scripts/ios-appstore-upload.sh'), 'L3');
  assert.equal(lane('mingle-app/src/app/api/coins/wallet/route.ts'), 'L3');
  assert.equal(lane('mingle-app/src/app/admin/coins/page.tsx'), 'L3');
  assert.equal(lane('mingle-app/src/app/api/conversations/[conversationId]/coin-usage/route.ts'), 'L3');
  assert.equal(lane('scripts/agent-gate.logic.mjs'), 'L3');
  assert.equal(lane('.github/workflows/mingle-app-tdd.yml'), 'L3');
});

test('money rule does not catch unrelated words', () => {
  assert.equal(lane('mingle-app/public/legal/assets/m2e/sweatcoin.jpg'), 'L1');
});

test('version and namespace changes in package.json are L3', () => {
  assert.equal(lane('mingle-app/package.json', '+  "version": "2.3.2",\n'), 'L3');
  assert.equal(lane('mingle-app/package.json', '+ "build:x": "NEXT_PUBLIC_API_NAMESPACE=ios/v2.3.2 pnpm build",\n'), 'L3');
  assert.equal(lane('mingle-app/package.json', '+ "lint:x": "eslint",\n'), 'L2');
});

test('docs, contained and wide lanes', () => {
  assert.equal(lane('docs/agent-loop-graph-design.md'), 'L0');
  assert.equal(lane('CLAUDE.md'), 'L0');
  assert.equal(lane('mingle-app/src/components/ChatBubble.tsx'), 'L1');
  assert.equal(lane('mingle-app/src/app/[locale]/feed/page.tsx'), 'L1');
  assert.equal(lane('mingle-app/src/app/admin/users/page.tsx'), 'L1');
  assert.equal(lane('mingle-app/src/server/admin/users.ts'), 'L1');
  assert.equal(lane('scripts/devbox.sh'), 'L1');
  assert.equal(lane('mingle-app/src/server/operator-automation/worker.ts'), 'L1');
  assert.equal(lane('mingle-app/src/server/operators/create-operator.ts'), 'L1');
  assert.equal(lane('mingle-app/src/lib/admin-dashboard-query.ts'), 'L1');
  assert.equal(lane('mingle-app/pnpm-lock.yaml'), 'L2');
  assert.equal(lane('mingle-app/src/lib/foo.test.ts'), 'L1');
  assert.equal(lane('mingle-app/src/lib/foo.ts'), 'L2');
  assert.equal(lane('mingle-app/src/app/api/conversations/route.ts'), 'L2');
  assert.equal(lane('shared/x.ts'), 'L2');
  assert.equal(lane('something-new/x.ts'), 'L2');
});

test('change lane is the highest file lane', () => {
  const { lane: l } = classifyChange(['docs/a.md', 'mingle-app/src/components/A.tsx', 'mingle-app/prisma/schema.prisma']);
  assert.equal(l, 'L3');
  assert.equal(classifyChange([]).lane, 'L0');
});

test('CI: skipped or absent runs are never a pass', () => {
  const files = ['mingle-app/src/components/A.tsx'];
  assert.equal(evaluateCi([], files).state, 'missing');
  assert.equal(evaluateCi([{ name: 'Unit Tests (Vitest 1/4)', bucket: 'skipping' }], files).state, 'missing');
  const partial = evaluateCi([{ name: 'Unit Tests (Vitest 1/4)', bucket: 'pass' }], files);
  assert.equal(partial.state, 'missing');
  assert.deepEqual(partial.missing_required, ['Typecheck']);
  const ok = evaluateCi(
    [
      { name: 'Unit Tests (Vitest 1/4)', bucket: 'pass' },
      { name: 'Typecheck (tsc)', bucket: 'pass' },
      { name: 'Live Integration (STT + Finalize, Opt-In)', bucket: 'skipping' },
    ],
    files,
  );
  assert.equal(ok.state, 'pass');
  assert.equal(evaluateCi([{ name: 'Typecheck (tsc)', bucket: 'fail' }], files).state, 'fail');
  assert.equal(evaluateCi([{ name: 'Typecheck (tsc)', bucket: 'pending' }], files).state, 'pending');
});

test('CI: docs-only needs no CI, uncovered paths are reported', () => {
  assert.equal(evaluateCi([], ['docs/a.md']).state, 'not_required');
  const ci = evaluateCi([{ name: 'x', bucket: 'pass' }], ['mingle-messaging/src/a.ts', 'railway.json']);
  assert.deepEqual(ci.uncovered, ['mingle-messaging/src/a.ts', 'railway.json']);
});

test('scope check against the plan', () => {
  const plan = {
    units: [
      { id: 'a', allowed: ['mingle-app/src/components/A*.tsx'] },
      { id: 'b', allowed: ['mingle-app/src/lib/b.ts'] },
    ],
  };
  assert.deepEqual(checkScope(['x'], null), { checked: false, ok: null, outside: [] });
  assert.equal(checkScope(['mingle-app/src/components/A.tsx', 'mingle-app/src/lib/b.ts'], plan).ok, true);
  const unitOnly = checkScope(['mingle-app/src/components/A.tsx', 'mingle-app/src/lib/b.ts'], plan, 'a');
  assert.equal(unitOnly.ok, false);
  assert.deepEqual(unitOnly.outside, ['mingle-app/src/lib/b.ts']);
  assert.equal(checkScope(['x'], plan, 'zzz').ok, false);
});

test('migration and env detection', () => {
  const known = parseEnvExampleKeys('A_KEY=1\n# B_KEY=\nexport C_KEY=x\nlower=1\n');
  assert.deepEqual([...known].sort(), ['A_KEY', 'B_KEY', 'C_KEY']);
  const patches = {
    'mingle-app/src/lib/x.ts': '+const a = process.env.A_KEY;\n+const n = process.env.NEW_KEY;\n+const m = process.env["OTHER_KEY"];\n-const o = process.env.OLD_KEY;\n',
  };
  const flags = detectMigrationAndEnv(['mingle-app/src/lib/x.ts', 'mingle-app/prisma/migrations/1/migration.sql'], patches, known);
  assert.equal(flags.migration, true);
  assert.equal(flags.env_change, true);
  assert.deepEqual(flags.new_env_keys, ['NEW_KEY', 'OTHER_KEY']);
  assert.equal(detectMigrationAndEnv(['docs/a.md'], {}, known).env_change, false);
  const fromTest = detectMigrationAndEnv(['scripts/x.test.mjs'], { 'scripts/x.test.mjs': '+process.env.NEW_KEY\n' }, known);
  assert.equal(fromTest.env_change, false);
});

const passCi = (files) =>
  evaluateCi([{ name: 'Unit Tests (Vitest 1/4)', bucket: 'pass' }, { name: 'Typecheck (tsc)', bucket: 'pass' }], files);
const noFlags = { migration: false, env_change: false, new_env_keys: [] };
const noScope = { checked: false, ok: null, outside: [] };

test('decide: lanes map to auto / approve', () => {
  const f1 = ['mingle-app/src/components/A.tsx'];
  assert.deepEqual(decide({ lane: 'L1', ci: passCi(f1), scope: noScope, flags: noFlags }).merge, 'auto');
  const f2 = ['mingle-app/src/lib/a.ts'];
  assert.equal(decide({ lane: 'L2', ci: passCi(f2), scope: noScope, flags: noFlags }).merge, 'approve');
  const f3 = ['mingle-app/prisma/schema.prisma'];
  assert.equal(decide({ lane: 'L3', ci: passCi(f3), scope: noScope, flags: noFlags }).merge, 'approve');
  const f0 = ['docs/a.md'];
  assert.equal(decide({ lane: 'L0', ci: evaluateCi([], f0), scope: noScope, flags: noFlags }).merge, 'auto');
});

test('decide: red and pending block merging', () => {
  const f = ['mingle-app/src/components/A.tsx'];
  const red = decide({ lane: 'L1', ci: evaluateCi([{ name: 'Typecheck (tsc)', bucket: 'fail' }], f), scope: noScope, flags: noFlags });
  assert.equal(red.verdict, 'red');
  assert.equal(red.merge, 'none');
  const outside = decide({ lane: 'L1', ci: passCi(f), scope: { checked: true, ok: false, outside: f }, flags: noFlags });
  assert.equal(outside.verdict, 'red');
  assert.equal(decide({ lane: 'L1', ci: evaluateCi([], f), scope: noScope, flags: noFlags }).verdict, 'pending');
  assert.equal(decide({ lane: 'L1', ci: passCi(f), scope: noScope, flags: noFlags, requirePlan: true }).verdict, 'pending');
});

test('decide: uncovered paths and env changes downgrade auto to approve', () => {
  const f = ['mingle-landing/app/page.tsx', 'mingle-model-test/x.ts'];
  const ci = evaluateCi([{ name: 'Landing Namespace Contracts', bucket: 'pass' }], f);
  const d = decide({ lane: 'L1', ci, scope: noScope, flags: noFlags });
  assert.equal(d.merge, 'approve');
  const f1 = ['mingle-app/src/components/A.tsx'];
  const env = decide({ lane: 'L1', ci: passCi(f1), scope: noScope, flags: { ...noFlags, env_change: true } });
  assert.equal(env.merge, 'approve');
});

test('decide: CI not read keeps merge closed, auto lanes come from config, L3 never opens', () => {
  const f1 = ['mingle-app/src/components/A.tsx'];
  const notRead = decide({ lane: 'L1', ci: { ...evaluateCi([], f1), state: 'not_read' }, scope: noScope, flags: noFlags });
  assert.equal(notRead.verdict, 'green');
  assert.equal(notRead.merge, 'none');
  const f2 = ['mingle-app/src/lib/a.ts'];
  assert.equal(decide({ lane: 'L2', ci: passCi(f2), scope: noScope, flags: noFlags, autoLanes: ['L0', 'L1', 'L2'] }).merge, 'auto');
  const f3 = ['mingle-app/prisma/schema.prisma'];
  assert.equal(decide({ lane: 'L3', ci: passCi(f3), scope: noScope, flags: noFlags, autoLanes: ['L0', 'L1', 'L2', 'L3'] }).merge, 'approve');
  const broken = decide({ lane: 'L0', ci: evaluateCi([], ['docs/a.md']), scope: noScope, flags: noFlags, docs: { broken: ['docs/a.md: x.md'] } });
  assert.equal(broken.verdict, 'red');
});

test('return packet: only the failed unit, scoped, escalates on the third attempt', () => {
  const f = ['mingle-app/src/components/A.tsx', 'mingle-app/src/lib/b.ts'];
  const ci = evaluateCi([{ name: 'Typecheck (tsc)', bucket: 'fail' }], f);
  const scope = { checked: true, ok: false, outside: ['mingle-app/src/lib/b.ts'] };
  const result = { ...decide({ lane: 'L2', ci, scope, flags: noFlags }), ci, scope };
  const u = { id: 'a', allowed: ['mingle-app/src/components/A.tsx'] };
  const p1 = buildReturnPacket({ unit: u, result, attempt: 1, checkUrls: { 'Typecheck (tsc)': 'https://ci/1' } });
  assert.equal(p1.unit, 'a');
  assert.equal(p1.verdict, 'red');
  assert.deepEqual(p1.scope, ['mingle-app/src/components/A.tsx']);
  assert.ok(p1.evidence.includes('Typecheck (tsc): https://ci/1'));
  assert.ok(p1.evidence.includes('outside plan: mingle-app/src/lib/b.ts'));
  assert.equal(p1.escalate, false);
  assert.equal(buildReturnPacket({ unit: u, result, attempt: 3 }).escalate, true);
});

test('rollback stats decide when L2 may go auto', () => {
  const l2 = { files: ['mingle-app/src/lib/a.ts'] };
  const prs = Array.from({ length: 10 }, () => l2).concat([{ files: ['docs/a.md'] }]);
  const clean = rollbackStats(prs, []);
  assert.equal(clean.stats.L2.merged, 10);
  assert.equal(clean.stats.L0.merged, 1);
  assert.match(clean.recommendation, /may switch L2 to auto/);
  const dirty = rollbackStats(prs, [{ subject: 'Revert "x"', files: ['mingle-app/src/lib/a.ts'] }]);
  assert.equal(dirty.stats.L2.reverted, 1);
  assert.match(dirty.recommendation, /Keep approval/);
  assert.match(rollbackStats(prs.slice(0, 3), []).recommendation, /Keep approval/);
});

test('broken doc links', () => {
  const exists = (p) => ['docs/b.md', 'scripts/x.mjs'].includes(p);
  const text = '[ok](b.md) [ok2](../scripts/x.mjs#L3) [web](https://x.y) [anchor](#top) [bad](missing.md)';
  assert.deepEqual(brokenDocLinks('docs/a.md', text, exists), ['docs/a.md: missing.md']);
});
