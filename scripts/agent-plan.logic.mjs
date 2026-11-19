// Splitter output checks: plan validation, parallel waves, worker briefs.
// Design: docs/agent-loop-graph-design.md (sections 2 and 5).

import { classifyFile, maxLane } from './agent-gate.logic.mjs';
import { relevantConstraints } from './agent-constraints.logic.mjs';

export const MAX_ATTEMPTS = 3;

const ID = /^[a-z0-9][a-z0-9-]*$/;

// Literal part of a glob before the first wildcard. Used to spot units that may write the same files.
function literalPrefix(glob) {
  const i = glob.search(/[*?[]/);
  return i === -1 ? glob : glob.slice(0, i);
}

export function globsMayOverlap(a, b) {
  const pa = literalPrefix(a);
  const pb = literalPrefix(b);
  const exactA = pa === a;
  const exactB = pb === b;
  if (exactA && exactB) return a === b;
  if (exactA) return a.startsWith(pb);
  if (exactB) return b.startsWith(pa);
  return pa.startsWith(pb) || pb.startsWith(pa);
}

export function validatePlan(plan) {
  const errors = [];
  if (!plan || typeof plan !== 'object') return ['plan must be an object'];
  if (typeof plan.request !== 'string' || !plan.request.trim()) errors.push('request: required');
  if (!Array.isArray(plan.units) || plan.units.length === 0) {
    errors.push('units: at least one unit required');
    return errors;
  }
  const ids = new Set();
  for (const [i, u] of plan.units.entries()) {
    const at = `units[${i}]`;
    if (!ID.test(u.id ?? '')) errors.push(`${at}.id: lowercase letters, digits and dashes`);
    else if (ids.has(u.id)) errors.push(`${at}.id: duplicate '${u.id}'`);
    else ids.add(u.id);
    if (!Array.isArray(u.allowed) || u.allowed.length === 0) errors.push(`${at}.allowed: list the files this unit may change`);
    else if (u.allowed.some((g) => g === '**' || g === '**/*')) errors.push(`${at}.allowed: '**' allows everything, name the files`);
    if (!Array.isArray(u.check) || u.check.length === 0) {
      errors.push(`${at}.check: give at least one command a program can fail (e.g. a test command)`);
    }
    if (u.depends_on !== undefined && !Array.isArray(u.depends_on)) errors.push(`${at}.depends_on: must be a list`);
    if (u.device_qa !== undefined && !['none', 'android', 'ios', 'both'].includes(u.device_qa)) {
      errors.push(`${at}.device_qa: none | android | ios | both`);
    }
  }
  for (const u of plan.units) {
    for (const dep of u.depends_on ?? []) {
      if (!ids.has(dep)) errors.push(`unit '${u.id}' depends on unknown unit '${dep}'`);
      if (dep === u.id) errors.push(`unit '${u.id}' depends on itself`);
    }
  }
  if (errors.length === 0) {
    try {
      waves(plan);
    } catch (err) {
      errors.push(err.message);
    }
  }
  return errors;
}

// Topological levels: every unit in a wave only reads outputs of earlier waves, so a wave runs in parallel.
export function waves(plan) {
  const remaining = new Map(plan.units.map((u) => [u.id, new Set(u.depends_on ?? [])]));
  const done = new Set();
  const result = [];
  while (remaining.size) {
    const ready = [...remaining].filter(([, deps]) => [...deps].every((d) => done.has(d))).map(([id]) => id);
    if (!ready.length) throw new Error(`dependency cycle among: ${[...remaining.keys()].join(', ')}`);
    result.push(ready);
    for (const id of ready) {
      remaining.delete(id);
      done.add(id);
    }
  }
  return result;
}

// Two writers in one wave on the same files collide. They must be serialized or merged into one unit.
export function writerConflicts(plan) {
  const byId = new Map(plan.units.map((u) => [u.id, u]));
  const conflicts = [];
  for (const wave of waves(plan)) {
    for (let i = 0; i < wave.length; i += 1) {
      for (let j = i + 1; j < wave.length; j += 1) {
        const a = byId.get(wave[i]);
        const b = byId.get(wave[j]);
        const pairs = a.allowed.flatMap((ga) => b.allowed.filter((gb) => globsMayOverlap(ga, gb)).map((gb) => [ga, gb]));
        if (pairs.length) conflicts.push({ units: [a.id, b.id], globs: pairs });
      }
    }
  }
  return conflicts;
}

// Expected lane of a unit from the literal parts of its allowed globs.
export function unitLane(unit) {
  return maxLane(unit.allowed.map((g) => classifyFile(literalPrefix(g).replace(/\/$/, '/x') || g).lane));
}

export function workerBrief(plan, unitId, constraints = []) {
  const unit = plan.units.find((u) => u.id === unitId);
  if (!unit) throw new Error(`unit '${unitId}' not in plan`);
  const rules = relevantConstraints(constraints, unit.allowed);
  const lines = [
    `# Unit: ${unit.id}`,
    '',
    `Request: ${plan.request}`,
    unit.goal ? `Goal: ${unit.goal}` : null,
    '',
    '## Files you may change',
    ...unit.allowed.map((g) => `- ${g}`),
    'Anything else makes the gate red. Do not fix nearby issues; report them instead.',
    '',
    '## Check (must pass before you report done)',
    ...unit.check.map((c) => `- \`${c}\``),
    unit.device_qa && unit.device_qa !== 'none' ? `- device QA: ${unit.device_qa} (attach the summary JSON)` : null,
    '',
    '## Loop',
    `Change → run the check → fix → repeat until it passes. At most ${MAX_ATTEMPTS} attempts after a gate return;`,
    'after that stop and report: the plan is wrong, not the code.',
    'Do not read other units\' work in progress.',
    '',
    `## Constraints that apply (docs/agent-constraints.md)`,
    ...(rules.length ? rules.map((c) => `- ${c.id}: ${c.rule} (source: ${c.source})`) : ['- none']),
    '',
    '## Report',
    'Changed files, check output (exit codes), and anything you saw but did not fix.',
  ];
  return lines.filter((l) => l !== null).join('\n');
}
