'use client'

// Face check bridge to the app shell (rn/App.tsx `native_face_check`): the
// phone looks for a face in a profile photo (iOS Vision, Android's face
// detector). The photo never leaves the phone for this; only the answer is
// sent to the server with the upload.

import { NATIVE_SHELL_CAPABILITIES_STATE_KEY } from '@/lib/native-device-audio'

export const NATIVE_FACE_CHECK_EVENT = 'mingle:native-face-check'

/** What goes to the server: 'unchecked' where no check can run (a browser, an older app). */
export type FaceCheckResult = 'face' | 'no_face' | 'unchecked'

/** A face this wide (share of the photo's width) or wider counts: a face, not a crowd in the back. */
export const MIN_FACE_WIDTH = 0.1
const FACE_CHECK_MAX_SIDE = 720
const FACE_CHECK_TIMEOUT_MS = 15_000

type FaceCheckWindow = Window & {
  ReactNativeWebView?: { postMessage?: (message: string) => void }
  [NATIVE_SHELL_CAPABILITIES_STATE_KEY]?: unknown
}

type NativeFaceCheckDetail = {
  type?: unknown
  requestId?: unknown
  faces?: unknown
  largestFaceWidth?: unknown
}

export function parseNativeFaceCheckCapability(detail: unknown): boolean {
  if (typeof detail !== 'object' || detail === null || Array.isArray(detail)) return false
  const record = detail as Record<string, unknown>
  return record.type === 'capabilities' && record.faceCheck === true
}

export function isNativeFaceCheckSupported(): boolean {
  if (typeof window === 'undefined') return false
  const nativeWindow = window as FaceCheckWindow
  return typeof nativeWindow.ReactNativeWebView?.postMessage === 'function'
    && parseNativeFaceCheckCapability(nativeWindow[NATIVE_SHELL_CAPABILITIES_STATE_KEY])
}

/** The phone's answer as a result: a big enough face, no face, or null when the check failed. */
export function resolveFaceCheckAnswer(detail: NativeFaceCheckDetail | null): FaceCheckResult | null {
  if (!detail || detail.type !== 'result') return null
  const width = typeof detail.largestFaceWidth === 'number' && Number.isFinite(detail.largestFaceWidth)
    ? detail.largestFaceWidth
    : 0
  return width >= MIN_FACE_WIDTH ? 'face' : 'no_face'
}

/** A small JPEG copy, so the bridge carries a few hundred KB instead of the full photo. */
async function smallJpegDataUrl(blob: Blob): Promise<string> {
  const bitmap = await createImageBitmap(blob)
  try {
    const scale = Math.min(1, FACE_CHECK_MAX_SIDE / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(bitmap.width * scale))
    canvas.height = Math.max(1, Math.round(bitmap.height * scale))
    canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    return canvas.toDataURL('image/jpeg', 0.85)
  } finally {
    bitmap.close()
  }
}

function waitForAnswer(requestId: string): Promise<NativeFaceCheckDetail | null> {
  return new Promise(resolve => {
    const timer = window.setTimeout(() => finish(null), FACE_CHECK_TIMEOUT_MS)
    function handle(event: Event) {
      const detail = (event as CustomEvent<NativeFaceCheckDetail>).detail
      if (detail && detail.requestId === requestId) finish(detail)
    }
    function finish(detail: NativeFaceCheckDetail | null) {
      window.clearTimeout(timer)
      window.removeEventListener(NATIVE_FACE_CHECK_EVENT, handle)
      resolve(detail)
    }
    window.addEventListener(NATIVE_FACE_CHECK_EVENT, handle)
  })
}

/**
 * Asks the phone whether the photo shows a face. 'unchecked' when this shell
 * cannot check (a browser, an older app) or the check itself failed, so the
 * device someone uses never locks them out.
 */
export async function checkPhotoForFace(blob: Blob): Promise<FaceCheckResult> {
  if (!isNativeFaceCheckSupported()) return 'unchecked'
  try {
    const dataUrl = await smallJpegDataUrl(blob)
    const requestId = `face-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
    const answer = waitForAnswer(requestId)
    ;(window as FaceCheckWindow).ReactNativeWebView?.postMessage?.(
      JSON.stringify({ type: 'native_face_check', payload: { requestId, dataUrl } }),
    )
    return resolveFaceCheckAnswer(await answer) ?? 'unchecked'
  } catch {
    return 'unchecked'
  }
}
