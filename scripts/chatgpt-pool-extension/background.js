/**
 * Lends this Chrome profile's ChatGPT to the local pool server
 * (scripts/chatgpt-pool.mjs): asks it for work, does each job in one pinned
 * background chatgpt.com tab, sends the answer back.
 *
 * The waiting is done here, not in the page: a hidden tab's timers are
 * throttled to once a minute, so every check is a fresh script injection.
 */
const POOL = 'http://127.0.0.1:10320'
const TEXT_URL = 'https://chatgpt.com/?temporary-chat=true'
const IMAGE_URL = 'https://chatgpt.com/'
const LIMIT_PATTERN = /limit|try again (later|in|after)|too many requests|한도|제한에 도달|나중에 다시|이후에 다시/i
const RETRY_PATTERN = /완료되지 않았|확인되지 않았|couldn.t (generate|create)|something went wrong|오류가 발생/i

const sleep = (ms) => new Promise((done) => setTimeout(done, ms))

class JobError extends Error {
  constructor(code, message, retryAfterMs) {
    super(message)
    this.code = code
    this.retryAfterMs = retryAfterMs
  }
}

async function agentId() {
  const { agentId: stored } = await chrome.storage.local.get('agentId')
  if (stored) return stored
  const id = crypto.randomUUID()
  await chrome.storage.local.set({ agentId: id })
  return id
}

// ---- the page (runs inside chatgpt.com, self-contained) -----------------

async function page(op, arg) {
  const composer = () => document.querySelector('#prompt-textarea') || document.querySelector('.ProseMirror[contenteditable]')
  const labelled = (pattern) => [...document.querySelectorAll('button')].find((b) => pattern.test(b.getAttribute('aria-label') || ''))
  const sendButton = () => document.querySelector('[data-testid="send-button"]') || labelled(/^(보내기|Send|Send prompt|프롬프트 보내기)$/i)
  const turns = () => [...document.querySelectorAll('[data-message-author-role="assistant"]')]
  const generated = () => [...document.images].filter((i) => /^(Generated image|생성된 이미지)/i.test(i.alt || '') && i.complete && i.naturalWidth > 400)

  if (op === 'state') {
    const last = turns().at(-1)
    const form = composer()?.closest('form')
    return {
      composer: Boolean(composer()),
      signedOut: !composer() && [...document.querySelectorAll('button, a')].some((b) => /^(Log in|로그인)$/i.test(b.innerText.trim())),
      turns: turns().length,
      text: last ? (last.querySelector('.markdown')?.innerText ?? last.innerText).trim() : '',
      streaming: Boolean(document.querySelector('[data-testid="stop-button"]') || labelled(/^(스트리밍 중지|Stop streaming|중지)/i)),
      creating: /Creating image|이미지 생성 중|이미지를 생성하는 중/i.test(document.querySelector('main')?.innerText || ''),
      images: generated().length,
      attached: Boolean(form && [...form.querySelectorAll('img')].some((img) => img.naturalWidth > 0) && form.querySelectorAll('[role=progressbar]').length === 0),
    }
  }
  if (op === 'email') {
    try { return (await (await fetch('/api/auth/session')).json())?.user?.email ?? null } catch { return null }
  }
  if (op === 'type') {
    const box = composer()
    if (!box) return false
    box.focus()
    document.execCommand('selectAll')
    document.execCommand('delete')
    document.execCommand('insertText', false, arg)
    return box.innerText.trim().length > 0
  }
  if (op === 'send') {
    const button = sendButton()
    if (!button || button.disabled) return false
    button.click()
    return true
  }
  if (op === 'attach') {
    const blob = await (await fetch(arg)).blob()
    const file = new File([blob], `reference.${(blob.type.split('/')[1] || 'jpg').replace('jpeg', 'jpg')}`, { type: blob.type })
    const inputs = [...document.querySelectorAll('input[type=file]')]
    const input = inputs.find((i) => /image/.test(i.accept || '') && !i.hasAttribute('capture')) ?? inputs[0]
    if (!input) return false
    const data = new DataTransfer()
    data.items.add(file)
    input.files = data.files
    input.dispatchEvent(new Event('change', { bubbles: true }))
    return true
  }
  if (op === 'image') {
    const img = generated().at(-1)
    const blob = await (await fetch(img.src)).blob()
    const bytes = new Uint8Array(await blob.arrayBuffer())
    let text = ''
    for (let i = 0; i < bytes.length; i += 32768) text += String.fromCharCode(...bytes.subarray(i, i + 32768))
    return { type: blob.type || 'image/png', base64: btoa(text), width: img.naturalWidth, height: img.naturalHeight }
  }
  return null
}

// ---- the worker tab ----------------------------------------------------

async function workerTab() {
  const { tabId } = await chrome.storage.local.get('tabId')
  if (tabId) {
    const tab = await chrome.tabs.get(tabId).catch(() => null)
    if (tab) return tab
  }
  const windows = await chrome.windows.getAll({ windowTypes: ['normal'] })
  const tab = windows.length
    ? await chrome.tabs.create({ windowId: windows[0].id, url: IMAGE_URL, active: false, pinned: true, index: 0 })
    : (await chrome.windows.create({ url: IMAGE_URL, focused: false, state: 'minimized' })).tabs[0]
  await chrome.tabs.update(tab.id, { autoDiscardable: false })
  await chrome.storage.local.set({ tabId: tab.id })
  return tab
}

async function load(tabId, url) {
  await chrome.tabs.update(tabId, { url })
  for (let i = 0; i < 120; i += 1) {
    await sleep(500)
    const tab = await chrome.tabs.get(tabId)
    if (tab.status === 'complete' && tab.url?.startsWith('https://chatgpt.com')) return
  }
  throw new JobError('ui_changed', 'chatgpt.com did not load')
}

async function inPage(tabId, op, arg = null) {
  const [result] = await chrome.scripting.executeScript({ target: { tabId }, world: 'MAIN', func: page, args: [op, arg] })
  return result?.result
}

async function until(tabId, test, timeoutMs, message) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const state = await inPage(tabId, 'state').catch(() => null)
    if (state && test(state)) return state
    await sleep(1000)
  }
  throw new JobError('timeout', message)
}

/** "…resets in 10 hours" / "3시간 후" → that delay; an hour when the text gives none. */
function resetDelayMs(text) {
  const english = /in (\d+) (minute|hour|day)/i.exec(text)
  if (english) return Number(english[1]) * { minute: 60_000, hour: 3_600_000, day: 86_400_000 }[english[2].toLowerCase()]
  const korean = /(\d+)\s*(분|시간|일)/.exec(text)
  if (korean) return Number(korean[1]) * { 분: 60_000, 시간: 3_600_000, 일: 86_400_000 }[korean[2]]
  return 3_600_000
}

/** Waits for the next assistant turn after `before` to finish (and, for an image, to show the picture). */
async function answer(tabId, before, wantImage, timeoutMs) {
  let last = null
  let stable = 0
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    await sleep(1500)
    const state = await inPage(tabId, 'state').catch(() => null)
    if (!state || state.turns <= before || state.streaming || state.creating) { stable = 0; continue }
    if (wantImage && state.images > 0) return { text: state.text, image: true }
    stable = state.text === last ? stable + 1 : 0
    last = state.text
    if (stable >= (wantImage ? 3 : 1)) return { text: state.text, image: false }
  }
  throw new JobError('timeout', 'no answer in time')
}

async function runJob(job) {
  const tab = await workerTab()
  await load(tab.id, job.kind === 'image' ? IMAGE_URL : TEXT_URL)
  const ready = await until(tab.id, (s) => s.composer || s.signedOut, 30_000, 'composer not found')
  if (!ready.composer) throw new JobError('signed_out', 'log in to ChatGPT in this profile')
  if (job.reference) {
    if (!(await inPage(tab.id, 'attach', job.reference))) throw new JobError('ui_changed', 'no file input for the reference photo')
    await until(tab.id, (s) => s.attached, 40_000, 'the reference photo did not finish uploading')
  }
  const prompt = job.kind === 'image'
    ? `${job.reference ? '첨부한 사진 속 사람을 그대로 살려서 ' : ''}이미지 1장 생성해줘: ${job.prompt}`
    : job.prompt
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const before = (await inPage(tab.id, 'state')).turns
    if (!(await inPage(tab.id, 'type', attempt === 0 ? prompt : '다시 시도해서 위 설명대로 이미지 1장 생성해줘'))) throw new JobError('ui_changed', 'could not type')
    let sent = false
    for (let i = 0; i < 40 && !sent; i += 1) { await sleep(250); sent = await inPage(tab.id, 'send') }
    if (!sent) throw new JobError('ui_changed', 'send button stayed disabled')
    const result = await answer(tab.id, before, job.kind === 'image', job.kind === 'image' ? 7 * 60_000 : 4 * 60_000)
    if (job.kind !== 'image') return { text: result.text }
    if (result.image) {
      await sleep(1500) // the full-size picture replaces the preview
      return { image: await inPage(tab.id, 'image') }
    }
    if (LIMIT_PATTERN.test(result.text)) throw new JobError('image_limit', result.text.slice(0, 200), resetDelayMs(result.text))
    // The first image request of a chat often ends empty or "not finished"; asking again draws it.
    if (attempt === 0 && (result.text === '' || RETRY_PATTERN.test(result.text) || result.text.length < 200)) continue
    throw new JobError('image_refused', result.text.slice(0, 300))
  }
  throw new JobError('image_refused', 'no image after a retry')
}

// ---- talking to the pool -----------------------------------------------

let email = null
let emailCheckedAt = 0

async function currentEmail() {
  if (Date.now() - emailCheckedAt < 5 * 60_000) return email
  emailCheckedAt = Date.now()
  try {
    const session = await (await fetch('https://chatgpt.com/api/auth/session', { credentials: 'include' })).json()
    email = session?.user?.email ?? null
  } catch {
    const tab = await workerTab().catch(() => null)
    email = tab ? await inPage(tab.id, 'email').catch(() => null) : null
  }
  return email
}

async function post(path, body) {
  const response = await fetch(`${POOL}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  return response.json()
}

let looping = false

async function loop() {
  if (looping) return
  looping = true
  const id = await agentId()
  try {
    for (;;) {
      let reply
      try {
        reply = await post('/agent/poll', { agentId: id, email: await currentEmail(), idle: true })
      } catch {
        await sleep(10_000) // the pool is not running
        continue
      }
      const job = reply?.job
      if (!job) continue
      // Any extension call keeps this service worker alive through a long job.
      const keepAlive = setInterval(() => chrome.runtime.getPlatformInfo(), 20_000)
      try {
        const result = await runJob(job)
        await post('/agent/result', { agentId: id, jobId: job.id, ...result })
      } catch (error) {
        if (error instanceof JobError && error.code === 'signed_out') emailCheckedAt = 0
        await post('/agent/result', {
          agentId: id, jobId: job.id,
          error: { code: error instanceof JobError ? error.code : 'internal', message: String(error?.message ?? error).slice(0, 300), retryAfterMs: error?.retryAfterMs },
        }).catch(() => {})
      } finally {
        clearInterval(keepAlive)
      }
    }
  } finally {
    looping = false
  }
}

chrome.runtime.onStartup.addListener(() => void loop())
chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create('wake', { periodInMinutes: 1 })
  void loop()
})
chrome.alarms.onAlarm.addListener(() => void loop())
void loop()
