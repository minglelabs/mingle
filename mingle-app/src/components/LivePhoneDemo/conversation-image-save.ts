'use client'

/** Asks the chat screen to show a short toast (the long-press menu has none of its own). */
export const CONVERSATION_TOAST_EVENT = 'live-phone-demo:toast'

export type ConversationImageSaveResult = 'saved' | 'permission' | 'failed'

const NATIVE_IMAGE_SAVE_EVENT = 'mingle:native-image-save'
const NATIVE_QR_SAVE_EVENT = 'mingle:native-qr-save'
/** A build that knows `native_image_save` answers a probe with "ready" at once; silence means an older build. */
const NATIVE_ACK_TIMEOUT_MS = 1500
const NATIVE_SAVE_TIMEOUT_MS = 30_000
/** Older builds only take a PNG data URL up to this many characters (rn/App.tsx `handleNativeQrSave`). */
const LEGACY_PNG_MAX_CHARS = 4_900_000

type NativeBridgeWindow = Window & { ReactNativeWebView?: { postMessage?: (message: string) => void } }
type NativeSaveDetail = { type?: string; requestId?: string; message?: string }

function nativeBridge(): ((message: string) => void) | null {
  if (typeof window === 'undefined') return null
  const post = (window as NativeBridgeWindow).ReactNativeWebView?.postMessage
  return typeof post === 'function' ? post.bind((window as NativeBridgeWindow).ReactNativeWebView) : null
}

function readAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => (typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('read_failed')))
    reader.onerror = () => reject(reader.error ?? new Error('read_failed'))
    reader.readAsDataURL(blob)
  })
}

function resultFromMessage(message: string | undefined): ConversationImageSaveResult {
  return /permission/i.test(message ?? '') ? 'permission' : 'failed'
}

/** Re-encodes the photo as PNG for older app builds, shrinking it until it fits their size limit. */
async function legacyPngDataUrl(blob: Blob): Promise<string | null> {
  const bitmap = await createImageBitmap(blob)
  try {
    for (let scale = 1; scale >= 0.3; scale -= 0.15) {
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(bitmap.width * scale))
      canvas.height = Math.max(1, Math.round(bitmap.height * scale))
      canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
      const dataUrl = canvas.toDataURL('image/png')
      if (dataUrl.length <= LEGACY_PNG_MAX_CHARS) return dataUrl
    }
    return null
  } finally {
    bitmap.close()
  }
}

function waitForEvent(name: string, accept: (detail: NativeSaveDetail) => boolean, timeoutMs: number): Promise<NativeSaveDetail | null> {
  return new Promise(resolve => {
    const timer = window.setTimeout(() => finish(null), timeoutMs)
    function handle(event: Event) {
      const detail = (event as CustomEvent<NativeSaveDetail>).detail
      if (detail && accept(detail)) finish(detail)
    }
    function finish(detail: NativeSaveDetail | null) {
      window.clearTimeout(timer)
      window.removeEventListener(name, handle)
      resolve(detail)
    }
    window.addEventListener(name, handle)
  })
}

async function saveThroughNative(post: (message: string) => void, blob: Blob, fileName: string): Promise<ConversationImageSaveResult> {
  const requestId = `img-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  const ofRequest = (detail: NativeSaveDetail) => detail.requestId === requestId
  // A tiny probe first, so the answer is never held up by a large photo and an older build that stays
  // silent can be told apart without risking the photo being saved twice.
  const ready = waitForEvent(NATIVE_IMAGE_SAVE_EVENT, detail => ofRequest(detail) && detail.type === 'ready', NATIVE_ACK_TIMEOUT_MS)
  post(JSON.stringify({ type: 'native_image_save', payload: { requestId, probe: true } }))

  if (await ready) {
    const dataUrl = await readAsDataUrl(blob)
    const finished = waitForEvent(NATIVE_IMAGE_SAVE_EVENT, detail => ofRequest(detail) && (detail.type === 'success' || detail.type === 'error'), NATIVE_SAVE_TIMEOUT_MS)
    post(JSON.stringify({ type: 'native_image_save', payload: { requestId, dataUrl, fileName } }))
    const detail = await finished
    return detail?.type === 'success' ? 'saved' : resultFromMessage(detail?.message)
  }

  // An older build: save through the QR code path, which takes a PNG.
  const png = await legacyPngDataUrl(blob)
  if (!png) return 'failed'
  const legacy = waitForEvent(NATIVE_QR_SAVE_EVENT, detail => detail.type === 'success' || detail.type === 'error', NATIVE_SAVE_TIMEOUT_MS)
  post(JSON.stringify({ type: 'native_qr_save', payload: { dataUrl: png, fileName: fileName.replace(/\.[a-z0-9]+$/i, '.png') } }))
  const detail = await legacy
  return detail?.type === 'success' ? 'saved' : resultFromMessage(detail?.message)
}

function saveThroughBrowser(blob: Blob, fileName: string): ConversationImageSaveResult {
  const url = URL.createObjectURL(blob)
  try {
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = fileName
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    return 'saved'
  } finally {
    window.setTimeout(() => URL.revokeObjectURL(url), 10_000)
  }
}

let queue: Promise<unknown> = Promise.resolve()

/**
 * Saves a chat photo to the device: the app saves it to the photo library (Photos on iOS, the
 * gallery on Android), a browser downloads it.
 */
export async function saveConversationImage(src: string, fileName: string): Promise<ConversationImageSaveResult> {
  // One save at a time: the older builds' answer carries no request id to match it to its photo.
  const run = queue.then(() => saveOnce(src, fileName))
  queue = run.catch(() => undefined)
  return run
}

async function saveOnce(src: string, fileName: string): Promise<ConversationImageSaveResult> {
  try {
    const response = await fetch(src, { credentials: 'include' })
    if (!response.ok) return 'failed'
    const blob = await response.blob()
    const post = nativeBridge()
    return post ? await saveThroughNative(post, blob, fileName) : saveThroughBrowser(blob, fileName)
  } catch {
    return 'failed'
  }
}

export function conversationImageFileName(messageId: string): string {
  return `hashchat-${messageId.replace(/[^A-Za-z0-9_-]/g, '').slice(-24) || 'photo'}.jpg`
}

export function announceConversationToast(label: string) {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(CONVERSATION_TOAST_EVENT, { detail: { label } }))
}
