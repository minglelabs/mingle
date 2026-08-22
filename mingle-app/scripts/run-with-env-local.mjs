#!/usr/bin/env node

import { execFileSync, spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const inheritedEnvKeys = new Set(Object.keys(process.env));

const WORKTREE_ENV_KEYS = new Set([
  'DEVBOX_WORKTREE_NAME',
  'DEVBOX_ROOT_DIR',
  'DEVBOX_PROFILE',
  'DEVBOX_WEB_PORT',
  'DEVBOX_STT_PORT',
  'DEVBOX_MESSAGING_PORT',
  'DEVBOX_METRO_PORT',
  'DEVBOX_NGROK_API_PORT',
  'DEVBOX_SITE_URL',
  'DEVBOX_RN_WS_URL',
  'DEVBOX_RN_MESSAGING_WS_URL',
  'DEVBOX_PUBLIC_WS_URL',
  'DEVBOX_PUBLIC_MESSAGING_WS_URL',
  'DEVBOX_TEST_API_BASE_URL',
  'DEVBOX_TEST_WS_URL',
  'NEXT_PUBLIC_SITE_URL',
  'NEXTAUTH_URL',
  'NEXT_PUBLIC_WS_PORT',
  'NEXT_PUBLIC_WS_URL',
  'NEXT_PUBLIC_MESSAGING_WS_URL',
  'MINGLE_MESSAGING_URL',
  'MINGLE_TEST_API_BASE_URL',
  'MINGLE_TEST_WS_URL',
]);

function loadEnvFile(filePath, { override = false, onlyKeys = null, excludeKeys = null } = {}) {
  if (!existsSync(filePath)) return;

  const raw = readFileSync(filePath, 'utf8');
  const lines = raw.split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex <= 0) continue;

    const key = trimmed.slice(0, separatorIndex).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    if (onlyKeys && !onlyKeys.has(key)) continue;
    if (excludeKeys && excludeKeys.has(key)) continue;
    if (inheritedEnvKeys.has(key)) continue;

    let value = trimmed.slice(separatorIndex + 1);
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (override || process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

function findClosestFile(startDir, fileName) {
  let currentDir = resolve(startDir);

  while (true) {
    const candidate = resolve(currentDir, fileName);
    if (existsSync(candidate)) {
      return candidate;
    }

    const parentDir = dirname(currentDir);
    if (parentDir === currentDir) {
      return null;
    }
    currentDir = parentDir;
  }
}

function findMainWorktreeRoot(startDir) {
  try {
    const output = execFileSync(
      'git',
      ['-C', resolve(startDir), 'worktree', 'list', '--porcelain'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
    );
    let worktreePath = null;

    for (const line of output.split(/\r?\n/)) {
      if (line.startsWith('worktree ')) {
        worktreePath = line.slice('worktree '.length).trim();
      } else if (line === 'branch refs/heads/main' && worktreePath) {
        return resolve(worktreePath);
      }
    }
  } catch {
    // Direct package commands should still work when git is unavailable.
  }

  return null;
}

function ensurePrismaAppSchemaUrl(rawValue) {
  if (typeof rawValue !== 'string') return rawValue;
  const trimmed = rawValue.trim();
  if (!trimmed) return rawValue;

  try {
    const parsed = new URL(trimmed);
    if (!parsed.searchParams.has('schema')) {
      parsed.searchParams.set('schema', 'app');
    }
    return parsed.toString();
  } catch {
    return rawValue;
  }
}

const cwd = process.cwd();
const localEnvPath = findClosestFile(cwd, '.env.local');
const devboxEnvPath = findClosestFile(cwd, '.devbox.env');
const mainWorktreeRoot = findMainWorktreeRoot(cwd);
const mainRootEnvPath = mainWorktreeRoot ? resolve(mainWorktreeRoot, '.env.local') : localEnvPath;

if (localEnvPath) {
  loadEnvFile(localEnvPath);
}
if (mainRootEnvPath) {
  loadEnvFile(mainRootEnvPath, { override: true, excludeKeys: WORKTREE_ENV_KEYS });
}
if (devboxEnvPath) {
  // .devbox.env is a derived source for worktree runtime values only. Legacy
  // shared entries are intentionally ignored after the root env migration.
  loadEnvFile(devboxEnvPath, { override: true, onlyKeys: WORKTREE_ENV_KEYS });
}

if (process.env.DATABASE_URL !== undefined) {
  process.env.DATABASE_URL = ensurePrismaAppSchemaUrl(process.env.DATABASE_URL);
}
if (process.env.DIRECT_DATABASE_URL !== undefined) {
  process.env.DIRECT_DATABASE_URL = ensurePrismaAppSchemaUrl(process.env.DIRECT_DATABASE_URL);
}

const [command, ...args] = process.argv.slice(2);

if (!command) {
  console.error('Usage: node scripts/run-with-env-local.mjs <command> [...args]');
  process.exit(1);
}

const child = spawn(command, args, {
  stdio: 'inherit',
  env: process.env,
  shell: process.platform === 'win32',
});

child.on('error', (error) => {
  console.error(error.message);
  process.exit(1);
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
