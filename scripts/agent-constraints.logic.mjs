// Learning edge: parse and check docs/agent-constraints.md, pick the constraints a unit must read.
//
// Entry format:
//   ### C3 Short title
//   - scope: glob, glob
//   - rule: one sentence the splitter / worker must follow
//   - source: commit or PR that confirmed it (e.g. e6327151, #404)
//   - added: YYYY-MM-DD

import { matchesGlob } from './agent-gate.logic.mjs';

const HEADER = /^###\s+(C\d+)\s+(.+?)\s*$/;
const FIELD = /^-\s+(scope|rule|source|added):\s*(.*)$/;
const SOURCE_REF = /(#\d+|\b[0-9a-f]{7,40}\b)/;

export function parseConstraints(text) {
  const entries = [];
  let current = null;
  for (const [n, raw] of text.split('\n').entries()) {
    const line = raw.trimEnd();
    const h = line.match(HEADER);
    if (h) {
      current = { id: h[1], title: h[2], line: n + 1, scope: [], rule: '', source: '', added: '' };
      entries.push(current);
      continue;
    }
    if (/^#{1,3}\s/.test(line)) {
      current = null;
      continue;
    }
    const f = current && line.match(FIELD);
    if (!f) continue;
    if (f[1] === 'scope') current.scope = f[2].split(',').map((s) => s.trim().replace(/^`|`$/g, '')).filter(Boolean);
    else current[f[1]] = f[2].trim();
  }
  return entries;
}

export function validateConstraints(entries) {
  const errors = [];
  const seen = new Set();
  for (const c of entries) {
    const at = `${c.id} (line ${c.line})`;
    if (seen.has(c.id)) errors.push(`${at}: duplicate id`);
    seen.add(c.id);
    if (!c.scope.length) errors.push(`${at}: scope is empty (use ** for repo-wide)`);
    if (!c.rule) errors.push(`${at}: rule is empty`);
    if (!SOURCE_REF.test(c.source)) errors.push(`${at}: source needs a commit hash or PR number`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(c.added)) errors.push(`${at}: added must be YYYY-MM-DD`);
  }
  return errors;
}

// A constraint applies when one of its scope globs could touch one of the unit's files or globs.
export function relevantConstraints(entries, pathsOrGlobs) {
  return entries.filter((c) =>
    c.scope.some((scope) =>
      scope === '**' ||
      pathsOrGlobs.some((p) => {
        const literal = p.replace(/[*?[].*$/, '');
        const scopeLiteral = scope.replace(/[*?[].*$/, '');
        if (matchesGlob(p, scope)) return true;
        // Unit glob is wider than the constraint scope, or the other way round.
        if (literal && scopeLiteral && (literal.startsWith(scopeLiteral) || scopeLiteral.startsWith(literal))) return true;
        return false;
      }),
    ),
  );
}

export function nextId(entries) {
  const max = entries.reduce((m, c) => Math.max(m, Number(c.id.slice(1))), 0);
  return `C${max + 1}`;
}

export function renderEntry({ id, title, scope, rule, source, added }) {
  return [`### ${id} ${title}`, `- scope: ${scope.join(', ')}`, `- rule: ${rule}`, `- source: ${source}`, `- added: ${added}`, ''].join('\n');
}
