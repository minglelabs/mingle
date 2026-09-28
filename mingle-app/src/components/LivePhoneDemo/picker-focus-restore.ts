// Keyboard-mode photo picking: the native file chooser (Take Photo / Photo
// Library / Choose File) takes first responder away from the WKWebView, so the
// composer textarea loses the software keyboard even when the menu item itself
// did not steal focus. These helpers remember the text control that owned
// focus before the chooser opened and put focus back once the chooser flow
// ends. iOS only raises the keyboard for a programmatic focus once the WebView
// is first responder again, hence the delay (the RN WebView sets
// `keyboardDisplayRequiresUserAction={false}`).

export const PICKER_FOCUS_RESTORE_DELAY_MS = 350

type FocusableTextControl = {
  isConnected: boolean
  focus: (options?: { preventScroll?: boolean }) => void
}

type FocusDocument = {
  activeElement: unknown
}

type TimerHost = {
  setTimeout: (handler: () => void, timeout: number) => unknown
  clearTimeout: (id: never) => void
}

function isRestorableTextControl(element: unknown): element is FocusableTextControl {
  if (!element || typeof element !== 'object') return false
  const candidate = element as { tagName?: unknown, type?: unknown, isContentEditable?: unknown, focus?: unknown }
  if (typeof candidate.focus !== 'function') return false
  const tagName = typeof candidate.tagName === 'string' ? candidate.tagName.toUpperCase() : ''
  if (tagName === 'TEXTAREA') return true
  if (tagName === 'INPUT') {
    const type = typeof candidate.type === 'string' ? candidate.type.toLowerCase() : 'text'
    return ['text', 'search', 'email', 'url', 'tel', 'password', ''].includes(type)
  }
  return candidate.isContentEditable === true
}

// Returns the focused text control, or null when focus is not on one (voice
// mode, or the keyboard was already closed) so nothing is restored later.
export function captureRestorableFocus(doc: FocusDocument | null | undefined): FocusableTextControl | null {
  if (!doc) return null
  const active = doc.activeElement
  return isRestorableTextControl(active) ? active : null
}

// Schedules one delayed refocus. Skips it when the element left the DOM (the
// user switched to voice mode) or already has focus. Returns a cancel function.
export function scheduleFocusRestore(
  element: FocusableTextControl,
  options: { doc: FocusDocument, timers: TimerHost, delayMs?: number },
): () => void {
  const { doc, timers } = options
  let cancelled = false
  const id = timers.setTimeout(() => {
    if (cancelled) return
    if (!element.isConnected) return
    if (doc.activeElement === element) return
    try {
      element.focus({ preventScroll: true })
    } catch {
      // A detached or disabled control cannot take focus; nothing to restore.
    }
  }, options.delayMs ?? PICKER_FOCUS_RESTORE_DELAY_MS)
  return () => {
    cancelled = true
    timers.clearTimeout(id as never)
  }
}
