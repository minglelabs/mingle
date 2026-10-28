#!/usr/bin/env node
/**
 * Draws images with the ChatGPT desktop app on this Mac, so operator photos
 * use the ChatGPT subscription instead of the paid image API.
 *
 * The app is an Electron app; started with a remote-debugging port it can be
 * driven in the background: open a new chat, type the prompt, send, wait for
 * the generated image and read its bytes from the page. Requests are served
 * one at a time in the same shape as the model proxy the server already
 * speaks (`POST /v1/chat/completions` answering with an inline data URL), plus
 * `POST /v1/images/generations` and `GET /health`.
 *
 *   node scripts/chatgpt-image-bridge.mjs                 serve (restarts ChatGPT with the debug port if needed)
 *   node scripts/chatgpt-image-bridge.mjs draw [--ref photo.jpg] "prompt"
 *                                                       draw one image into ./chatgpt-image.png
 *   node scripts/chatgpt-image-bridge.mjs install         keep it running with launchd
 *   node scripts/chatgpt-image-bridge.mjs uninstall
 *
 * Env: CHATGPT_BRIDGE_PORT (10310), CHATGPT_BRIDGE_HOST (127.0.0.1),
 * CHATGPT_BRIDGE_KEY (required bearer token when set; set it before exposing
 * the bridge through a tunnel), CHATGPT_CDP_PORT (9333).
 */
import { execFile } from 'node:child_process'
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises'
import { createServer } from 'node:http'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'

const run = promisify(execFile)
const PORT = Number(process.env.CHATGPT_BRIDGE_PORT || 10310)
const HOST = process.env.CHATGPT_BRIDGE_HOST || '127.0.0.1'
const KEY = process.env.CHATGPT_BRIDGE_KEY?.trim() || ''
const CDP_PORT = Number(process.env.CHATGPT_CDP_PORT || 9333)
const CDP = `http://127.0.0.1:${CDP_PORT}`
const DRAW_TIMEOUT_MS = 5 * 60_000
const LABEL = 'app.mingle.chatgpt-image-bridge'

const sleep = (ms) => new Promise((done) => setTimeout(done, ms))
const log = (...args) => console.log(new Date().toISOString(), ...args)

class BridgeError extends Error {
  constructor(status, code, detail) {
    super(detail ? `${code}: ${detail}` : code)
    this.status = status
    this.code = code
  }
}

// ---- ChatGPT app -------------------------------------------------------

async function cdpReachable() {
  try {
    return (await fetch(`${CDP}/json/version`, { signal: AbortSignal.timeout(2000) })).ok
  } catch {
    return false
  }
}

async function appRunning() {
  try {
    await run('pgrep', ['-f', 'ChatGPT.app/Contents/MacOS/ChatGPT'])
    return true
  } catch {
    return false
  }
}

/** Makes sure ChatGPT runs with the debug port, restarting it in the background if it runs without. */
async function ensureApp() {
  if (await cdpReachable()) return
  if (await appRunning()) {
    log('ChatGPT runs without the debug port; restarting it')
    await run('pkill', ['-f', 'ChatGPT.app/Contents/MacOS/ChatGPT']).catch(() => {})
    for (let i = 0; i < 40 && (await appRunning()); i += 1) await sleep(500)
  }
  await run('open', ['-g', '-a', 'ChatGPT', '--args', `--remote-debugging-port=${CDP_PORT}`, '--remote-allow-origins=*'])
  for (let i = 0; i < 60; i += 1) {
    if ((await cdpReachable()) && (await mainPageTarget().catch(() => null))) return
    await sleep(1000)
  }
  throw new BridgeError(503, 'app_unavailable', 'ChatGPT did not start with the debug port')
}

async function mainPageTarget() {
  const targets = await (await fetch(`${CDP}/json/list`)).json()
  const page = targets.find((target) => target.type === 'page' && target.url.startsWith('app://') && target.url.includes('index.html'))
  if (!page) throw new BridgeError(503, 'app_unavailable', 'main ChatGPT window not found')
  return page
}

/** A DevTools session on the main window. */
async function connect() {
  const page = await mainPageTarget()
  const socket = new WebSocket(page.webSocketDebuggerUrl)
  await new Promise((done, fail) => {
    socket.addEventListener('open', done, { once: true })
    socket.addEventListener('error', () => fail(new BridgeError(503, 'app_unavailable', 'debugger connection failed')), { once: true })
  })
  let nextId = 0
  const pending = new Map()
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data)
    const waiter = pending.get(message.id)
    if (!waiter) return
    pending.delete(message.id)
    if (message.error) waiter.fail(new Error(message.error.message))
    else waiter.done(message.result)
  })
  const send = (method, params = {}) => new Promise((done, fail) => {
    nextId += 1
    pending.set(nextId, { done, fail })
    socket.send(JSON.stringify({ id: nextId, method, params }))
  })
  const evaluate = async (expression) => {
    const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? 'page script failed')
    return result.result.value
  }
  return { evaluate, close: () => socket.close() }
}

// Page scripts. They rely on accessible labels, which survive UI restyles better than class names.
const PAGE_HELPERS = `
  // The app keeps earlier chats mounted but hidden, so only what is on screen counts.
  const shown = (el) => el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden'
  const buttons = () => [...document.querySelectorAll('button')].filter(shown)
  const byLabel = (label) => buttons().find((b) => (b.getAttribute('aria-label') || b.innerText.trim()) === label)
  const composer = () => [...document.querySelectorAll('[contenteditable=true][role=textbox]')].find(shown)
  const generated = () => [...document.images].filter((i) => /^Generated image/i.test(i.alt) && i.complete && i.naturalWidth > 0 && shown(i))
  const streaming = () => buttons().some((b) => /^stop/i.test(b.getAttribute('aria-label') || ''))
  const chatText = () => composer()?.closest('main')?.innerText ?? [...document.querySelectorAll('main')].filter(shown).map((m) => m.innerText).join('\\n')
`

const LIMIT_PATTERN = /limit|try again (later|in|after)|too many requests/i
/** While the plan's image limit lasts, requests are turned down here instead of opening a chat each time. */
let limitedUntil = 0
let limitMessage = ''

/** "…when the limit resets in 10 hours" → that delay; an hour when the text gives none. */
function resetDelayMs(text) {
  const match = /in (\d+) (minute|hour|day)/i.exec(text)
  if (!match) return 60 * 60_000
  const unit = { minute: 60_000, hour: 60 * 60_000, day: 24 * 60 * 60_000 }[match[2].toLowerCase()]
  return Number(match[1]) * unit
}

async function draw(prompt, reference = null) {
  if (Date.now() < limitedUntil) throw new BridgeError(429, 'image_limit', `${limitMessage} (until ${new Date(limitedUntil).toISOString()})`)
  await ensureApp()
  const page = await connect()
  try {
    const mode = await page.evaluate(`[...document.querySelectorAll('button')].map((b) => b.getAttribute('aria-label') || '').find((l) => l.startsWith('Switch mode')) || ''`)
    if (mode && !/ChatGPT$/.test(mode)) throw new BridgeError(503, 'app_wrong_mode', `${mode}; switch the app to ChatGPT mode`)

    const opened = await page.evaluate(`(async () => { ${PAGE_HELPERS}
      const button = byLabel('New chat'); if (!button) return false
      button.click()
      for (let i = 0; i < 30; i += 1) { await new Promise((r) => setTimeout(r, 200)); if (composer() && generated().length === 0) return true }
      return false })()`)
    if (!opened) throw new BridgeError(503, 'app_ui_changed', 'could not open a new chat')

    if (reference) {
      // Pasting a file is how a person attaches a photo; the upload shows as a thumbnail in the composer.
      const attached = await page.evaluate(`(async () => { ${PAGE_HELPERS}
        const box = composer(); box.focus()
        const blob = await (await fetch(${JSON.stringify(reference)})).blob()
        const data = new DataTransfer()
        data.items.add(new File([blob], 'reference.' + (blob.type.split('/')[1] || 'jpg'), { type: blob.type }))
        box.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }))
        const form = box.closest('form') ?? document
        for (let i = 0; i < 75; i += 1) {
          await new Promise((r) => setTimeout(r, 200))
          const thumb = [...form.querySelectorAll('img')].some((img) => shown(img) && img.naturalWidth > 0)
          const uploading = [...form.querySelectorAll('[role=progressbar], circle')].some(shown)
          if (thumb && !uploading) return true
        }
        return false })()`)
      if (!attached) throw new BridgeError(503, 'app_ui_changed', 'could not attach the reference photo')
    }
    const typed = await page.evaluate(`(() => { ${PAGE_HELPERS}
      const box = composer(); box.focus()
      document.execCommand('insertText', false, ${JSON.stringify(`${reference ? 'Using the attached photo of this person, create a new image' : 'Create an image'}: ${prompt}`)})
      return box.innerText.trim().length > 0 })()`)
    if (!typed) throw new BridgeError(503, 'app_ui_changed', 'could not type into the composer')
    await sleep(400)
    const sent = await page.evaluate(`(() => { ${PAGE_HELPERS} const b = byLabel('Send'); if (!b || b.disabled) return false; b.click(); return true })()`)
    if (!sent) throw new BridgeError(503, 'app_ui_changed', 'send button not found')

    const deadline = Date.now() + DRAW_TIMEOUT_MS
    let sawActivity = false
    while (Date.now() < deadline) {
      await sleep(2000)
      const state = await page.evaluate(`(() => { ${PAGE_HELPERS}
        const text = chatText()
        return { images: generated().length, creating: /Creating image/i.test(text), streaming: streaming(), tail: text.slice(-600) } })()`)
      if (state.images > 0 && !state.creating) break
      if (state.creating || state.streaming) { sawActivity = true; continue }
      // The answer finished without an image: a refusal or a usage limit, said in words.
      if (sawActivity) {
        const lines = state.tail.split('\n').map((line) => line.trim()).filter((line) => line && !/^(Auto|Latest response|ChatGPT said:|ChatGPT can make mistakes)/i.test(line))
        const said = lines.find((line) => LIMIT_PATTERN.test(line)) ?? lines.at(-1) ?? ''
        if (LIMIT_PATTERN.test(said)) {
          limitedUntil = Date.now() + resetDelayMs(said)
          limitMessage = said.slice(0, 200)
          throw new BridgeError(429, 'image_limit', said.slice(0, 300))
        }
        throw new BridgeError(422, 'image_refused', said.slice(0, 300))
      }
    }
    if (Date.now() >= deadline) throw new BridgeError(504, 'image_timeout')

    await sleep(1500) // let the final full-resolution image replace the preview
    const image = await page.evaluate(`(async () => { ${PAGE_HELPERS}
      const img = generated().at(-1)
      const blob = await (await fetch(img.src)).blob()
      const bytes = new Uint8Array(await blob.arrayBuffer())
      let text = ''
      for (let i = 0; i < bytes.length; i += 32768) text += String.fromCharCode(...bytes.subarray(i, i + 32768))
      return { type: blob.type || 'image/png', base64: btoa(text), width: img.naturalWidth, height: img.naturalHeight } })()`)
    return image
  } finally {
    page.close()
  }
}

// One drawing at a time: the app has one composer.
let queue = Promise.resolve()
function drawQueued(prompt, reference) {
  const job = queue.then(() => draw(prompt, reference))
  queue = job.catch(() => {})
  return job
}

// ---- HTTP --------------------------------------------------------------

function readBody(request) {
  return new Promise((done, fail) => {
    let body = ''
    request.on('data', (chunk) => { body += chunk; if (body.length > 20_000_000) request.destroy() })
    request.on('end', () => { try { done(body ? JSON.parse(body) : {}) } catch { fail(new BridgeError(400, 'bad_json')) } })
    request.on('error', fail)
  })
}

function lastUserContent(body) {
  return [...(body.messages ?? [])].reverse().find((message) => message.role === 'user')?.content
}

/** The first image attached to the request as a data URL, if any: a photo of the person to draw again. */
function referenceFrom(path, body) {
  const content = path === '/v1/chat/completions' ? lastUserContent(body) : null
  const url = Array.isArray(content) ? content.find((part) => part?.type === 'image_url')?.image_url?.url : null
  return typeof url === 'string' && url.startsWith('data:image/') ? url : null
}

function promptFrom(path, body) {
  if (path === '/v1/images/generations') return typeof body.prompt === 'string' ? body.prompt : ''
  const last = lastUserContent(body)
  const content = Array.isArray(last) ? last.map((part) => part?.text ?? '').join('\n') : last
  return typeof content === 'string' ? content.replace(/^Generate this image\.\s*/i, '') : ''
}

function reply(response, status, payload) {
  response.writeHead(status, { 'content-type': 'application/json' })
  response.end(JSON.stringify(payload))
}

function serve() {
  const server = createServer(async (request, response) => {
    const path = new URL(request.url ?? '/', 'http://bridge').pathname
    if (KEY && request.headers.authorization !== `Bearer ${KEY}`) return reply(response, 401, { error: { code: 'unauthorized' } })
    if (request.method === 'GET' && path === '/health') {
      return reply(response, 200, { ok: true, app: await cdpReachable(), limitedUntil: limitedUntil > Date.now() ? new Date(limitedUntil).toISOString() : null })
    }
    if (request.method !== 'POST' || (path !== '/v1/chat/completions' && path !== '/v1/images/generations')) {
      return reply(response, 404, { error: { code: 'not_found' } })
    }
    const started = Date.now()
    try {
      const body = await readBody(request)
      const prompt = promptFrom(path, body).trim()
      if (!prompt) throw new BridgeError(400, 'empty_prompt')
      const reference = referenceFrom(path, body)
      log('draw', reference ? '(with reference)' : '', JSON.stringify(prompt.slice(0, 80)))
      const image = await drawQueued(prompt, reference)
      log('done', `${image.width}x${image.height}`, `${Math.round((Date.now() - started) / 1000)}s`)
      if (path === '/v1/images/generations') return reply(response, 200, { created: Math.floor(Date.now() / 1000), data: [{ b64_json: image.base64 }] })
      return reply(response, 200, {
        object: 'chat.completion',
        model: 'chatgpt-app/image',
        choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content: `![image](data:${image.type};base64,${image.base64})` } }],
      })
    } catch (error) {
      const status = error instanceof BridgeError ? error.status : 500
      log('fail', status, error.message)
      return reply(response, status, { error: { code: error.code ?? 'internal', message: error.message } })
    }
  })
  server.listen(PORT, HOST, () => log(`ChatGPT image bridge on http://${HOST}:${PORT}${KEY ? ' (key required)' : ''}`))
  ensureApp().then(() => log('ChatGPT app ready'), (error) => log('ChatGPT app not ready yet:', error.message))
}

// ---- launchd -----------------------------------------------------------

async function install() {
  const plist = join(homedir(), 'Library/LaunchAgents', `${LABEL}.plist`)
  const logFile = join(homedir(), 'Library/Logs', `${LABEL}.log`)
  const env = { CHATGPT_BRIDGE_PORT: String(PORT), CHATGPT_BRIDGE_HOST: HOST, CHATGPT_CDP_PORT: String(CDP_PORT), PATH: process.env.PATH ?? '/usr/bin:/bin' }
  if (KEY) env.CHATGPT_BRIDGE_KEY = KEY
  const escape = (value) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;')
  await mkdir(join(homedir(), 'Library/LaunchAgents'), { recursive: true })
  await writeFile(plist, `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>${LABEL}</string>
  <key>ProgramArguments</key><array><string>${escape(process.execPath)}</string><string>${escape(resolve(process.argv[1]))}</string></array>
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

const [command, ...rest] = process.argv.slice(2)
if (!command || command === 'serve') serve()
else if (command === 'draw') {
  // draw [--ref photo.jpg] <prompt>
  const refAt = rest.indexOf('--ref')
  const refPath = refAt >= 0 ? rest.splice(refAt, 2)[1] : null
  const reference = refPath ? `data:image/${refPath.endsWith('.png') ? 'png' : 'jpeg'};base64,${(await readFile(refPath)).toString('base64')}` : null
  const image = await draw(rest.join(' '), reference)
  const out = resolve('chatgpt-image.png')
  await writeFile(out, Buffer.from(image.base64, 'base64'))
  console.log(`${out} ${image.width}x${image.height}`)
} else if (command === 'install') await install()
else if (command === 'uninstall') await uninstall()
else {
  console.error('usage: chatgpt-image-bridge.mjs [serve | draw [--ref photo] <prompt> | install | uninstall]')
  process.exit(1)
}
