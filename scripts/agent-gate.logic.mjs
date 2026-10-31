// Pure decision logic for the agent gate. No I/O here so every rule is unit-testable.
// Design: docs/agent-loop-graph-design.md

export const LANES = ['L0', 'L1', 'L2', 'L3'];

export function globToRegExp(glob) {
  let re = '';
  for (let i = 0; i < glob.length; i += 1) {
    const ch = glob[i];
    if (ch === '*') {
      if (glob[i + 1] === '*') {
        i += 1;
        if (glob[i + 1] === '/') {
          i += 1;
          re += '(?:.*/)?';
        } else {
          re += '.*';
        }
      } else {
        re += '[^/]*';
      }
    } else if (ch === '?') {
      re += '[^/]';
    } else {
      re += ch.replace(/[.+^${}()|[\]\\]/g, '\\$&');
    }
  }
  return new RegExp(`^${re}$`);
}

export function matchesGlob(path, glob) {
  return globToRegExp(glob).test(path);
}

// Payment code: a path segment that starts with one of these words.
const MONEY_SEGMENT = /(^|\/)(coins?|iap|purchases?|billing|payments?|web-checkout|nativeiap)([-_./]|$)/i;

// Order matters: the first matching rule wins, so closed-lane rules come first.
export const LANE_RULES = [
  // L3: closed lane. Always needs Nam's approval.
  { lane: 'L3', glob: 'scripts/agent-gate*', reason: 'changes the gate itself' },
  { lane: 'L3', glob: '.github/**', reason: 'changes CI, the gate input' },
  { lane: 'L3', glob: '**/prisma/**', reason: 'database schema or migration' },
  { lane: 'L3', glob: '**/.env*', reason: 'environment variables' },
  { lane: 'L3', glob: 'railway/**', reason: 'production deploy config' },
  { lane: 'L3', glob: 'railway.json', reason: 'production deploy config' },
  { lane: 'L3', glob: 'Dockerfile*', reason: 'production deploy config' },
  { lane: 'L3', glob: '**/vercel.json', reason: 'production deploy config' },
  { lane: 'L3', glob: 'mingle-app/rn/**', reason: 'native app code, needs an app release' },
  { lane: 'L3', glob: 'mingle-app/scripts/seed*', reason: 'writes production data' },
  { lane: 'L3', glob: 'mingle-app/scripts/backfill*', reason: 'writes production data' },
  { lane: 'L3', glob: 'mingle-app/scripts/*delete*', reason: 'deletes data' },
  { lane: 'L3', glob: 'mingle-app/scripts/*purge*', reason: 'deletes data' },
  { lane: 'L3', glob: 'scripts/google-play-console-*', reason: 'store release' },
  { lane: 'L3', glob: 'scripts/ios-appstore-*', reason: 'store release' },
  { lane: 'L3', test: (p) => MONEY_SEGMENT.test(p), reason: 'moves money (coins / IAP)' },

  // L0: documentation.
  { lane: 'L0', glob: '**/*.md', reason: 'documentation' },
  { lane: 'L0', glob: 'docs/**', reason: 'documentation' },
  { lane: 'L0', glob: 'mingle-app/docs/**', reason: 'documentation' },

  // L1: reversible and contained.
  { lane: 'L1', glob: '**/*.test.*', reason: 'test only' },
  { lane: 'L1', glob: '**/__tests__/**', reason: 'test only' },
  { lane: 'L1', glob: 'mingle-app/src/app/admin/**', reason: 'admin tool UI' },
  { lane: 'L1', glob: 'mingle-app/src/server/admin/**', reason: 'admin tool server code' },
  { lane: 'L1', glob: 'mingle-app/src/server/operator*/**', reason: 'admin tool server code (operators)' },
  { lane: 'L1', glob: 'mingle-app/src/lib/admin-*', reason: 'admin tool helper' },
  { lane: 'L1', glob: 'mingle-app/src/components/**', reason: 'web UI component' },
  { lane: 'L1', glob: 'mingle-app/src/app/[locale]/**', reason: 'web UI page' },
  { lane: 'L1', glob: 'mingle-app/src/i18n/**', reason: 'UI copy' },
  { lane: 'L1', glob: 'mingle-app/public/**', reason: 'static asset' },
  { lane: 'L1', glob: 'mingle-app/qa/**', reason: 'QA tooling' },
  { lane: 'L1', glob: 'mingle-app/scripts/**', reason: 'dev / QA script' },
  { lane: 'L1', glob: 'scripts/devbox*', reason: 'devbox tooling' },
  { lane: 'L1', glob: 'mingle-landing/**', reason: 'landing site' },
  { lane: 'L1', glob: 'mingle-model-test/**', reason: 'internal model test tool' },

  // L2: reversible but wide.
  { lane: 'L2', glob: '**/pnpm-lock.yaml', reason: 'dependency change' },
  { lane: 'L2', glob: '**/package.json', reason: 'dependency or script change' },
  { lane: 'L2', glob: 'mingle-app/src/**', reason: 'shared app / server code' },
  { lane: 'L2', glob: 'shared/**', reason: 'shared package' },
  { lane: 'L2', glob: 'mingle-stt/**', reason: 'STT service' },
  { lane: 'L2', glob: 'mingle-messaging/**', reason: 'messaging service' },
  { lane: 'L2', glob: 'mingle-xr/**', reason: 'XR app' },
  { lane: 'L2', glob: 'scripts/**', reason: 'repo script' },
];

// Content rules: a change inside a file that raises its lane.
const VERSION_LINE = /^[+-]\s*"version"\s*:/m;
const NAMESPACE_LINE = /^[+-].*(NEXT_PUBLIC_API_NAMESPACE|RN_API_NAMESPACE|MINGLE_RELEASE_TARGET)/m;

// The test rule above must not hide closed-lane code: `**/*.test.*` under prisma or rn stays L3
// because L3 rules are evaluated first.
export function classifyFile(path, patch = '') {
  if (/(^|\/)package\.json$/.test(path) && (VERSION_LINE.test(patch) || NAMESPACE_LINE.test(patch))) {
    return { path, lane: 'L3', reason: 'app version or API namespace' };
  }
  for (const rule of LANE_RULES) {
    const hit = rule.test ? rule.test(path) : matchesGlob(path, rule.glob);
    if (hit) return { path, lane: rule.lane, reason: rule.reason };
  }
  return { path, lane: 'L2', reason: 'unclassified path, treated as wide' };
}

export function maxLane(lanes) {
  let best = 'L0';
  for (const lane of lanes) if (LANES.indexOf(lane) > LANES.indexOf(best)) best = lane;
  return best;
}

export function classifyChange(files, patches = {}) {
  const items = files.map((f) => classifyFile(f, patches[f] ?? ''));
  return { lane: items.length ? maxLane(items.map((i) => i.lane)) : 'L0', items };
}

// Paths each workflow's `paths` filter covers. Keep in sync with .github/workflows.
export const CI_COVERAGE = {
  'mingle-app TDD': ['mingle-app/**', 'mingle-stt/**', 'scripts/**', 'data/**', '.github/workflows/mingle-app-tdd.yml'],
  'Namespace Contract Tests': ['mingle-app/**', 'mingle-landing/**'],
};

// Jobs that must have passed when files under the prefix changed.
export const REQUIRED_JOBS = [
  { glob: 'mingle-app/**', jobs: ['Unit Tests', 'Typecheck'] },
  { glob: 'mingle-landing/**', jobs: ['Landing Namespace Contracts'] },
];

export function ciCoverage(files) {
  const uncovered = files.filter(
    (f) => !Object.values(CI_COVERAGE).some((globs) => globs.some((g) => matchesGlob(f, g))),
  );
  return { covered: files.filter((f) => !uncovered.includes(f)), uncovered };
}

export function requiredJobsFor(files) {
  const jobs = new Set();
  for (const rule of REQUIRED_JOBS) {
    if (files.some((f) => matchesGlob(f, rule.glob))) rule.jobs.forEach((j) => jobs.add(j));
  }
  return [...jobs];
}

// checks: [{ name, bucket }] from `gh pr checks --json name,bucket`.
// bucket is one of pass | fail | pending | skipping | cancel.
export function evaluateCi(checks, files, { lane } = {}) {
  const codeFiles = files.filter((f) => classifyFile(f).lane !== 'L0');
  const { uncovered } = ciCoverage(codeFiles);
  const required = requiredJobsFor(codeFiles);
  const failed = checks.filter((c) => c.bucket === 'fail' || c.bucket === 'cancel').map((c) => c.name);
  const pending = checks.filter((c) => c.bucket === 'pending').map((c) => c.name);
  const passedNames = checks.filter((c) => c.bucket === 'pass').map((c) => c.name);
  const missingRequired = required.filter((job) => !passedNames.some((n) => n.startsWith(job)));

  let state;
  if (failed.length) state = 'fail';
  else if (pending.length) state = 'pending';
  else if (codeFiles.length === 0) state = 'not_required';
  else if (missingRequired.length) state = 'missing';
  else if (passedNames.length === 0) state = 'missing';
  else state = 'pass';

  return {
    state,
    failed,
    pending,
    required,
    missing_required: missingRequired,
    // Files no workflow runs on. A skipped CI run is not a green check.
    uncovered,
    lane,
  };
}

// plan: { units: [{ id, allowed: [glob] }] }. unitId limits the check to one unit.
export function checkScope(files, plan, unitId) {
  if (!plan) return { checked: false, ok: null, outside: [] };
  const units = (plan.units ?? []).filter((u) => !unitId || u.id === unitId);
  if (unitId && units.length === 0) {
    return { checked: true, ok: false, outside: files, error: `unit '${unitId}' not in plan` };
  }
  const allowed = units.flatMap((u) => u.allowed ?? []);
  const outside = files.filter((f) => !allowed.some((g) => matchesGlob(f, g)));
  return { checked: true, ok: outside.length === 0, outside };
}

const MIGRATION_PATH = /(^|\/)prisma\/(migrations\/|schema\.prisma$)/;
const ENV_FILE = /(^|\/)\.env[^/]*$/;
const ENV_READ = /process\.env\.([A-Z][A-Z0-9_]*)|process\.env\[['"]([A-Z][A-Z0-9_]*)['"]\]/g;

// knownEnvKeys: keys listed in .env.example files. A new process.env key not listed there is an
// env change the deploy needs to know about.
export function detectMigrationAndEnv(files, patches = {}, knownEnvKeys = new Set()) {
  const migrations = files.filter((f) => MIGRATION_PATH.test(f));
  const envFiles = files.filter((f) => ENV_FILE.test(f));
  const newKeys = new Set();
  for (const [file, patch] of Object.entries(patches)) {
    if (!files.includes(file)) continue;
    for (const line of patch.split('\n')) {
      if (!line.startsWith('+') || line.startsWith('+++')) continue;
      for (const m of line.matchAll(ENV_READ)) {
        const key = m[1] ?? m[2];
        if (!knownEnvKeys.has(key)) newKeys.add(key);
      }
    }
  }
  return {
    migration: migrations.length > 0,
    migration_files: migrations,
    env_change: envFiles.length > 0 || newKeys.size > 0,
    env_files: envFiles,
    new_env_keys: [...newKeys].sort(),
  };
}

export function parseEnvExampleKeys(text) {
  const keys = new Set();
  for (const line of text.split('\n')) {
    const m = line.match(/^\s*#?\s*(?:export\s+)?([A-Z][A-Z0-9_]*)\s*=/);
    if (m) keys.add(m[1]);
  }
  return keys;
}

// Final decision. Evidence order: deterministic results first, model opinion never.
// merge: auto = agent may merge; approve = Nam approves; none = not mergeable yet.
export function decide({ lane, ci, scope, flags, requirePlan = false }) {
  const reasons = [];
  let verdict = 'green';

  if (ci.state === 'fail') {
    verdict = 'red';
    reasons.push(`CI failed: ${ci.failed.join(', ')}`);
  }
  if (scope.checked && !scope.ok) {
    verdict = 'red';
    reasons.push(`files outside plan: ${scope.outside.join(', ')}`);
  }
  if (verdict !== 'red' && ci.state === 'pending') {
    verdict = 'pending';
    reasons.push(`CI running: ${ci.pending.join(', ')}`);
  }
  if (verdict === 'green' && ci.state === 'missing') {
    verdict = 'pending';
    reasons.push(
      ci.missing_required.length
        ? `required CI jobs have not passed: ${ci.missing_required.join(', ')}`
        : 'no CI check has passed',
    );
  }
  if (verdict === 'green' && !scope.checked && requirePlan) {
    verdict = 'pending';
    reasons.push('no plan given (--plan), scope not checked');
  }

  let merge = 'none';
  if (verdict === 'green') {
    merge = 'auto';
    if (lane === 'L3') {
      merge = 'approve';
      reasons.push('L3 is a closed lane: Nam approves');
    } else if (lane === 'L2') {
      merge = 'approve';
      reasons.push('L2 needs approval until rollback history allows auto merge');
    }
    if (merge === 'auto' && ci.uncovered.length) {
      merge = 'approve';
      reasons.push(`no CI runs on: ${ci.uncovered.join(', ')}`);
    }
    if (merge === 'auto' && (flags.migration || flags.env_change)) {
      merge = 'approve';
      reasons.push('migration or env change');
    }
  }

  return { verdict, merge, reasons };
}

export function renderMarkdown(result) {
  const yesNo = (v) => (v ? 'yes' : 'no');
  const lines = [
    `### Agent gate: ${result.verdict} / merge: ${result.merge}`,
    '',
    `| item | value |`,
    `|---|---|`,
    `| lane | ${result.lane} |`,
    `| CI | ${result.ci.state} |`,
    `| scope | ${result.scope.checked ? (result.scope.ok ? 'inside plan' : 'outside plan') : 'not checked (no plan)'} |`,
    `| migration | ${yesNo(result.flags.migration)} |`,
    `| env change | ${yesNo(result.flags.env_change)}${result.flags.new_env_keys.length ? ` (${result.flags.new_env_keys.join(', ')})` : ''} |`,
    `| checked on a real device | not checked by the gate |`,
  ];
  if (result.reasons.length) {
    lines.push('', 'Reasons:', ...result.reasons.map((r) => `- ${r}`));
  }
  lines.push('', '<details><summary>Lane per file</summary>', '');
  for (const item of result.items) lines.push(`- \`${item.path}\` → ${item.lane} (${item.reason})`);
  lines.push('', '</details>');
  return lines.join('\n');
}
