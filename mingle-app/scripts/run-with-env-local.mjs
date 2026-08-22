#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

function loadEnvFile(filePath) {
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

    let value = trimmed.slice(separatorIndex + 1);
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (process.env[key] === undefined) {
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

if (localEnvPath) {
  loadEnvFile(localEnvPath);
}
if (devboxEnvPath) {
  loadEnvFile(devboxEnvPath);
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
