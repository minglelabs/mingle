#!/usr/bin/env node
/**
 * ChatGPT through the staff's own Chrome profiles, used like an API.
 *
 * Each Chrome profile signed in to chatgpt.com runs the small extension in
 * scripts/chatgpt-pool-extension (loaded once per profile). The extension
 * asks this server for work, does it in a background chatgpt.com tab of that
 * profile (type, send, wait, read the answer or the drawn image) and sends the
 * result back. Requests go to the next free account; one at its image limit
 * or signed out is skipped until it recovers. The staff's everyday Chrome is
 * the one doing it: no second Chrome, no API key, no paid API.
 *
 *   node scripts/chatgpt-pool.mjs serve             HTTP API on 127.0.0.1:10320 (also where the extensions connect)
 *   node scripts/chatgpt-pool.mjs install|uninstall keep `serve` running with launchd
 *   node scripts/chatgpt-pool.mjs accounts          the connected profiles
 *   node scripts/chatgpt-pool.mjs chat "question"   one answer, printed (needs `serve`)
 *   node scripts/chatgpt-pool.mjs image [--ref photo.jpg] [--out file.png] "prompt"
 *   node scripts/chatgpt-pool.mjs mcp               MCP server on stdio (tools chatgpt_chat, chatgpt_image, chatgpt_accounts), a client of `serve`
 *
 * HTTP, in the OpenAI shape so existing clients work:
 *   POST /v1/chat/completions  model "chatgpt-web" answers in text; an image model
 *                              ("chatgpt-web/image", "chatgpt-app/…") answers with the
 *                              picture as a markdown data URL. An image_url part in the
 *                              last user message is attached as a reference photo.
 *   POST /v1/images/generations  { prompt, reference?: data URL } -> { data: [{ b64_json }] }
 *   Add "async": true to either POST to get 202 { id } at once, then poll
 *   GET /v1/jobs/:id -> { status: pending | done (+ result) | error (+ error) }.
 *   Use it through a tunnel: ngrok cuts a request at 300s and images can take longer.
 *   GET  /health, GET /accounts
 *   Optional `account` field (email) pins a request to one account.
 *
 * Env: CHATGPT_POOL_PORT (10320), CHATGPT_POOL_HOST (127.0.0.1), CHATGPT_POOL_KEY
 * (bearer token for the API on the public port, or on the main port when HOST is not
 * loopback; the extensions only ever talk to 127.0.0.1).
 * CHATGPT_POOL_PUBLIC_PORT opens a second listener, for a tunnel (ngrok, cloudflared)
 * to point at, so people elsewhere can use the API: it requires CHATGPT_POOL_KEY and
 * never serves the extensions' /agent endpoints. A tunnel's requests arrive from
 * 127.0.0.1 too, so the main port must never be the one exposed.
 */
import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { homedir, tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { createInterface } from 'node:readline'
import { promisify } from 'node:util'

const run = promisify(execFile)
const PORT = Number(process.env.CHATGPT_POOL_PORT || 10320)
const HOST = process.env.CHATGPT_POOL_HOST || '127.0.0.1'
const KEY = process.env.CHATGPT_POOL_KEY?.trim() || ''
const PUBLIC_PORT = Number(process.env.CHATGPT_POOL_PUBLIC_PORT || 0)
const LOOPBACK_HOSTS = ['127.0.0.1', '::1', 'localhost']
const POLL_HOLD_MS = 20_000
const AGENT_STALE_MS = 75_000
const TEXT_TIMEOUT_MS = 5 * 60_000
const IMAGE_TIMEOUT_MS = 8 * 60_000
const LABEL = 'app.mingle.chatgpt-pool'

const log = (...args) => console.error(new Date().toISOString(), ...args)

class PoolError extends Error {
  constructor(status, code, detail) {
    super(detail ? `${code}: ${detail}` : code)
    this.status = status
    this.code = code
  }
}

// ---- agents (one per Chrome profile) and jobs --------------------------

/** agentId -> { id, email, profile, lastSeen, lastUsed, busy, limitedUntil, limitMessage, signedOut, hold } */
const agents = new Map()
/** Jobs waiting for an agent, oldest first. */
const queue = []
/** jobId -> job handed to an agent, waiting for its result. */
const running = new Map()

const online = (agent) => Date.now() - agent.lastSeen < AGENT_STALE_MS
const accepts = (job, agent) => !job.account || job.account === agent.email || job.account === agent.id

function eligible(agent, job) {
  if (agent.busy || agent.signedOut || !agent.email || job.tried.has(agent.id) || !accepts(job, agent)) return false
  return job.kind !== 'image' || Date.now() >= agent.limitedUntil
}

/** Hands queued jobs to idle agents that are waiting in a poll, least recently used first. */
function dispatch() {
  for (const job of [...queue]) {
    const agent = [...agents.values()]
      .filter((candidate) => candidate.hold && online(candidate) && eligible(candidate, job))
      .sort((a, b) => a.lastUsed - b.lastUsed)[0]
    if (!agent) continue
    queue.splice(queue.indexOf(job), 1)
    agent.busy = true
    agent.lastUsed = Date.now()
    job.agent = agent
    job.tried.add(agent.id)
    running.set(job.id, job)
    job.timer = setTimeout(() => finish(job.id, { error: { code: 'timeout', message: 'took too long' } }), job.kind === 'image' ? IMAGE_TIMEOUT_MS : TEXT_TIMEOUT_MS)
    const hold = agent.hold
    agent.hold = null
    hold({ job: { id: job.id, kind: job.kind, prompt: job.prompt, reference: job.reference } })
  }
}

/** Fails a waiting job that no connected account can take. */
function failUnservable() {
  for (const job of [...queue]) {
    const candidates = [...agents.values()].filter((agent) => online(agent) && agent.email && !job.tried.has(agent.id) && accepts(job, agent))
    let error = null
    if (candidates.length === 0) {
      error = job.lastError ?? new PoolError(503, 'no_account', job.account ? `${job.account} is not connected` : 'no Chrome profile with the extension is connected')
    } else if (job.kind === 'image' && candidates.every((agent) => Date.now() < agent.limitedUntil)) {
      const soonest = Math.min(...candidates.map((agent) => agent.limitedUntil))
      error = new PoolError(429, 'image_limit', `every account is at its image limit, the first until ${new Date(soonest).toISOString()}`)
    }
    if (!error) continue
    queue.splice(queue.indexOf(job), 1)
    job.reject(error)
  }
}

/** An agent's answer (or a timeout): resolve, or try the job on another account. */
function finish(jobId, outcome) {
  const job = running.get(jobId)
  if (!job) return
  running.delete(jobId)
  clearTimeout(job.timer)
  const agent = job.agent
  agent.busy = false
  if (!outcome.error) {
    job.resolve({ account: agent.email, profile: agent.profile ?? null, ...outcome })
    return
  }
  const { code, message, retryAfterMs } = outcome.error
  log('fail', who(agent), code, message ?? '')
  if (code === 'image_limit') {
    agent.limitedUntil = Date.now() + (retryAfterMs || 3_600_000)
    agent.limitMessage = message ?? ''
  }
  if (code === 'signed_out') agent.signedOut = true
  const error = new PoolError(code === 'image_refused' ? 422 : code === 'image_limit' ? 429 : 502, code, `${agent.email}: ${message ?? ''}`)
  // A refusal is about the prompt; a pinned job has nowhere else to go.
  if (code === 'image_refused' || code === 'bad_reference' || job.account || job.tried.size >= 4) {
    job.reject(error)
    return
  }
  job.lastError = error
  queue.unshift(job)
  failUnservable()
  dispatch()
}

function submit({ kind, prompt, reference = null, account = null }) {
  return new Promise((resolveJob, rejectJob) => {
    queue.push({ id: randomUUID(), kind, prompt, reference, account, tried: new Set(), resolve: resolveJob, reject: rejectJob })
    failUnservable()
    dispatch()
  })
}

/**
 * The extension version on disk next to this script (the installed copy keeps it in
 * ./extension, the repo in ./chatgpt-pool-extension). Sent with every poll so an
 * extension running older code reloads itself instead of waiting for a Chrome restart.
 */
async function extensionVersion() {
  const here = dirname(resolve(process.argv[1]))
  for (const folder of ['extension', 'chatgpt-pool-extension']) {
    try { return JSON.parse(await readFile(join(here, folder, 'manifest.json'), 'utf8')).version } catch {}
  }
  return null
}

const CHROME_DIR = join(homedir(), 'Library/Application Support/Google/Chrome')

/**
 * Which Chrome profile an agent runs in, e.g. "Profile 2 (Somi is so cute)". An
 * extension cannot read its profile's name, but it keeps its agentId in
 * chrome.storage, which lives in that profile's folder; so the folder holding
 * the id is the profile. Null when not found (another OS, another Chrome).
 */
async function chromeProfileOf(agentId) {
  try {
    const names = JSON.parse(await readFile(join(CHROME_DIR, 'Local State'), 'utf8'))?.profile?.info_cache ?? {}
    for (const folder of Object.keys(names)) {
      const settings = join(CHROME_DIR, folder, 'Local Extension Settings')
      for (const extension of await readdir(settings).catch(() => [])) {
        for (const file of await readdir(join(settings, extension)).catch(() => [])) {
          if (!/\.(log|ldb)$/.test(file)) continue
          const path = join(settings, extension, file)
          if ((await stat(path)).size > 5_000_000) continue
          if ((await readFile(path, 'latin1')).includes(agentId)) return `${folder} (${names[folder]?.name ?? ''})`
        }
      }
    }
  } catch {}
  return null
}

const who = (agent) => (agent?.profile ? `${agent.email} [${agent.profile}]` : agent?.email ?? '?')

/**
 * An extension asking for work: held open until a job comes or POLL_HOLD_MS passes.
 * A hold whose connection has closed (Chrome stopped the extension's worker while it
 * waited) is dropped, so a job is never handed to a request nobody will read.
 */
async function poll(body, response) {
  const id = String(body.agentId ?? '')
  if (!id) throw new PoolError(400, 'agent_id_required')
  const agent = agents.get(id) ?? { id, email: null, busy: false, limitedUntil: 0, limitMessage: '', signedOut: false, lastUsed: 0, hold: null }
  agents.set(id, agent)
  const email = typeof body.email === 'string' && body.email ? body.email : null
  if (!agent.profileLookup) {
    agent.profileLookup = chromeProfileOf(id).then((profile) => {
      if (profile) { agent.profile = profile; log('profile', id.slice(0, 8), agent.email ?? '', profile) }
    })
  }
  if (email !== agent.email || !agent.lastSeen) log('agent', id.slice(0, 8), email ?? '(signed out)', agent.profile ?? '')
  agent.email = email
  agent.signedOut = !email
  agent.profile = body.profile ?? agent.profile ?? null
  agent.lastSeen = Date.now()
  // A new poll means the agent is idle: a job it still holds was lost (its worker
  // restarted mid-job, or never got the job), so it goes to another account now
  // instead of after the timeout.
  if (agent.busy && body.idle) {
    const lost = [...running.values()].find((job) => job.agent === agent)
    if (lost) finish(lost.id, { error: { code: 'lost', message: 'the extension restarted before answering' } })
    agent.busy = false
  }
  agent.hold?.({})
  const version = await extensionVersion()
  return new Promise((resolveHold) => {
    const answer = (payload) => resolveHold({ ...payload, extensionVersion: version })
    agent.hold = answer
    response.on('close', () => { if (agent.hold === answer && !response.writableEnded) agent.hold = null })
    setTimeout(() => { if (agent.hold === answer) { agent.hold = null; answer({}) } }, POLL_HOLD_MS)
    failUnservable()
    dispatch()
  })
}

function accountsStatus() {
  return [...agents.values()].filter(online).map((agent) => ({
    email: agent.email, profile: agent.profile, agentId: agent.id, busy: agent.busy, signedOut: agent.signedOut,
    imageLimitedUntil: agent.limitedUntil > Date.now() ? new Date(agent.limitedUntil).toISOString() : null,
    limitMessage: agent.limitedUntil > Date.now() ? agent.limitMessage : null,
  }))
}

// ---- HTTP --------------------------------------------------------------

function readBody(request) {
  return new Promise((done, fail) => {
    let body = ''
    request.on('data', (chunk) => { body += chunk; if (body.length > 30_000_000) request.destroy() })
    request.on('end', () => { try { done(body ? JSON.parse(body) : {}) } catch { fail(new PoolError(400, 'bad_json')) } })
    request.on('error', fail)
  })
}

const partsText = (content) => (Array.isArray(content) ? content.map((part) => part?.text ?? '').join('\n') : String(content ?? ''))

/** A chat request as one message: ChatGPT's web UI has no system role, so instructions go first. */
function chatPrompt(messages) {
  const system = messages.filter((m) => m.role === 'system').map((m) => partsText(m.content)).join('\n\n')
  const turns = messages.filter((m) => m.role !== 'system')
  const history = turns.slice(0, -1).map((m) => `${m.role === 'assistant' ? 'Assistant' : 'User'}: ${partsText(m.content)}`).join('\n\n')
  return [system && `Instructions:\n${system}`, history && `Conversation so far:\n${history}`, partsText(turns.at(-1)?.content)].filter(Boolean).join('\n\n')
}

function referenceIn(messages) {
  const last = [...(messages ?? [])].reverse().find((m) => m.role === 'user')?.content
  const url = Array.isArray(last) ? last.find((part) => part?.type === 'image_url')?.image_url?.url : null
  return typeof url === 'string' && url.startsWith('data:image/') ? url : null
}

function reply(response, status, payload) {
  response.writeHead(status, { 'content-type': 'application/json' })
  response.end(JSON.stringify(payload))
}

/**
 * Requests sent with "async": true, kept for an hour after they finish. A tunnel
 * (ngrok's free plan) cuts a request at 300s and an image can take longer, so the
 * caller gets an id at once and polls GET /v1/jobs/:id.
 */
const asyncJobs = new Map()
const ASYNC_KEEP_MS = 60 * 60_000

function startAsync(path, body) {
  const id = `job_${randomUUID()}`
  const entry = { id, status: 'pending', created: Math.floor(Date.now() / 1000), result: null, error: null, finishedAt: 0 }
  asyncJobs.set(id, entry)
  handleApi(path, body).then(
    (result) => { entry.status = 'done'; entry.result = result; entry.finishedAt = Date.now() },
    (error) => {
      entry.status = 'error'
      entry.error = { status: error instanceof PoolError ? error.status : 500, code: error.code ?? 'internal', message: error.message }
      entry.finishedAt = Date.now()
      log('error', entry.error.status, error.message)
    },
  )
  for (const [key, old] of asyncJobs) if (old.finishedAt && Date.now() - old.finishedAt > ASYNC_KEEP_MS) asyncJobs.delete(key)
  return { id, object: 'job', status: 'pending', created: entry.created }
}

function asyncStatus(id) {
  const entry = asyncJobs.get(id)
  if (!entry) throw new PoolError(404, 'job_not_found')
  return { id, object: 'job', status: entry.status, created: entry.created, ...(entry.result ? { result: entry.result } : {}), ...(entry.error ? { error: entry.error } : {}) }
}

async function handleApi(path, body) {
  const image = path === '/v1/images/generations' || /image/i.test(body.model ?? '')
  const lastUser = partsText([...(body.messages ?? [])].reverse().find((m) => m.role === 'user')?.content)
  const prompt = path === '/v1/images/generations' ? String(body.prompt ?? '') : image ? lastUser.replace(/^Generate this image\.\s*/i, '') : chatPrompt(body.messages ?? [])
  if (!prompt.trim()) throw new PoolError(400, 'empty_prompt')
  const reference = path === '/v1/images/generations' ? (typeof body.reference === 'string' ? body.reference : null) : referenceIn(body.messages)
  const started = Date.now()
  log(image ? 'image' : 'chat', JSON.stringify(prompt.slice(0, 70)))
  const result = await submit({ kind: image ? 'image' : 'text', prompt: prompt.trim(), reference, account: body.account ?? null })
  log('done', result.profile ? `${result.account} [${result.profile}]` : result.account, `${Math.round((Date.now() - started) / 1000)}s`)
  if (path === '/v1/images/generations') return { created: Math.floor(Date.now() / 1000), account: result.account, profile: result.profile, data: [{ b64_json: result.image.base64 }] }
  const content = image ? `![image](data:${result.image.type};base64,${result.image.base64})` : result.text
  return { object: 'chat.completion', model: body.model ?? 'chatgpt-web', account: result.account, profile: result.profile, choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content } }] }
}

function serve() {
  const handler = (exposed) => async (request, response) => {
    const path = new URL(request.url ?? '/', 'http://pool').pathname
    try {
      // The extensions, only ever from this machine and never through the public port.
      if (path === '/agent/poll' || path === '/agent/result' || path === '/agent/progress') {
        if (exposed) return reply(response, 404, { error: { code: 'not_found' } })
        const local = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(request.socket.remoteAddress ?? '')
        if (!local || request.method !== 'POST') return reply(response, 403, { error: { code: 'forbidden' } })
        const body = await readBody(request)
        if (path === '/agent/poll') return reply(response, 200, await poll(body, response))
        if (path === '/agent/progress') {
          const agent = agents.get(String(body.agentId ?? ''))
          if (agent) agent.lastSeen = Date.now()
          log('step', who(agent), String(body.jobId ?? '').slice(0, 8), String(body.step ?? '').slice(0, 120))
          return reply(response, 200, { ok: true })
        }
        const agent = agents.get(String(body.agentId ?? ''))
        if (agent) agent.lastSeen = Date.now()
        finish(String(body.jobId ?? ''), body.error ? { error: body.error } : body.image ? { image: body.image } : { text: String(body.text ?? '') })
        return reply(response, 200, { ok: true })
      }
      // The main port stays keyless while it listens only on this machine, so the local CLI and MCP need no key.
      const keyed = exposed || (KEY && !LOOPBACK_HOSTS.includes(HOST))
      if (keyed && request.headers.authorization !== `Bearer ${KEY}`) return reply(response, 401, { error: { code: 'unauthorized' } })
      if (request.method === 'GET' && path === '/health') return reply(response, 200, { ok: true, accounts: accountsStatus().length, queued: queue.length, running: running.size })
      if (request.method === 'GET' && path === '/accounts') return reply(response, 200, { accounts: accountsStatus() })
      if (request.method === 'GET' && path.startsWith('/v1/jobs/')) return reply(response, 200, asyncStatus(decodeURIComponent(path.slice('/v1/jobs/'.length))))
      if (request.method === 'POST' && (path === '/v1/chat/completions' || path === '/v1/images/generations')) {
        const body = await readBody(request)
        if (body.async === true) return reply(response, 202, startAsync(path, body))
        return reply(response, 200, await handleApi(path, body))
      }
      return reply(response, 404, { error: { code: 'not_found' } })
    } catch (error) {
      const status = error instanceof PoolError ? error.status : 500
      log('error', status, error.message)
      return reply(response, status, { error: { code: error.code ?? 'internal', message: error.message } })
    }
  }
  // Image jobs answer after minutes; Node's default 5-minute request timeout would cut them off.
  const server = (exposed) => createServer({ requestTimeout: 0 }, handler(exposed))
  server(false).listen(PORT, HOST, () => log(`ChatGPT pool on http://${HOST}:${PORT}${KEY && !LOOPBACK_HOSTS.includes(HOST) ? ' (key required)' : ''}; waiting for the Chrome extensions`))
  if (PUBLIC_PORT) {
    if (!KEY) log('CHATGPT_POOL_PUBLIC_PORT is ignored without CHATGPT_POOL_KEY: the API would be open to anyone')
    else server(true).listen(PUBLIC_PORT, '127.0.0.1', () => log(`public API (key required) on http://127.0.0.1:${PUBLIC_PORT}, for a tunnel`))
  }
  setInterval(() => { failUnservable(); dispatch() }, 5_000).unref()
}

// ---- clients of `serve`: CLI and MCP -----------------------------------

async function callPool(path, body) {
  const response = await fetch(`http://${HOST}:${PORT}${path}`, {
    method: body ? 'POST' : 'GET',
    headers: { 'content-type': 'application/json', ...(KEY ? { authorization: `Bearer ${KEY}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  }).catch(() => { throw new Error(`ChatGPT pool is not running on ${HOST}:${PORT}; start it with \`node scripts/chatgpt-pool.mjs serve\` (or \`install\`)`) })
  const payload = await response.json()
  if (!response.ok) throw new Error(payload.error?.message ?? `pool answered ${response.status}`)
  return payload
}

const dataUrlOf = async (file) => `data:image/${file.endsWith('.png') ? 'png' : 'jpeg'};base64,${(await readFile(file)).toString('base64')}`

const MCP_TOOLS = [
  {
    name: 'chatgpt_chat',
    description: "Ask ChatGPT through the staff's own Chrome profiles on this Mac (no paid API) and get its text answer. Each call is a fresh temporary chat.",
    inputSchema: { type: 'object', properties: { prompt: { type: 'string' }, account: { type: 'string', description: 'Optional account email to use' } }, required: ['prompt'] },
  },
  {
    name: 'chatgpt_image',
    description: "Draw one image with ChatGPT through the staff's Chrome profiles (rotating past image limits; no paid API) and save it as a PNG.",
    inputSchema: {
      type: 'object',
      properties: {
        prompt: { type: 'string' },
        out_path: { type: 'string', description: 'Where to save the PNG (default: a temp file)' },
        reference_path: { type: 'string', description: 'Optional photo of a person to draw again' },
        account: { type: 'string' },
      },
      required: ['prompt'],
    },
  },
  {
    name: 'chatgpt_accounts',
    description: 'The ChatGPT accounts (Chrome profiles) connected to the pool, and which are busy or at their image limit.',
    inputSchema: { type: 'object', properties: {} },
  },
]

async function mcpCall(name, args) {
  if (name === 'chatgpt_chat') {
    const payload = await callPool('/v1/chat/completions', { model: 'chatgpt-web', account: args.account, messages: [{ role: 'user', content: args.prompt }] })
    return `${payload.choices[0].message.content}\n\n(account: ${payload.account})`
  }
  if (name === 'chatgpt_image') {
    const payload = await callPool('/v1/images/generations', { prompt: args.prompt, reference: args.reference_path ? await dataUrlOf(args.reference_path) : undefined, account: args.account })
    const out = resolve(args.out_path || join(tmpdir(), `chatgpt-image-${Date.now()}.png`))
    await writeFile(out, Buffer.from(payload.data[0].b64_json, 'base64'))
    return `saved ${out} (account: ${payload.account})`
  }
  if (name === 'chatgpt_accounts') return JSON.stringify((await callPool('/accounts')).accounts, null, 2)
  throw new Error(`unknown tool ${name}`)
}

function mcp() {
  const write = (message) => process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', ...message })}\n`)
  createInterface({ input: process.stdin }).on('line', async (line) => {
    let message
    try { message = JSON.parse(line) } catch { return }
    const { id, method, params } = message
    if (id === undefined) return // notifications
    if (method === 'initialize') return write({ id, result: { protocolVersion: params?.protocolVersion ?? '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'chatgpt-pool', version: '1.0.0' } } })
    if (method === 'tools/list') return write({ id, result: { tools: MCP_TOOLS } })
    if (method === 'ping') return write({ id, result: {} })
    if (method === 'tools/call') {
      try {
        return write({ id, result: { content: [{ type: 'text', text: await mcpCall(params.name, params.arguments ?? {}) }] } })
      } catch (error) {
        return write({ id, result: { isError: true, content: [{ type: 'text', text: error.message }] } })
      }
    }
    write({ id, error: { code: -32601, message: `unknown method ${method}` } })
  })
}

// ---- launchd -----------------------------------------------------------

async function install() {
  const plist = join(homedir(), 'Library/LaunchAgents', `${LABEL}.plist`)
  const logFile = join(homedir(), 'Library/Logs', `${LABEL}.log`)
  const env = { CHATGPT_POOL_PORT: String(PORT), CHATGPT_POOL_HOST: HOST, PATH: process.env.PATH ?? '/usr/bin:/bin' }
  if (KEY) env.CHATGPT_POOL_KEY = KEY
  if (PUBLIC_PORT) env.CHATGPT_POOL_PUBLIC_PORT = String(PUBLIC_PORT)
  const escape = (value) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;')
  await mkdir(join(homedir(), 'Library/LaunchAgents'), { recursive: true })
  await writeFile(plist, `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>${LABEL}</string>
  <key>ProgramArguments</key><array><string>${escape(process.execPath)}</string><string>${escape(resolve(process.argv[1]))}</string><string>serve</string></array>
  <key>EnvironmentVariables</key><dict>${Object.entries(env).map(([k, v]) => `<key>${k}</key><string>${escape(v)}</string>`).join('')}</dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>${escape(logFile)}</string>
  <key>StandardErrorPath</key><string>${escape(logFile)}</string>
</dict></plist>
`)
  await run('launchctl', ['bootout', `gui/${process.getuid()}/${LABEL}`]).catch(() => {})
  await run('launchctl', ['bootstrap', `gui/${process.getuid()}`, plist])
  console.log(`installed ${plist}\nlog: ${logFile}`)
}

async function uninstall() {
  const plist = join(homedir(), 'Library/LaunchAgents', `${LABEL}.plist`)
  await run('launchctl', ['bootout', `gui/${process.getuid()}/${LABEL}`]).catch(() => {})
  await rm(plist, { force: true })
  console.log('uninstalled')
}

// ---- CLI ---------------------------------------------------------------

const [command, ...rest] = process.argv.slice(2)
const option = (name) => { const at = rest.indexOf(name); return at >= 0 ? rest.splice(at, 2)[1] : null }
if (!command || command === 'serve') serve()
else if (command === 'mcp') mcp()
else if (command === 'install') await install()
else if (command === 'uninstall') await uninstall()
else if (command === 'accounts') console.log(JSON.stringify((await callPool('/accounts')).accounts, null, 2))
else if (command === 'chat') {
  const account = option('--account')
  const payload = await callPool('/v1/chat/completions', { model: 'chatgpt-web', account, messages: [{ role: 'user', content: rest.join(' ') }] })
  console.log(payload.choices[0].message.content)
  log('account', payload.account)
} else if (command === 'image') {
  const account = option('--account')
  const refPath = option('--ref')
  const out = resolve(option('--out') ?? 'chatgpt-image.png')
  const payload = await callPool('/v1/images/generations', { prompt: rest.join(' '), reference: refPath ? await dataUrlOf(refPath) : undefined, account })
  await writeFile(out, Buffer.from(payload.data[0].b64_json, 'base64'))
  console.log(out)
  log('account', payload.account)
} else {
  console.error('usage: chatgpt-pool.mjs serve | install | uninstall | accounts | mcp | chat "…" | image [--ref photo] [--out file] "…"')
  process.exit(1)
}
