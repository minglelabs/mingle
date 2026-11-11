/**
 * First run, per device: a new user picks a language, signs in, and is asked
 * to say something from the conversation list so they see a translation before
 * anything else. Questions that used to sit in front of that (interest
 * language, where they heard of the app, gender, birth date) are asked later,
 * each when it is needed.
 *
 * A device that finished the older, longer onboarding never gets these flags,
 * so nothing here changes what existing users see.
 */
export const LS_KEY_FIRST_SPEAK_PENDING = 'mingle_first_speak_pending_v1'
export const LS_KEY_DISCOVERY_PROMPT_DUE = 'mingle_discovery_prompt_due_v1'

type FirstRunStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

function resolveBrowserStorage(): FirstRunStorage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
}

function readFlag(key: string, storage: FirstRunStorage | null): boolean {
  try {
    return storage?.getItem(key) === '1'
  } catch {
    return false
  }
}

function writeFlag(key: string, on: boolean, storage: FirstRunStorage | null): void {
  try {
    if (on) storage?.setItem(key, '1')
    else storage?.removeItem(key)
  } catch {
    // A lost flag only means the first-run card is not shown.
  }
}

/** Set when the short onboarding finishes on this device. */
export function markFirstSpeakPending(storage: FirstRunStorage | null = resolveBrowserStorage()): void {
  writeFlag(LS_KEY_FIRST_SPEAK_PENDING, true, storage)
}

/** True until this device has seen its first translation. */
export function isFirstSpeakPending(storage: FirstRunStorage | null = resolveBrowserStorage()): boolean {
  return readFlag(LS_KEY_FIRST_SPEAK_PENDING, storage)
}

/**
 * The first translation was shown. Returns true when this call ended the first
 * run (so the caller counts it once); the question about where the user heard
 * of the app then becomes due when they leave the room.
 */
export function completeFirstSpeak(storage: FirstRunStorage | null = resolveBrowserStorage()): boolean {
  if (!readFlag(LS_KEY_FIRST_SPEAK_PENDING, storage)) return false
  writeFlag(LS_KEY_FIRST_SPEAK_PENDING, false, storage)
  writeFlag(LS_KEY_DISCOVERY_PROMPT_DUE, true, storage)
  return true
}

export function isDiscoveryPromptDue(storage: FirstRunStorage | null = resolveBrowserStorage()): boolean {
  return readFlag(LS_KEY_DISCOVERY_PROMPT_DUE, storage)
}

/** Asked once: answered or closed, it does not come back. */
export function clearDiscoveryPromptDue(storage: FirstRunStorage | null = resolveBrowserStorage()): void {
  writeFlag(LS_KEY_DISCOVERY_PROMPT_DUE, false, storage)
}

/**
 * The app opens on the feed. A device still in its first run is sent to the
 * conversation list instead, where the "say something" card is, unless the
 * launch points at a specific post (a shared link or a push).
 */
export function shouldOpenConversationsInsteadOfFeed(input: {
  isNativeApp: boolean
  onboardingConfirmed: boolean
  firstSpeakPending: boolean
  hasPostTarget: boolean
}): boolean {
  if (!input.isNativeApp || input.hasPostTarget) return false
  return !input.onboardingConfirmed || input.firstSpeakPending
}
