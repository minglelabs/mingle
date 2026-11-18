// Starts the pool with fake extension agents and checks account limits:
// an image job goes past any number of image-limited accounts, and the limits
// are saved in profiles.json, survive a restart and show for closed profiles.
// Run: node scripts/chatgpt-pool.limits.test.mjs
import { spawn } from 'node:child_process'
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const script = fileURLToPath(new URL('./chatgpt-pool.mjs', import.meta.url))
const dir = await mkdtemp(join(tmpdir(), 'pool-limits-'))
const chromeDir = join(dir, 'User Data')
const profilesFile = join(dir, 'profiles.json')
const names = ['one', 'two', 'three', 'four', 'five']
await mkdir(chromeDir, { recursive: true })
await writeFile(join(chromeDir, 'Local State'), JSON.stringify({ profile: { info_cache: Object.fromEntries(names.map((name, i) => [`Profile ${i + 1}`, { name }])) } }))
for (const [i, name] of names.entries()) {
  const settings = join(chromeDir, `Profile ${i + 1}`, 'Local Extension Settings', 'ext')
  await mkdir(settings, { recursive: true })
  await writeFile(join(settings, '000003.log'), `agentId agent-${name}`)
}

const PORT = 20000 + Math.floor(Math.random() * 20000)
const base = `http://127.0.0.1:${PORT}`
let server = null
let serverLog = ''
function start() {
  server = spawn(process.execPath, [script, 'serve'], {
    env: {
      ...process.env, CHATGPT_POOL_PORT: String(PORT), CHATGPT_POOL_KEY: '', CHATGPT_POOL_ACCOUNT_GAP_MS: '0',
      // Rotation on, so profiles are saved, but it never starts, so nothing is opened.
      CHATGPT_POOL_ROTATE: '1', CHATGPT_POOL_ROTATE_GRACE_MS: '600000', CHATGPT_POOL_POLL_HOLD_MS: '200', CHATGPT_POOL_AGENT_STALE_MS: '800',
      CHATGPT_POOL_CHROME: join(dir, 'no-chrome'), CHATGPT_POOL_CHROME_DIR: chromeDir, CHATGPT_POOL_PROFILES_FILE: profilesFile,
    },
    stdio: ['ignore', 'ignore', 'pipe'],
  })
  server.stderr.on('data', (d) => { serverLog += d })
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const post = async (path, body) => {
  const r = await fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  return { status: r.status, body: await r.json() }
}
const ready = async () => { for (let i = 0; i < 50; i++) { try { await fetch(base + '/health'); return } catch { await sleep(100) } } }

let stop = false
const tried = []
async function agentLoop(name, answer, after = 0) {
  // Connect, then stay connected without taking jobs until `after` other accounts were tried.
  await post('/agent/poll', { agentId: `agent-${name}`, email: `${name}@example.com`, idle: true }).catch(() => {})
  while (!stop && tried.length < after) await sleep(10)
  while (!stop) {
    const { body } = await post('/agent/poll', { agentId: `agent-${name}`, email: `${name}@example.com`, idle: true }).catch(() => ({ body: {} }))
    if (body.job) {
      tried.push(name)
      await post('/agent/result', { agentId: `agent-${name}`, jobId: body.job.id, ...answer })
    }
  }
}

const limited = { error: { code: 'image_limit', message: 'limit reached', retryAfterMs: 3_600_000 } }
try {
  start()
  await ready()
  // Four limited accounts, and a fifth that can draw but takes the job only after all four.
  for (const name of names.slice(0, 4)) agentLoop(name, limited)
  agentLoop('five', { image: 'data:image/png;base64,AAAA' }, 4)
  await sleep(300)
  const r1 = await post('/v1/images/generations', { prompt: 'a cat' })
  assert.equal(r1.status, 200, JSON.stringify(r1.body))
  assert.deepEqual([...tried.slice(0, 4)].sort(), ['four', 'one', 'three', 'two'])
  assert.equal(tried[4], 'five')

  // The limits are saved for the next start.
  await sleep(1500)
  const saved = JSON.parse(await readFile(profilesFile, 'utf8'))
  assert.ok(saved['Profile 1'].limitedUntil > Date.now(), JSON.stringify(saved['Profile 1']))
  assert.equal(saved['Profile 5'].limitedUntil, undefined)

  // Restart with every agent gone: the limits come back and show for the closed profiles.
  stop = true
  server.kill()
  await sleep(500)
  start()
  await ready()
  const { closed } = await (await fetch(base + '/accounts')).json()
  const one = closed.find((entry) => entry.email === 'one@example.com')
  const five = closed.find((entry) => entry.email === 'five@example.com')
  assert.ok(one.imageLimitedUntil, JSON.stringify(closed))
  assert.equal(five.imageLimitedUntil, null)
  assert.equal(one.pausedUntil, null)
  console.log('PASS')
} catch (error) {
  console.error('FAIL', error.message)
  console.error(serverLog.slice(-2000))
  process.exitCode = 1
} finally {
  stop = true
  server?.kill()
  setTimeout(() => process.exit(), 200)
}
