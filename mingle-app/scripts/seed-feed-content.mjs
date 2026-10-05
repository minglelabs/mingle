#!/usr/bin/env node
/**
 * Launcher for scripts/seed-feed-content.ts.
 *
 * The seed imports app server modules through the `@/` alias, so it runs under
 * vite-node with vitest.config.ts (which defines the alias). vite-node is not a
 * direct dependency; it is resolved through vitest, which ships it.
 *
 *   node scripts/run-with-env-local.mjs node scripts/seed-feed-content.mjs [flags]
 */
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const requireFromApp = createRequire(join(appRoot, 'package.json'))
const vitestPkg = requireFromApp.resolve('vitest/package.json')
const viteNodePkg = createRequire(vitestPkg).resolve('vite-node/package.json')
const viteNodeBin = join(dirname(viteNodePkg), 'vite-node.mjs')

const child = spawn(
  process.execPath,
  [
    viteNodeBin,
    '--config',
    join(appRoot, 'vitest.config.ts'),
    join(appRoot, 'scripts', 'seed-feed-content.ts'),
    '--',
    ...process.argv.slice(2),
  ],
  { cwd: appRoot, stdio: 'inherit', env: process.env },
)
child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal)
  process.exit(code ?? 1)
})
