// Single source of truth for "a native media/file picker is currently in
// flight". Opening the OS photo/file chooser from the WebView briefly blurs
// the page and — on some mobile browsers — fires `visibilitychange`/`focus`.
// The STT background-recovery logic (see use-realtime-stt.ts) must NOT treat
// that transient picker round-trip as an app backgrounding, or it tears down /
// restarts recording while the user is only choosing a photo.
//
// The composer marks a picker in flight right before it clicks the hidden
// <input type="file">, and clears it when the picker resolves (`change`),
// is cancelled, or the page/window regains focus — with a hard timeout so a
// missed close event can never wedge the flag on. Genuine app
// backgrounding/screen-lock happens while NO picker is in flight, so real
// background handling is left untouched.

export const MEDIA_PICKER_IN_FLIGHT_TIMEOUT_MS = 60_000

type Listener = (inFlight: boolean) => void

let inFlight = false
let clearTimer: ReturnType<typeof setTimeout> | null = null
const listeners = new Set<Listener>()

function notify(): void {
  for (const listener of listeners) {
    try {
      listener(inFlight)
    } catch {
      // A misbehaving listener must not break the others or the caller.
    }
  }
}

/** True while a media/file picker opened from the WebView is still open. */
export function isMediaPickerInFlight(): boolean {
  return inFlight
}

/**
 * Mark that a media/file picker is about to open. Safe to call repeatedly; the
 * timeout is (re)armed on every call so a fresh pick always gets the full
 * window. `timeoutMs <= 0` disables the safety timeout (used by tests).
 */
export function beginMediaPickerInFlight(timeoutMs = MEDIA_PICKER_IN_FLIGHT_TIMEOUT_MS): void {
  if (clearTimer) {
    clearTimeout(clearTimer)
    clearTimer = null
  }
  if (timeoutMs > 0 && typeof setTimeout === 'function') {
    clearTimer = setTimeout(() => {
      clearTimer = null
      endMediaPickerInFlight()
    }, timeoutMs)
  }
  if (inFlight) return
  inFlight = true
  notify()
}

/** Clear the in-flight marker (picker resolved, cancelled, or focus returned). */
export function endMediaPickerInFlight(): void {
  if (clearTimer) {
    clearTimeout(clearTimer)
    clearTimer = null
  }
  if (!inFlight) return
  inFlight = false
  notify()
}

/** Subscribe to in-flight transitions. Returns an unsubscribe function. */
export function subscribeMediaPickerInFlight(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
