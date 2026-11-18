// Usage: node run-app.mjs <app.env.json> <image> [extra docker args...]
// Starts hashchat-app with every var passed by name (-e KEY), values only in the child env.
import fs from 'node:fs'
import { spawnSync } from 'node:child_process'
const [jsonPath, image, ...extra] = process.argv.slice(2)
const vars = JSON.parse(fs.readFileSync(jsonPath, 'utf8'))
const args = ['run', '-d', '--name', 'hashchat-app', '--restart', 'unless-stopped', '-p', '127.0.0.1:8080:8080', ...extra]
for (const k of Object.keys(vars)) args.push('-e', k)
args.push(image)
const r = spawnSync('docker', args, { env: { PATH: process.env.PATH, ...vars }, stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' })
console.log(r.status === 0 ? `started ${r.stdout.trim().slice(0, 12)}` : `failed: ${r.stderr.trim()}`)
process.exit(r.status ?? 1)
