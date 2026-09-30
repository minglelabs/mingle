import {
  buildTargetLanguagesForUtterance,
  createDisplayLanguageResolver,
  findDisplayTranslation,
  resolveInitialDisplayLanguage,
  type Utterance,
} from './ChatBubble'
import {
  buildTranslationBubblePlaybackKey,
  type BubbleTtsPlaybackKind,
} from './live-phone-demo.bubble-tts-indicator'
import { utteranceOrderTime } from './utterance-order'
import { normalizeConversationMessageImage } from '@/lib/conversation-image'

// Per-device toggle. Deliberately separate from the fixed-off TTS setting
// (tts-settings.tsx) and from the account's `speakerEnabled` preference.
export const EARPHONE_MODE_ENABLED_STORAGE_KEY = 'mingle_earphone_mode_enabled'
// Own messages are read too, through their translation into the session's
// read language (one spoken in that language never is). Flip to stop reading
// them.
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

// ── Read language: ONE language (L) per earphone-mode session ──────────────

// The room's display-language inputs, exactly what each bubble row receives.
export type EarphoneModeDisplayContext = {
  preferredDisplayLanguage?: string | null
  preferredDisplayLanguages?: readonly string[]
  defaultDisplayLanguage?: string | null
  languageOrder: readonly string[]
}

// Default L: the viewer's display language for this room, resolved by the
// collapsed bubble's own resolver (member / solo-room default, then the
// viewer's preferred languages, limited to the room's languages, then the
// first room language) with the room's languages as the available set.
// null only for a room without languages.
export function resolveEarphoneModeDefaultReadLanguage(display: EarphoneModeDisplayContext): string | null {
  const roomLanguages = display.languageOrder.filter((language) => language.trim())
  if (roomLanguages.length === 0) return null
  return resolveInitialDisplayLanguage(
    display.preferredDisplayLanguages?.length
      ? display.preferredDisplayLanguages
      : (display.preferredDisplayLanguage ? [display.preferredDisplayLanguage] : []),
    display.defaultDisplayLanguage,
    roomLanguages[0],
    roomLanguages.slice(1),
    roomLanguages,
  )
}

// A language picked in the earphone-mode notice. Session state only: it is
// never persisted, and the room drops it on every on/off edge.
export type EarphoneModeReadLanguagePick = {
  // The room the pick was made in; every other room reads its own default.
  conversationKey: string
  language: string
}

// L right now: the pick, while it belongs to this room and is still one of
// its languages; otherwise the room's default L.
export function resolveEarphoneModeReadLanguage(input: {
  pick: EarphoneModeReadLanguagePick | null
  conversationKey: string
  display: EarphoneModeDisplayContext
}): string | null {
  const { pick, display } = input
  if (pick && pick.conversationKey === input.conversationKey) {
    const pickedKey = pick.language.trim().toLowerCase()
    const roomLanguage = pickedKey
      ? display.languageOrder.find((language) => language.trim().toLowerCase() === pickedKey)
      : undefined
    if (roomLanguage) return roomLanguage
  }
  return resolveEarphoneModeDefaultReadLanguage(display)
}

// What one earphone-mode session reads: only the translation into
// `readLanguage`. `languageOrder` keys display languages (Chinese variants)
// the way the bubbles do.
export type EarphoneModeReadContext = {
  readLanguage: string | null
  languageOrder: readonly string[]
}

export type EarphoneModeReadTarget = {
  playbackKey: string
  utteranceId: string
  language: string
  kind: BubbleTtsPlaybackKind
  text: string
}

type EarphoneModeReadLanguageInspection = {
  // The original itself is in L: the viewer already understood it.
  isSourceLanguage: boolean
  // The row's translation into L, when L is one of its translation targets.
  translation: { language: string, text: string, finalized: boolean | undefined } | null
  // Nothing more will land: the row has no translation targets, or at least
  // one translation is final and none is still streaming. Translations land
  // as one batch, so an L translation still missing then never comes.
  translationsSettled: boolean
}

function inspectEarphoneModeReadLanguage(
  utterance: Utterance,
  read: EarphoneModeReadContext,
): EarphoneModeReadLanguageInspection | null {
  const readLanguage = read.readLanguage?.trim()
  if (!readLanguage) return null
  const resolver = createDisplayLanguageResolver(utterance, read.languageOrder)
  const readKey = resolver.keyOf(readLanguage)
  if (!readKey) return null

  // The same rows, keys and texts the bubble renders.
  const targetLanguages = buildTargetLanguagesForUtterance(utterance, read.languageOrder, resolver)
  let translation: EarphoneModeReadLanguageInspection['translation'] = null
  let hasFinal = false
  let hasInterim = false
  for (const language of targetLanguages) {
    const { text, finalized } = findDisplayTranslation(utterance, language, resolver)
    const trimmed = text.trim()
    if (trimmed && finalized === false) hasInterim = true
    else if (trimmed) hasFinal = true
    if (!translation && resolver.keyOf(language) === readKey) {
      translation = { language, text: trimmed, finalized }
    }
  }
  return {
    isSourceLanguage: readKey === resolver.originalKey,
    translation,
    translationsSettled: targetLanguages.length === 0 || (hasFinal && !hasInterim),
  }
}

function buildEarphoneModeReadTarget(
  utterance: Utterance,
  inspection: EarphoneModeReadLanguageInspection,
): EarphoneModeReadTarget | null {
  const translation = inspection.translation
  if (inspection.isSourceLanguage || !translation?.text || translation.finalized === false) return null
  return {
    // The key the bubble gives its L translation row, so that row lights up.
    playbackKey: buildTranslationBubblePlaybackKey(utterance.id, translation.language),
    utteranceId: utterance.id,
    language: translation.language,
    kind: 'translation',
    text: translation.text,
  }
}

// The row's final translation into L, read with the same text, language and
// playbackKey as a manual tap on that translation row. null while there is
// nothing final in L, and always for a row whose original is in L.
export function resolveEarphoneModeReadTarget(
  utterance: Utterance,
  read: EarphoneModeReadContext,
): EarphoneModeReadTarget | null {
  const inspection = inspectEarphoneModeReadLanguage(utterance, read)
  return inspection ? buildEarphoneModeReadTarget(utterance, inspection) : null
}

export function isOwnEarphoneModeUtterance(utterance: Utterance, viewerUserId: string | null | undefined): boolean {
  // Solo rooms have no account ids: every row came from this device.
  if (!utterance.speakerUserId) return true
  return Boolean(viewerUserId) && utterance.speakerUserId === viewerUserId
}

export type EarphoneModeUnreadableReason =
  | 'image'
  | 'own_message'
  | 'empty'
  // Spoken in L (own messages included).
  | 'source_language'
  // Its translations finished without L, or there is no L at all.
  | 'missing_language'

export type EarphoneModeUtteranceState =
  | { state: 'incomplete' }
  | { state: 'ready', target: EarphoneModeReadTarget }
  | { state: 'unreadable', reason: EarphoneModeUnreadableReason }

// "Complete" = committed, no longer a draft, translation settled (it may still
// re-detect the source language), and the translation into L is final. A row
// spoken in L, or whose translations finished without L, is never read and
// never holds the queue; one whose L translation is still to come waits
// (stall rules apply).
export function classifyEarphoneModeUtterance(input: {
  utterance: Utterance
  isDraft: boolean
  read: EarphoneModeReadContext
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

  const inspection = inspectEarphoneModeReadLanguage(utterance, input.read)
  if (!inspection) return { state: 'unreadable', reason: 'missing_language' }
  if (inspection.isSourceLanguage) {
    // Decided once the translation has landed: until then the source language
    // can still be re-detected.
    return inspection.translationsSettled
      ? { state: 'unreadable', reason: 'source_language' }
      : { state: 'incomplete' }
  }
  const target = buildEarphoneModeReadTarget(utterance, inspection)
  if (target) return { state: 'ready', target }
  return inspection.translationsSettled
    ? { state: 'unreadable', reason: 'missing_language' }
    : { state: 'incomplete' }
}

// A committed row is settled once it reads as it will (ready) or can never be
// read (unreadable). One whose translation is still pending or streaming is
// not settled yet.
export function isEarphoneModeUtteranceSettled(input: {
  utterance: Utterance
  read: EarphoneModeReadContext
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
