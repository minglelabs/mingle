// Pure helpers for the agent QA scenario catalog (mingle-app/qa/agent/scenarios).
// The CLI wrapper is scripts/qa-agent-scenarios.mjs.

export const SCENARIO_ENVIRONMENTS = ['sim', 'real-device', 'manual-only'];
export const SCENARIO_PRIORITIES = ['P0', 'P1', 'P2'];
const REQUIRED_FIELDS = ['id', 'title', 'priority', 'environment', 'tags', 'taste', 'paths'];
const NO_HISTORY_PREFIX = 'No history entry';

function parseScalar(raw) {
  const value = raw.trim();
  if (value.startsWith('[') && value.endsWith(']')) {
    return value
      .slice(1, -1)
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return value;
}

// Parses the small YAML subset used by scenario frontmatter: `key: value`,
// `key: [a, b]`, and `key:` followed by `  - item` lines.
export function parseScenarioMarkdown(markdown) {
  const match = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(markdown);
  if (!match) throw new Error('missing frontmatter');
  const [, frontmatter, body] = match;
  const data = {};
  let listKey = null;
  for (const line of frontmatter.split('\n')) {
    if (!line.trim()) continue;
    const item = /^\s+-\s+(.*)$/.exec(line);
    if (item) {
      if (!listKey) throw new Error(`list item without a key: ${line}`);
      data[listKey].push(item[1].trim());
      continue;
    }
    const pair = /^([A-Za-z][\w-]*):\s*(.*)$/.exec(line);
    if (!pair) throw new Error(`unparsable frontmatter line: ${line}`);
    const [, key, rawValue] = pair;
    if (rawValue.trim() === '') {
      data[key] = [];
      listKey = key;
    } else {
      data[key] = parseScalar(rawValue);
      listKey = null;
    }
  }
  return { data, body };
}

// `**` crosses directories, `*` stays within one segment. Everything else is literal,
// so Next.js route folders such as `[conversationId]` need no escaping.
export function globToRegExp(glob) {
  let pattern = '';
  for (let index = 0; index < glob.length; index += 1) {
    const char = glob[index];
    if (char === '*') {
      if (glob[index + 1] === '*') {
        pattern += '.*';
        index += 1;
      } else {
        pattern += '[^/]*';
      }
    } else {
      pattern += char.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
    }
  }
  return new RegExp(`^${pattern}$`);
}

export function matchingFiles(globs, files) {
  const patterns = globs.map(globToRegExp);
  return files.filter((file) => patterns.some((pattern) => pattern.test(file)));
}

const PRIORITY_ORDER = new Map(SCENARIO_PRIORITIES.map((priority, index) => [priority, index]));

export function sortScenarios(scenarios) {
  return [...scenarios].sort((left, right) => (
    (PRIORITY_ORDER.get(left.priority) ?? 9) - (PRIORITY_ORDER.get(right.priority) ?? 9)
    || left.id.localeCompare(right.id)
  ));
}

// Selects the scenarios whose `paths` cover a changed file, and reports changed app
// files that no scenario covers so the agent can explore them by hand.
export function selectScenarios(scenarios, changedFiles) {
  const selected = [];
  const covered = new Set();
  for (const scenario of scenarios) {
    const matched = matchingFiles(scenario.paths, changedFiles);
    if (matched.length === 0) continue;
    matched.forEach((file) => covered.add(file));
    selected.push({ ...scenario, matchedFiles: matched });
  }
  const uncovered = changedFiles.filter((file) => (
    !covered.has(file)
    && /^mingle-app\/(src|rn\/src|rn\/App\.tsx|rn\/ios|rn\/android)/.test(file)
    && !/\.test\.[cm]?[jt]sx?$/.test(file)
  ));
  return { selected: sortScenarios(selected), uncovered };
}

function normalizeHistoryReference(reference) {
  return reference
    .replace(/^P2\s+/, '')
    .replace(/\s*\([^)]*\)\s*$/, '')
    .trim();
}

// Returns human-readable problems; an empty list means the catalog is valid.
export function validateScenario(scenario, { trackedFiles, historyHeadings, tasteIds, fileName }) {
  const problems = [];
  const where = fileName || scenario.id || '(unknown)';
  for (const field of REQUIRED_FIELDS) {
    const value = scenario[field];
    if (value === undefined || value === '' || (Array.isArray(value) && value.length === 0)) {
      problems.push(`${where}: missing ${field}`);
    }
  }
  if (fileName && scenario.id && fileName !== `${scenario.id}.md`) {
    problems.push(`${where}: file name must be ${scenario.id}.md`);
  }
  if (scenario.environment && !SCENARIO_ENVIRONMENTS.includes(scenario.environment)) {
    problems.push(`${where}: environment must be one of ${SCENARIO_ENVIRONMENTS.join(', ')}`);
  }
  if (scenario.priority && !SCENARIO_PRIORITIES.includes(scenario.priority)) {
    problems.push(`${where}: priority must be one of ${SCENARIO_PRIORITIES.join(', ')}`);
  }
  for (const glob of scenario.paths || []) {
    if (matchingFiles([glob], trackedFiles).length === 0) {
      problems.push(`${where}: path glob matches no tracked file: ${glob}`);
    }
  }
  for (const tasteId of scenario.taste || []) {
    if (!tasteIds.has(tasteId)) problems.push(`${where}: unknown taste rule ${tasteId}`);
  }
  for (const reference of scenario.history || []) {
    if (reference.startsWith(NO_HISTORY_PREFIX)) continue;
    const heading = normalizeHistoryReference(reference);
    if (!historyHeadings.some((candidate) => candidate === heading || candidate.startsWith(heading))) {
      problems.push(`${where}: history heading not found: ${reference}`);
    }
  }
  return problems;
}

export function extractHistoryHeadings(markdown) {
  return markdown
    .split('\n')
    .filter((line) => line.startsWith('## '))
    .map((line) => line.slice(3).trim());
}

export function extractTasteIds(markdown) {
  return new Set([...markdown.matchAll(/^###\s+(T\d+)\./gm)].map((match) => match[1]));
}
