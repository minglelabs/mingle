#!/usr/bin/env node
// Splitter tooling. Design: docs/agent-loop-graph-design.md
//
// Usage:
//   node scripts/agent-plan.mjs validate .agent/plan.json    # schema, cycles, parallel writer conflicts
//   node scripts/agent-plan.mjs waves .agent/plan.json       # which units run in parallel
//   node scripts/agent-plan.mjs brief .agent/plan.json <unit> # worker brief with constraints
//   node scripts/agent-plan.mjs constraints                  # check docs/agent-constraints.md
//   node scripts/agent-plan.mjs constraints <file|glob>...   # constraints that apply to these paths
//
// Exit codes: 0 ok, 1 invalid, 2 usage error.

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { parseConstraints, relevantConstraints, validateConstraints } from './agent-constraints.logic.mjs';
import { unitLane, validatePlan, waves, workerBrief, writerConflicts } from './agent-plan.logic.mjs';

const root = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8', timeout: 10_000 }).trim();
const constraintsPath = join(root, 'docs/agent-constraints.md');

function constraints() {
  return existsSync(constraintsPath) ? parseConstraints(readFileSync(constraintsPath, 'utf8')) : [];
}

function readPlan(path) {
  if (!path) usage();
  return JSON.parse(readFileSync(path, 'utf8'));
}

function usage() {
  console.error(readFileSync(new URL(import.meta.url), 'utf8').split('\n').slice(1, 12).join('\n'));
  process.exit(2);
}

const [cmd, ...rest] = process.argv.slice(2);

if (cmd === 'validate') {
  const plan = readPlan(rest[0]);
  const errors = validatePlan(plan);
  if (errors.length) {
    errors.forEach((e) => console.error(`error: ${e}`));
    process.exit(1);
  }
  const conflicts = writerConflicts(plan);
  for (const c of conflicts) {
    console.error(`error: units ${c.units.join(' and ')} run in parallel and may write the same files: ${c.globs.map((g) => g.join(' ~ ')).join(', ')}`);
  }
  if (conflicts.length) {
    console.error('Serialize them with depends_on or merge them into one unit.');
    process.exit(1);
  }
  for (const u of plan.units) console.log(`${u.id}: lane ${unitLane(u)}`);
  console.log('plan ok');
} else if (cmd === 'waves') {
  const plan = readPlan(rest[0]);
  const errors = validatePlan(plan);
  if (errors.length) {
    errors.forEach((e) => console.error(`error: ${e}`));
    process.exit(1);
  }
  waves(plan).forEach((w, i) => console.log(`wave ${i + 1} (parallel): ${w.join(', ')}`));
} else if (cmd === 'brief') {
  const plan = readPlan(rest[0]);
  if (!rest[1]) usage();
  console.log(workerBrief(plan, rest[1], constraints()));
} else if (cmd === 'constraints') {
  const entries = constraints();
  if (rest.length) {
    for (const c of relevantConstraints(entries, rest)) console.log(`${c.id}: ${c.rule} (source: ${c.source})`);
  } else {
    const errors = validateConstraints(entries);
    errors.forEach((e) => console.error(`error: ${e}`));
    if (errors.length) process.exit(1);
    console.log(`${entries.length} constraints ok`);
  }
} else {
  usage();
}
