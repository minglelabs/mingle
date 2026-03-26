#!/usr/bin/env node

import { spawn } from 'node:child_process';

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
  await run('pnpm', ['exec', 'prisma', 'generate']);
  await run('pnpm', ['exec', 'next', 'build']);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
