#!/usr/bin/env node
// Agent gate: classifies a change into a lane (L0-L3), checks scope against a plan,
// reads CI results and decides whether an agent may merge. Design: docs/agent-loop-graph-design.md
//
// Usage:
//   node scripts/agent-gate.mjs --pr 414                 # a pull request (files + CI from gh)
//   node scripts/agent-gate.mjs --base origin/main       # local branch, CI not read
//   node scripts/agent-gate.mjs --pr 414 --plan .agent/plan.json --unit chat-bubble-align
//   node scripts/agent-gate.mjs --pr 414 --plan .agent/plan.json --unit chat-bubble-align --return
//                                                        # red: write .agent/returns/<unit>.json
//   node scripts/agent-gate.mjs --pr 414 --markdown      # PR comment body
//   node scripts/agent-gate.mjs --base origin/main --no-ci-read --markdown   # inside CI
//   node scripts/agent-gate.mjs --backtest 20            # lanes of the last 20 merged PRs
//   node scripts/agent-gate.mjs --rollback-stats --days 30
//
// Exit codes: 0 green, 1 red, 3 pending (CI running / missing), 4 escalate (3rd failed return),
// 2 usage error.

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import {
  brokenDocLinks,
  buildReturnPacket,
  checkScope,
  classifyChange,
  decide,
  detectMigrationAndEnv,
  evaluateCi,
  parseEnvExampleKeys,
  renderMarkdown,
  rollbackStats,
} from './agent-gate.logic.mjs';
import { parseConstraints, relevantConstraints } from './agent-constraints.logic.mjs';

const ENV_EXAMPLES = ['mingle-app/.env.example', 'mingle-landing/.env.example', 'mingle-stt/.env.example'];
const CONFIG = '.github/agent-gate.json';
const CONSTRAINTS = 'docs/agent-constraints.md';

function parseArgs(argv) {
  const args = { base: 'origin/main', head: 'HEAD', days: 30 };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    const next = () => {
      const v = argv[i + 1];
      if (v === undefined) throw new Error(`${a} needs a value`);
      i += 1;
      return v;
    };
    if (a === '--pr') args.pr = next();
    else if (a === '--base') args.base = next();
    else if (a === '--head') args.head = next();
    else if (a === '--plan') args.plan = next();
    else if (a === '--unit') args.unit = next();
    else if (a === '--checks-json') args.checksJson = next();
    else if (a === '--backtest') args.backtest = Number(next());
    else if (a === '--days') args.days = Number(next());
    else if (a === '--rollback-stats') args.rollbackStats = true;
    else if (a === '--return') args.return = true;
    else if (a === '--no-ci-read') args.noCiRead = true;
    else if (a === '--markdown') args.markdown = true;
    else if (a === '--require-plan') args.requirePlan = true;
    else if (a === '-h' || a === '--help') args.help = true;
    else throw new Error(`unknown argument ${a}`);
  }
  if (args.return && (!args.plan || !args.unit)) throw new Error('--return needs --plan and --unit');
  return args;
}

function run(cmd, cmdArgs) {
  return execFileSync(cmd, cmdArgs, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout: 60_000 });
}

function repoRoot() {
  return run('git', ['rev-parse', '--show-toplevel']).trim();
}

// Split a unified diff into { path: patchText }.
function splitPatch(diff) {
  const patches = {};
  let current = null;
  for (const line of diff.split('\n')) {
    const m = line.match(/^diff --git a\/(.+?) b\/(.+)$/);
    if (m) {
      current = m[2];
      patches[current] = '';
      continue;
    }
    if (current) patches[current] += `${line}\n`;
  }
  return patches;
}

function loadChange(args) {
  if (args.pr) {
    const files = run('gh', ['pr', 'diff', args.pr, '--name-only']).split('\n').filter(Boolean);
    const patches = splitPatch(run('gh', ['pr', 'diff', args.pr]));
    return { files, patches };
  }
  const range = `${args.base}...${args.head}`;
  const files = run('git', ['diff', '--name-only', range]).split('\n').filter(Boolean);
  const patches = splitPatch(run('git', ['diff', range]));
  return { files, patches };
}

function loadChecks(args) {
  if (args.checksJson) return JSON.parse(readFileSync(args.checksJson, 'utf8'));
  if (!args.pr) return null;
  try {
    return JSON.parse(run('gh', ['pr', 'checks', args.pr, '--json', 'name,bucket,link']));
  } catch (err) {
    // `gh pr checks` exits non-zero when checks fail or are pending but still prints JSON.
    const out = err.stdout?.toString() ?? '';
    if (out.trim().startsWith('[')) return JSON.parse(out);
    if (/no checks reported/i.test(err.stderr?.toString() ?? '')) return [];
    throw err;
  }
}

function loadEnvKeys(root) {
  const keys = new Set();
  for (const rel of ENV_EXAMPLES) {
    const p = join(root, rel);
    if (existsSync(p)) parseEnvExampleKeys(readFileSync(p, 'utf8')).forEach((k) => keys.add(k));
  }
  return keys;
}

function loadConfig(root) {
  const p = join(root, CONFIG);
  const config = existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : {};
  // L3 can never be listed: the closed lane does not open by config.
  const autoLanes = (config.auto_lanes ?? ['L0', 'L1']).filter((l) => l !== 'L3');
  return { autoLanes };
}

function loadConstraints(root) {
  const p = join(root, CONSTRAINTS);
  return existsSync(p) ? parseConstraints(readFileSync(p, 'utf8')) : [];
}

// Doc links are checked against the working tree, so only when it holds the change.
function checkDocs(root, files, args) {
  const local = !args.pr || run('git', ['rev-parse', '--abbrev-ref', 'HEAD']).trim() === prHeadBranch(args.pr);
  if (!local) return { checked: false, broken: [] };
  const broken = [];
  for (const f of files.filter((x) => x.endsWith('.md'))) {
    const p = join(root, f);
    if (!existsSync(p)) continue;
    broken.push(...brokenDocLinks(f, readFileSync(p, 'utf8'), (rel) => existsSync(join(root, rel))));
  }
  return { checked: true, broken };
}

function prHeadBranch(pr) {
  try {
    return run('gh', ['pr', 'view', pr, '--json', 'headRefName', '-q', '.headRefName']).trim();
  } catch {
    return null;
  }
}

function revertCount(files, base) {
  if (!files.length) return 0;
  try {
    const out = run('git', ['log', '--oneline', '--grep', '^Revert', base, '--', ...files]);
    return out.split('\n').filter(Boolean).length;
  } catch {
    return null;
  }
}

function gate(args) {
  const root = repoRoot();
  const { files, patches } = loadChange(args);
  const { lane, items } = classifyChange(files, patches);
  const checks = args.noCiRead ? null : loadChecks(args);
  let ci;
  if (args.noCiRead) ci = { ...evaluateCi([], files, { lane }), state: 'not_read' };
  else if (checks) ci = evaluateCi(checks, files, { lane });
  else ci = { ...evaluateCi([], files, { lane }), note: 'CI not read (no --pr)' };
  const plan = args.plan ? JSON.parse(readFileSync(args.plan, 'utf8')) : null;
  const scope = checkScope(files, plan, args.unit);
  const flags = detectMigrationAndEnv(files, patches, loadEnvKeys(root));
  const docs = checkDocs(root, files, args);
  const { autoLanes } = loadConfig(root);
  const { verdict, merge, reasons } = decide({ lane, ci, scope, flags, docs, autoLanes, requirePlan: args.requirePlan });
  const constraints = relevantConstraints(loadConstraints(root), files).map(({ id, rule, source }) => ({ id, rule, source }));
  const checkUrls = Object.fromEntries((checks ?? []).filter((c) => c.link).map((c) => [c.name, c.link]));
  return {
    pr: args.pr ?? null,
    lane,
    verdict,
    merge,
    reasons,
    ci,
    scope,
    flags,
    docs,
    constraints,
    evidence: { revert_count: revertCount(files, args.base) },
    items,
    _checkUrls: checkUrls,
    _plan: plan,
  };
}

// Correction edge. Attempts live next to the plan so they survive worker restarts.
function writeReturn(args, result) {
  const unit = result._plan.units.find((u) => u.id === args.unit);
  const dir = dirname(args.plan);
  const attemptsPath = join(dir, 'attempts.json');
  const attempts = existsSync(attemptsPath) ? JSON.parse(readFileSync(attemptsPath, 'utf8')) : {};
  if (result.verdict !== 'red') return null;
  attempts[args.unit] = (attempts[args.unit] ?? 0) + 1;
  writeFileSync(attemptsPath, `${JSON.stringify(attempts, null, 2)}\n`);
  const packet = buildReturnPacket({ unit, result, attempt: attempts[args.unit], checkUrls: result._checkUrls });
  mkdirSync(join(dir, 'returns'), { recursive: true });
  const out = join(dir, 'returns', `${args.unit}.json`);
  writeFileSync(out, `${JSON.stringify(packet, null, 2)}\n`);
  return { packet, path: out };
}

function mergedPrs(limit, sinceDays) {
  const argv = ['pr', 'list', '--state', 'merged', '--limit', String(limit), '--json', 'number,title,files,mergedAt'];
  if (sinceDays) {
    const since = new Date(Date.now() - sinceDays * 86_400_000).toISOString().slice(0, 10);
    argv.push('--search', `merged:>=${since}`);
  }
  return JSON.parse(run('gh', argv)).map((pr) => ({ ...pr, files: (pr.files ?? []).map((f) => f.path) }));
}

function backtest(n) {
  const rows = mergedPrs(n).map((pr) => {
    const { lane, items } = classifyChange(pr.files);
    const top = items.filter((i) => i.lane === lane).map((i) => i.reason);
    return { number: pr.number, title: pr.title, lane, why: [...new Set(top)].join('; ') };
  });
  const lines = ['| PR | lane | why | title |', '|---|---|---|---|'];
  for (const r of rows) lines.push(`| #${r.number} | ${r.lane} | ${r.why} | ${r.title.replace(/\|/g, '/')} |`);
  return lines.join('\n');
}

function revertsSince(days, base) {
  const out = run('git', ['log', base, `--since=${days} days ago`, '--grep', '^Revert', '--name-only', '--format=@@%h %s']);
  const reverts = [];
  for (const line of out.split('\n')) {
    if (line.startsWith('@@')) reverts.push({ subject: line.slice(2), files: [] });
    else if (line.trim() && reverts.length) reverts[reverts.length - 1].files.push(line.trim());
  }
  return reverts;
}

function printRollbackStats(args) {
  const { stats, recommendation } = rollbackStats(mergedPrs(500, args.days), revertsSince(args.days, args.base));
  const lines = [`Last ${args.days} days`, '', '| lane | merged PRs | reverts |', '|---|---|---|'];
  for (const [lane, s] of Object.entries(stats)) lines.push(`| ${lane} | ${s.merged} | ${s.reverted} |`);
  lines.push('', recommendation, '', `Auto-merge lanes are set in ${CONFIG} (Nam's decision; L3 cannot be listed).`);
  for (const [lane, s] of Object.entries(stats)) for (const r of s.reverts) lines.push(`- ${lane} revert: ${r}`);
  return lines.join('\n');
}

function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(err.message);
    process.exit(2);
  }
  if (args.help) {
    console.log(readFileSync(new URL(import.meta.url), 'utf8').split('\n').slice(1, 20).join('\n'));
    return;
  }
  if (args.backtest) {
    console.log(backtest(args.backtest));
    return;
  }
  if (args.rollbackStats) {
    console.log(printRollbackStats(args));
    return;
  }
  const result = gate(args);
  const ret = args.return ? writeReturn(args, result) : null;
  const { _checkUrls, _plan, ...publicResult } = result;
  if (ret) publicResult.return_packet = { path: ret.path, ...ret.packet };
  console.log(args.markdown ? renderMarkdown(publicResult) : JSON.stringify(publicResult, null, 2));
  if (ret?.packet.escalate) process.exit(4);
  process.exit(result.verdict === 'green' ? 0 : result.verdict === 'red' ? 1 : 3);
}

main();
