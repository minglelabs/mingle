#!/usr/bin/env node
// Agent gate: classifies a change into a lane (L0-L3), checks scope against a plan,
// reads CI results and decides whether an agent may merge. Design: docs/agent-loop-graph-design.md
//
// Usage:
//   node scripts/agent-gate.mjs --pr 414                 # a pull request (files + CI from gh)
//   node scripts/agent-gate.mjs --base origin/main       # local branch, CI not read
//   node scripts/agent-gate.mjs --pr 414 --plan .agent/plan.json --unit chat-bubble-align
//   node scripts/agent-gate.mjs --pr 414 --markdown      # PR comment body
//   node scripts/agent-gate.mjs --backtest 20            # lanes of the last 20 merged PRs
//
// Exit codes: 0 green, 1 red, 3 pending (CI running / missing), 2 usage error.

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  checkScope,
  classifyChange,
  decide,
  detectMigrationAndEnv,
  evaluateCi,
  parseEnvExampleKeys,
  renderMarkdown,
} from './agent-gate.logic.mjs';

const ENV_EXAMPLES = ['mingle-app/.env.example', 'mingle-landing/.env.example', 'mingle-stt/.env.example'];

function parseArgs(argv) {
  const args = { base: 'origin/main', head: 'HEAD' };
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
    else if (a === '--markdown') args.markdown = true;
    else if (a === '--require-plan') args.requirePlan = true;
    else if (a === '-h' || a === '--help') args.help = true;
    else throw new Error(`unknown argument ${a}`);
  }
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
    return JSON.parse(run('gh', ['pr', 'checks', args.pr, '--json', 'name,bucket']));
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
  const checks = loadChecks(args);
  const ci = checks
    ? evaluateCi(checks, files, { lane })
    : { ...evaluateCi([], files, { lane }), note: 'CI not read (no --pr)' };
  const plan = args.plan ? JSON.parse(readFileSync(args.plan, 'utf8')) : null;
  const scope = checkScope(files, plan, args.unit);
  const flags = detectMigrationAndEnv(files, patches, loadEnvKeys(root));
  const { verdict, merge, reasons } = decide({ lane, ci, scope, flags, requirePlan: args.requirePlan });
  return {
    pr: args.pr ?? null,
    lane,
    verdict,
    merge,
    reasons,
    ci,
    scope,
    flags,
    evidence: { revert_count: revertCount(files, args.base) },
    items,
  };
}

function backtest(n) {
  const prs = JSON.parse(
    run('gh', ['pr', 'list', '--state', 'merged', '--limit', String(n), '--json', 'number,title,files']),
  );
  const rows = prs.map((pr) => {
    const files = (pr.files ?? []).map((f) => f.path);
    const { lane, items } = classifyChange(files);
    const top = items.filter((i) => i.lane === lane).map((i) => i.reason);
    return { number: pr.number, title: pr.title, lane, why: [...new Set(top)].join('; ') };
  });
  const lines = ['| PR | lane | why | title |', '|---|---|---|---|'];
  for (const r of rows) lines.push(`| #${r.number} | ${r.lane} | ${r.why} | ${r.title.replace(/\|/g, '/')} |`);
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
    console.log(readFileSync(new URL(import.meta.url), 'utf8').split('\n').slice(1, 14).join('\n'));
    return;
  }
  if (args.backtest) {
    console.log(backtest(args.backtest));
    return;
  }
  const result = gate(args);
  console.log(args.markdown ? renderMarkdown(result) : JSON.stringify(result, null, 2));
  process.exit(result.verdict === 'green' ? 0 : result.verdict === 'red' ? 1 : 3);
}

main();
