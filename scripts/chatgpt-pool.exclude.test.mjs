// Starts the pool with fake extension agents and checks that an excluded account gets no jobs.
// Run: node scripts/chatgpt-pool.exclude.test.mjs
import { spawn } from 'node:child_process'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'

const script = fileURLToPath(new URL('./chatgpt-pool.mjs', import.meta.url))
const PORT = 20000 + Math.floor(Math.random() * 20000)
const base = `http://127.0.0.1:${PORT}`
const server = spawn(process.execPath, [script, 'serve'], {
  env: { ...process.env, CHATGPT_POOL_PORT: String(PORT), CHATGPT_POOL_ACCOUNT_GAP_MS: '0', CHATGPT_POOL_EXCLUDE: 'Skip@Example.com', CHATGPT_POOL_KEY: '', CHATGPT_POOL_ALLOW_MAC: '1' },
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
async function agentLoop(agentId, email) {
  while (!stop) {
    const { body } = await post('/agent/poll', { agentId, email, idle: true }).catch(() => ({ body: {} }))
    if (body.job) await post('/agent/result', { agentId, jobId: body.job.id, text: `answer:${body.job.prompt}` })
  }
}

try {
  for (let i = 0; i < 50; i++) { try { await fetch(base + '/health'); break } catch { await sleep(100) } }
  agentLoop('agent-skip', 'skip@example.com')
  agentLoop('agent-use', 'use@example.com')
  await sleep(300)
  const chat = (prompt, account) => post('/v1/chat/completions', { model: 'chatgpt-web', messages: [{ role: 'user', content: prompt }], ...(account ? { account } : {}) })
  for (const prompt of ['one', 'two', 'three', 'four']) {
    const r = await chat(prompt)
    assert.equal(r.status, 200, JSON.stringify(r.body))
    assert.equal(r.body.account, 'use@example.com')
  }
  // Pinned to the excluded account: refused, not served.
  const pinned = await chat('pinned', 'skip@example.com')
  assert.equal(pinned.status, 503, JSON.stringify(pinned.body))
  const health = await (await fetch(base + '/health')).json()
  assert.equal(health.ready, 1)
  const accounts = (await (await fetch(base + '/accounts')).json()).accounts
  assert.equal(accounts.find((a) => a.email === 'skip@example.com').excluded, true)
  console.log('PASS')
} catch (error) {
  console.error('FAIL', error.message)
  console.error(serverLog.slice(-2000))
  process.exitCode = 1
} finally {
  stop = true
  server.kill()
  setTimeout(() => process.exit(), 200)
}
