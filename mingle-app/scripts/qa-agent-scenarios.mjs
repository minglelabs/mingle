#!/usr/bin/env node
// Lists, selects and validates the agent QA scenarios in qa/agent/scenarios.
//
//   node scripts/qa-agent-scenarios.mjs list
//   node scripts/qa-agent-scenarios.mjs select [--base origin/main] [--files a,b]
//   node scripts/qa-agent-scenarios.mjs check
//
// Output is JSON so the /qa skill can read it directly.

import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import {
  extractHistoryHeadings,
  extractTasteIds,
  parseScenarioMarkdown,
  selectScenarios,
  sortScenarios,
  validateScenario,
} from './qa-agent-scenarios.logic.mjs';

const APP_ROOT = path.resolve(import.meta.dirname, '..');
const REPO_ROOT = path.resolve(APP_ROOT, '..');
const AGENT_QA_ROOT = path.join(APP_ROOT, 'qa/agent');
const SCENARIO_DIR = path.join(AGENT_QA_ROOT, 'scenarios');
const HISTORY_PATH = path.join(REPO_ROOT, 'docs/ui-ux-codex-thread-history.md');

function git(args) {
  return execFileSync('git', args, { cwd: REPO_ROOT, encoding: 'utf8' })
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

async function loadScenarios() {
  const names = (await fs.readdir(SCENARIO_DIR)).filter((name) => name.endsWith('.md')).sort();
  return Promise.all(names.map(async (fileName) => {
    const markdown = await fs.readFile(path.join(SCENARIO_DIR, fileName), 'utf8');
    const { data } = parseScenarioMarkdown(markdown);
    return { ...data, fileName, file: path.relative(REPO_ROOT, path.join(SCENARIO_DIR, fileName)) };
  }));
}

function summarize(scenario) {
  const { id, title, priority, environment, tags, taste, file, matchedFiles } = scenario;
  return { id, title, priority, environment, tags, taste, file, ...(matchedFiles ? { matchedFiles } : {}) };
}

function readOption(argv, name) {
  const index = argv.indexOf(name);
  return index === -1 ? '' : argv[index + 1] || '';
}

function changedFiles(base) {
  const files = new Set([
    ...git(['diff', '--name-only', `${base}...HEAD`]),
    ...git(['diff', '--name-only', 'HEAD']),
    ...git(['ls-files', '--others', '--exclude-standard']),
  ]);
  return [...files].sort();
}

async function main() {
  const [command = 'list', ...argv] = process.argv.slice(2);
  const scenarios = await loadScenarios();

  if (command === 'list') {
    console.log(JSON.stringify(sortScenarios(scenarios).map(summarize), null, 2));
    return;
  }

  if (command === 'select') {
    const explicitFiles = readOption(argv, '--files');
    const base = readOption(argv, '--base') || 'origin/main';
    const files = explicitFiles ? explicitFiles.split(',').map((file) => file.trim()).filter(Boolean) : changedFiles(base);
    const { selected, uncovered } = selectScenarios(scenarios, files);
    console.log(JSON.stringify({
      base: explicitFiles ? null : base,
      changedFileCount: files.length,
      selected: selected.map(summarize),
      uncoveredAppFiles: uncovered,
    }, null, 2));
    return;
  }

  if (command === 'check') {
    const trackedFiles = git(['ls-files']);
    const historyHeadings = extractHistoryHeadings(await fs.readFile(HISTORY_PATH, 'utf8'));
    const tasteIds = extractTasteIds(await fs.readFile(path.join(AGENT_QA_ROOT, 'taste.md'), 'utf8'));
    const problems = scenarios.flatMap((scenario) => validateScenario(scenario, {
      trackedFiles,
      historyHeadings,
      tasteIds,
      fileName: scenario.fileName,
    }));
    const ids = scenarios.map((scenario) => scenario.id);
    ids.filter((id, index) => ids.indexOf(id) !== index).forEach((id) => problems.push(`duplicate id: ${id}`));
    console.log(JSON.stringify({ scenarioCount: scenarios.length, problems }, null, 2));
    if (problems.length > 0) process.exitCode = 1;
    return;
  }

  console.error(`unknown command: ${command} (expected list, select or check)`);
  process.exitCode = 2;
}

await main();
