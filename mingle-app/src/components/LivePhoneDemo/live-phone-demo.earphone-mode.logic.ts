import {
  buildTargetLanguagesForUtterance,
  createDisplayLanguageResolver,
  findDisplayTranslation,
  resolveInitialDisplayLanguage,
  type Utterance,
} from './ChatBubble'
import {
  buildOriginalBubblePlaybackKey,
  buildTranslationBubblePlaybackKey,
  type BubbleTtsPlaybackKind,
} from './live-phone-demo.bubble-tts-indicator'
import { utteranceOrderTime } from './utterance-order'
import { normalizeConversationMessageImage } from '@/lib/conversation-image'

// Per-device toggle. Deliberately separate from the fixed-off TTS setting
// (tts-settings.tsx) and from the account's `speakerEnabled` preference.
export const EARPHONE_MODE_ENABLED_STORAGE_KEY = 'mingle_earphone_mode_enabled'
// Own messages are read back too (bubble parity). Flip to stop reading them.
export const EARPHONE_MODE_READ_OWN_MESSAGES = true
// An earlier-started message that is still incomplete holds the queue until it
// completes, disappears, or shows no progress for this long.
export const EARPHONE_MODE_STALL_TIMEOUT_MS = 15_000
// A prefetched clip that has not arrived by then is dropped.
export const EARPHONE_MODE_AUDIO_TIMEOUT_MS = 15_000
export const EARPHONE_MODE_PREFETCH_LIMIT = 3
// A message first seen after the rising edge that started more than this long
// before it is history (older page, recovery hydration), not a new message.
// The allowance absorbs clock offset between devices and the server.
export const EARPHONE_MODE_HISTORY_CLOCK_SKEW_MS = 10_000

// ── Gate ───────────────────────────────────────────────────────────────────

export type EarphoneModeGateInput = {
  supported: boolean
  enabled: boolean
  earphonesConnected: boolean
}

export type EarphoneModeGate = {
  controlVisible: boolean
  autoReadActive: boolean
  waitingForEarphones: boolean
}

// Auto-read needs all three; unknown earphone state counts as not connected.
export function resolveEarphoneModeGate(input: EarphoneModeGateInput): EarphoneModeGate {
  const controlVisible = input.supported === true
  const enabled = controlVisible && input.enabled === true
  const connected = controlVisible && input.earphonesConnected === true
  return {
    controlVisible,
    autoReadActive: enabled && connected,
    waitingForEarphones: enabled && !connected,
  }
}

// Every off -> on shows the notice and re-reads the route; on -> off only
// turns the mode off.
export function resolveEarphoneModeToggle(currentEnabled: boolean): {
  nextEnabled: boolean
  showNotice: boolean
  requestRoute: boolean
} {
  const nextEnabled = !currentEnabled
  return { nextEnabled, showNotice: nextEnabled, requestRoute: nextEnabled }
}

// ── Preference store (localStorage, shared by every mounted room) ──────────

type EarphoneModeStorage = Pick<Storage, 'getItem' | 'setItem'>

function resolveStorage(storage?: EarphoneModeStorage | null): EarphoneModeStorage | null {
  if (storage) return storage
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage
  } catch {
    return null
  }
}

export function readEarphoneModeEnabled(storage?: EarphoneModeStorage | null): boolean {
  try {
    return resolveStorage(storage)?.getItem(EARPHONE_MODE_ENABLED_STORAGE_KEY) === 'true'
  } catch {
    return false
  }
}

let preferenceSnapshot: boolean | null = null
const preferenceListeners = new Set<() => void>()
let detachPreferenceStorageListener: (() => void) | null = null

function emitPreferenceChange(): void {
  for (const listener of [...preferenceListeners]) {
    listener()
  }
}

export function getEarphoneModePreferenceSnapshot(): boolean {
  if (preferenceSnapshot === null) {
    if (typeof window === 'undefined') return false
    preferenceSnapshot = readEarphoneModeEnabled()
  }
  return preferenceSnapshot
}

export function getEarphoneModePreferenceServerSnapshot(): boolean {
  return false
}

export function writeEarphoneModeEnabled(enabled: boolean, storage?: EarphoneModeStorage | null): void {
  try {
    resolveStorage(storage)?.setItem(EARPHONE_MODE_ENABLED_STORAGE_KEY, enabled ? 'true' : 'false')
  } catch {
    // Keep the in-memory value when storage is unavailable.
  }
  if (preferenceSnapshot === enabled) return
  preferenceSnapshot = enabled
  emitPreferenceChange()
}

export function subscribeEarphoneModePreference(listener: () => void): () => void {
  if (typeof window === 'undefined') return () => {}
  preferenceListeners.add(listener)
  if (!detachPreferenceStorageListener) {
    const handleStorage = (event: StorageEvent) => {
      if (event.key !== null && event.key !== EARPHONE_MODE_ENABLED_STORAGE_KEY) return
      const next = readEarphoneModeEnabled()
      if (next === preferenceSnapshot) return
      preferenceSnapshot = next
      emitPreferenceChange()
    }
    window.addEventListener('storage', handleStorage)
    detachPreferenceStorageListener = () => window.removeEventListener('storage', handleStorage)
  }
  return () => {
    preferenceListeners.delete(listener)
    if (preferenceListeners.size === 0 && detachPreferenceStorageListener) {
      detachPreferenceStorageListener()
      detachPreferenceStorageListener = null
    }
  }
}

export function resetEarphoneModePreferenceForTests(): void {
  detachPreferenceStorageListener?.()
  detachPreferenceStorageListener = null
  preferenceListeners.clear()
  preferenceSnapshot = null
}

// ── Watermark ──────────────────────────────────────────────────────────────

type IdentifiedUtterance = { id: string }
type OrderableUtterance = {
  id: string
  createdAtMs?: number
  serverCreatedAtMs?: number
  serverMessageId?: string
}

export type EarphoneModeWatermark = {
  armedAtMs: number
  // Committed and settled at the rising edge: never read.
  existingIds: ReadonlySet<string>
  // Still being spoken, or committed with a translation still pending, at the
  // rising edge: read once they complete.
  inFlightIds: ReadonlySet<string>
}

export function createEarphoneModeWatermark<T extends IdentifiedUtterance>(input: {
  committed: readonly T[]
  drafts: readonly IdentifiedUtterance[]
  // Whether a committed row already reads as a manual tap would read it (or
  // can never be read). One whose translation is still pending completes
  // after the edge, so it counts like a draft.
  isCommittedSettled: (utterance: T) => boolean
  nowMs: number
}): EarphoneModeWatermark {
  const existingIds = new Set<string>()
  const inFlightIds = new Set<string>()
  for (const utterance of input.committed) {
    if (input.isCommittedSettled(utterance)) existingIds.add(utterance.id)
    else inFlightIds.add(utterance.id)
  }
  for (const utterance of input.drafts) {
    if (!existingIds.has(utterance.id)) inFlightIds.add(utterance.id)
  }
  return { armedAtMs: input.nowMs, existingIds, inFlightIds }
}

export function isEarphoneModeCandidate(
  watermark: EarphoneModeWatermark,
  utterance: OrderableUtterance,
  historyClockSkewMs: number = EARPHONE_MODE_HISTORY_CLOCK_SKEW_MS,
): boolean {
  if (watermark.existingIds.has(utterance.id)) return false
  if (watermark.inFlightIds.has(utterance.id)) return true
  return utteranceOrderTime(utterance) >= watermark.armedAtMs - historyClockSkewMs
}

// ── What a message reads as (manual-tap parity) ────────────────────────────

export type EarphoneModeDisplayContext = {
  preferredDisplayLanguage?: string | null
  preferredDisplayLanguages?: readonly string[]
  defaultDisplayLanguage?: string | null
  languageOrder: readonly string[]
}

export type EarphoneModeReadTarget = {
  playbackKey: string
  utteranceId: string
  language: string
  kind: BubbleTtsPlaybackKind
  text: string
}

// Mirrors ChatBubble's automatic (collapsed) language choice and the manual
// tap handlers: an original row reads `originalText` in `originalLang`, a
// translation row reads that translation in its display language. null while
// the shown language has nothing final to read.
export function resolveEarphoneModeReadTarget(
  utterance: Utterance,
  display: EarphoneModeDisplayContext,
): EarphoneModeReadTarget | null {
  const languageOrder = display.languageOrder
  const resolver = createDisplayLanguageResolver(utterance, languageOrder)
  const originalDisplayLanguage = resolver.originalLanguage
  const targetLanguages = buildTargetLanguagesForUtterance(utterance, languageOrder, resolver)
  const displayLanguage = resolveInitialDisplayLanguage(
    display.preferredDisplayLanguages?.length
      ? display.preferredDisplayLanguages
      : (display.preferredDisplayLanguage ? [display.preferredDisplayLanguage] : []),
    display.defaultDisplayLanguage,
    originalDisplayLanguage,
    targetLanguages,
    languageOrder,
    resolver,
  )

  if (resolver.keyOf(displayLanguage) === resolver.originalKey) {
    const text = utterance.originalText.trim()
    const language = utterance.originalLang.trim()
    if (!text || !language) return null
    return {
      playbackKey: buildOriginalBubblePlaybackKey(utterance.id, utterance.originalLang),
      utteranceId: utterance.id,
      language: utterance.originalLang,
      kind: 'original',
      text,
    }
  }

  const translation = findDisplayTranslation(utterance, displayLanguage, resolver)
  const text = translation.text.trim()
  if (!text || translation.finalized === false) return null
  return {
    playbackKey: buildTranslationBubblePlaybackKey(utterance.id, displayLanguage),
    utteranceId: utterance.id,
    language: displayLanguage,
    kind: 'translation',
    text,
  }
}

export function isOwnEarphoneModeUtterance(utterance: Utterance, viewerUserId: string | null | undefined): boolean {
  // Solo rooms have no account ids: every row came from this device.
  if (!utterance.speakerUserId) return true
  return Boolean(viewerUserId) && utterance.speakerUserId === viewerUserId
}

export type EarphoneModeUtteranceState =
  | { state: 'incomplete' }
  | { state: 'ready', target: EarphoneModeReadTarget }
  | { state: 'unreadable', reason: 'image' | 'own_message' | 'empty' }

// "Complete" = committed, no longer a draft, translation settled (it may still
// re-detect the source language), and the shown language has final text.
export function classifyEarphoneModeUtterance(input: {
  utterance: Utterance
  isDraft: boolean
  display: EarphoneModeDisplayContext
  viewerUserId: string | null | undefined
  readOwnMessages?: boolean
}): EarphoneModeUtteranceState {
  const { utterance } = input
  if (normalizeConversationMessageImage(utterance.image)) return { state: 'unreadable', reason: 'image' }
  if (
    !(input.readOwnMessages ?? EARPHONE_MODE_READ_OWN_MESSAGES)
    && isOwnEarphoneModeUtterance(utterance, input.viewerUserId)
  ) {
    return { state: 'unreadable', reason: 'own_message' }
  }
  if (input.isDraft || utterance.translationStatus !== undefined) return { state: 'incomplete' }
  if (!utterance.originalText.trim()) return { state: 'unreadable', reason: 'empty' }

  const target = resolveEarphoneModeReadTarget(utterance, input.display)
  return target ? { state: 'ready', target } : { state: 'incomplete' }
}

// A committed row is settled once it reads as it will (ready) or can never be
// read (unreadable). One whose translation is still pending or streaming is
// not settled yet.
export function isEarphoneModeUtteranceSettled(input: {
  utterance: Utterance
  display: EarphoneModeDisplayContext
  viewerUserId: string | null | undefined
  readOwnMessages?: boolean
}): boolean {
  return classifyEarphoneModeUtterance({ ...input, isDraft: false }).state !== 'incomplete'
}

// Anything a user could see change on the row counts as progress.
export function buildEarphoneModeProgressSignature(utterance: Utterance, isDraft: boolean): string {
  const translations = Object.entries(utterance.translations || {})
    .map(([language, text]) => `${language}=${text}`)
    .sort()
    .join('\u0001')
  const finalized = Object.entries(utterance.translationFinalized || {})
    .map(([language, value]) => `${language}=${value ? 1 : 0}`)
    .sort()
    .join(',')
  return [
    isDraft ? 'd' : 'c',
    utterance.originalLang,
    utterance.originalText,
    utterance.originalDisplayText ?? '',
    utterance.translationStatus ?? '',
    translations,
    finalized,
  ].join('\u0002')
}

// ── Falling edge / native start helpers ────────────────────────────────────

// A falling edge drops queued auto items; manual items stay.
export function keepManualTtsQueueItems<T extends { mode: 'auto' | 'manual' }>(queue: readonly T[]): T[] {
  return queue.filter((item) => item.mode === 'manual')
}

export function shouldStopCurrentClipOnEarphoneFallingEdge(
  current: { mode: 'auto' | 'manual' } | null | undefined,
): boolean {
  return current?.mode === 'auto'
}

// Shells that implement the audio-route contract also report `tts_started`;
// older iOS shells do not, so the post itself is treated as the start there.
export function shouldTreatNativeTtsPostAsStart(nativeTtsStartedSupported: boolean): boolean {
  return !nativeTtsStartedSupported
}
