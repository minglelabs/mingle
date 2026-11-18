/**
 * Lends this Chrome profile's ChatGPT and Gemini to the local pool server
 * (scripts/chatgpt-pool.mjs): one poll loop per site asks it for work, does each
 * job in that site's pinned background tab (chatgpt.com, gemini.google.com),
 * sends the answer back.
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
  // ChatGPT's newer renderer dropped data-message-author-role; its turns carry a search unit key ending in ":assistant".
  // Since 2026-11-04 that key is only there while the answer streams; a finished answer
  // is found by data-turn="assistant".
  const turns = () => {
    const pick = (selector) => [...document.querySelectorAll(selector)]
    for (const found of [
      pick('[data-message-author-role="assistant"]'),
      pick('[data-chatgpt-search-unit-key$=":assistant"]'),
      pick('[data-turn="assistant"]'),
    ]) {
      // Keep only the outermost match, so a turn nested in another counts once.
      const outer = found.filter((el) => !found.some((other) => other !== el && other.contains(el)))
      if (outer.length) return outer
    }
    return []
  }
  // What the page has, for the log when no answer is found.
  const dom = () => {
    const count = (selector) => document.querySelectorAll(selector).length
    const tail = (document.querySelector('main')?.innerText || '').replace(/\s+/g, ' ').slice(-80)
    return `role=${count('[data-message-author-role]')} unit=${count('[data-chatgpt-search-unit-key]')} turn=${count('[data-turn]')} article=${count('article')} md=${count('.markdown, [data-markdown-text-style]')} url=${location.pathname.slice(0, 12)} tail=${JSON.stringify(tail)}`
  }
  // Source chips ("일본 관광청 +1") are popover badges inside the answer; hide them while reading.
  const answerText = (root) => {
    const chips = [...root.querySelectorAll('[data-d-component="popover-trigger"]:has([data-d-component="badge"]), [data-testid*="citation"]')]
    const before = chips.map((chip) => chip.style.display)
    chips.forEach((chip) => { chip.style.display = 'none' })
    const text = root.innerText
    chips.forEach((chip, i) => { chip.style.display = before[i] })
    return text.replace(/[ \t]+\n/g, '\n').trim()
  }
  // A drawn picture: alt "생성된 이미지 1" / "Generated image 1", or anything inside ChatGPT's image gallery.
  const generated = () => [...document.images].filter((i) => (/^(Generated image|생성된 이미지)/i.test(i.alt || '') || i.closest('[data-testid="generated-image-gallery"], [data-web-image-tile]')) && i.complete && i.naturalWidth > 400)
  // An image reply has no ":assistant" unit; its turn carries data-talvt-turn-state ("complete" once done).
  const turnStates = () => [...document.querySelectorAll('[data-talvt-turn-state]')].map((el) => el.getAttribute('data-talvt-turn-state'))

  if (op === 'state') {
    const last = turns().at(-1)
    // The composer's box: its form, or (newer layouts without one) the nearest
    // ancestor of the editor that also holds the send / voice button. Attachment
    // previews sit somewhere in there, not always within a fixed number of levels.
    const box = composer()
    const send = sendButton()
    let form = box?.closest('form') ?? null
    if (!form && box) {
      let node = box.parentElement
      for (let depth = 0; node && depth < 12; depth += 1, node = node.parentElement) {
        if ((send && node.contains(send)) || node.querySelector('[data-testid="composer-speech-button"], [data-testid*="composer-footer"]')) { form = node; break }
      }
      form ??= box.parentElement?.parentElement?.parentElement?.parentElement ?? null
    }
    // A finished preview: a loaded picture in the composer that is not a drawn result.
    const previews = form ? [...form.querySelectorAll('img')].filter((img) => img.complete && img.naturalWidth > 0 && !img.closest('[data-testid="generated-image-gallery"]')) : []
    // Still uploading: any progress ring, busy marker or spinner inside the composer.
    const uploading = form ? form.querySelectorAll('[role=progressbar], [aria-busy="true"], .animate-spin, circle[stroke-dasharray]').length : 0
    const sendState = !send ? 'none' : send.disabled || send.getAttribute('aria-disabled') === 'true' ? 'disabled' : 'enabled'
    const states = turnStates()
    const pictures = generated()
    return {
      turnState: states.at(-1) ?? null,
      turnStates: states.length,
      imageSrc: pictures.at(-1)?.src?.slice(-40) ?? null,
      composer: Boolean(composer()),
      signedOut: !composer() && [...document.querySelectorAll('button, a')].some((b) => /^(Log in|로그인)$/i.test(b.innerText.trim())),
      turns: turns().length,
      dom: dom(),
      // ChatGPT's own error in place of an answer ("... Please try again later." + 다시 시도), e.g. when it
      // throttles an account that sent too much. Seen 2026-11-04 on an account after ~15h of nonstop jobs.
      blocked: (/[^.!?\n]{0,200}(Please try again later|try again later|잠시 후 다시 시도|Too many requests|unusual activity)[^\n]{0,60}/i.exec(document.querySelector('main')?.innerText || '') || [null])[0],
      text: last ? answerText(last.querySelector('[data-markdown-text-style="assistant-message"], .markdown') ?? last) : '',
      streaming: Boolean(document.querySelector('[data-testid="stop-button"]') || labelled(/^(스트리밍 중지|Stop streaming|중지)/i)),
      creating: /Creating image|이미지 생성 중|이미지를 생성하는 중/i.test(document.querySelector('main')?.innerText || ''),
      images: pictures.length,
      // Done uploading: a preview is there, nothing is spinning, and ChatGPT lets you send.
      attached: previews.length > 0 && uploading === 0 && sendState === 'enabled',
      preview: previews.length,
      uploading,
      sendState,
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
    // Returns { how, detail }. Never throws: an exception here used to come back
    // as an empty result and was reported as "no file input" / "no composer".
    const detail = []
    try {
      // Decode the data URL by hand. fetch(data:…) runs under chatgpt.com's CSP
      // (connect-src), which can refuse it.
      const match = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(String(arg ?? ''))
      if (!match) return { how: null, detail: 'reference is not a data URL' }
      const type = match[1] || 'image/jpeg'
      const raw = match[2] ? atob(match[3]) : decodeURIComponent(match[3])
      const bytes = new Uint8Array(raw.length)
      for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i)
      const file = new File([bytes], `reference.${(type.split('/')[1] || 'jpg').replace('jpeg', 'jpg')}`, { type })
      detail.push(`file ${type} ${Math.round(file.size / 1024)}KB`)
      const files = () => {
        const data = new DataTransfer()
        data.items.add(file)
        return data
      }
      // 1) A file input already in the page (older ChatGPT keeps one hidden in the composer).
      const inputs = [...document.querySelectorAll('input[type=file]')]
      detail.push(`inputs=${inputs.length}`)
      const input = inputs.find((i) => /image/.test(i.accept || '') && !i.hasAttribute('capture')) ?? inputs[0]
      if (input) {
        input.files = files().files
        input.dispatchEvent(new Event('change', { bubbles: true }))
        return { how: 'input', detail: detail.join(' ') }
      }
      // 2) Newer ChatGPT creates the input only from its "+" menu, which would open a
      // file dialog. Paste the picture into the composer instead, as a user would.
      const box = composer()
      if (!box) return { how: null, detail: [...detail, 'no composer'].join(' ') }
      detail.push(`composer=${box.tagName.toLowerCase()}${box.id ? '#' + box.id : ''}`)
      box.focus()
      const pasted = new ClipboardEvent('paste', { clipboardData: files(), bubbles: true, cancelable: true })
      box.dispatchEvent(pasted)
      if (pasted.defaultPrevented) return { how: 'paste', detail: detail.join(' ') }
      detail.push('paste ignored')
      // 3) Dropping it on the composer.
      const target = box.closest('form') ?? box
      for (const type of ['dragenter', 'dragover', 'drop']) {
        target.dispatchEvent(new DragEvent(type, { dataTransfer: files(), bubbles: true, cancelable: true }))
      }
      return { how: 'drop', detail: detail.join(' ') }
    } catch (error) {
      return { how: null, detail: [...detail, `error ${error?.name ?? ''}: ${error?.message ?? error}`].join(' ') }
    }
  }
  if (op === 'image') {
    // The newest gallery's widest picture (the full-size one, not a preview); with two candidates, the first.
    const galleries = [...document.querySelectorAll('[data-testid="generated-image-gallery"]')]
    const inLast = galleries.length ? generated().filter((i) => galleries.at(-1).contains(i)) : []
    const pool = inLast.length ? inLast : generated().slice(-1)
    const img = pool.reduce((best, i) => (i.naturalWidth > best.naturalWidth ? i : best), pool[0])
    if (!img) return null
    const blob = await (await fetch(img.src)).blob()
    const bytes = new Uint8Array(await blob.arrayBuffer())
    let text = ''
    for (let i = 0; i < bytes.length; i += 32768) text += String.fromCharCode(...bytes.subarray(i, i + 32768))
    return { type: blob.type || 'image/png', base64: btoa(text), width: img.naturalWidth, height: img.naturalHeight }
  }
  return null
}

// ---- the page (runs inside gemini.google.com, self-contained) -----------

async function geminiPage(op, arg) {
  const composer = () => document.querySelector('rich-textarea .ql-editor[contenteditable="true"]')
    || document.querySelector('.ql-editor[contenteditable="true"]')
    || document.querySelector('[contenteditable="true"][role="textbox"]')
  const buttons = () => [...document.querySelectorAll('button')]
  const label = (b) => `${b.getAttribute('aria-label') || ''} ${b.getAttribute('mattooltip') || ''}`.trim()
  const stopButton = () => document.querySelector('button.send-button.stop')
    || buttons().find((b) => /^(Stop (response|generating)|대답 (생성 )?중지|응답 (생성 )?중지|생성 중지|중지)/i.test(label(b)))
  const sendButton = () => (stopButton() ? null : document.querySelector('button.send-button'))
    || buttons().find((b) => /^(Send message|Send|메시지 보내기|보내기|전송)$/i.test(label(b)))
  const responses = () => [...document.querySelectorAll('model-response')]
  const textRoot = (response) => response.querySelector('message-content .markdown, .model-response-text .markdown, message-content, .model-response-text') ?? response
  // A drawn picture inside an answer: big enough not to be an icon or avatar.
  const pictures = (root) => [...(root ?? document).querySelectorAll('img')].filter((img) => img.complete && img.naturalWidth >= 256 && !img.closest('user-query'))
  const dom = () => {
    const count = (selector) => document.querySelectorAll(selector).length
    const tail = (document.querySelector('chat-window, main')?.innerText || document.body.innerText || '').replace(/\s+/g, ' ').slice(-100)
    const last = responses().at(-1)
    const stop = stopButton()
    return `vis=${document.visibilityState} focus=${document.hasFocus()} model-response=${count('model-response')} user-query=${count('user-query')} editor=${count('.ql-editor')} send=${count('button.send-button')} stop=${stop ? JSON.stringify(`${stop.className} ${label(stop)}`.slice(0, 60)) : 'none'} busy=${last ? last.querySelectorAll('[aria-busy="true"]').length : 0} pending=${last ? last.querySelectorAll('.pending, [class*="processing"]').length : 0} actions=${last ? last.querySelectorAll('message-actions, [aria-label*="Copy"], [aria-label*="복사"]').length : 0} resp=${JSON.stringify((last?.innerText || '').replace(/\s+/g, ' ').slice(0, 80))} md=${last ? [...last.querySelectorAll('.markdown, message-content, .model-response-text, [class*="response-content"], [class*="markdown"]')].map((el) => `${el.tagName.toLowerCase()}.${[...el.classList].slice(0, 2).join('.')}:${el.innerText.trim().length}`).slice(0, 5).join(',') : ''} img=${pictures().length} url=${location.host}${location.pathname.slice(0, 16)} tail=${JSON.stringify(tail)}`
  }
  const signInVisible = () => [...document.querySelectorAll('a, button')].some((b) => /^(Sign in|로그인)$/i.test((b.innerText || '').trim()))

  if (op === 'state') {
    const all = responses()
    const last = all.at(-1)
    const box = composer()
    let area = box
    for (let depth = 0; area && depth < 10 && !area.querySelector?.('button.send-button, [aria-label*="Send"], [aria-label*="보내기"]'); depth += 1) area = area.parentElement
    const previews = area ? [...area.querySelectorAll('img')].filter((img) => img.complete && img.naturalWidth > 0) : []
    const uploading = area ? area.querySelectorAll('[role=progressbar], mat-progress-spinner, .loading, [aria-busy="true"]').length : 0
    const send = sendButton()
    const sendState = !send ? 'none' : send.disabled || send.getAttribute('aria-disabled') === 'true' ? 'disabled' : 'enabled'
    const text = last ? textRoot(last).innerText.replace(/[ \t]+\n/g, '\n').trim() : ''
    const drawn = last ? pictures(last) : []
    return {
      // Gemini has no turn-state marker or ChatGPT's "creating image" text; answer() reads these as "not drawing".
      turnState: null,
      turnStates: 0,
      creating: false,
      composer: Boolean(box),
      signedOut: !box && (signInVisible() || /accounts\.google\.com/.test(location.host)),
      turns: all.length,
      queries: document.querySelectorAll('user-query').length,
      text,
      // The stop button, or the answer still marked as processing (seen 2026-11-15:
      // structured-content-container.model-response-text.processing-state-visible while
      // Gemini thinks). Not aria-busy / "pending": those stayed on after an answer finished.
      // In the pool's background tab (document hidden) Gemini writes the answer's text but
      // never finishes its own "done" step: the processing marker stays and no action
      // buttons appear (seen 2026-11-15). So "still thinking" only counts while no text
      // has come; once there is text, answer() waits for it to stop changing.
      streaming: Boolean(stopButton()) || (Boolean(last?.querySelector('.processing-state-visible')) && !text),
      thinking: Boolean(last?.querySelector('.processing-state-visible')),
      images: drawn.length,
      imageSrc: drawn.at(-1)?.src?.slice(-40) ?? null,
      // Gemini's own error toast or banner in place of an answer.
      blocked: (/[^.!?\n]{0,200}(try again later|unusual traffic|Too many requests|잠시 후 다시 시도|나중에 다시 시도)[^\n]{0,60}/i.exec((document.querySelector('chat-window') ?? document.body).innerText || '') || [null])[0],
      preview: previews.length,
      uploading,
      sendState,
      attached: previews.length > 0 && uploading === 0 && sendState === 'enabled',
      dom: dom(),
    }
  }
  if (op === 'email') {
    // The signed-in Google account: the account button's label, else the page's own data.
    const fromLabel = [...document.querySelectorAll('a[aria-label], button[aria-label]')].map((el) => /[\w.+-]+@[\w-]+(\.[\w-]+)+/.exec(el.getAttribute('aria-label') || '')?.[0]).find(Boolean)
    return fromLabel ?? window.WIZ_global_data?.oPEP7c ?? null
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
    if (!button || button.disabled || button.getAttribute('aria-disabled') === 'true') return false
    button.click()
    return true
  }
  if (op === 'attach') {
    try {
      const match = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(String(arg ?? ''))
      if (!match) return { how: null, detail: 'reference is not a data URL' }
      const type = match[1] || 'image/jpeg'
      const raw = match[2] ? atob(match[3]) : decodeURIComponent(match[3])
      const bytes = new Uint8Array(raw.length)
      for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i)
      const file = new File([bytes], `reference.${(type.split('/')[1] || 'jpg').replace('jpeg', 'jpg')}`, { type })
      const box = composer()
      if (!box) return { how: null, detail: 'no composer' }
      const data = new DataTransfer()
      data.items.add(file)
      box.focus()
      const pasted = new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true })
      box.dispatchEvent(pasted)
      return { how: 'paste', detail: `file ${type} ${Math.round(file.size / 1024)}KB${pasted.defaultPrevented ? '' : ' (paste not handled)'}` }
    } catch (error) {
      return { how: null, detail: `error ${error?.name ?? ''}: ${error?.message ?? error}` }
    }
  }
  if (op === 'image') {
    const last = responses().at(-1)
    const img = (last ? pictures(last) : []).reduce((best, i) => (!best || i.naturalWidth > best.naturalWidth ? i : best), null)
    if (!img) return null
    // blob: and data: URLs only work from the page; other pictures the extension fetches itself.
    if (!/^(blob|data):/.test(img.src)) return { src: img.src, width: img.naturalWidth, height: img.naturalHeight }
    const blob = await (await fetch(img.src)).blob()
    const bytes = new Uint8Array(await blob.arrayBuffer())
    let text = ''
    for (let i = 0; i < bytes.length; i += 32768) text += String.fromCharCode(...bytes.subarray(i, i + 32768))
    return { type: blob.type || 'image/png', base64: btoa(text), width: img.naturalWidth, height: img.naturalHeight }
  }
  return null
}

// ---- the worker tab ----------------------------------------------------

/** What differs between the two sites a profile lends: where to go and how to read the page. */
const SITES = {
  chatgpt: { origin: 'https://chatgpt.com', match: 'https://chatgpt.com/*', textUrl: TEXT_URL, imageUrl: IMAGE_URL, tabKey: 'tabId', page },
  gemini: { origin: 'https://gemini.google.com', match: 'https://gemini.google.com/*', textUrl: 'https://gemini.google.com/app', imageUrl: 'https://gemini.google.com/app', tabKey: 'geminiTabId', page: geminiPage },
}
/** tabId -> the page function for the site that tab works on. */
const tabSite = new Map()

async function workerTab(provider = 'chatgpt', { create = true } = {}) {
  const site = SITES[provider]
  const remember = async (tab) => { tabSite.set(tab.id, site); await chrome.storage.local.set({ [site.tabKey]: tab.id }); return tab }
  const { [site.tabKey]: tabId } = await chrome.storage.local.get(site.tabKey)
  if (tabId) {
    const tab = await chrome.tabs.get(tabId).catch(() => null)
    if (tab) { tabSite.set(tab.id, site); return tab }
  }
  // The pool opened this profile with a tab of this site: use that one rather than a second.
  const [opened] = await chrome.tabs.query({ url: site.match })
  if (opened) {
    await chrome.tabs.update(opened.id, { pinned: true, autoDiscardable: false })
    return remember(opened)
  }
  if (!create) return null
  const windows = await chrome.windows.getAll({ windowTypes: ['normal'] })
  const tab = windows.length
    ? await chrome.tabs.create({ windowId: windows[0].id, url: site.imageUrl, active: false, pinned: true, index: 0 })
    : (await chrome.windows.create({ url: site.imageUrl, focused: false, state: 'minimized' })).tabs[0]
  await chrome.tabs.update(tab.id, { autoDiscardable: false })
  return remember(tab)
}

async function load(tabId, url) {
  const site = tabSite.get(tabId) ?? SITES.chatgpt
  await chrome.tabs.update(tabId, { url })
  for (let i = 0; i < 120; i += 1) {
    await sleep(500)
    const tab = await chrome.tabs.get(tabId)
    if (tab.status !== 'complete') continue
    if (tab.url?.startsWith(site.origin)) return
    // Google sent the profile to its sign-in page: nobody is signed in to Gemini here.
    if (tab.url?.startsWith('https://accounts.google.com')) throw new JobError('signed_out', 'sign in to Google in this profile')
  }
  throw new JobError('ui_changed', `${new URL(site.origin).host} did not load`)
}

async function inPage(tabId, op, arg = null) {
  const func = (tabSite.get(tabId) ?? SITES.chatgpt).page
  const [result] = await chrome.scripting.executeScript({ target: { tabId }, world: 'MAIN', func, args: [op, arg] })
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
async function answer(tabId, before, wantImage, timeoutMs, job) {
  let last = null
  let stable = 0
  let lastPicture = null
  let pictureStable = 0
  let reportedAt = 0
  let blockedSeen = 0
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    await sleep(1500)
    const state = await inPage(tabId, 'state').catch(() => null)
    if (state && job && Date.now() - reportedAt > 15_000) {
      reportedAt = Date.now()
      const said = state.text ? ` said=${JSON.stringify(state.text.replace(/\s+/g, ' ').slice(0, 80))}` : ''
      progress(job, `wait turns=${state.turns} images=${state.images} turnState=${state.turnState} states=${state.turnStates} streaming=${state.streaming} creating=${state.creating} text=${state.text.length}${said}${(state.turns <= before.turns || !state.text || job.provider === 'gemini') && (!state.streaming || state.thinking) ? ` dom: ${state.dom}` : ''}`)
    }
    const drawing = wantImage && state && state.turnState !== null && state.turnState !== 'complete'
    if (!state || state.streaming || state.creating || drawing) { stable = 0; pictureStable = 0; continue }
    // An image reply has no ":assistant" turn, so a new picture is the answer once it stops changing.
    if (wantImage && state.images > before.images && (state.turnState === null || state.turnState === 'complete')) {
      pictureStable = state.imageSrc === lastPicture ? pictureStable + 1 : 0
      lastPicture = state.imageSrc
      if (pictureStable >= 2) return { text: state.text, image: true }
      continue
    }
    if (state.turns <= before.turns) {
      stable = 0
      // The error stays put, so seeing it on a few checks in a row means no answer is coming.
      blockedSeen = state.blocked ? blockedSeen + 1 : 0
      if (blockedSeen >= 3) throw new JobError('rate_limited', state.blocked.trim().slice(0, 200), resetDelayMs(state.blocked))
      continue
    }
    if (!wantImage && !state.text) { stable = 0; continue } // the turn shows up before its words do
    stable = state.text === last ? stable + 1 : 0
    last = state.text
    // Gemini gives no reliable "done" in a hidden tab: its text must hold still for ~6s.
    if (stable >= (state.thinking ? 4 : wantImage ? 3 : 1)) return { text: state.text, image: false }
  }
  throw new JobError('timeout', 'no answer in time')
}

/**
 * Waits for the attached reference photo to finish uploading.
 * Done when ChatGPT shows the preview, nothing spins and send is enabled. If the
 * send button never turns on (empty composer in some layouts), a preview that has
 * stopped spinning for 5s counts too. Logs each change of the upload state, so a
 * new ChatGPT layout shows up in the log instead of as a bare timeout.
 */
async function uploaded(tabId, job, how) {
  const started = Date.now()
  const deadline = started + 60_000
  let lastShape = ''
  let settledSince = 0
  let goneSince = 0
  let reattached = 0
  while (Date.now() < deadline) {
    const state = await inPage(tabId, 'state').catch(() => null)
    if (state) {
      const shape = `preview=${state.preview} uploading=${state.uploading} send=${state.sendState}`
      if (shape !== lastShape) {
        progress(job, `upload ${Math.round((Date.now() - started) / 1000)}s ${shape}`)
        lastShape = shape
      }
      if (state.attached) return
      const settled = state.preview > 0 && state.uploading === 0
      settledSince = settled ? settledSince || Date.now() : 0
      if (settledSince && Date.now() - settledSince >= 5_000) {
        progress(job, 'upload settled without send enabled; going on')
        return
      }
      // ChatGPT sometimes re-renders the composer just after the page loads and
      // drops the photo: no preview, nothing uploading, the voice button back
      // instead of send. Attach it again in the same tab instead of giving up.
      const gone = state.preview === 0 && state.uploading === 0
      goneSince = gone ? goneSince || Date.now() : 0
      if (goneSince && Date.now() - goneSince >= 2_000 && reattached < 3) {
        reattached += 1
        const again = await inPage(tabId, 'attach', job.reference).catch(() => null)
        progress(job, `photo dropped by the page; attached again by ${again?.how ?? 'nothing'} (${reattached}/3)`)
        goneSince = 0
        lastShape = ''
      }
    }
    await sleep(1000)
  }
  throw new JobError('timeout', `the reference photo did not finish uploading (attached by ${how}; ${lastShape || 'no state'}; attached again ${reattached}x)`)
}

/** Tells the pool which step a job is on, for its log; never fails the job. */
function progress(job, step) {
  void post('/agent/progress', { agentId: currentAgentId, provider: job.provider ?? 'chatgpt', jobId: job.id, step }).catch(() => {})
}

const GEMINI_LIMIT = /limit|한도|더 (이상 )?(생성|만들)할 수 없|(생성|만들) 수 없어요.*(오늘|내일)|can.t (create|generate) (any )?more|try again (later|tomorrow)|나중에 다시/i

/** A job in this profile's pinned gemini.google.com tab. */
async function runGeminiJob(job) {
  const tab = await workerTab('gemini')
  progress(job, `tab ${tab.id}`)
  await load(tab.id, SITES.gemini.textUrl)
  progress(job, 'loaded')
  const ready = await until(tab.id, (s) => s.composer || s.signedOut, 30_000, 'composer not found')
  progress(job, ready.composer ? 'composer ready' : `signed out; dom: ${ready.dom}`)
  if (!ready.composer) throw new JobError('signed_out', 'sign in to Gemini (Google) in this profile')
  if (job.reference) {
    await sleep(1500)
    const attached = await inPage(tab.id, 'attach', job.reference).catch((error) => ({ how: null, detail: `inject failed: ${error?.message ?? error}` }))
    progress(job, `attach: ${attached?.detail ?? 'no result from the page'}`)
    if (!attached?.how) throw new JobError('ui_changed', `could not attach the reference photo (${attached?.detail ?? 'no result'})`)
    await uploaded(tab.id, job, attached.how)
  }
  const wantImage = job.kind === 'image'
  const prompt = wantImage ? `${job.reference ? '첨부한 사진 속 사람을 그대로 살려서 ' : ''}이미지 1장 생성해줘: ${job.prompt}` : job.prompt
  // The editor shows before Gemini's app has started; text typed in the first moment is lost.
  await sleep(2000)
  const before = await inPage(tab.id, 'state')
  for (let attempt = 1; ; attempt += 1) {
    if (!(await inPage(tab.id, 'type', prompt))) throw new JobError('ui_changed', 'could not type')
    let sent = false
    for (let i = 0; i < 40 && !sent; i += 1) { await sleep(250); sent = await inPage(tab.id, 'send') }
    if (!sent) throw new JobError('ui_changed', `send button stayed disabled; dom: ${(await inPage(tab.id, 'state').catch(() => null))?.dom ?? '?'}`)
    // Sent for real once the question shows in the chat.
    const shown = await until(tab.id, (s) => s.queries > before.queries || s.turns > before.turns, 8_000, 'not shown').catch(() => null)
    if (shown) break
    const now = await inPage(tab.id, 'state').catch(() => null)
    if (attempt >= 2) throw new JobError('ui_changed', `the message did not show in the chat after sending; dom: ${now?.dom ?? '?'}`)
    progress(job, `message not shown after sending; typing it again. dom: ${now?.dom ?? '?'}`)
  }
  progress(job, `sent (turns before ${before.turns}, images before ${before.images})`)
  const result = await answer(tab.id, before, wantImage, wantImage ? 7 * 60_000 : 4 * 60_000, job)
  if (!wantImage) return { text: result.text }
  if (result.image) {
    await sleep(1500) // the full-size picture replaces the preview
    const picture = await inPage(tab.id, 'image')
    if (picture?.src) {
      // A googleusercontent.com picture: the extension may fetch it (host permission), the page may not (CORS).
      const response = await fetch(picture.src, { credentials: 'include' })
      if (!response.ok) throw new JobError('ui_changed', `the picture could not be fetched (${response.status})`)
      const blob = await response.blob()
      const bytes = new Uint8Array(await blob.arrayBuffer())
      let text = ''
      for (let i = 0; i < bytes.length; i += 32768) text += String.fromCharCode(...bytes.subarray(i, i + 32768))
      Object.assign(picture, { type: blob.type || 'image/png', base64: btoa(text) })
      delete picture.src
    }
    if (!picture?.base64) throw new JobError('ui_changed', 'the picture could not be read')
    progress(job, `image ${picture.width}x${picture.height} ${picture.type} ${Math.round(picture.base64.length / 1024)}KB`)
    return { image: picture }
  }
  if (GEMINI_LIMIT.test(result.text)) throw new JobError('image_limit', result.text.slice(0, 200), resetDelayMs(result.text))
  throw new JobError('image_refused', result.text.slice(0, 300) || 'no image in the answer')
}

async function runJob(job) {
  if (job.provider === 'gemini') return runGeminiJob(job)
  const tab = await workerTab()
  progress(job, `tab ${tab.id}`)
  await load(tab.id, job.kind === 'image' ? IMAGE_URL : TEXT_URL)
  progress(job, 'loaded')
  const ready = await until(tab.id, (s) => s.composer || s.signedOut, 30_000, 'composer not found')
  progress(job, ready.composer ? 'composer ready' : 'signed out')
  if (!ready.composer) throw new JobError('signed_out', 'log in to ChatGPT in this profile')
  if (job.reference) {
    // Give the freshly loaded page a moment to finish its own re-render, which
    // otherwise can drop a photo attached in the first second.
    await sleep(1500)
    const attached = await inPage(tab.id, 'attach', job.reference).catch((error) => ({ how: null, detail: `inject failed: ${error?.message ?? error}` }))
    const how = attached?.how
    progress(job, `attach: ${attached?.detail ?? 'no result from the page'}`)
    if (!how) throw new JobError('ui_changed', `could not attach the reference photo (${attached?.detail ?? 'no result from the page'})`)
    progress(job, `reference attached by ${how}`)
    await uploaded(tab.id, job, how)
  }
  const prompt = job.kind === 'image'
    ? `${job.reference ? '첨부한 사진 속 사람을 그대로 살려서 ' : ''}이미지 1장 생성해줘: ${job.prompt}`
    : job.prompt
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const before = await inPage(tab.id, 'state')
    if (!(await inPage(tab.id, 'type', attempt === 0 ? prompt : '다시 시도해서 위 설명대로 이미지 1장 생성해줘'))) throw new JobError('ui_changed', 'could not type')
    let sent = false
    for (let i = 0; i < 40 && !sent; i += 1) { await sleep(250); sent = await inPage(tab.id, 'send') }
    if (!sent) throw new JobError('ui_changed', 'send button stayed disabled')
    progress(job, `sent (attempt ${attempt + 1}, turns before ${before.turns}, images before ${before.images})`)
    const result = await answer(tab.id, before, job.kind === 'image', job.kind === 'image' ? 7 * 60_000 : 4 * 60_000, job)
    if (job.kind !== 'image') return { text: result.text }
    if (result.image) {
      await sleep(1500) // the full-size picture replaces the preview
      const picture = await inPage(tab.id, 'image')
      if (!picture?.base64) throw new JobError('ui_changed', 'the picture could not be read')
      progress(job, `image ${picture.width}x${picture.height} ${picture.type} ${Math.round(picture.base64.length / 1024)}KB`)
      return { image: picture }
    }
    if (LIMIT_PATTERN.test(result.text)) throw new JobError('image_limit', result.text.slice(0, 200), resetDelayMs(result.text))
    // The first image request of a chat often ends empty or "not finished"; asking again draws it.
    if (attempt === 0 && (result.text === '' || RETRY_PATTERN.test(result.text) || result.text.length < 200)) continue
    throw new JobError('image_refused', result.text.slice(0, 300))
  }
  throw new JobError('image_refused', 'no image after a retry')
}

// ---- talking to the pool -----------------------------------------------

/** provider -> { email, checkedAt }: who is signed in to that site in this profile, rechecked every 5 minutes. */
const signedIn = { chatgpt: { email: null, checkedAt: 0 }, gemini: { email: null, checkedAt: 0 } }

async function geminiEmail() {
  // The app page carries the signed-in account in its startup data; signed out, there is none.
  try {
    const html = await (await fetch(SITES.gemini.textUrl, { credentials: 'include' })).text()
    const found = /"oPEP7c":"([^"@]+@[^"]+)"/.exec(html)?.[1]
    if (found) return found
  } catch {}
  // Else ask an open Gemini tab (never open one just for this).
  const tab = await workerTab('gemini', { create: false }).catch(() => null)
  return tab ? await inPage(tab.id, 'email').catch(() => null) : null
}

async function currentEmail(provider = 'chatgpt') {
  const state = signedIn[provider]
  if (Date.now() - state.checkedAt < 5 * 60_000) return state.email
  state.checkedAt = Date.now()
  if (provider === 'gemini') {
    state.email = await geminiEmail()
    return state.email
  }
  try {
    const session = await (await fetch('https://chatgpt.com/api/auth/session', { credentials: 'include' })).json()
    state.email = session?.user?.email ?? null
  } catch {
    const tab = await workerTab().catch(() => null)
    state.email = tab ? await inPage(tab.id, 'email').catch(() => null) : null
  }
  return state.email
}

async function post(path, body) {
  const response = await fetch(`${POOL}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  return response.json()
}

/** One poll loop per site, so a profile can answer a ChatGPT and a Gemini job at the same time. */
const looping = { chatgpt: false, gemini: false }
let currentAgentId = null
let keepOpen = false

const POOL_TAB = /^(https:\/\/chatgpt\.com\/|https:\/\/gemini\.google\.com\/|about:blank|chrome:\/\/newtab\/?$|chrome:\/\/new-tab-page\/?$)/

/** Closes every window of this profile when all its tabs are ChatGPT or blank; false otherwise. */
async function closeProfile() {
  const windows = await chrome.windows.getAll({ populate: true })
  const tabs = windows.flatMap((window) => window.tabs ?? [])
  if (tabs.some((tab) => !POOL_TAB.test(tab.pendingUrl || tab.url || ''))) return false
  await chrome.storage.local.remove(['tabId', 'geminiTabId'])
  for (const window of windows) await chrome.windows.remove(window.id).catch(() => {})
  return true
}

async function loop(provider = 'chatgpt') {
  if (looping[provider]) return
  looping[provider] = true
  const id = await agentId()
  currentAgentId = id
  try {
    for (;;) {
      let reply
      try {
        reply = await post('/agent/poll', { agentId: id, provider, email: await currentEmail(provider), idle: true, ...(keepOpen ? { keepOpen: true } : {}) })
      } catch {
        await sleep(10_000) // the pool is not running
        continue
      }
      if (reply?.extensionVersion && reply.extensionVersion !== chrome.runtime.getManifest().version) {
        chrome.runtime.reload() // the server has newer code on disk
        return
      }
      // The pool has more profiles open than it needs: close this one, unless the
      // staff use it for anything else (a tab that is not ChatGPT).
      if (reply?.park) {
        if (await closeProfile()) return
        keepOpen = true
        continue
      }
      const job = reply?.job
      if (!job) continue
      job.provider = provider
      try {
        const result = await runJob(job)
        await post('/agent/result', { agentId: id, provider, jobId: job.id, ...result })
      } catch (error) {
        if (error instanceof JobError && error.code === 'signed_out') signedIn[provider].checkedAt = 0
        await post('/agent/result', {
          agentId: id, provider, jobId: job.id,
          error: { code: error instanceof JobError ? error.code : 'internal', message: String(error?.message ?? error).slice(0, 300), retryAfterMs: error?.retryAfterMs },
        }).catch(() => {})
      }
    }
  } finally {
    looping[provider] = false
  }
}

const loops = () => { void loop('chatgpt'); void loop('gemini') }

// Chrome stops an idle service worker after 30s, and a pending fetch does not count
// as activity, so a worker waiting in a poll would die and the job handed to it be
// lost. Any extension API call resets that timer.
setInterval(() => chrome.runtime.getPlatformInfo(), 20_000)

chrome.runtime.onStartup.addListener(loops)
chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create('wake', { periodInMinutes: 1 })
  loops()
})
chrome.alarms.onAlarm.addListener(loops)
loops()
