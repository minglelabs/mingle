// Starts the pool with fake extension agents and a fake chrome.exe and checks
// that idle profiles beyond the minimum are closed and closed ones are opened again.
// Run: node scripts/chatgpt-pool.rotation.test.mjs
import { spawn } from 'node:child_process'
import assert from 'node:assert/strict'
import { chmod, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const script = fileURLToPath(new URL('./chatgpt-pool.mjs', import.meta.url))
const dir = await mkdtemp(join(tmpdir(), 'pool-rotation-'))
const chromeDir = join(dir, 'User Data')
const opened = join(dir, 'opened.log')
const fakeChrome = join(dir, 'chrome.sh')
await writeFile(fakeChrome, `#!/bin/sh\necho "$@" >> "${opened}"\n`)
await chmod(fakeChrome, 0o755)
const profiles = { 'Profile 1': 'agent-one', 'Profile 2': 'agent-two' }
await mkdir(chromeDir, { recursive: true })
await writeFile(join(chromeDir, 'Local State'), JSON.stringify({ profile: { info_cache: { 'Profile 1': { name: 'one' }, 'Profile 2': { name: 'two' } } } }))
for (const [folder, agentId] of Object.entries(profiles)) {
  const settings = join(chromeDir, folder, 'Local Extension Settings', 'ext')
  await mkdir(settings, { recursive: true })
  await writeFile(join(settings, '000003.log'), `agentId ${agentId}`)
}

const PORT = 20000 + Math.floor(Math.random() * 20000)
const base = `http://127.0.0.1:${PORT}`
const server = spawn(process.execPath, [script, 'serve'], {
  env: {
    ...process.env, CHATGPT_POOL_PORT: String(PORT), CHATGPT_POOL_KEY: '', CHATGPT_POOL_ACCOUNT_GAP_MS: '0',
    CHATGPT_POOL_ROTATE: '1', CHATGPT_POOL_POLL_HOLD_MS: '200', CHATGPT_POOL_AGENT_STALE_MS: '800', CHATGPT_POOL_MIN_OPEN: '1', CHATGPT_POOL_IDLE_CLOSE_MS: '500', CHATGPT_POOL_ROTATE_TICK_MS: '100',
    CHATGPT_POOL_ROTATE_GRACE_MS: '0', CHATGPT_POOL_WAKE_GAP_MS: '100', CHATGPT_POOL_WAKE_AFTER_MS: '200',
    CHATGPT_POOL_CHROME: fakeChrome, CHATGPT_POOL_CHROME_DIR: chromeDir, CHATGPT_POOL_PROFILES_FILE: join(dir, 'profiles.json'),
  },
  stdio: ['ignore', 'ignore', 'pipe'],
})
let serverLog = ''
server.stderr.on('data', (d) => { serverLog += d })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const post = async (path, body) => {
  const r = await fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  return { status: r.status, body: await r.json() }
}

const running = new Set()
const parked = []
/** A fake extension; `keep` answers a close request like a profile with other tabs open. */
async function agentLoop(agentId, email, { keep = false } = {}) {
  running.add(agentId)
  let keepOpen = false
  while (running.has(agentId)) {
    const { body } = await post('/agent/poll', { agentId, email, idle: true, ...(keepOpen ? { keepOpen } : {}) }).catch(() => ({ body: {} }))
    if (body.park) {
      if (keep) { keepOpen = true; continue }
      parked.push(agentId)
      running.delete(agentId) // the profile closed its windows
      return
    }
    if (body.job) await post('/agent/result', { agentId, jobId: body.job.id, text: 'ok' })
  }
}

try {
  for (let i = 0; i < 50; i++) { try { await fetch(base + '/health'); break } catch { await sleep(100) } }
  agentLoop('agent-one', 'one@example.com')
  agentLoop('agent-two', 'two@example.com')
  await sleep(2000)
  // Two open, one needed: exactly one is told to close after it idled.
  assert.equal(parked.length, 1, serverLog.slice(-1500))
  const stillOpen = Object.values(profiles).find((id) => !parked.includes(id))
  const known = JSON.parse(await readFile(join(dir, 'profiles.json'), 'utf8'))
  assert.deepEqual(Object.keys(known).sort(), ['Profile 1', 'Profile 2'])

  // The last open profile goes away too (closed by hand): the pool opens one again.
  running.delete(stillOpen)
  await sleep(2500) // it goes stale, then the pool opens the most recently used closed profile
  const log = await readFile(opened, 'utf8').catch(() => '')
  assert.match(log, /--profile-directory=Profile [12] https:\/\/chatgpt\.com\//)
  console.log('PASS', { parked, opened: log.trim().split('\n') })
} catch (error) {
  console.error('FAIL', error.message)
  console.error(serverLog.slice(-2000))
  process.exitCode = 1
} finally {
  for (const id of running) running.delete(id)
  server.kill()
  setTimeout(() => process.exit(), 200)
}
