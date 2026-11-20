/**
 * When a new device is asked for notifications.
 *
 * The system prompt used to come up the moment a new account signed in, with
 * no reason given. A device in its first run now waits: after the first
 * conversation it gets a short sheet that says why ("we'll tell you when a
 * friend replies") and the system prompt follows a tap on it.
 *
 * Only a device that went through the onboarding here is held. A device that
 * was already using the app registers for pushes at every launch as before,
 * so nobody loses notifications. A hold that is never answered runs out after
 * a day, and the app then asks at launch the old way.
 */
export const LS_KEY_PUSH_PROMPT_HOLD_UNTIL = 'mingle.pushPrompt.holdUntil'
export const PUSH_PROMPT_HOLD_MS = 24 * 60 * 60 * 1000
/** Asks the sheet to open (dispatched after the first conversation). */
export const PUSH_PROMPT_DUE_EVENT = 'mingle:push-prompt-due'
/** The sheet was answered or closed; `detail.allowed` says which. */
export const PUSH_PROMPT_CLOSED_EVENT = 'mingle:push-prompt-closed'

type PushPromptStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

function resolveBrowserStorage(): PushPromptStorage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
}

/** Called when the onboarding finishes on this device. Keeps an earlier hold. */
export function holdPushPrompt(now: number = Date.now(), storage: PushPromptStorage | null = resolveBrowserStorage()): void {
  try {
    if (storage?.getItem(LS_KEY_PUSH_PROMPT_HOLD_UNTIL)) return
    storage?.setItem(LS_KEY_PUSH_PROMPT_HOLD_UNTIL, String(now + PUSH_PROMPT_HOLD_MS))
  } catch {
    // A lost hold only means the prompt comes at sign-in, as it used to.
  }
}

/** True while this device should not be asked by the system yet. */
export function isPushPromptHeld(now: number = Date.now(), storage: PushPromptStorage | null = resolveBrowserStorage()): boolean {
  try {
    const until = Number(storage?.getItem(LS_KEY_PUSH_PROMPT_HOLD_UNTIL))
    return Number.isFinite(until) && until > now
  } catch {
    return false
  }
}

export function releasePushPrompt(storage: PushPromptStorage | null = resolveBrowserStorage()): void {
  try {
    storage?.removeItem(LS_KEY_PUSH_PROMPT_HOLD_UNTIL)
  } catch {
    // Nothing to release.
  }
}

/**
 * After the first conversation: opens the "want to know when a friend
 * replies?" sheet if this device is still held. Returns whether it did, so
 * the caller can wait for PUSH_PROMPT_CLOSED_EVENT before showing its own
 * next prompt.
 */
export function requestPushPrompt(): boolean {
  if (typeof window === 'undefined' || !isPushPromptHeld()) return false
  window.dispatchEvent(new CustomEvent(PUSH_PROMPT_DUE_EVENT))
  return true
}
