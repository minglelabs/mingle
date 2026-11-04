// Starts the pool with fake extension agents and checks per-account pacing.
// Run: node scripts/chatgpt-pool.pacing.test.mjs
import { spawn } from 'node:child_process'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'

const script = fileURLToPath(new URL('./chatgpt-pool.mjs', import.meta.url))
const PORT = 20000 + Math.floor(Math.random() * 20000)
const base = `http://127.0.0.1:${PORT}`
const server = spawn(process.execPath, [script, 'serve'], {
  env: { ...process.env, CHATGPT_POOL_PORT: String(PORT), CHATGPT_POOL_ACCOUNT_GAP_MS: '400', CHATGPT_POOL_ACCOUNT_PER_HOUR: '3', CHATGPT_POOL_ACCOUNT_PER_DAY: '100', CHATGPT_POOL_KEY: '' },
  stdio: ['ignore', 'ignore', 'pipe'],
})
let serverLog = ''
server.stderr.on('data', (d) => { serverLog += d })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const post = async (path, body) => {
  const r = await fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  return { status: r.status, body: await r.json() }
}

let stop = false
const handled = []
async function agentLoop(agentId, email) {
  while (!stop) {
    const { body } = await post('/agent/poll', { agentId, email, idle: true }).catch(() => ({ body: {} }))
    if (body.job) {
      handled.push({ email, at: Date.now() })
      await post('/agent/result', { agentId, jobId: body.job.id, text: `answer:${body.job.prompt}` })
    }
  }
}

try {
  for (let i = 0; i < 50; i++) { try { await fetch(base + '/health'); break } catch { await sleep(100) } }
  agentLoop('agent-a', 'a@example.com')
  await sleep(300)

  const chat = (prompt) => post('/v1/chat/completions', { model: 'chatgpt-web', messages: [{ role: 'user', content: prompt }] })

  const t0 = Date.now()
  const r1 = await chat('one')
  const r2 = await chat('two')
  assert.equal(r1.status, 200); assert.equal(r2.status, 200)
  const gap = handled[1].at - handled[0].at
  assert.ok(gap >= 400, `second job waited ${gap} ms, expected >= 400`)
  assert.ok(gap < 1500, `second job waited ${gap} ms, too long`)

  const r3 = await chat('three')
  assert.equal(r3.status, 200)
  const r4 = await chat('four')
  assert.equal(r4.status, 429, JSON.stringify(r4.body))
  assert.equal(r4.body.error.code, 'account_quota')

  const accounts = (await (await fetch(base + '/accounts')).json()).accounts
  assert.equal(accounts[0].jobsLastHour, 3)
  assert.ok(accounts[0].cappedUntil)
  const health = await (await fetch(base + '/health')).json()
  assert.equal(health.ready, 0)

  // A second account takes over while the first is capped.
  agentLoop('agent-b', 'b@example.com')
  await sleep(300)
  const r5 = await chat('five')
  assert.equal(r5.status, 200)
  assert.equal(r5.body.account, 'b@example.com')
  console.log('PASS', { gap, firstThreeMs: Date.now() - t0 })
} catch (error) {
  console.error('FAIL', error.message)
  console.error(serverLog.slice(-2000))
  process.exitCode = 1
} finally {
  stop = true
  server.kill()
  setTimeout(() => process.exit(), 200)
}
