#!/usr/bin/env node

import { spawn } from 'node:child_process';
import {
  parseBooleanEnv,
  validateReleaseTargetConfig,
} from './release-target-config.mjs';

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: 'inherit',
      env: process.env,
      shell: process.platform === 'win32',
    });

    child.on('error', reject);
    child.on('exit', (code, signal) => {
      if (signal) {
        process.kill(process.pid, signal);
        return;
      }
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${command} ${args.join(' ')} exited with code ${code ?? 1}`));
    });
  });
}

try {
  process.env.NEXT_PUBLIC_MINGLE_RELEASE_TARGET = process.env.MINGLE_RELEASE_TARGET || '';

  const releaseTargetValidation = validateReleaseTargetConfig({
    releaseTarget: process.env.MINGLE_RELEASE_TARGET || '',
    siteUrl: process.env.NEXT_PUBLIC_SITE_URL || '',
    wsUrl: process.env.NEXT_PUBLIC_WS_URL || '',
    legacySiteUrl: process.env.MINGLE_LEGACY_SITE_URL || '',
    legacyWsUrl: process.env.MINGLE_LEGACY_WS_URL || '',
    allowLegacyProductionTargets: parseBooleanEnv(process.env.MINGLE_ALLOW_LEGACY_RELEASE_TARGETS || ''),
  });

  if (!releaseTargetValidation.ok) {
    throw new Error(releaseTargetValidation.error);
  }

  await run('pnpm', ['exec', 'prisma', 'generate']);
  await run('pnpm', ['exec', 'next', 'build']);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
