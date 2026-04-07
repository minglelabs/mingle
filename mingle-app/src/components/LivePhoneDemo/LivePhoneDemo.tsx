'use client'

import { useState, useRef, useEffect, useLayoutEffect, useImperativeHandle, forwardRef, useCallback, useMemo, useId, useSyncExternalStore, type ChangeEvent, type FormEvent, type PointerEvent as ReactPointerEvent } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Mic, Loader2, ChevronDown, Check, Menu, LogOut, Trash2, Download, ChevronLeft, ChevronRight, Keyboard } from 'lucide-react'
import { toast } from 'sonner'
import PhoneFrame from './PhoneFrame'
import ChatBubble from './ChatBubble'
import type { Utterance } from './ChatBubble'
import LanguageSelector from './LanguageSelector'
import TranslationBubbleRow from './TranslationBubbleRow'
import useRealtimeSTT from './useRealtimeSTT'
import { getOrCreateSessionKey, getOrCreateTrackingUserId, mergeDisplayUtterances } from './use-realtime-stt'
import { buildClientApiPath, clientApiNamespace } from '@/lib/api-contract'
import { useTtsSettings } from '@/context/tts-settings'
import {
  DEFAULT_STT_LANGUAGES,
  canonicalizeSttLanguageCode,
  deriveDefaultSttLanguagesForLocale,
  getSttLanguageFlag,
} from '@/lib/stt-languages'
import {
  DEFAULT_INPUT_MODE,
  DEFAULT_SONIOX_SILENCE_MS,
  DEFAULT_TEXT_SIZE_LEVEL,
  LS_KEY_AD_BANNER_POSITION,
  LS_KEY_INPUT_MODE,
  LS_KEY_LANGUAGES,
  LS_KEY_TEXT_SIZE_LEVEL,
  MAX_SONIOX_SILENCE_MS,
  MIN_SONIOX_SILENCE_MS,
  normalizeLivePhoneDemoAdBannerPosition,
  type LivePhoneDemoInputMode,
  readPersistedLivePhoneDemoPreferences,
  resolveDisplayedLivePhoneDemoAdBannerPosition,
  type LivePhoneDemoAdBannerPosition,
} from './live-phone-demo.preferences'
import {
  buildHydratedAccountPreferences,
  DEFAULT_ECHO_ALLOWED,
  DEFAULT_SPEAKER_ENABLED,
  serializeAccountPreferencesSyncState,
  shouldScheduleAccountPreferencesSync,
  type AccountPreferencesResponse,
  type LivePhoneDemoAccountPreferences,
} from './live-phone-demo.account-preferences'
import {
  DEFAULT_SELECTABLE_TRANSLATION_MODEL,
  TRANSLATION_MODEL_OPTIONS,
  type UserSelectableTranslationModel,
} from '@/lib/translation-models'
import { isLegacySonioxSilenceSliderNamespace } from '@/lib/api-namespace-version'
import {
  AUTO_SCROLL_BOTTOM_THRESHOLD_PX,
  createAutoScrollScheduler,
  deriveScrollAutoFollowState,
  deriveScrollUiVisibility,
  isLikelyIOSNavigator,
} from './live-phone-demo.scroll.logic'
import {
  NATIVE_UI_EVENT,
  isNativeUiBridgeEnabledFromSearch,
  parseNativeUiBannerLayoutDetail,
  parseNativeUiScrollToTopDetail,
  readCachedNativeUiBannerLayout,
  shouldEnableIosTopTapFallback,
  type NativeUiBannerLayoutEventDetail,
} from './live-phone-demo.native-ui.logic'
import {
  DEFAULT_NATIVE_APP_UPDATE_DETAIL,
  NATIVE_APP_UPDATE_EVENT,
  parseNativeAppUpdateDetail,
  readRequestedApiNamespaceFromSearch,
  resolveNativeAppTrackingContext,
  resolveNativeAppUpdateCopy,
  type NativeAppUpdateDetail,
} from './live-phone-demo.app-update.logic'
import {
  resolveLivePhoneDemoFeedbackCopy,
  type LivePhoneDemoFeedbackCategory,
} from './live-phone-demo.feedback-copy'
import { COPY_SUCCESS_EVENT } from './live-phone-demo.copy'
import { resolveLivePhoneDemoCopyActionCopy } from './live-phone-demo.copy-actions'
import { resolveLivePhoneDemoTtsActionCopy } from './live-phone-demo.tts-actions'
import { formatLivePhoneDemoUsageDuration } from './live-phone-demo.usage-format'

const VOLUME_THRESHOLD = 0.05
const ACCOUNT_PREFERENCES_API_PATH = '/api/account/preferences'
const FEEDBACK_API_PATH = buildClientApiPath('/feedback')
const TTS_API_PATH = buildClientApiPath('/tts/inworld')
const ACCOUNT_PREFERENCES_SYNC_DEBOUNCE_MS = 1500
const FEEDBACK_MIN_MESSAGE_LENGTH = 5
const LS_KEY_FEEDBACK_DRAFT = 'mingle_live_phone_demo_feedback_draft_v1'
const SILENT_WAV_DATA_URI = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA='
// Boost factor applied to TTS playback while STT is active.
// iOS .playAndRecord reduces speaker output; this compensates in software.
const TTS_STT_GAIN = 1.0
const NATIVE_TTS_EVENT = 'mingle:native-tts'
const SCROLL_TO_BOTTOM_BUTTON_THRESHOLD_PX = AUTO_SCROLL_BOTTOM_THRESHOLD_PX
const SCROLL_TO_BOTTOM_BUTTON_BOTTOM_PX = 24
const SCROLL_TO_BOTTOM_BUTTON_SIZE_PX = 48
const SCROLL_UI_HIDE_DELAY_MS = 1000
const SCROLLBAR_MIN_THUMB_HEIGHT_PX = 28
const USER_SCROLL_INTENT_WINDOW_MS = 2000
const NATIVE_TTS_EVENT_TIMEOUT_MS = 15000
const LIVE_CHAT_BUBBLE_TEXT_LINE_HEIGHT = 1.25
const NATIVE_INSET_QUERY_MAX_PX = 240
const SILENCE_SLIDER_UPGRADE_TOAST_COOLDOWN_MS = 5000
const MENU_HISTORY_STATE_KEY = '__mingle_live_phone_demo_menu_depth'
const MENU_PANEL_CLOSE_DRAG_DISTANCE_PX = 88
const MENU_PANEL_CLOSE_DRAG_VELOCITY_PX_PER_MS = 0.45
const WEB_CANVAS_BASE_WIDTH_PX = 400
const NATIVE_AD_BANNER_DEFAULT_HEIGHT_PX = 50
const EMPTY_STATE_ARROW_END_Y = 78
const EMPTY_STATE_ARROW_HEAD_Y = 72
const COMPOSER_TEXTAREA_MIN_HEIGHT_PX = 36
const COMPOSER_TEXTAREA_MAX_HEIGHT_PX = 104
const COMPOSER_TEXTAREA_LINE_HEIGHT_PX = 22
const LS_KEY_COMPOSER_DRAFT = 'mingle_live_phone_demo_composer_draft_v1'

type LivePhoneDemoComposerCopy = {
  manualSpeakerLabel: string
  openKeyboardLabel: string
  closeKeyboardLabel: string
  composerPlaceholder: string
  sendMessageLabel: string
}

type PersistedFeedbackDraft = {
  category: LivePhoneDemoFeedbackCategory
  message: string
  email: string
  emailEdited: boolean
}

type FeedbackSubmitErrorCode =
  | 'message_too_short'
  | 'invalid_contact_email'
  | 'invalid_category'
  | 'invalid_json'

const TEXT_SIZE_CLASS_BY_LEVEL: Record<number, string> = {
  1: 'text-[13px]',
  2: 'text-sm',
  3: 'text-[15px]',
  4: 'text-base',
  5: 'text-[18px]',
}
const TEXT_SIZE_LEVEL_OPTIONS = [1, 2, 3, 4, 5] as const

function isNativeApp(): boolean {
  return typeof window !== 'undefined'
    && typeof window.ReactNativeWebView?.postMessage === 'function'
}

function isLikelyIOSPlatform(): boolean {
  if (typeof window === 'undefined') return false
  return isLikelyIOSNavigator(window.navigator)
}

function parseNativeInsetPxFromSearch(search: string, queryKey: string): number {
  try {
    const params = new URLSearchParams(search)
    const raw = (params.get(queryKey) || '').trim()
    if (!raw) return 0
    const parsed = Number(raw)
    if (!Number.isFinite(parsed)) return 0
    return Math.max(0, Math.min(NATIVE_INSET_QUERY_MAX_PX, Math.round(parsed)))
  } catch {
    return 0
  }
}

function subscribeToLocationSearch(onStoreChange: () => void): () => void {
  if (typeof window === 'undefined') return () => {}

  window.addEventListener('popstate', onStoreChange)
  window.addEventListener('hashchange', onStoreChange)
  return () => {
    window.removeEventListener('popstate', onStoreChange)
    window.removeEventListener('hashchange', onStoreChange)
  }
}

function subscribeToViewportWidth(onStoreChange: () => void): () => void {
  if (typeof window === 'undefined') return () => {}

  window.addEventListener('resize', onStoreChange)
  return () => {
    window.removeEventListener('resize', onStoreChange)
  }
}

function readViewportWidthPx(): number {
  if (typeof window === 'undefined') return WEB_CANVAS_BASE_WIDTH_PX
  const width = Number(window.innerWidth)
  if (!Number.isFinite(width) || width <= 0) return WEB_CANVAS_BASE_WIDTH_PX
  return Math.round(width)
}

function useViewportWidthPx(): number {
  return useSyncExternalStore(
    subscribeToViewportWidth,
    readViewportWidthPx,
    () => WEB_CANVAS_BASE_WIDTH_PX,
  )
}

function resolveEstimatedNativeBannerInsetPx(viewportWidthPx: number): number {
  const canvasScale = viewportWidthPx > 0
    ? Math.min(1, viewportWidthPx / WEB_CANVAS_BASE_WIDTH_PX)
    : 1
  const safeCanvasScale = canvasScale > 0 ? canvasScale : 1
  return Math.max(0, Math.round(NATIVE_AD_BANNER_DEFAULT_HEIGHT_PX / safeCanvasScale))
}

function isLivePhoneDemoFeedbackCategory(value: unknown): value is LivePhoneDemoFeedbackCategory {
  return value === 'feedback' || value === 'suggestion' || value === 'inquiry'
}

export function resolveLivePhoneDemoComposerCopy(uiLocale: string): LivePhoneDemoComposerCopy {
  const locale = (uiLocale || '').trim().toLowerCase()

  if (locale.startsWith('ko')) {
    return {
      manualSpeakerLabel: '나',
      openKeyboardLabel: '텍스트 입력 열기',
      closeKeyboardLabel: '텍스트 입력 닫기',
      composerPlaceholder: '메시지를 입력하세요',
      sendMessageLabel: '메시지 보내기',
    }
  }

  if (locale.startsWith('ja')) {
    return {
      manualSpeakerLabel: '自分',
      openKeyboardLabel: 'テキスト入力を開く',
      closeKeyboardLabel: 'テキスト入力を閉じる',
      composerPlaceholder: 'メッセージを入力',
      sendMessageLabel: 'メッセージを送信',
    }
  }

  return {
    manualSpeakerLabel: 'You',
    openKeyboardLabel: 'Open text input',
    closeKeyboardLabel: 'Close text input',
    composerPlaceholder: 'Type a message',
    sendMessageLabel: 'Send message',
  }
}

export function resolveKeyboardViewportInsetPx(viewport: VisualViewport | null | undefined): number {
  if (typeof window === 'undefined' || !viewport) return 0

  const inset = window.innerHeight - viewport.height - viewport.offsetTop
  if (!Number.isFinite(inset) || inset <= 0) return 0
  return Math.round(inset)
}

function resizeComposerTextarea(textarea: HTMLTextAreaElement | null): void {
  if (!textarea) return

  textarea.style.height = `${COMPOSER_TEXTAREA_MIN_HEIGHT_PX}px`
  textarea.style.lineHeight = `${COMPOSER_TEXTAREA_LINE_HEIGHT_PX}px`
  const nextHeight = Math.max(
    COMPOSER_TEXTAREA_MIN_HEIGHT_PX,
    Math.min(COMPOSER_TEXTAREA_MAX_HEIGHT_PX, textarea.scrollHeight),
  )
  textarea.style.height = `${nextHeight}px`
  textarea.style.overflowY = nextHeight >= COMPOSER_TEXTAREA_MAX_HEIGHT_PX ? 'auto' : 'hidden'
}

function readPersistedComposerDraft(): string {
  if (typeof window === 'undefined') return ''

  try {
    const rawValue = window.localStorage.getItem(LS_KEY_COMPOSER_DRAFT)
    return typeof rawValue === 'string' ? rawValue : ''
  } catch {
    return ''
  }
}

function persistComposerDraft(nextDraft: string): void {
  if (typeof window === 'undefined') return

  try {
    if (nextDraft) {
      window.localStorage.setItem(LS_KEY_COMPOSER_DRAFT, nextDraft)
      return
    }
    window.localStorage.removeItem(LS_KEY_COMPOSER_DRAFT)
  } catch {
    // Ignore local persistence failures.
  }
}

function readPersistedFeedbackDraft(): PersistedFeedbackDraft | null {
  if (typeof window === 'undefined') return null

  try {
    const rawValue = window.localStorage.getItem(LS_KEY_FEEDBACK_DRAFT)
    if (!rawValue) return null

    const parsed = JSON.parse(rawValue) as Partial<PersistedFeedbackDraft> | null
    if (!parsed || typeof parsed !== 'object') return null

    const category = isLivePhoneDemoFeedbackCategory(parsed.category)
      ? parsed.category
      : 'feedback'
    const message = typeof parsed.message === 'string' ? parsed.message : ''
    const email = typeof parsed.email === 'string' ? parsed.email : ''
    const emailEdited = parsed.emailEdited === true

    if (!message && !email && category === 'feedback' && !emailEdited) {
      return null
    }

    return {
      category,
      message,
      email,
      emailEdited,
    }
  } catch {
    return null
  }
}

function persistFeedbackDraft(draft: PersistedFeedbackDraft | null): void {
  if (typeof window === 'undefined') return

  try {
    if (draft) {
      window.localStorage.setItem(LS_KEY_FEEDBACK_DRAFT, JSON.stringify(draft))
      return
    }

    window.localStorage.removeItem(LS_KEY_FEEDBACK_DRAFT)
  } catch {
    // Ignore storage failures so feedback remains usable.
  }
}

function parseFeedbackSubmitErrorCode(value: unknown): FeedbackSubmitErrorCode | null {
  if (value === 'message_too_short') return value
  if (value === 'invalid_contact_email') return value
  if (value === 'invalid_category') return value
  if (value === 'invalid_json') return value
  return null
}

function readNativeInsetPxFromWindow(queryKey: string): number {
  if (typeof window === 'undefined') return 0
  return parseNativeInsetPxFromSearch(window.location.search || '', queryKey)
}

function useNativeInsetPx(queryKey: string): number {
  return useSyncExternalStore(
    subscribeToLocationSearch,
    () => readNativeInsetPxFromWindow(queryKey),
    () => 0,
  )
}

function parseNativeBannerPositionFromSearch(search: string): LivePhoneDemoAdBannerPosition | null {
  try {
    const params = new URLSearchParams(search)
    return normalizeLivePhoneDemoAdBannerPosition(params.get('nativeBannerPosition'))
  } catch {
    return null
  }
}

function readNativeBannerPositionFromWindow(): LivePhoneDemoAdBannerPosition | null {
  if (typeof window === 'undefined') return null
  return parseNativeBannerPositionFromSearch(window.location.search || '')
}

function useNativeBannerPositionFromSearch(): LivePhoneDemoAdBannerPosition | null {
  return useSyncExternalStore(
    subscribeToLocationSearch,
    readNativeBannerPositionFromWindow,
    () => null,
  )
}

async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer()
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}


function resolveDefaultSelectedLanguages(uiLocale?: string): string[] {
  const normalizedUiLocale = (uiLocale || '').trim()
  if (normalizedUiLocale) {
    return deriveDefaultSttLanguagesForLocale(normalizedUiLocale)
  }

  if (typeof window === 'undefined') return [...DEFAULT_STT_LANGUAGES]

  const browserLocale = (
    document.documentElement.lang ||
    window.navigator.languages?.find(Boolean) ||
    window.navigator.language ||
    ''
  ).trim()

  return deriveDefaultSttLanguagesForLocale(browserLocale)
}

function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function formatScrollDateLabel(createdAtMs: number, locale: string): string {
  const targetDate = new Date(createdAtMs)
  if (Number.isNaN(targetDate.getTime())) return ''
  const now = new Date()
  const dayMs = 24 * 60 * 60 * 1000
  const todayStart = startOfLocalDay(now).getTime()
  const targetStart = startOfLocalDay(targetDate).getTime()
  const dayDelta = Math.round((targetStart - todayStart) / dayMs)

  if (dayDelta === 0 || dayDelta === -1) {
    try {
      return new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(dayDelta, 'day')
    } catch {
      return dayDelta === 0 ? 'today' : 'yesterday'
    }
  }

  const sameYear = targetDate.getFullYear() === now.getFullYear()
  try {
    return new Intl.DateTimeFormat(locale, sameYear
      ? { month: 'numeric', day: 'numeric', weekday: 'short' }
      : { year: 'numeric', month: 'numeric', day: 'numeric', weekday: 'short' })
      .format(targetDate)
  } catch {
    return sameYear
      ? `${targetDate.getMonth() + 1}/${targetDate.getDate()}`
      : `${targetDate.getFullYear()}/${targetDate.getMonth() + 1}/${targetDate.getDate()}`
  }
}

function findTopVisibleUtteranceDateLabel(container: HTMLDivElement, locale: string): string {
  const containerRect = container.getBoundingClientRect()
  const nodes = container.querySelectorAll<HTMLElement>('[data-utterance-created-at]')
  for (const node of nodes) {
    const rect = node.getBoundingClientRect()
    if (rect.bottom <= containerRect.top + 1) continue
    const raw = node.dataset.utteranceCreatedAt || ''
    const createdAtMs = Number(raw)
    if (!Number.isFinite(createdAtMs) || createdAtMs <= 0) continue
    return formatScrollDateLabel(createdAtMs, locale)
  }
  return ''
}

function deriveRangeValueFromPointer(
  event: ReactPointerEvent<HTMLInputElement>,
  min: number,
  max: number,
  step: number,
): number {
  const rect = event.currentTarget.getBoundingClientRect()
  if (rect.width <= 0) return min
  const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width))
  const raw = min + ((max - min) * ratio)
  const stepped = min + (Math.round((raw - min) / step) * step)
  const bounded = Math.max(min, Math.min(max, stepped))
  return Number.isFinite(bounded) ? bounded : min
}

function isValidFeedbackEmailAddress(value: string): boolean {
  const normalized = value.trim()
  if (!normalized) return false
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)
}

type FeedbackHistoryMessage = {
  id: string
  authorType: 'user' | 'team'
  message: string
  createdAt: string
}

type FeedbackHistoryThread = {
  id: string
  category: LivePhoneDemoFeedbackCategory
  contactEmail: string | null
  createdAt: string
  messages: FeedbackHistoryMessage[]
}

type FeedbackHistoryResponse = {
  threads: FeedbackHistoryThread[]
}

type LivePhoneDemoMenuScreen = 'root' | 'feedback'

type FeedbackPageTab = 'compose' | 'history'

function formatFeedbackTimestamp(createdAt: string, locale: string): string {
  const date = new Date(createdAt)
  if (Number.isNaN(date.getTime())) return ''

  try {
    return new Intl.DateTimeFormat(locale, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(date)
  } catch {
    return date.toLocaleString()
  }
}

function buildMenuHistoryState(depth: number): Record<string, unknown> {
  if (typeof window === 'undefined') {
    return { [MENU_HISTORY_STATE_KEY]: depth }
  }

  const currentState = window.history.state
  if (!currentState || typeof currentState !== 'object') {
    return { [MENU_HISTORY_STATE_KEY]: depth }
  }

  return {
    ...(currentState as Record<string, unknown>),
    [MENU_HISTORY_STATE_KEY]: depth,
  }
}

function shouldIgnoreMenuSwipeTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false
  return Boolean(
    target.closest(
      'button, input, select, textarea, a, label, [role="button"], [data-menu-swipe-ignore="true"]',
    ),
  )
}

export interface LivePhoneDemoRef {
  startRecording: () => void
}

interface LivePhoneDemoProps {
  onLimitReached?: () => void
  enableAutoTTS?: boolean
  uiLocale: string
  tapPlayToStartLabel: string
  usageLimitReachedLabel: string
  usageLimitRetryHintLabel: string
  connectingLabel: string
  connectionFailedLabel: string
  muteTtsLabel: string
  unmuteTtsLabel: string
  textSizeLabel: string
  silenceFinalizeLabel: string
  translationModelLabel: string
  adBannerPositionLabel: string
  adBannerPositionTopLabel: string
  adBannerPositionBottomLabel: string
  silenceFinalizeLockedMessage: string
  silenceFinalizeLockedButtonLabel: string
  menuLabel: string
  logoutLabel: string
  deleteAccountLabel: string
  deleteAccountConfirmMessage: string
  deleteAccountConfirmLabel: string
  deleteAccountCancelLabel: string
  onLogout: () => void
  onDeleteAccount: () => void
  defaultFeedbackEmail?: string
  isAuthActionPending?: boolean
  showMenuButton?: boolean
  showAccountActions?: boolean
  enableAccountPreferencesSync?: boolean
}

const TTS_AUDIO_WAIT_TIMEOUT_MS = 3000

type TtsQueueItem = {
  playbackKey: string
  utteranceId: string
  audioBlob: Blob | null
  language: string
  kind: 'original' | 'translation'
  mode: 'auto' | 'manual'
}

type BubbleTtsTarget = {
  playbackKey: string
  utteranceId: string
  language: string
  kind: 'original' | 'translation'
}

type NativeTtsStopReason = 'mute_or_sound_disabled' | 'component_unmount' | 'force_reset'

type NativeOpenUpdateStoreCommand = {
  type: 'native_open_update_store'
  payload?: {
    updateUrl?: string
  }
}

type NativeUiOverlayStateCommand = {
  type: 'native_ui_overlay_state'
  payload?: {
    menuOpen?: boolean
  }
}

type NativeSetAdBannerPositionCommand = {
  type: 'native_set_ad_banner_position'
  payload?: {
    position?: LivePhoneDemoAdBannerPosition | ''
  }
}

type NativeAppUpdateWindow = Window & {
  __MINGLE_NATIVE_APP_UPDATE_STATUS?: unknown
}

function buildOriginalBubblePlaybackKey(utteranceId: string, language: string): string {
  return `original:${utteranceId}:${language.trim().toLowerCase()}`
}

function buildTranslationBubblePlaybackKey(utteranceId: string, language: string): string {
  return `translation:${utteranceId}:${language.trim().toLowerCase()}`
}

function buildTrackingRequestHeaders(args: {
  sessionKey: string
  trackingUserId: string
  nativeAppUpdate: NativeAppUpdateDetail | null
}): Record<string, string> {
  const headers: Record<string, string> = {
    'x-mingle-session-key': args.sessionKey,
    'x-mingle-user-id': args.trackingUserId,
  }

  const apiNamespace = typeof window === 'undefined'
    ? clientApiNamespace
    : readRequestedApiNamespaceFromSearch(window.location.search || '') || clientApiNamespace
  const trackingContext = resolveNativeAppTrackingContext({
    detail: args.nativeAppUpdate,
    apiNamespace,
    isNativeAppRuntime: isNativeApp(),
  })

  if (trackingContext.appVersion) {
    headers['x-mingle-app-version'] = trackingContext.appVersion
  }
  if (trackingContext.apiNamespace) {
    headers['x-mingle-api-namespace'] = trackingContext.apiNamespace
  }
  if (trackingContext.clientPlatform) {
    headers['x-mingle-client-platform'] = trackingContext.clientPlatform
  }

  return headers
}

const LivePhoneDemo = forwardRef<LivePhoneDemoRef, LivePhoneDemoProps>(function LivePhoneDemo({
  onLimitReached,
  enableAutoTTS = false,
  uiLocale,
  tapPlayToStartLabel,
  usageLimitReachedLabel,
  usageLimitRetryHintLabel,
  connectingLabel,
  connectionFailedLabel,
  textSizeLabel,
  silenceFinalizeLabel,
  translationModelLabel,
  adBannerPositionLabel,
  adBannerPositionTopLabel,
  adBannerPositionBottomLabel,
  silenceFinalizeLockedMessage,
  silenceFinalizeLockedButtonLabel,
  menuLabel,
  logoutLabel,
  deleteAccountLabel,
  deleteAccountConfirmMessage,
  deleteAccountConfirmLabel,
  deleteAccountCancelLabel,
  onLogout,
  onDeleteAccount,
  defaultFeedbackEmail = '',
  isAuthActionPending = false,
  showMenuButton = true,
  showAccountActions = true,
  enableAccountPreferencesSync = true,
}, ref) {
  const fallbackLanguages = useMemo(() => resolveDefaultSelectedLanguages(uiLocale), [uiLocale])
  const nativeAppUpdateCopy = useMemo(() => resolveNativeAppUpdateCopy(uiLocale), [uiLocale])
  const feedbackCopy = useMemo(() => resolveLivePhoneDemoFeedbackCopy(uiLocale), [uiLocale])
  const copyActionCopy = useMemo(() => resolveLivePhoneDemoCopyActionCopy(uiLocale), [uiLocale])
  const ttsActionCopy = useMemo(() => resolveLivePhoneDemoTtsActionCopy(uiLocale), [uiLocale])
  const [selectedLanguages, setSelectedLanguages] = useState<string[]>(fallbackLanguages)
  const [langSelectorOpen, setLangSelectorOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [menuScreen, setMenuScreen] = useState<LivePhoneDemoMenuScreen>('root')
  const [textSizeMenuOpen, setTextSizeMenuOpen] = useState(false)
  const [translationModelMenuOpen, setTranslationModelMenuOpen] = useState(false)
  const [textSizeLevel, setTextSizeLevel] = useState<number>(DEFAULT_TEXT_SIZE_LEVEL)
  const [sonioxManualFinalizeSilenceMs, setSonioxManualFinalizeSilenceMs] = useState<number>(DEFAULT_SONIOX_SILENCE_MS)
  const [translationModel, setTranslationModel] = useState<UserSelectableTranslationModel>(DEFAULT_SELECTABLE_TRANSLATION_MODEL)
  const [adBannerPosition, setAdBannerPosition] = useState<LivePhoneDemoAdBannerPosition | null>(null)
  const [isSilenceFinalizeSliderLocked, setIsSilenceFinalizeSliderLocked] = useState(false)
  const [deleteAccountDialogOpen, setDeleteAccountDialogOpen] = useState(false)
  const [feedbackTab, setFeedbackTab] = useState<FeedbackPageTab>('compose')
  const [feedbackCategory, setFeedbackCategory] = useState<LivePhoneDemoFeedbackCategory>('feedback')
  const [feedbackMessage, setFeedbackMessage] = useState('')
  const [feedbackEmail, setFeedbackEmail] = useState(defaultFeedbackEmail)
  const [feedbackEmailEdited, setFeedbackEmailEdited] = useState(false)
  const [feedbackSubmitError, setFeedbackSubmitError] = useState<string | null>(null)
  const [feedbackSubmitSuccess, setFeedbackSubmitSuccess] = useState(false)
  const [isSubmittingFeedback, setIsSubmittingFeedback] = useState(false)
  const [feedbackThreads, setFeedbackThreads] = useState<FeedbackHistoryThread[]>([])
  const [isFeedbackHistoryLoading, setIsFeedbackHistoryLoading] = useState(false)
  const [feedbackHistoryError, setFeedbackHistoryError] = useState<string | null>(null)
  const [isNativeAppRuntime, setIsNativeAppRuntime] = useState(false)
  const [nativeAppUpdate, setNativeAppUpdate] = useState<NativeAppUpdateDetail | null>(null)
  const [nativeBannerLayout, setNativeBannerLayout] = useState<NativeUiBannerLayoutEventDetail | null>(null)
  const [isComposerOpen, setIsComposerOpen] = useState(false)
  const [composerDraft, setComposerDraft] = useState('')
  const [keyboardViewportInsetPx, setKeyboardViewportInsetPx] = useState(0)
  const silenceSliderUpgradeToastLastShownAtRef = useRef(0)
  const { ttsEnabled: isSoundEnabled, aecEnabled } = useTtsSettings()
  const [speakingItem, setSpeakingItem] = useState<BubbleTtsTarget | null>(null)
  const [pendingManualTtsTarget, setPendingManualTtsTarget] = useState<BubbleTtsTarget | null>(null)
  const utterancesRef = useRef<Utterance[]>([])
  const playerAudioRef = useRef<HTMLAudioElement | null>(null)
  const currentAudioUrlRef = useRef<string | null>(null)
  const ttsQueueRef = useRef<TtsQueueItem[]>([])
  const isTtsProcessingRef = useRef(false)
  const ttsWaitTimerRef = useRef<number | null>(null)
  const nativeTtsPlaybackSeqRef = useRef(0)
  const activeNativeTtsPlaybackIdRef = useRef<string | null>(null)
  const activeNativeTtsUtteranceIdRef = useRef<string | null>(null)
  const nativeTtsEventTimerRef = useRef<number | null>(null)
  const isAudioPrimedRef = useRef(false)
  const ttsAudioContextRef = useRef<AudioContext | null>(null)
  const ttsGainNodeRef = useRef<GainNode | null>(null)
  const ttsNeedsUnlockRef = useRef(false)
  const processTtsQueueRef = useRef<() => void>(() => {})
  const stopClickResumeTimerIdsRef = useRef<number[]>([])
  const manualTtsRequestSeqRef = useRef(0)
  const accountPreferencesSyncTimerRef = useRef<number | null>(null)
  const langSelectorButtonRef = useRef<HTMLButtonElement | null>(null)
  const menuButtonRef = useRef<HTMLButtonElement | null>(null)
  const menuPanelRef = useRef<HTMLDivElement | null>(null)
  const textSizeDropdownRef = useRef<HTMLDivElement | null>(null)
  const textSizeButtonRef = useRef<HTMLButtonElement | null>(null)
  const translationModelDropdownRef = useRef<HTMLDivElement | null>(null)
  const translationModelButtonRef = useRef<HTMLButtonElement | null>(null)
  const menuHistoryDepthRef = useRef(0)
  const menuHistoryTargetDepthRef = useRef<number | null>(null)
  const menuSwipeSessionRef = useRef<{
    pointerId: number
    startX: number
    startedAt: number
  } | null>(null)
  const deleteAccountCancelButtonRef = useRef<HTMLButtonElement | null>(null)
  const composerTextareaRef = useRef<HTMLTextAreaElement | null>(null)
  const persistedInputModeRef = useRef<LivePhoneDemoInputMode | null>(null)
  const feedbackHistoryLoadedRef = useRef(false)
  const initialDefaultFeedbackEmailRef = useRef(defaultFeedbackEmail.trim())
  const [isIosTopTapEnabled, setIsIosTopTapEnabled] = useState(false)
  const [menuDragOffsetX, setMenuDragOffsetX] = useState(0)
  const [isMenuDragging, setIsMenuDragging] = useState(false)
  const accountPreferencesHydrationGenerationRef = useRef(0)
  const [accountPreferencesHydratedGeneration, setAccountPreferencesHydratedGeneration] = useState(0)
  const accountPreferencesLastSyncedStateKeyRef = useRef<string | null>(null)
  const silenceFinalizeLockedDescriptionId = useId()
  const textSizeListboxId = useId()
  const translationModelListboxId = useId()
  const nativeBannerPositionFromQuery = useNativeBannerPositionFromSearch()
  const composerCopy = useMemo(() => resolveLivePhoneDemoComposerCopy(uiLocale), [uiLocale])
  const latestAccountPreferencesRef = useRef<LivePhoneDemoAccountPreferences>({
    textSizeLevel: DEFAULT_TEXT_SIZE_LEVEL,
    sonioxManualFinalizeSilenceMs: DEFAULT_SONIOX_SILENCE_MS,
    translationModel: DEFAULT_SELECTABLE_TRANSLATION_MODEL,
    adBannerPosition: null,
    inputMode: DEFAULT_INPUT_MODE,
    speakerEnabled: DEFAULT_SPEAKER_ENABLED,
    echoAllowed: DEFAULT_ECHO_ALLOWED,
  })
  const latestAccountPreferences = useMemo<LivePhoneDemoAccountPreferences>(() => ({
    textSizeLevel,
    sonioxManualFinalizeSilenceMs,
    translationModel,
    adBannerPosition,
    inputMode: isComposerOpen ? 'text' : 'voice',
    speakerEnabled: isSoundEnabled,
    echoAllowed: !aecEnabled,
  }), [adBannerPosition, aecEnabled, isComposerOpen, isSoundEnabled, sonioxManualFinalizeSilenceMs, textSizeLevel, translationModel])
  const normalizedDefaultFeedbackEmail = defaultFeedbackEmail.trim()
  const displayedAdBannerPosition = resolveDisplayedLivePhoneDemoAdBannerPosition({
    preferredPosition: adBannerPosition,
    nativeLayoutPosition: normalizeLivePhoneDemoAdBannerPosition(nativeBannerLayout?.position),
    queryPosition: nativeBannerPositionFromQuery,
  })
  const selectedTranslationModelOption = useMemo(
    () => TRANSLATION_MODEL_OPTIONS.find((option) => option.value === translationModel) || TRANSLATION_MODEL_OPTIONS[0],
    [translationModel],
  )
  const isNativeMenuOverlayVisible = menuOpen || menuScreen === 'feedback'

  useEffect(() => {
    latestAccountPreferencesRef.current = latestAccountPreferences
  }, [latestAccountPreferences])

  useEffect(() => {
    if (!normalizedDefaultFeedbackEmail) return
    if (feedbackEmailEdited) return
    setFeedbackEmail(normalizedDefaultFeedbackEmail)
  }, [feedbackEmailEdited, normalizedDefaultFeedbackEmail])

  useLayoutEffect(() => {
    let cancelled = false
    const schedule = typeof queueMicrotask === 'function'
      ? queueMicrotask
      : (callback: () => void) => { void Promise.resolve().then(callback) }

    schedule(() => {
      if (cancelled) return

      const persistedDraft = readPersistedFeedbackDraft()
      if (!persistedDraft) return

      setFeedbackCategory(persistedDraft.category)
      setFeedbackMessage(persistedDraft.message)
      setFeedbackEmail(persistedDraft.email)
      setFeedbackEmailEdited(
        persistedDraft.emailEdited
        || (
          persistedDraft.email.trim().length > 0
          && persistedDraft.email.trim() !== initialDefaultFeedbackEmailRef.current
        ),
      )
    })

    return () => {
      cancelled = true
    }
  }, [])

  // Hydrate persisted preferences before paint without tripping the
  // react-hooks/set-state-in-effect rule.
  useLayoutEffect(() => {
    let cancelled = false
    const schedule = typeof queueMicrotask === 'function'
      ? queueMicrotask
      : (callback: () => void) => { void Promise.resolve().then(callback) }

    schedule(() => {
      if (cancelled) return

      const next = readPersistedLivePhoneDemoPreferences(fallbackLanguages)
      persistedInputModeRef.current = next.inputMode
      const nextIsSilenceFinalizeSliderLocked = isLegacySonioxSilenceSliderNamespace(clientApiNamespace)
      setIsSilenceFinalizeSliderLocked(nextIsSilenceFinalizeSliderLocked)
      setSelectedLanguages(next.selectedLanguages)
      setTextSizeLevel(next.textSizeLevel)
      setSonioxManualFinalizeSilenceMs(DEFAULT_SONIOX_SILENCE_MS)
      setAdBannerPosition(next.adBannerPosition)
      setIsComposerOpen(next.inputMode === 'text')
      setComposerDraft(readPersistedComposerDraft())

      const nativeUiBridgeEnabled = isNativeUiBridgeEnabledFromSearch(window.location.search || '')
      setIsIosTopTapEnabled(shouldEnableIosTopTapFallback({
        isLikelyIosPlatform: isLikelyIOSPlatform(),
        isNativeApp: isNativeApp(),
        isNativeUiBridgeEnabled: nativeUiBridgeEnabled,
      }))
    })

    return () => {
      cancelled = true
    }
  }, [fallbackLanguages])

  useEffect(() => {
    if (!isNativeApp()) return

    const nativeRuntimeTimerId = window.setTimeout(() => {
      setIsNativeAppRuntime(true)
    }, 0)

    const windowWithUpdate = window as NativeAppUpdateWindow
    const cachedDetail = parseNativeAppUpdateDetail(windowWithUpdate.__MINGLE_NATIVE_APP_UPDATE_STATUS)
    const nativeUpdateTimerId = window.setTimeout(() => {
      setNativeAppUpdate(cachedDetail || DEFAULT_NATIVE_APP_UPDATE_DETAIL)
    }, 0)

    const handleNativeAppUpdate = (event: Event) => {
      const detail = parseNativeAppUpdateDetail((event as CustomEvent<unknown>).detail)
      if (!detail) return
      setNativeAppUpdate(detail)
    }

    window.addEventListener(NATIVE_APP_UPDATE_EVENT, handleNativeAppUpdate as EventListener)
    return () => {
      window.clearTimeout(nativeRuntimeTimerId)
      window.clearTimeout(nativeUpdateTimerId)
      window.removeEventListener(NATIVE_APP_UPDATE_EVENT, handleNativeAppUpdate as EventListener)
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return

    const viewport = window.visualViewport
    if (!viewport) return

    const syncKeyboardInset = () => {
      setKeyboardViewportInsetPx(resolveKeyboardViewportInsetPx(viewport))
    }

    syncKeyboardInset()
    viewport.addEventListener('resize', syncKeyboardInset)
    viewport.addEventListener('scroll', syncKeyboardInset)

    return () => {
      viewport.removeEventListener('resize', syncKeyboardInset)
      viewport.removeEventListener('scroll', syncKeyboardInset)
    }
  }, [])

  useEffect(() => {
    if (!isComposerOpen) return

    const timerId = window.setTimeout(() => {
      const textarea = composerTextareaRef.current
      if (!textarea) return
      resizeComposerTextarea(textarea)
      textarea.focus({ preventScroll: true })
      const cursor = textarea.value.length
      textarea.setSelectionRange(cursor, cursor)
    }, 40)

    return () => {
      window.clearTimeout(timerId)
    }
  }, [isComposerOpen])

  useLayoutEffect(() => {
    resizeComposerTextarea(composerTextareaRef.current)
  }, [composerDraft, isComposerOpen])

  // Persist selected languages
  useEffect(() => {
    try {
      localStorage.setItem(LS_KEY_LANGUAGES, JSON.stringify(selectedLanguages))
    } catch { /* ignore */ }
  }, [selectedLanguages])

  useEffect(() => {
    try {
      localStorage.setItem(LS_KEY_TEXT_SIZE_LEVEL, String(textSizeLevel))
    } catch { /* ignore */ }
  }, [textSizeLevel])

  useEffect(() => {
    try {
      if (adBannerPosition) {
        localStorage.setItem(LS_KEY_AD_BANNER_POSITION, adBannerPosition)
      } else {
        localStorage.removeItem(LS_KEY_AD_BANNER_POSITION)
      }
    } catch { /* ignore */ }
  }, [adBannerPosition])

  useEffect(() => {
    try {
      localStorage.setItem(LS_KEY_INPUT_MODE, isComposerOpen ? 'text' : 'voice')
    } catch { /* ignore */ }
  }, [isComposerOpen])

  useEffect(() => {
    persistComposerDraft(composerDraft)
  }, [composerDraft])

  useEffect(() => {
    if (!feedbackMessage) {
      persistFeedbackDraft(null)
      return
    }

    persistFeedbackDraft({
      category: feedbackCategory,
      message: feedbackMessage,
      email: feedbackEmail,
      emailEdited: feedbackEmailEdited,
    })
  }, [feedbackCategory, feedbackEmail, feedbackEmailEdited, feedbackMessage])

  const clearAccountPreferencesSyncTimer = useCallback(() => {
    if (accountPreferencesSyncTimerRef.current === null) return
    window.clearTimeout(accountPreferencesSyncTimerRef.current)
    accountPreferencesSyncTimerRef.current = null
  }, [])

  useEffect(() => {
    let cancelled = false
    clearAccountPreferencesSyncTimer()

    if (!enableAccountPreferencesSync) {
      accountPreferencesLastSyncedStateKeyRef.current = null
      return () => {
        cancelled = true
      }
    }

    const hydrationGeneration = accountPreferencesHydrationGenerationRef.current + 1
    accountPreferencesHydrationGenerationRef.current = hydrationGeneration
    const sessionKey = getOrCreateSessionKey()
    const trackingUserId = getOrCreateTrackingUserId()

    void fetch(ACCOUNT_PREFERENCES_API_PATH, {
      method: 'GET',
      cache: 'no-store',
      headers: buildTrackingRequestHeaders({
        sessionKey,
        trackingUserId,
        nativeAppUpdate,
      }),
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`account_preferences_fetch_failed:${response.status}`)
        }
        return response.json() as Promise<AccountPreferencesResponse>
      })
      .then((body) => {
        if (cancelled) return
        const hydratedPreferences = buildHydratedAccountPreferences(
          body,
          isLegacySonioxSilenceSliderNamespace(clientApiNamespace),
        )
        setTextSizeLevel(hydratedPreferences.textSizeLevel)
        setSonioxManualFinalizeSilenceMs(hydratedPreferences.sonioxManualFinalizeSilenceMs)
        setTranslationModel(hydratedPreferences.translationModel)
        setAdBannerPosition(hydratedPreferences.adBannerPosition)
        if (persistedInputModeRef.current === null) {
          setIsComposerOpen(hydratedPreferences.inputMode === 'text')
        }
        accountPreferencesLastSyncedStateKeyRef.current =
          serializeAccountPreferencesSyncState(hydratedPreferences)
        setAccountPreferencesHydratedGeneration(hydrationGeneration)
      })
      .catch(() => {
        if (cancelled) return
        accountPreferencesLastSyncedStateKeyRef.current =
          serializeAccountPreferencesSyncState(latestAccountPreferencesRef.current)
        setAccountPreferencesHydratedGeneration(hydrationGeneration)
      })

    return () => {
      cancelled = true
    }
  }, [clearAccountPreferencesSyncTimer, enableAccountPreferencesSync, nativeAppUpdate])

  const syncAccountPreferences = useCallback(() => {
    if (!enableAccountPreferencesSync) return
    const currentPreferences = latestAccountPreferencesRef.current
    const currentSyncStateKey = serializeAccountPreferencesSyncState(currentPreferences)
    const sessionKey = getOrCreateSessionKey()
    const trackingUserId = getOrCreateTrackingUserId()

    void fetch(ACCOUNT_PREFERENCES_API_PATH, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...buildTrackingRequestHeaders({
          sessionKey,
          trackingUserId,
          nativeAppUpdate,
        }),
      },
      body: JSON.stringify({
        textSizeLevel: currentPreferences.textSizeLevel,
        sonioxManualFinalizeSilenceMs: currentPreferences.sonioxManualFinalizeSilenceMs,
        translationModel: currentPreferences.translationModel,
        adBannerPosition: currentPreferences.adBannerPosition,
        inputMode: currentPreferences.inputMode,
      }),
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error(`account_preferences_patch_failed:${response.status}`)
        }
        accountPreferencesLastSyncedStateKeyRef.current = currentSyncStateKey
      })
      .catch(() => {
        // Keep the current in-memory state and retry on the next change.
      })
  }, [enableAccountPreferencesSync, nativeAppUpdate])

  const syncAccountPreferencesOverride = useCallback((nextPreferences: LivePhoneDemoAccountPreferences) => {
    if (!enableAccountPreferencesSync) return
    latestAccountPreferencesRef.current = nextPreferences
    const currentSyncStateKey = serializeAccountPreferencesSyncState(nextPreferences)
    const sessionKey = getOrCreateSessionKey()
    const trackingUserId = getOrCreateTrackingUserId()

    void fetch(ACCOUNT_PREFERENCES_API_PATH, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...buildTrackingRequestHeaders({
          sessionKey,
          trackingUserId,
          nativeAppUpdate,
        }),
      },
      body: JSON.stringify({
        textSizeLevel: nextPreferences.textSizeLevel,
        sonioxManualFinalizeSilenceMs: nextPreferences.sonioxManualFinalizeSilenceMs,
        translationModel: nextPreferences.translationModel,
        adBannerPosition: nextPreferences.adBannerPosition,
        inputMode: nextPreferences.inputMode,
      }),
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error(`account_preferences_patch_failed:${response.status}`)
        }
        accountPreferencesLastSyncedStateKeyRef.current = currentSyncStateKey
      })
      .catch(() => {
        // Keep the current in-memory state and retry on the next change.
      })
  }, [enableAccountPreferencesSync, nativeAppUpdate])

  const clearFeedbackSubmitState = useCallback(() => {
    setFeedbackSubmitError(null)
    setFeedbackSubmitSuccess(false)
  }, [])

  const loadFeedbackThreads = useCallback(async (options?: { silent?: boolean }) => {
    if (!options?.silent) {
      setIsFeedbackHistoryLoading(true)
    }
    setFeedbackHistoryError(null)

    try {
      const sessionKey = getOrCreateSessionKey()
      const trackingUserId = getOrCreateTrackingUserId()
      const response = await fetch(FEEDBACK_API_PATH, {
        method: 'GET',
        cache: 'no-store',
        headers: buildTrackingRequestHeaders({
          sessionKey,
          trackingUserId,
          nativeAppUpdate,
        }),
      })

      if (!response.ok) {
        throw new Error(`feedback_history_fetch_failed:${response.status}`)
      }

      const body = await response.json() as FeedbackHistoryResponse
      setFeedbackThreads(Array.isArray(body.threads) ? body.threads : [])
      feedbackHistoryLoadedRef.current = true
    } catch {
      setFeedbackHistoryError(feedbackCopy.historyErrorMessage)
    } finally {
      setIsFeedbackHistoryLoading(false)
    }
  }, [feedbackCopy.historyErrorMessage, nativeAppUpdate])

  const handleFeedbackSubmit = useCallback(async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const nextFeedbackMessage = feedbackMessage.trim()
    const nextFeedbackEmail = feedbackEmail.trim()

    if (nextFeedbackMessage.length < FEEDBACK_MIN_MESSAGE_LENGTH) {
      setFeedbackSubmitSuccess(false)
      setFeedbackSubmitError(feedbackCopy.messageTooShortMessage)
      return
    }

    if (nextFeedbackEmail && !isValidFeedbackEmailAddress(nextFeedbackEmail)) {
      setFeedbackSubmitSuccess(false)
      setFeedbackSubmitError(feedbackCopy.invalidEmailMessage)
      return
    }

    setIsSubmittingFeedback(true)
    setFeedbackSubmitError(null)
    setFeedbackSubmitSuccess(false)

    try {
      const sessionKey = getOrCreateSessionKey()
      const trackingUserId = getOrCreateTrackingUserId()
      const response = await fetch(FEEDBACK_API_PATH, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...buildTrackingRequestHeaders({
            sessionKey,
            trackingUserId,
            nativeAppUpdate,
          }),
        },
        body: JSON.stringify({
          category: feedbackCategory,
          message: nextFeedbackMessage,
          contactEmail: nextFeedbackEmail || undefined,
          locale: uiLocale,
          pathname: typeof window === 'undefined' ? null : window.location.pathname,
        }),
      })

      if (!response.ok) {
        const responseBody = await response.json().catch(() => null) as { error?: unknown } | null
        const errorCode = parseFeedbackSubmitErrorCode(responseBody?.error)

        if (errorCode === 'message_too_short') {
          setFeedbackSubmitError(feedbackCopy.messageTooShortMessage)
          setFeedbackSubmitSuccess(false)
          return
        }

        if (errorCode === 'invalid_contact_email') {
          setFeedbackSubmitError(feedbackCopy.invalidEmailMessage)
          setFeedbackSubmitSuccess(false)
          return
        }

        throw new Error(`feedback_submit_failed:${response.status}`)
      }

      setFeedbackMessage('')
      persistFeedbackDraft(null)
      setFeedbackSubmitSuccess(true)
      await loadFeedbackThreads({ silent: true })
    } catch {
      setFeedbackSubmitError(feedbackCopy.errorMessage)
      setFeedbackSubmitSuccess(false)
    } finally {
      setIsSubmittingFeedback(false)
    }
  }, [feedbackCategory, feedbackCopy.errorMessage, feedbackCopy.invalidEmailMessage, feedbackCopy.messageTooShortMessage, feedbackEmail, feedbackMessage, loadFeedbackThreads, nativeAppUpdate, uiLocale])

  const applyMenuNavigationDepth = useCallback((nextDepth: number) => {
    const boundedDepth = Math.max(0, Math.min(2, nextDepth))
    menuHistoryDepthRef.current = boundedDepth
    setTextSizeMenuOpen(false)
    setTranslationModelMenuOpen(false)
    setMenuDragOffsetX(0)
    setIsMenuDragging(false)

    if (boundedDepth === 0) {
      setDeleteAccountDialogOpen(false)
      setMenuScreen('root')
      setMenuOpen(false)
      return
    }

    setMenuOpen(true)
    setMenuScreen(boundedDepth === 1 ? 'root' : 'feedback')
  }, [])

  const pushMenuHistoryEntry = useCallback((nextDepth: number) => {
    applyMenuNavigationDepth(nextDepth)
    if (typeof window === 'undefined') return
    menuHistoryTargetDepthRef.current = null
    window.history.pushState(buildMenuHistoryState(nextDepth), '')
  }, [applyMenuNavigationDepth])

  const closeMenuPanel = useCallback(() => {
    menuHistoryTargetDepthRef.current = null
    applyMenuNavigationDepth(0)
  }, [applyMenuNavigationDepth])

  const requestMenuBackStep = useCallback(() => {
    const nextDepth = Math.max(0, menuHistoryDepthRef.current - 1)
    if (typeof window === 'undefined' || menuHistoryDepthRef.current <= 0) {
      applyMenuNavigationDepth(nextDepth)
      return
    }
    menuHistoryTargetDepthRef.current = nextDepth
    window.history.back()
  }, [applyMenuNavigationDepth])

  const requestCloseMenuPanel = useCallback(() => {
    const currentDepth = menuHistoryDepthRef.current
    if (typeof window === 'undefined' || currentDepth <= 0) {
      applyMenuNavigationDepth(0)
      return
    }
    menuHistoryTargetDepthRef.current = 0
    window.history.go(-currentDepth)
  }, [applyMenuNavigationDepth])

  const handleMenuButtonPress = useCallback(() => {
    setLangSelectorOpen(false)

    if (menuOpen) {
      requestCloseMenuPanel()
      return
    }

    clearFeedbackSubmitState()
    setFeedbackTab('compose')
    pushMenuHistoryEntry(1)
  }, [clearFeedbackSubmitState, menuOpen, pushMenuHistoryEntry, requestCloseMenuPanel])

  const handleFeedbackMenuItemPress = useCallback(() => {
    if (!menuOpen || menuScreen === 'feedback') return
    clearFeedbackSubmitState()
    setFeedbackTab('compose')
    pushMenuHistoryEntry(2)
  }, [clearFeedbackSubmitState, menuOpen, menuScreen, pushMenuHistoryEntry])

  const handleTextSizeLevelSelect = useCallback((nextTextSizeLevel: number) => {
    setTextSizeMenuOpen(false)
    if (latestAccountPreferencesRef.current.textSizeLevel === nextTextSizeLevel) return
    setTextSizeLevel(nextTextSizeLevel)
    clearAccountPreferencesSyncTimer()
    syncAccountPreferencesOverride({
      ...latestAccountPreferencesRef.current,
      textSizeLevel: nextTextSizeLevel,
    })
  }, [clearAccountPreferencesSyncTimer, syncAccountPreferencesOverride])

  const handleTranslationModelSelect = useCallback((nextTranslationModel: UserSelectableTranslationModel) => {
    setTranslationModelMenuOpen(false)
    setTranslationModel(nextTranslationModel)
    clearAccountPreferencesSyncTimer()
    syncAccountPreferencesOverride({
      ...latestAccountPreferencesRef.current,
      translationModel: nextTranslationModel,
    })
  }, [clearAccountPreferencesSyncTimer, syncAccountPreferencesOverride])

  const handleAdBannerPositionSelect = useCallback((nextAdBannerPosition: LivePhoneDemoAdBannerPosition) => {
    if (latestAccountPreferencesRef.current.adBannerPosition === nextAdBannerPosition) return
    setAdBannerPosition(nextAdBannerPosition)
    clearAccountPreferencesSyncTimer()
    syncAccountPreferencesOverride({
      ...latestAccountPreferencesRef.current,
      adBannerPosition: nextAdBannerPosition,
    })
  }, [clearAccountPreferencesSyncTimer, syncAccountPreferencesOverride])

  useEffect(() => {
    if (!isNativeApp()) return

    const command: NativeUiOverlayStateCommand = {
      type: 'native_ui_overlay_state',
      payload: { menuOpen: isNativeMenuOverlayVisible },
    }

    try {
      window.ReactNativeWebView?.postMessage(JSON.stringify(command))
    } catch {
      // Ignore bridge errors and leave the native banner state unchanged.
    }
  }, [isNativeMenuOverlayVisible])

  useEffect(() => {
    if (!isNativeApp()) return

    return () => {
      try {
        window.ReactNativeWebView?.postMessage(JSON.stringify({
          type: 'native_ui_overlay_state',
          payload: { menuOpen: false },
        } satisfies NativeUiOverlayStateCommand))
      } catch {
        // Ignore bridge errors during teardown.
      }
    }
  }, [])

  useEffect(() => {
    if (!isNativeApp()) return

    const nextBannerPosition = adBannerPosition
      || nativeBannerPositionFromQuery
    if (!nextBannerPosition) return
    const command: NativeSetAdBannerPositionCommand = {
      type: 'native_set_ad_banner_position',
      payload: { position: nextBannerPosition },
    }

    try {
      window.ReactNativeWebView?.postMessage(JSON.stringify(command))
    } catch {
      // Ignore bridge errors and leave the native banner position unchanged.
    }
  }, [adBannerPosition, nativeBannerPositionFromQuery])

  const flushAccountPreferencesSync = useCallback(() => {
    if (!shouldScheduleAccountPreferencesSync({
      allowSync: enableAccountPreferencesSync,
      hydratedGeneration: accountPreferencesHydratedGeneration,
      requestedHydrationGeneration: accountPreferencesHydrationGenerationRef.current,
      currentPreferences: latestAccountPreferences,
      lastSyncedStateKey: accountPreferencesLastSyncedStateKeyRef.current,
    })) {
      return
    }
    clearAccountPreferencesSyncTimer()
    syncAccountPreferences()
  }, [accountPreferencesHydratedGeneration, clearAccountPreferencesSyncTimer, enableAccountPreferencesSync, latestAccountPreferences, syncAccountPreferences])

  useEffect(() => {
    if (!shouldScheduleAccountPreferencesSync({
      allowSync: enableAccountPreferencesSync,
      hydratedGeneration: accountPreferencesHydratedGeneration,
      requestedHydrationGeneration: accountPreferencesHydrationGenerationRef.current,
      currentPreferences: latestAccountPreferences,
      lastSyncedStateKey: accountPreferencesLastSyncedStateKeyRef.current,
    })) {
      return
    }

    clearAccountPreferencesSyncTimer()
    accountPreferencesSyncTimerRef.current = window.setTimeout(() => {
      accountPreferencesSyncTimerRef.current = null
      syncAccountPreferences()
    }, ACCOUNT_PREFERENCES_SYNC_DEBOUNCE_MS)

    return clearAccountPreferencesSyncTimer
  }, [accountPreferencesHydratedGeneration, clearAccountPreferencesSyncTimer, enableAccountPreferencesSync, latestAccountPreferences, syncAccountPreferences])

  useEffect(() => {
    const handlePopState = () => {
      const requestedDepth = menuHistoryTargetDepthRef.current
      menuHistoryTargetDepthRef.current = null

      if (requestedDepth !== null) {
        applyMenuNavigationDepth(requestedDepth)
        return
      }

      if (menuHistoryDepthRef.current <= 0) return
      applyMenuNavigationDepth(Math.max(0, menuHistoryDepthRef.current - 1))
    }

    window.addEventListener('popstate', handlePopState)
    return () => {
      window.removeEventListener('popstate', handlePopState)
    }
  }, [applyMenuNavigationDepth])

  useEffect(() => {
    if (!menuOpen) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      if (textSizeMenuOpen) {
        setTextSizeMenuOpen(false)
        try {
          textSizeButtonRef.current?.focus({ preventScroll: true })
        } catch {
          textSizeButtonRef.current?.focus()
        }
        return
      }
      if (translationModelMenuOpen) {
        setTranslationModelMenuOpen(false)
        try {
          translationModelButtonRef.current?.focus({ preventScroll: true })
        } catch {
          translationModelButtonRef.current?.focus()
        }
        return
      }
      requestMenuBackStep()
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [menuOpen, requestMenuBackStep, textSizeMenuOpen, translationModelMenuOpen])

  useEffect(() => {
    if (!textSizeMenuOpen) return

    const handlePointerDown = (event: PointerEvent) => {
      if (!(event.target instanceof Node)) return
      if (textSizeDropdownRef.current?.contains(event.target)) return
      setTextSizeMenuOpen(false)
    }

    window.addEventListener('pointerdown', handlePointerDown)
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown)
    }
  }, [textSizeMenuOpen])

  useEffect(() => {
    if (!menuOpen || menuScreen !== 'feedback') return
    if (feedbackHistoryLoadedRef.current) {
      void loadFeedbackThreads({ silent: true })
      return
    }
    void loadFeedbackThreads()
  }, [loadFeedbackThreads, menuOpen, menuScreen])

  useEffect(() => {
    if (!translationModelMenuOpen) return

    const handlePointerDown = (event: PointerEvent) => {
      if (!(event.target instanceof Node)) return
      if (translationModelDropdownRef.current?.contains(event.target)) return
      setTranslationModelMenuOpen(false)
    }

    window.addEventListener('pointerdown', handlePointerDown)
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown)
    }
  }, [translationModelMenuOpen])

  useEffect(() => {
    if (showMenuButton) return

    const closeMenuState = window.setTimeout(() => {
      closeMenuPanel()
    }, 0)

    return () => {
      window.clearTimeout(closeMenuState)
    }
  }, [closeMenuPanel, showMenuButton])

  const closeDeleteAccountDialog = useCallback(() => {
    if (isAuthActionPending) return
    setDeleteAccountDialogOpen(false)
  }, [isAuthActionPending])

  const finishMenuSwipe = useCallback((pointerId: number, currentX: number) => {
    const swipeSession = menuSwipeSessionRef.current
    if (!swipeSession || swipeSession.pointerId !== pointerId) return

    const offsetX = Math.max(0, currentX - swipeSession.startX)
    const elapsedMs = Math.max(1, performance.now() - swipeSession.startedAt)
    const velocityPxPerMs = offsetX / elapsedMs

    menuSwipeSessionRef.current = null
    setIsMenuDragging(false)

    if (
      offsetX >= MENU_PANEL_CLOSE_DRAG_DISTANCE_PX
      || velocityPxPerMs >= MENU_PANEL_CLOSE_DRAG_VELOCITY_PX_PER_MS
    ) {
      requestMenuBackStep()
      return
    }

    setMenuDragOffsetX(0)
  }, [requestMenuBackStep])

  const handleMenuPanelPointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'mouse') return
    if (shouldIgnoreMenuSwipeTarget(event.target)) return

    menuSwipeSessionRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startedAt: performance.now(),
    }
    setIsMenuDragging(true)
    setMenuDragOffsetX(0)
    event.currentTarget.setPointerCapture(event.pointerId)
  }, [])

  const handleMenuPanelPointerMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const swipeSession = menuSwipeSessionRef.current
    if (!swipeSession || swipeSession.pointerId !== event.pointerId) return

    const nextOffset = Math.max(0, event.clientX - swipeSession.startX)
    setMenuDragOffsetX(nextOffset)
  }, [])

  const handleMenuPanelPointerUp = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    finishMenuSwipe(event.pointerId, event.clientX)
  }, [finishMenuSwipe])

  const handleMenuPanelPointerCancel = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    menuSwipeSessionRef.current = null
    setIsMenuDragging(false)
    setMenuDragOffsetX(0)
  }, [])

  const handleDeleteAccountConfirm = useCallback(() => {
    if (isAuthActionPending) return
    setDeleteAccountDialogOpen(false)
    onDeleteAccount()
  }, [isAuthActionPending, onDeleteAccount])

  useEffect(() => {
    if (!deleteAccountDialogOpen) return
    deleteAccountCancelButtonRef.current?.focus()

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      closeDeleteAccountDialog()
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [closeDeleteAccountDialog, deleteAccountDialogOpen])

  const ensureAudioPlayer = useCallback(() => {
    if (playerAudioRef.current) return playerAudioRef.current
    const audio = new Audio()
    audio.preload = 'auto'
    ;(audio as HTMLAudioElement & { playsInline?: boolean }).playsInline = true
    playerAudioRef.current = audio
    // In the native RN app, the native AVAudioSession handles AEC and volume.
    // Creating a WebView AudioContext here conflicts with the native session
    // causing silent TTS playback and STT stalls.  Only use the GainNode
    // path on the regular mobile-web surface where there is no native session.
    if (!isNativeApp()) {
      try {
        const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
        if (AudioCtx) {
          const ctx = new AudioCtx()
          const source = ctx.createMediaElementSource(audio)
          const gain = ctx.createGain()
          gain.gain.value = 1.0
          source.connect(gain)
          gain.connect(ctx.destination)
          ttsAudioContextRef.current = ctx
          ttsGainNodeRef.current = gain
        }
      } catch { /* fallback: audio plays without gain control */ }
    }
    return audio
  }, [])

  const cleanupCurrentAudio = useCallback(() => {
    const player = playerAudioRef.current
    if (player) {
      player.pause()
      player.onended = null
      player.onerror = null
      player.src = ''
      player.load()
    }
    if (currentAudioUrlRef.current) {
      URL.revokeObjectURL(currentAudioUrlRef.current)
      currentAudioUrlRef.current = null
    }
  }, [])

  const clearTtsWaitTimer = useCallback(() => {
    if (ttsWaitTimerRef.current) {
      window.clearTimeout(ttsWaitTimerRef.current)
      ttsWaitTimerRef.current = null
    }
  }, [])

  const clearNativeTtsEventTimer = useCallback(() => {
    if (nativeTtsEventTimerRef.current !== null) {
      window.clearTimeout(nativeTtsEventTimerRef.current)
      nativeTtsEventTimerRef.current = null
    }
  }, [])

  const sendNativeTtsStopCommand = useCallback((reason: NativeTtsStopReason) => {
    if (!isNativeApp()) return
    window.ReactNativeWebView!.postMessage(JSON.stringify({
      type: 'native_tts_stop',
      payload: { reason },
    }))
  }, [])

  const allocateNativeTtsPlaybackId = useCallback((playbackKey: string) => {
    nativeTtsPlaybackSeqRef.current += 1
    return `${playbackKey}::${nativeTtsPlaybackSeqRef.current}`
  }, [])

  const armNativeTtsEventTimeout = useCallback((playbackId: string, playbackKey: string) => {
    if (!isNativeApp()) return
    clearNativeTtsEventTimer()
    activeNativeTtsPlaybackIdRef.current = playbackId
    activeNativeTtsUtteranceIdRef.current = playbackKey
    nativeTtsEventTimerRef.current = window.setTimeout(() => {
      if (
        activeNativeTtsPlaybackIdRef.current !== playbackId
        && activeNativeTtsUtteranceIdRef.current !== playbackKey
      ) {
        return
      }
      activeNativeTtsPlaybackIdRef.current = null
      activeNativeTtsUtteranceIdRef.current = null
      nativeTtsEventTimerRef.current = null
      setSpeakingItem(prev => (prev?.playbackKey === playbackKey ? null : prev))
      isTtsProcessingRef.current = false
      processTtsQueueRef.current()
    }, NATIVE_TTS_EVENT_TIMEOUT_MS)
  }, [clearNativeTtsEventTimer])

  const processTtsQueue = useCallback(() => {
    if (isTtsProcessingRef.current) return
    if (!enableAutoTTS || !isSoundEnabled) {
      ttsQueueRef.current = ttsQueueRef.current.filter(item => item.mode === 'manual')
    }

    const queue = ttsQueueRef.current
    if (queue.length === 0) {
      clearTtsWaitTimer()
      clearNativeTtsEventTimer()
      activeNativeTtsPlaybackIdRef.current = null
      activeNativeTtsUtteranceIdRef.current = null
      setSpeakingItem(null)
      return
    }

    const front = queue[0]

    // Front item is waiting for audio — set a timeout to skip if it never arrives
    if (!front.audioBlob) {
      if (!ttsWaitTimerRef.current) {
        ttsWaitTimerRef.current = window.setTimeout(() => {
          ttsWaitTimerRef.current = null
          const q = ttsQueueRef.current
          if (q.length > 0 && !q[0].audioBlob) {
            q.shift()
          }
          processTtsQueueRef.current()
        }, TTS_AUDIO_WAIT_TIMEOUT_MS)
      }
      return
    }

    // Front item has audio — play it
    clearTtsWaitTimer()
    const next = queue.shift()!
    const audioBlob = next.audioBlob!
    isTtsProcessingRef.current = true
    cleanupCurrentAudio()
    setSpeakingItem({
      playbackKey: next.playbackKey,
      utteranceId: next.utteranceId,
      language: next.language,
      kind: next.kind,
    })

    const onPlaybackDone = () => {
      clearNativeTtsEventTimer()
      activeNativeTtsPlaybackIdRef.current = null
      activeNativeTtsUtteranceIdRef.current = null
      setSpeakingItem(prev => (prev?.playbackKey === next.playbackKey ? null : prev))
      isTtsProcessingRef.current = false
      processTtsQueueRef.current()
    }

    const playViaNativeBridge = async () => {
      try {
        const playbackId = allocateNativeTtsPlaybackId(next.playbackKey)
        const audioBase64 = await blobToBase64(audioBlob)
        window.ReactNativeWebView!.postMessage(JSON.stringify({
          type: 'native_tts_play',
          payload: {
            playbackId,
            utteranceId: next.playbackKey,
            audioBase64,
            contentType: audioBlob.type || 'audio/mpeg',
          },
        }))
        armNativeTtsEventTimeout(playbackId, next.playbackKey)
      } catch {
        onPlaybackDone()
      }
    }

    const playViaHtmlAudio = async () => {
      clearNativeTtsEventTimer()
      activeNativeTtsPlaybackIdRef.current = null
      activeNativeTtsUtteranceIdRef.current = null
      const audio = ensureAudioPlayer()

      const ctx = ttsAudioContextRef.current
      if (ctx && ctx.state === 'suspended') {
        try { await ctx.resume() } catch { /* best-effort */ }
      }

      const objectUrl = URL.createObjectURL(audioBlob)
      currentAudioUrlRef.current = objectUrl
      audio.src = objectUrl

      audio.onended = () => {
        if (currentAudioUrlRef.current === objectUrl) {
          URL.revokeObjectURL(objectUrl)
          currentAudioUrlRef.current = null
        }
        onPlaybackDone()
      }

      audio.onerror = () => {
        if (currentAudioUrlRef.current === objectUrl) {
          URL.revokeObjectURL(objectUrl)
          currentAudioUrlRef.current = null
        }
        onPlaybackDone()
      }

      audio.play().catch(() => {
        if (currentAudioUrlRef.current === objectUrl) {
          URL.revokeObjectURL(objectUrl)
          currentAudioUrlRef.current = null
        }
        setSpeakingItem(prev => (prev?.playbackKey === next.playbackKey ? null : prev))
        ttsNeedsUnlockRef.current = true
        // Re-insert at front of queue so it can be retried after audio unlock
        ttsQueueRef.current.unshift(next)
        isTtsProcessingRef.current = false
      })
    }

    // NativeTTSModule은 iOS 전용 — Android에서는 HTML audio로 재생
    if (isNativeApp() && isLikelyIOSPlatform()) {
      void playViaNativeBridge()
    } else {
      void playViaHtmlAudio()
    }
  }, [allocateNativeTtsPlaybackId, armNativeTtsEventTimeout, cleanupCurrentAudio, clearNativeTtsEventTimer, clearTtsWaitTimer, enableAutoTTS, ensureAudioPlayer, isSoundEnabled])

  useEffect(() => {
    processTtsQueueRef.current = processTtsQueue
  }, [processTtsQueue])

  // Listen for native TTS playback events (only in native app).
  useEffect(() => {
    if (!isNativeApp()) return

    const handleNativeTtsEvent = (event: Event) => {
      const detail = (event as CustomEvent).detail as {
        type: string
        playbackId?: string
        utteranceId?: string
        message?: string
      } | null
      if (!detail || typeof detail !== 'object') return

      const playbackId = detail.playbackId || ''
      const utteranceId = detail.utteranceId || ''
      const isCurrentPlaybackEvent = () => {
        if (playbackId) {
          if (activeNativeTtsPlaybackIdRef.current) {
            return activeNativeTtsPlaybackIdRef.current === playbackId
          }
          if (utteranceId && activeNativeTtsUtteranceIdRef.current) {
            return activeNativeTtsUtteranceIdRef.current === utteranceId
          }
          return true
        }
        if (utteranceId && activeNativeTtsUtteranceIdRef.current) {
          return activeNativeTtsUtteranceIdRef.current === utteranceId
        }
        return true
      }

      if (detail.type === 'tts_ended' || detail.type === 'tts_error') {
        if (!isCurrentPlaybackEvent()) return
        activeNativeTtsPlaybackIdRef.current = null
        activeNativeTtsUtteranceIdRef.current = null
        clearNativeTtsEventTimer()
        setSpeakingItem(prev => {
          if (utteranceId && prev?.playbackKey === utteranceId) return null
          return prev
        })
        isTtsProcessingRef.current = false
        processTtsQueueRef.current()
        return
      }

      if (detail.type === 'tts_stopped') {
        if (!isCurrentPlaybackEvent()) return
        activeNativeTtsPlaybackIdRef.current = null
        activeNativeTtsUtteranceIdRef.current = null
        clearNativeTtsEventTimer()
        isTtsProcessingRef.current = false
        setSpeakingItem(prev => {
          if (!utteranceId) return null
          if (prev?.playbackKey === utteranceId) return null
          return prev
        })
        processTtsQueueRef.current()
      }
    }

    window.addEventListener(NATIVE_TTS_EVENT, handleNativeTtsEvent as EventListener)
    return () => {
      window.removeEventListener(NATIVE_TTS_EVENT, handleNativeTtsEvent as EventListener)
    }
  }, [clearNativeTtsEventTimer])

  // Reserve a slot in the TTS queue when a TTS request is about to be made.
  // This ensures playback order matches utterance order regardless of response arrival order.
  const handleTtsRequested = useCallback((utteranceId: string, language: string) => {
    if (!enableAutoTTS || !isSoundEnabled) return
    const queue = ttsQueueRef.current
    const playbackKey = buildTranslationBubblePlaybackKey(utteranceId, language)
    if (queue.some(item => item.playbackKey === playbackKey)) {
      return
    }
    queue.push({
      playbackKey,
      utteranceId,
      audioBlob: null,
      language,
      kind: 'translation',
      mode: 'auto',
    })
  }, [enableAutoTTS, isSoundEnabled])

  // Handle TTS audio received inline with translation response.
  const handleTtsAudio = useCallback((utteranceId: string, audioBlob: Blob, language: string) => {
    if (!enableAutoTTS || !isSoundEnabled) return
    const queue = ttsQueueRef.current
    const playbackKey = buildTranslationBubblePlaybackKey(utteranceId, language)
    // Fill in existing placeholder
    const existing = queue.find(item => item.playbackKey === playbackKey)
    if (existing) {
      existing.audioBlob = audioBlob
      existing.language = language
    } else {
      // No placeholder (edge case) — append to end
      queue.push({
        playbackKey,
        utteranceId,
        audioBlob,
        language,
        kind: 'translation',
        mode: 'auto',
      })
    }
    processTtsQueue()
  }, [enableAutoTTS, isSoundEnabled, processTtsQueue])

  const handleTtsCanceled = useCallback((utteranceId: string) => {
    const queue = ttsQueueRef.current
    const nextQueue = queue.filter((item) => item.utteranceId !== utteranceId || item.mode === 'manual')
    if (nextQueue.length === queue.length) return
    ttsQueueRef.current = nextQueue
    clearTtsWaitTimer()
    processTtsQueue()
  }, [clearTtsWaitTimer, processTtsQueue])

  const synthesizeBubbleTtsViaApi = useCallback(async (input: {
    playbackKey: string
    text: string
    language: string
  }): Promise<Blob | null> => {
    const text = input.text.trim()
    const language = input.language.trim()
    if (!text || !language) return null

    const sessionKey = getOrCreateSessionKey()
    const trackingUserId = getOrCreateTrackingUserId()

    try {
      const response = await fetch(TTS_API_PATH, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...buildTrackingRequestHeaders({
            sessionKey,
            trackingUserId,
            nativeAppUpdate,
          }),
        },
        body: JSON.stringify({
          text,
          language,
          sessionKey,
          clientMessageId: input.playbackKey,
        }),
      })
      if (!response.ok) return null
      const arrayBuffer = await response.arrayBuffer()
      if (!arrayBuffer || arrayBuffer.byteLength === 0) return null
      return new Blob([arrayBuffer], {
        type: response.headers.get('content-type') || 'audio/mpeg',
      })
    } catch {
      return null
    }
  }, [nativeAppUpdate])

  const {
    utterances,
    liveUtterances,
    partialTranscript,
    volume,
    toggleRecording,
    submitExternalUtterance,
    isActive,
    isReady,
    isConnecting,
    isError,
    usageSec,
    isLimitReached,
    usageLimitSec,
    loadOlderUtterances,
    hasOlderUtterances,
    isStorageHydrated,
    // Demo animation states
    isDemoAnimating,
    demoTypingText,
    demoTypingLang,
    demoTypingTranslations,
  } = useRealtimeSTT({
    languages: selectedLanguages,
    onLimitReached,
    onTtsRequested: handleTtsRequested,
    onTtsAudio: handleTtsAudio,
    onTtsCanceled: handleTtsCanceled,
    enableTts: enableAutoTTS && isSoundEnabled,
    enableAec: aecEnabled,
    sonioxManualFinalizeSilenceMs,
  })
  const isSttSessionRunning = isConnecting || isReady || isActive
  const isSilenceFinalizeSliderDisabled = isSttSessionRunning || isSilenceFinalizeSliderLocked

  const chatBubbleTextClassName = TEXT_SIZE_CLASS_BY_LEVEL[textSizeLevel] || TEXT_SIZE_CLASS_BY_LEVEL[DEFAULT_TEXT_SIZE_LEVEL]
  const textSizePreviewLanguage = selectedLanguages[0] || fallbackLanguages[0] || DEFAULT_STT_LANGUAGES[0] || 'en'
  const textSizePreviewBadgeLabel = textSizePreviewLanguage.trim().replace('_', '-').split('-')[0]?.toUpperCase() || 'EN'
  const textSizePreviewLabel = `Level ${textSizeLevel}`
  const sliderClassName = [
    // iOS-like visual style with larger touch area for drag stability on all platforms.
    'h-12 w-full cursor-pointer touch-none appearance-none bg-transparent py-1.5',
    'accent-[#0A84FF]',
    '[&::-webkit-slider-runnable-track]:h-1.5 [&::-webkit-slider-runnable-track]:appearance-none [&::-webkit-slider-runnable-track]:rounded-full [&::-webkit-slider-runnable-track]:bg-[#D1D1D6]',
    '[&::-webkit-slider-thumb]:-mt-[7px] [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border [&::-webkit-slider-thumb]:border-[#C7C7CC] [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-[0_1px_3px_rgba(0,0,0,0.35)]',
    '[&::-moz-range-track]:h-1.5 [&::-moz-range-track]:appearance-none [&::-moz-range-track]:rounded-full [&::-moz-range-track]:bg-[#D1D1D6]',
    '[&::-moz-range-thumb]:h-5 [&::-moz-range-thumb]:w-5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border [&::-moz-range-thumb]:border-[#C7C7CC] [&::-moz-range-thumb]:bg-white [&::-moz-range-thumb]:shadow-[0_1px_3px_rgba(0,0,0,0.35)]',
  ].join(' ')

  // Boost TTS volume while STT is active to compensate for iOS
  // .playAndRecord audio session reducing speaker output.
  useEffect(() => {
    const gain = ttsGainNodeRef.current
    if (!gain) return
    gain.gain.value = isActive ? TTS_STT_GAIN : 1.0
  }, [isActive])

  useEffect(() => {
    utterancesRef.current = utterances
  }, [utterances])

  // Re-evaluate queue after utterance state commit.
  // This closes the race where inline TTS arrives before translationFinalized state is rendered.
  useEffect(() => {
    if (!enableAutoTTS || !isSoundEnabled) return
    if (isTtsProcessingRef.current) return
    if (ttsQueueRef.current.length === 0) return
    const timerId = window.setTimeout(() => {
      processTtsQueue()
    }, 0)
    return () => {
      window.clearTimeout(timerId)
    }
  }, [enableAutoTTS, isSoundEnabled, processTtsQueue, utterances])



  const primeAudioPlayback = useCallback(async (force = false): Promise<boolean> => {
    if (!force && isAudioPrimedRef.current) return true
    try {
      const player = ensureAudioPlayer()
      // Resume TTS AudioContext if suspended (iOS requires user gesture).
      if (ttsAudioContextRef.current?.state === 'suspended') {
        await ttsAudioContextRef.current.resume()
      }
      // Don't interrupt active TTS playback.
      if (!player.paused && !player.ended) {
        isAudioPrimedRef.current = true
        ttsNeedsUnlockRef.current = false
        return true
      }
      player.src = SILENT_WAV_DATA_URI
      player.volume = 0
      await player.play()
      player.pause()
      player.currentTime = 0
      player.volume = 1
      player.src = ''
      player.load()
      isAudioPrimedRef.current = true
      ttsNeedsUnlockRef.current = false
      return true
    } catch {
      const player = playerAudioRef.current
      if (player) {
        // Ensure failed priming never leaves the shared player muted.
        player.volume = 1
        if (
          player.src === SILENT_WAV_DATA_URI
          || player.src.startsWith('data:audio/wav;base64,')
        ) {
          player.pause()
          player.currentTime = 0
          player.src = ''
          player.load()
        }
      }
      isAudioPrimedRef.current = false
      return false
    }
  }, [ensureAudioPlayer])

  const resumeTtsPlayback = useCallback((withPriming = false) => {
    const hasManualQueueItem = ttsQueueRef.current.some(item => item.mode === 'manual')
    if ((!enableAutoTTS || !isSoundEnabled) && !hasManualQueueItem) return
    const current = playerAudioRef.current
    if (current && !current.ended && current.paused) {
      void current.play().then(() => {
        ttsNeedsUnlockRef.current = false
      }).catch(() => {
        ttsNeedsUnlockRef.current = true
      })
      return
    }

    if (withPriming && ttsNeedsUnlockRef.current) {
      void primeAudioPlayback(true).then((ok) => {
        if (!ok) {
          ttsNeedsUnlockRef.current = true
          return
        }
        ttsNeedsUnlockRef.current = false
        processTtsQueue()
      })
      return
    }

    if (!isTtsProcessingRef.current) {
      processTtsQueue()
    }
  }, [enableAutoTTS, isSoundEnabled, primeAudioPlayback, processTtsQueue])

  const clearStopClickResumeTimers = useCallback(() => {
    if (stopClickResumeTimerIdsRef.current.length === 0) return
    for (const id of stopClickResumeTimerIdsRef.current) {
      window.clearTimeout(id)
    }
    stopClickResumeTimerIdsRef.current = []
  }, [])

  const scheduleTtsResumeAfterStopClick = useCallback(() => {
    if (!enableAutoTTS || !isSoundEnabled) return
    resumeTtsPlayback(true)
    const delays = [140, 420]
    for (const delay of delays) {
      const timerId = window.setTimeout(() => {
        stopClickResumeTimerIdsRef.current = stopClickResumeTimerIdsRef.current.filter(id => id !== timerId)
        resumeTtsPlayback(true)
      }, delay)
      stopClickResumeTimerIdsRef.current.push(timerId)
    }
  }, [enableAutoTTS, isSoundEnabled, resumeTtsPlayback])

  // TTS stop policy:
  // - STT stop path must NOT stop TTS.
  // - native_tts_stop is allowed only for mute/off, force reset, and unmount.
  const forceStopTtsPlayback = useCallback((
    reason: NativeTtsStopReason,
    options?: { clearSpeakingItem?: boolean },
  ) => {
    clearStopClickResumeTimers()
    clearTtsWaitTimer()
    clearNativeTtsEventTimer()
    activeNativeTtsPlaybackIdRef.current = null
    activeNativeTtsUtteranceIdRef.current = null
    ttsQueueRef.current = []
    isTtsProcessingRef.current = false
    ttsNeedsUnlockRef.current = false
    cleanupCurrentAudio()
    if (options?.clearSpeakingItem) {
      setSpeakingItem(null)
    }
    sendNativeTtsStopCommand(reason)
  }, [cleanupCurrentAudio, clearNativeTtsEventTimer, clearStopClickResumeTimers, clearTtsWaitTimer, sendNativeTtsStopCommand])

  // Stop current playback when sound is disabled.
  useEffect(() => {
    if (isSoundEnabled) return
    const timerId = window.setTimeout(() => {
      forceStopTtsPlayback('mute_or_sound_disabled', { clearSpeakingItem: true })
    }, 0)
    return () => window.clearTimeout(timerId)
  }, [forceStopTtsPlayback, isSoundEnabled])

  const prevEnableAutoTTSRef = useRef(enableAutoTTS)
  useEffect(() => {
    const wasEnabled = prevEnableAutoTTSRef.current
    prevEnableAutoTTSRef.current = enableAutoTTS
    if (enableAutoTTS || !wasEnabled) return
    const timerId = window.setTimeout(() => {
      forceStopTtsPlayback('force_reset', { clearSpeakingItem: true })
    }, 0)
    return () => window.clearTimeout(timerId)
  }, [enableAutoTTS, forceStopTtsPlayback])

  const handlePlayBubbleTts = useCallback(async (
    target: BubbleTtsTarget,
    text: string,
  ) => {
    const normalizedText = text.trim()
    if (!normalizedText) return

    const isSameTargetPending = pendingManualTtsTarget?.playbackKey === target.playbackKey
    const isSameTargetSpeaking = speakingItem?.playbackKey === target.playbackKey
    if (isSameTargetPending || isSameTargetSpeaking) {
      manualTtsRequestSeqRef.current += 1
      setPendingManualTtsTarget(null)
      forceStopTtsPlayback('force_reset', { clearSpeakingItem: true })
      return
    }

    manualTtsRequestSeqRef.current += 1
    const requestSeq = manualTtsRequestSeqRef.current
    setPendingManualTtsTarget(target)
    forceStopTtsPlayback('force_reset', { clearSpeakingItem: true })

    // Android WebView autoplay 제한: API 호출(async) 전, 유저 제스처 컨텍스트 안에서 audio를 프라이밍
    if (!isLikelyIOSPlatform()) {
      void primeAudioPlayback()
    }

    const audioBlob = await synthesizeBubbleTtsViaApi({
      playbackKey: target.playbackKey,
      text: normalizedText,
      language: target.language,
    })
    if (manualTtsRequestSeqRef.current !== requestSeq) return

    setPendingManualTtsTarget(null)
    if (!audioBlob) {
      toast.error(ttsActionCopy.playbackFailedLabel)
      return
    }

    ttsQueueRef.current = [{
      playbackKey: target.playbackKey,
      utteranceId: target.utteranceId,
      audioBlob,
      language: target.language,
      kind: target.kind,
      mode: 'manual',
    }]
    processTtsQueue()
  }, [
    forceStopTtsPlayback,
    pendingManualTtsTarget,
    primeAudioPlayback,
    processTtsQueue,
    speakingItem,
    synthesizeBubbleTtsViaApi,
    ttsActionCopy.playbackFailedLabel,
  ])

  const handlePlayOriginalBubbleTts = useCallback((utterance: Utterance) => {
    void handlePlayBubbleTts({
      playbackKey: buildOriginalBubblePlaybackKey(utterance.id, utterance.originalLang),
      utteranceId: utterance.id,
      language: utterance.originalLang,
      kind: 'original',
    }, utterance.originalText)
  }, [handlePlayBubbleTts])

  const handlePlayTranslationBubbleTts = useCallback((utterance: Utterance, language: string, text: string) => {
    void handlePlayBubbleTts({
      playbackKey: buildTranslationBubblePlaybackKey(utterance.id, language),
      utteranceId: utterance.id,
      language,
      kind: 'translation',
    }, text)
  }, [handlePlayBubbleTts])

  useEffect(() => {
    return () => {
      manualTtsRequestSeqRef.current += 1
    }
  }, [])

  useEffect(() => {
    if (!enableAutoTTS) return
    const handleVisibilityChange = () => {
      if (document.hidden) return
      resumeTtsPlayback(false)
    }
    const handlePageShow = () => {
      resumeTtsPlayback(false)
    }
    const handleWindowFocus = () => {
      resumeTtsPlayback(false)
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('pageshow', handlePageShow)
    window.addEventListener('focus', handleWindowFocus)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('pageshow', handlePageShow)
      window.removeEventListener('focus', handleWindowFocus)
    }
  }, [enableAutoTTS, resumeTtsPlayback])

  useEffect(() => {
    const handleUserGesture = () => {
      if (!ttsNeedsUnlockRef.current) return
      resumeTtsPlayback(true)
    }

    window.addEventListener('pointerdown', handleUserGesture, { passive: true })
    window.addEventListener('touchstart', handleUserGesture, { passive: true })
    return () => {
      window.removeEventListener('pointerdown', handleUserGesture)
      window.removeEventListener('touchstart', handleUserGesture)
    }
  }, [resumeTtsPlayback])

  // Keep TTS moving even if a trigger was missed (e.g. race between state commit and inline audio arrival).
  useEffect(() => {
    if (!enableAutoTTS || !isSoundEnabled) return
    const intervalId = window.setInterval(() => {
      if (isTtsProcessingRef.current) return
      if (ttsQueueRef.current.length === 0) return
      processTtsQueue()
    }, 350)
    return () => {
      window.clearInterval(intervalId)
    }
  }, [enableAutoTTS, isSoundEnabled, processTtsQueue])

  useEffect(() => {
    return () => {
      forceStopTtsPlayback('component_unmount')
      ttsAudioContextRef.current?.close()
      ttsAudioContextRef.current = null
      ttsGainNodeRef.current = null
    }
  }, [forceStopTtsPlayback])

  const handleToggleLanguage = useCallback((code: string) => {
    const normalizedCode = canonicalizeSttLanguageCode(code)
    if (!normalizedCode) return
    setSelectedLanguages(prev => {
      if (prev.includes(normalizedCode)) {
        return prev.filter(c => c !== normalizedCode)
      }
      return [...prev, normalizedCode]
    })
  }, [])

  const handleMicPointerDown = useCallback(() => {
    if (!enableAutoTTS || isActive) return
    void primeAudioPlayback()
  }, [enableAutoTTS, isActive, primeAudioPlayback])

  const handleMicClick = useCallback(async () => {
    if (isLimitReached) {
      onLimitReached?.()
      return
    }
    const wasActive = isActive
    // Mic button controls STT only.
    // Prime audio player only when starting STT from idle, not when stopping.
    if (enableAutoTTS && !wasActive) {
      const ok = await primeAudioPlayback()
      if (!ok) {
        ttsNeedsUnlockRef.current = true
      }
    }
    toggleRecording()
    if (wasActive) {
      scheduleTtsResumeAfterStopClick()
    }
  }, [enableAutoTTS, isActive, isLimitReached, onLimitReached, primeAudioPlayback, scheduleTtsResumeAfterStopClick, toggleRecording])

  const handleToggleComposer = useCallback(() => {
    setIsComposerOpen((previous) => {
      const next = !previous
      persistedInputModeRef.current = next ? 'text' : 'voice'
      try {
        localStorage.setItem(LS_KEY_INPUT_MODE, next ? 'text' : 'voice')
      } catch {
        // Ignore local persistence failures and keep in-memory state.
      }
      if (previous) {
        composerTextareaRef.current?.blur()
      }
      return next
    })
  }, [])

  const handleComposerDraftChange = useCallback((event: ChangeEvent<HTMLTextAreaElement>) => {
    const nextDraft = event.target.value
    setComposerDraft(nextDraft)
    persistComposerDraft(nextDraft)
  }, [])

  const handleComposerSubmit = useCallback((event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const nextText = composerDraft.trim()
    if (!nextText) {
      composerTextareaRef.current?.focus({ preventScroll: true })
      return
    }

    const submittedUtteranceId = submitExternalUtterance({
      text: nextText,
      sourceLanguage: 'unknown',
      speaker: composerCopy.manualSpeakerLabel,
    })
    if (!submittedUtteranceId) return
    setComposerDraft('')
    persistComposerDraft('')
  }, [composerCopy.manualSpeakerLabel, composerDraft, submitExternalUtterance])

  useImperativeHandle(ref, () => ({
    startRecording: handleMicClick,
  }), [handleMicClick])

  const chatRef = useRef<HTMLDivElement>(null)
  const shouldAutoScroll = useRef(true)
  const suppressAutoScrollRef = useRef(false)
  const userScrollIntentUntilRef = useRef(0)
  const hasInitialBottomAnchorRef = useRef(false)
  const allowAutoTopPaginationRef = useRef(false)
  const isPaginatingRef = useRef(false)
  const prevScrollHeightRef = useRef<number | null>(null)
  const isLoadingOlderRef = useRef(false)
  const autoScrollSchedulerRef = useRef(createAutoScrollScheduler())
  const scrollUiHideTimerRef = useRef<number | null>(null)
  const [scrollUiVisible, setScrollUiVisible] = useState(false)
  const [scrollDateLabel, setScrollDateLabel] = useState('')
  const [copyToastVisible, setCopyToastVisible] = useState(false)
  const copyToastTimerRef = useRef<number | null>(null)
  const [scrollMetrics, setScrollMetrics] = useState({
    thumbTop: 0,
    thumbHeight: 0,
    clientHeight: 0,
    scrollable: false,
    distanceToBottom: 0,
  })

  const handleLoadOlder = useCallback(() => {
    if (isLoadingOlderRef.current || !hasOlderUtterances || !chatRef.current) return
    isLoadingOlderRef.current = true
    suppressAutoScrollRef.current = true
    shouldAutoScroll.current = false
    isPaginatingRef.current = true
    prevScrollHeightRef.current = chatRef.current.scrollHeight
    loadOlderUtterances()
  }, [hasOlderUtterances, loadOlderUtterances])

  const markUserScrollIntent = useCallback(() => {
    userScrollIntentUntilRef.current = Date.now() + USER_SCROLL_INTENT_WINDOW_MS
  }, [])

  const isUserScrollIntentActive = useCallback(() => {
    return Date.now() <= userScrollIntentUntilRef.current
  }, [])

  const clearScrollUiHideTimer = useCallback(() => {
    if (scrollUiHideTimerRef.current) {
      window.clearTimeout(scrollUiHideTimerRef.current)
      scrollUiHideTimerRef.current = null
    }
  }, [])

  const clearPendingAutoScrollTimer = useCallback(() => {
    autoScrollSchedulerRef.current.cancel()
  }, [])

  const updateScrollDerivedState = useCallback((options?: { fromUserScroll?: boolean }) => {
    if (!chatRef.current) return
    const fromUserScroll = options?.fromUserScroll === true
    const { scrollTop, scrollHeight, clientHeight } = chatRef.current
    const distanceToBottom = Math.max(0, scrollHeight - scrollTop - clientHeight)
    const nextScrollState = deriveScrollAutoFollowState({
      distanceToBottom,
      fromUserScroll,
      suppressAutoScroll: suppressAutoScrollRef.current,
      isPaginating: isPaginatingRef.current,
      isLoadingOlder: isLoadingOlderRef.current,
      nearBottomThresholdPx: AUTO_SCROLL_BOTTOM_THRESHOLD_PX,
    })
    suppressAutoScrollRef.current = nextScrollState.suppressAutoScroll
    shouldAutoScroll.current = nextScrollState.shouldAutoScroll

    if (scrollHeight > clientHeight + 1) {
      const thumbHeight = Math.max(
        SCROLLBAR_MIN_THUMB_HEIGHT_PX,
        Math.round((clientHeight / scrollHeight) * clientHeight),
      )
      const maxThumbTop = Math.max(0, clientHeight - thumbHeight)
      const denominator = scrollHeight - clientHeight
      const ratio = denominator > 0 ? Math.min(1, Math.max(0, scrollTop / denominator)) : 0
      const thumbTop = ratio * maxThumbTop
      setScrollMetrics({
        thumbTop,
        thumbHeight,
        clientHeight,
        scrollable: true,
        distanceToBottom,
      })
    } else {
      setScrollMetrics({
        thumbTop: 0,
        thumbHeight: 0,
        clientHeight,
        scrollable: false,
        distanceToBottom,
      })
    }

    setScrollDateLabel(findTopVisibleUtteranceDateLabel(chatRef.current, uiLocale))

    if (
      allowAutoTopPaginationRef.current
      && scrollTop < 100
      && hasOlderUtterances
      && !isLoadingOlderRef.current
    ) {
      handleLoadOlder()
    }
  }, [hasOlderUtterances, handleLoadOlder, uiLocale])

  const handleScroll = useCallback(() => {
    const fromUserScroll = isUserScrollIntentActive()
    updateScrollDerivedState({ fromUserScroll })

    if (fromUserScroll && (!shouldAutoScroll.current || suppressAutoScrollRef.current)) {
      clearPendingAutoScrollTimer()
    }

    const scrollUi = deriveScrollUiVisibility({
      fromUserScroll,
      shouldAutoScroll: shouldAutoScroll.current,
    })

    if (!scrollUi.visible) {
      clearScrollUiHideTimer()
      setScrollUiVisible(false)
      return
    }

    setScrollUiVisible(true)
    clearScrollUiHideTimer()
    if (scrollUi.scheduleHideTimer) {
      scrollUiHideTimerRef.current = window.setTimeout(() => {
        setScrollUiVisible(false)
      }, SCROLL_UI_HIDE_DELAY_MS)
    }
  }, [clearPendingAutoScrollTimer, clearScrollUiHideTimer, isUserScrollIntentActive, updateScrollDerivedState])

  const handleScrollToBottom = useCallback(() => {
    if (!chatRef.current) return
    markUserScrollIntent()
    clearPendingAutoScrollTimer()
    suppressAutoScrollRef.current = false
    shouldAutoScroll.current = true
    chatRef.current.scrollTo({ top: chatRef.current.scrollHeight, behavior: 'smooth' })
    autoScrollSchedulerRef.current.markPerformed()
    updateScrollDerivedState({ fromUserScroll: true })
  }, [clearPendingAutoScrollTimer, markUserScrollIntent, updateScrollDerivedState])

  const handleTopSafeAreaTap = useCallback(() => {
    if (!chatRef.current) return
    markUserScrollIntent()
    clearPendingAutoScrollTimer()
    suppressAutoScrollRef.current = true
    shouldAutoScroll.current = false
    chatRef.current.scrollTo({ top: 0, behavior: 'smooth' })
    updateScrollDerivedState({ fromUserScroll: true })
  }, [clearPendingAutoScrollTimer, markUserScrollIntent, updateScrollDerivedState])

  const handleNativeAppUpdatePress = useCallback(() => {
    const updateUrl = nativeAppUpdate?.updateUrl?.trim() || ''
    if (!updateUrl) return

    closeMenuPanel()

    const command: NativeOpenUpdateStoreCommand = {
      type: 'native_open_update_store',
      payload: { updateUrl },
    }

    if (isNativeApp()) {
      try {
        window.ReactNativeWebView?.postMessage(JSON.stringify(command))
        return
      } catch {
        // Fall back to browser navigation if the bridge errors.
      }
    }

    window.location.href = updateUrl
  }, [closeMenuPanel, nativeAppUpdate?.updateUrl])

  useEffect(() => {
    if (!isNativeApp()) return

    const cachedBannerLayout = readCachedNativeUiBannerLayout(window)
    if (cachedBannerLayout) {
      setNativeBannerLayout(cachedBannerLayout)
    }

    const handleNativeUiEvent = (event: Event) => {
      const detail = (event as CustomEvent<unknown>).detail
      const bannerLayout = parseNativeUiBannerLayoutDetail(detail)
      if (bannerLayout) {
        setNativeBannerLayout(bannerLayout)
        return
      }

      const scrollToTop = parseNativeUiScrollToTopDetail(detail)
      if (!scrollToTop) return
      handleTopSafeAreaTap()
    }

    window.addEventListener(NATIVE_UI_EVENT, handleNativeUiEvent as EventListener)
    return () => {
      window.removeEventListener(NATIVE_UI_EVENT, handleNativeUiEvent as EventListener)
    }
  }, [handleTopSafeAreaTap])

  const nativeAppUpdateStatus = nativeAppUpdate || DEFAULT_NATIVE_APP_UPDATE_DETAIL
  const nativeAppInstalledVersion = nativeAppUpdateStatus.clientVersion || nativeAppUpdateCopy.unknownVersionLabel
  const nativeAppLatestVersion = nativeAppUpdateStatus.latestVersion || ''
  const nativeAppUpdateStatusMessage = nativeAppUpdateStatus.status === 'checking'
    ? nativeAppUpdateCopy.checkingMessage
    : nativeAppUpdateStatus.status === 'available'
      ? nativeAppUpdateCopy.availableMessage
      : nativeAppUpdateStatus.status === 'current'
        ? nativeAppUpdateCopy.currentMessage
        : nativeAppUpdateCopy.unknownMessage
  const showNativeAppUpdateAction = nativeAppUpdateStatus.updateAvailable && Boolean(nativeAppUpdateStatus.updateUrl)

  // Wait for stored conversation hydration, then pin to the latest messages once.
  // This prevents initial top-pagination from running before we settle at bottom.
  useLayoutEffect(() => {
    if (!chatRef.current || hasInitialBottomAnchorRef.current || !isStorageHydrated) return
    const node = chatRef.current
    if (utterances.length > 0) {
      node.scrollTop = node.scrollHeight
      shouldAutoScroll.current = true
      suppressAutoScrollRef.current = false
      autoScrollSchedulerRef.current.markPerformed()
    }
    hasInitialBottomAnchorRef.current = true

    const rafId = window.requestAnimationFrame(() => {
      allowAutoTopPaginationRef.current = true
      updateScrollDerivedState()
    })

    return () => window.cancelAnimationFrame(rafId)
  }, [isStorageHydrated, updateScrollDerivedState, utterances.length])

  // Preserve scroll position after prepending older utterances
  useLayoutEffect(() => {
    if (!isPaginatingRef.current || prevScrollHeightRef.current === null || !chatRef.current) return
    const delta = chatRef.current.scrollHeight - prevScrollHeightRef.current
    chatRef.current.scrollTop += delta
    prevScrollHeightRef.current = null
    isPaginatingRef.current = false
    isLoadingOlderRef.current = false
    updateScrollDerivedState()
  }, [updateScrollDerivedState, utterances])

  const executeAutoScrollIfEligible = useCallback(() => {
    updateScrollDerivedState()

    if (
      !chatRef.current
      || !shouldAutoScroll.current
      || suppressAutoScrollRef.current
      || isPaginatingRef.current
      || isLoadingOlderRef.current
    ) {
      return false
    }

    const targetTop = chatRef.current.scrollHeight
    if (Math.abs(targetTop - chatRef.current.scrollTop) <= 1) return false

    chatRef.current.scrollTo({ top: targetTop, behavior: 'smooth' })
    updateScrollDerivedState()
    return true
  }, [updateScrollDerivedState])

  useEffect(() => {
    updateScrollDerivedState()
    autoScrollSchedulerRef.current.update({
      shouldAutoScroll: () => (
        !!chatRef.current
        && shouldAutoScroll.current
        && !suppressAutoScrollRef.current
        && !isPaginatingRef.current
        && !isLoadingOlderRef.current
      ),
      runAutoScroll: executeAutoScrollIfEligible,
    })

    return () => {
      clearPendingAutoScrollTimer()
    }
  }, [
    clearPendingAutoScrollTimer,
    demoTypingText,
    executeAutoScrollIfEligible,
    isConnecting,
    liveUtterances,
    updateScrollDerivedState,
    utterances,
  ])

  useEffect(() => {
    updateScrollDerivedState()
  }, [updateScrollDerivedState])

  useEffect(() => {
    const handleCopySuccess = () => {
      if (copyToastTimerRef.current) clearTimeout(copyToastTimerRef.current)
      setCopyToastVisible(true)
      copyToastTimerRef.current = window.setTimeout(() => {
        setCopyToastVisible(false)
      }, 1500)
    }
    window.addEventListener(COPY_SUCCESS_EVENT, handleCopySuccess)
    return () => {
      window.removeEventListener(COPY_SUCCESS_EVENT, handleCopySuccess)
      if (copyToastTimerRef.current) clearTimeout(copyToastTimerRef.current)
    }
  }, [])

  useEffect(() => {
    return () => {
      clearPendingAutoScrollTimer()
      clearScrollUiHideTimer()
    }
  }, [clearPendingAutoScrollTimer, clearScrollUiHideTimer])

  const showRipple = isReady && volume > VOLUME_THRESHOLD
  const rippleScale = showRipple ? 1 + (volume - VOLUME_THRESHOLD) * 5 : 1

  const committedUtteranceIds = useMemo(
    () => new Set(utterances.map((utterance) => utterance.id)),
    [utterances],
  )
  const draftUtteranceIds = useMemo(() => new Set(
    liveUtterances
      .filter((utterance) => !committedUtteranceIds.has(utterance.id))
      .map((utterance) => utterance.id),
  ), [committedUtteranceIds, liveUtterances])
  const displayUtterances = useMemo(() => mergeDisplayUtterances({
    utterances,
    liveUtterances,
  }), [liveUtterances, utterances])

  const isUsageLimited = typeof usageLimitSec === 'number'
  const remainingSec = isUsageLimited
    ? Math.max(0, usageLimitSec - usageSec)
    : null
  const usagePercent = isUsageLimited
    ? Math.min(100, (usageSec / usageLimitSec) * 100)
    : null
  const showScrollToBottom = scrollMetrics.distanceToBottom > SCROLL_TO_BOTTOM_BUTTON_THRESHOLD_PX
  const scrollDateTop = Math.max(
    16,
    Math.min(
      scrollMetrics.clientHeight - 16,
      scrollMetrics.thumbTop + (scrollMetrics.thumbHeight / 2),
    ),
  )
  const navSurfaceClassName = 'bg-white'
  const viewportWidthPx = useViewportWidthPx()
  const isCenteredMenuLayout = viewportWidthPx >= 640
  const nativeTopInsetPxFromQuery = useNativeInsetPx('nativeTopInsetPx')
  const nativeBottomInsetPxFromQuery = useNativeInsetPx('nativeBottomInsetPx')
  const nativeTopInsetPx = nativeBannerLayout?.topInsetPx ?? nativeTopInsetPxFromQuery
  const nativeBottomInsetPx = nativeBannerLayout?.bottomInsetPx ?? nativeBottomInsetPxFromQuery
  const estimatedNativeBannerInsetPx = resolveEstimatedNativeBannerInsetPx(viewportWidthPx)
  const effectiveNativeTopInsetPx = isNativeAppRuntime && displayedAdBannerPosition === 'top'
    ? Math.max(nativeTopInsetPx, estimatedNativeBannerInsetPx)
    : nativeTopInsetPx
  const effectiveNativeBottomContentInsetPx = isNativeAppRuntime && displayedAdBannerPosition === 'bottom'
    ? Math.max(nativeBottomInsetPx, estimatedNativeBannerInsetPx)
    : nativeBottomInsetPx
  const activeKeyboardInsetPx = isComposerOpen ? keyboardViewportInsetPx : 0
  const visibleNativeBottomBannerReservePx = isNativeAppRuntime && displayedAdBannerPosition === 'bottom'
    ? (
      !isLikelyIOSPlatform() || activeKeyboardInsetPx <= 0
        ? effectiveNativeBottomContentInsetPx
        : 0
    )
    : 0
  const scrollToBottomButtonReservedPx = 0
  const scrollToBottomButtonBottomPx = SCROLL_TO_BOTTOM_BUTTON_BOTTOM_PX + scrollToBottomButtonReservedPx
  const copyToastBottomOffsetPx = scrollToBottomButtonBottomPx + SCROLL_TO_BOTTOM_BUTTON_SIZE_PX + 12
  const chatPaddingTop = effectiveNativeTopInsetPx > 0 ? `calc(0.625rem + ${effectiveNativeTopInsetPx}px)` : '0.625rem'
  const chatPaddingBottom = '0.625rem'
  const showEmptyState = utterances.length === 0
    && liveUtterances.length === 0
    && !partialTranscript
    && !demoTypingText
    && !demoTypingLang
    && !isDemoAnimating
    && !isActive
    && !isError
    && !isLimitReached
  const bottomBarPaddingBottom = `max(calc(env(safe-area-inset-bottom) + ${16 + activeKeyboardInsetPx + visibleNativeBottomBannerReservePx}px), ${20 + activeKeyboardInsetPx + visibleNativeBottomBannerReservePx}px)`
  const composerCanSend = composerDraft.trim().length > 0
  // Hidden by default to avoid exposing account actions in demo/review builds.
  const showAccountMenuItems = showAccountActions && process.env.NEXT_PUBLIC_ENABLE_ACCOUNT_MENU_ACTIONS === 'true'
  const handleSilenceFinalizeLockedInteraction = useCallback(() => {
    const now = Date.now()
    if (now - silenceSliderUpgradeToastLastShownAtRef.current < SILENCE_SLIDER_UPGRADE_TOAST_COOLDOWN_MS) return
    silenceSliderUpgradeToastLastShownAtRef.current = now
    toast(silenceFinalizeLockedMessage)
  }, [silenceFinalizeLockedMessage])

  return (
    <PhoneFrame>
      <div className="relative flex h-full min-h-0 flex-col overflow-hidden">

        {/* Header */}
        <div
          className={`relative z-40 shrink-0 flex items-center justify-between ${navSurfaceClassName}`}
          style={{
            paddingTop: "max(calc(env(safe-area-inset-top) + 20px), 24px)",
            paddingBottom: "10px",
            paddingLeft: "max(calc(env(safe-area-inset-left) + 14px), 18px)",
            paddingRight: "max(calc(env(safe-area-inset-right) + 14px), 18px)",
          }}
        >
          {isIosTopTapEnabled && (
            <button
              type="button"
              aria-label="Scroll to top"
              onClick={handleTopSafeAreaTap}
              className="absolute inset-x-0 top-0 z-10 bg-transparent"
              style={{ height: "max(env(safe-area-inset-top), 20px)" }}
            />
          )}
          <span className="relative z-20 text-[2.05rem] font-extrabold leading-[1.08] bg-gradient-to-r from-amber-500 to-orange-500 bg-clip-text text-transparent">
            Mingle
          </span>
          <div className="relative z-20 flex items-center gap-1">
            <div className="relative mr-1.5">
              <button
                ref={langSelectorButtonRef}
                type="button"
                onClick={() => {
                  closeMenuPanel()
                  setLangSelectorOpen(o => !o)
                }}
                aria-haspopup="menu"
                aria-expanded={langSelectorOpen}
                className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 py-1 text-gray-700 transition-colors"
                style={{ backgroundColor: '#ffffff' }}
              >
                {selectedLanguages.map((lang) => (
                  <span
                    key={lang}
                    className="text-[1.35rem]"
                    title={lang.toUpperCase()}
                  >
                    {getSttLanguageFlag(lang)}
                  </span>
                ))}
                <ChevronDown
                  size={14}
                  strokeWidth={2.4}
                  className={`shrink-0 text-black transition-transform ${
                    langSelectorOpen ? 'rotate-180' : ''
                  }`}
                />
              </button>
              <LanguageSelector
                isOpen={langSelectorOpen}
                onClose={() => setLangSelectorOpen(false)}
                selectedLanguages={selectedLanguages}
                onToggleLanguage={handleToggleLanguage}
                uiLocale={uiLocale}
                triggerRef={langSelectorButtonRef}
              />
            </div>
            {showMenuButton ? (
              <div className="relative">
                <button
                  ref={menuButtonRef}
                  type="button"
                  onClick={handleMenuButtonPress}
                  disabled={isAuthActionPending}
                  className={`inline-flex h-11 min-w-[44px] items-center justify-center px-2 text-gray-700 transition-colors hover:text-gray-900 active:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 disabled:cursor-not-allowed disabled:opacity-60 ${navSurfaceClassName}`}
                  aria-label={menuLabel}
                  aria-haspopup="dialog"
                  aria-expanded={menuOpen}
                >
                  <Menu size={16} strokeWidth={2} />
                </button>
              </div>
            ) : null}
          </div>
        </div>

        <AnimatePresence
          onExitComplete={() => {
            setMenuDragOffsetX(0)
            setIsMenuDragging(false)
            if (!deleteAccountDialogOpen) {
              try {
                menuButtonRef.current?.focus({ preventScroll: true })
              } catch {
                menuButtonRef.current?.focus()
              }
            }
          }}
        >
          {menuOpen && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.22, ease: 'easeOut' }}
              className="absolute inset-0 z-50 overflow-hidden bg-black/42"
              onClick={requestCloseMenuPanel}
            >
              <div className="flex h-full w-full justify-end sm:justify-center">
                <motion.div
                  ref={menuPanelRef}
                  role="dialog"
                  aria-modal="true"
                  aria-label={menuLabel}
                  tabIndex={-1}
                  initial={{ x: '100%' }}
                  animate={{ x: isMenuDragging ? menuDragOffsetX : 0 }}
                  exit={{ x: '100%' }}
                  transition={
                    isMenuDragging
                      ? { duration: 0 }
                      : { duration: 0.28, ease: [0.22, 1, 0.36, 1] }
                  }
                  onClick={(event) => event.stopPropagation()}
                  onPointerDown={handleMenuPanelPointerDown}
                  onPointerMove={handleMenuPanelPointerMove}
                  onPointerUp={handleMenuPanelPointerUp}
                  onPointerCancel={handleMenuPanelPointerCancel}
                  className={`relative flex h-full w-full flex-col overflow-hidden will-change-transform ${navSurfaceClassName} sm:max-w-[400px] sm:border-x sm:border-gray-200`}
                  style={{
                    boxShadow: isCenteredMenuLayout
                      ? '0 22px 64px rgba(15, 23, 42, 0.24)'
                      : '-18px 0 40px rgba(15, 23, 42, 0.22)',
                    touchAction: 'pan-y',
                  }}
                >
                  <motion.div
                    initial={false}
                    animate={{ x: menuScreen === 'feedback' ? '-50%' : '0%' }}
                    transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
                    className="flex h-full w-[200%]"
                  >
                    <section className="flex h-full w-1/2 min-w-0 flex-col bg-white">
                      <div
                        className="flex shrink-0 items-center border-b border-gray-200 px-4"
                        style={{
                          paddingTop: 'max(calc(env(safe-area-inset-top) + 10px), 16px)',
                          paddingBottom: '12px',
                        }}
                      >
                        <button
                          type="button"
                          aria-label={feedbackCopy.closeButtonLabel}
                          onClick={requestMenuBackStep}
                          className="inline-flex h-10 w-10 items-center justify-center rounded-full text-gray-700 transition hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
                        >
                          <ChevronLeft size={22} strokeWidth={2.2} />
                        </button>
                        <div className="flex-1 text-center text-[1rem] font-semibold text-gray-950">
                          {menuLabel}
                        </div>
                        <div className="w-10" />
                      </div>

                      <div
                        className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
                        style={{
                          paddingBottom: showAccountMenuItems ? '16px' : 'max(calc(env(safe-area-inset-bottom) + 16px), 20px)',
                        }}
                      >
                        <div className="px-4 py-4">
                          <div className="space-y-4">
                            <div className="block">
                              <div className="mb-1 flex items-start justify-between gap-3 text-[0.8125rem] leading-[1.05] text-gray-700">
                                <span className="min-w-0 flex-1 pt-2 font-semibold">{textSizeLabel}</span>
                                <div ref={textSizeDropdownRef} className="relative flex h-12 max-w-[68%] shrink-0 items-center">
                                  <button
                                    ref={textSizeButtonRef}
                                    type="button"
                                    onClick={() => {
                                      setTranslationModelMenuOpen(false)
                                      setTextSizeMenuOpen((open) => !open)
                                    }}
                                    aria-label={textSizeLabel}
                                    aria-haspopup="listbox"
                                    aria-expanded={textSizeMenuOpen}
                                    aria-controls={textSizeListboxId}
                                    className="group flex h-full min-w-[180px] items-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/80"
                                  >
                                    <div className="flex h-full w-full items-center rounded-2xl border border-gray-200 bg-white px-3.5 py-2 shadow-sm transition duration-200 group-hover:border-gray-300 group-hover:shadow-[0_10px_24px_rgba(15,23,42,0.08)]">
                                      <p
                                        style={{ lineHeight: LIVE_CHAT_BUBBLE_TEXT_LINE_HEIGHT }}
                                        className={`${chatBubbleTextClassName} min-w-0 flex-1 truncate font-normal text-gray-900`}
                                      >
                                        <span className="mr-1.5 inline-flex items-center gap-1 whitespace-nowrap align-middle rounded-full px-1 py-0.5 text-gray-400">
                                          <span className="text-base leading-none">{getSttLanguageFlag(textSizePreviewLanguage)}</span>
                                          <span className="text-[11px] font-semibold uppercase leading-none">
                                            {textSizePreviewBadgeLabel}
                                          </span>
                                        </span>
                                        <span className="align-middle">{textSizePreviewLabel}</span>
                                      </p>
                                      <span className="ml-2 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-gray-400 transition-colors duration-200 group-hover:text-amber-600">
                                        <ChevronDown
                                          size={14}
                                          strokeWidth={2.3}
                                          className={`transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
                                            textSizeMenuOpen ? 'rotate-180' : 'rotate-0'
                                          }`}
                                        />
                                      </span>
                                    </div>
                                  </button>
                                  <AnimatePresence initial={false}>
                                    {textSizeMenuOpen && (
                                      <motion.div
                                        initial={{ opacity: 0, y: -8, scale: 0.98 }}
                                        animate={{ opacity: 1, y: 0, scale: 1 }}
                                        exit={{ opacity: 0, y: -6, scale: 0.985 }}
                                        transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                                        className="absolute right-0 top-[calc(100%+0.6rem)] z-30 w-[220px] overflow-hidden rounded-[1.35rem] border border-gray-200/90 bg-white/95 shadow-[0_22px_48px_rgba(15,23,42,0.16)] backdrop-blur-sm"
                                      >
                                        <motion.div
                                          initial={{ opacity: 0, height: 0 }}
                                          animate={{ opacity: 1, height: 'auto' }}
                                          exit={{ opacity: 0, height: 0 }}
                                          transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                                          className="overflow-hidden"
                                        >
                                          <div
                                            id={textSizeListboxId}
                                            role="listbox"
                                            aria-label={textSizeLabel}
                                            className="space-y-1.5 p-2.5"
                                          >
                                            {TEXT_SIZE_LEVEL_OPTIONS.map((option) => {
                                              const isSelected = option === textSizeLevel
                                              const optionTextClassName = TEXT_SIZE_CLASS_BY_LEVEL[option] || TEXT_SIZE_CLASS_BY_LEVEL[DEFAULT_TEXT_SIZE_LEVEL]

                                              return (
                                                <button
                                                  key={option}
                                                  type="button"
                                                  role="option"
                                                  aria-selected={isSelected}
                                                  onClick={() => handleTextSizeLevelSelect(option)}
                                                  className={`group flex w-full items-center gap-3 rounded-[1rem] px-3 py-3 text-left transition duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/80 ${
                                                    isSelected
                                                      ? 'bg-gradient-to-r from-amber-50 via-orange-50 to-amber-50 text-gray-950 shadow-[inset_0_0_0_1px_rgba(251,191,36,0.35)]'
                                                      : 'bg-white text-gray-800 hover:bg-gray-50'
                                                  }`}
                                                >
                                                  <div className="min-w-0 flex-1">
                                                    <p
                                                      style={{ lineHeight: LIVE_CHAT_BUBBLE_TEXT_LINE_HEIGHT }}
                                                      className={`${optionTextClassName} truncate font-normal text-gray-900`}
                                                    >
                                                      <span className="mr-1.5 inline-flex items-center gap-1 whitespace-nowrap align-middle rounded-full px-1 py-0.5 text-gray-400">
                                                        <span className="text-base leading-none">{getSttLanguageFlag(textSizePreviewLanguage)}</span>
                                                        <span className="text-[11px] font-semibold uppercase leading-none">
                                                          {textSizePreviewBadgeLabel}
                                                        </span>
                                                      </span>
                                                      <span className="align-middle">{`Level ${option}`}</span>
                                                    </p>
                                                  </div>
                                                  <span
                                                    className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full transition-all duration-200 ${
                                                      isSelected
                                                        ? 'scale-100 bg-amber-500 text-white shadow-[0_6px_14px_rgba(245,158,11,0.28)]'
                                                        : 'scale-95 bg-gray-100 text-transparent group-hover:bg-amber-100 group-hover:text-amber-500'
                                                    }`}
                                                  >
                                                    <Check size={14} strokeWidth={2.6} />
                                                  </span>
                                                </button>
                                              )
                                            })}
                                          </div>
                                        </motion.div>
                                      </motion.div>
                                    )}
                                  </AnimatePresence>
                                </div>
                              </div>
                            </div>

                            <label className="block">
                              <div
                                className={`mb-0 flex items-start gap-3 text-[0.8125rem] font-semibold leading-[1.05] transition-colors ${
                                  isSilenceFinalizeSliderDisabled ? 'text-gray-400' : 'text-gray-700'
                                }`}
                              >
                                <span className="min-w-0 flex-1 whitespace-normal break-words leading-[1.1]">
                                  {silenceFinalizeLabel}
                                </span>
                                <span className="shrink-0 whitespace-nowrap">{sonioxManualFinalizeSilenceMs}ms</span>
                              </div>
                              <div className="relative">
                                <input
                                  type="range"
                                  min={MIN_SONIOX_SILENCE_MS}
                                  max={MAX_SONIOX_SILENCE_MS}
                                  step={100}
                                  value={sonioxManualFinalizeSilenceMs}
                                  disabled={isSilenceFinalizeSliderDisabled}
                                  onPointerDown={(event) => {
                                    if (isSilenceFinalizeSliderDisabled) return
                                    event.currentTarget.setPointerCapture(event.pointerId)
                                    const next = deriveRangeValueFromPointer(
                                      event,
                                      MIN_SONIOX_SILENCE_MS,
                                      MAX_SONIOX_SILENCE_MS,
                                      100,
                                    )
                                    setSonioxManualFinalizeSilenceMs(next)
                                  }}
                                  onPointerMove={(event) => {
                                    if (isSilenceFinalizeSliderDisabled) return
                                    if (event.buttons !== 1) return
                                    const next = deriveRangeValueFromPointer(
                                      event,
                                      MIN_SONIOX_SILENCE_MS,
                                      MAX_SONIOX_SILENCE_MS,
                                      100,
                                    )
                                    setSonioxManualFinalizeSilenceMs(next)
                                  }}
                                  onPointerUp={(event) => {
                                    if (isSilenceFinalizeSliderDisabled) return
                                    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                                      event.currentTarget.releasePointerCapture(event.pointerId)
                                    }
                                    flushAccountPreferencesSync()
                                  }}
                                  onChange={(event) => {
                                    if (isSilenceFinalizeSliderDisabled) return
                                    const next = Math.max(
                                      MIN_SONIOX_SILENCE_MS,
                                      Math.min(MAX_SONIOX_SILENCE_MS, Number(event.target.value) || DEFAULT_SONIOX_SILENCE_MS),
                                    )
                                    setSonioxManualFinalizeSilenceMs(next)
                                  }}
                                  className={`${sliderClassName} -mt-1 ${isSilenceFinalizeSliderDisabled ? 'pointer-events-none cursor-not-allowed opacity-40' : ''}`}
                                  aria-label={`${silenceFinalizeLabel} milliseconds`}
                                />
                                {isSilenceFinalizeSliderLocked && (
                                  <>
                                    <span id={silenceFinalizeLockedDescriptionId} className="sr-only">
                                      {silenceFinalizeLockedMessage}
                                    </span>
                                    <button
                                      type="button"
                                      aria-label={silenceFinalizeLockedButtonLabel}
                                      aria-describedby={silenceFinalizeLockedDescriptionId}
                                      onFocus={handleSilenceFinalizeLockedInteraction}
                                      onClick={handleSilenceFinalizeLockedInteraction}
                                      className="absolute inset-0 z-10 cursor-not-allowed rounded-full bg-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
                                    />
                                  </>
                                )}
                              </div>
                            </label>

                            <div className="block">
                              <div className="mb-1 flex items-start justify-between gap-3 text-[0.8125rem] leading-[1.05] text-gray-700">
                                <span className="min-w-0 flex-1 pt-1.5 font-semibold">{translationModelLabel}</span>
                                <div ref={translationModelDropdownRef} className="relative flex h-10 min-w-[220px] max-w-[68%] shrink-0 items-center">
                                <button
                                  ref={translationModelButtonRef}
                                  type="button"
                                  onClick={() => {
                                    setTextSizeMenuOpen(false)
                                    setTranslationModelMenuOpen((open) => !open)
                                  }}
                                  aria-label={translationModelLabel}
                                  aria-haspopup="listbox"
                                  aria-expanded={translationModelMenuOpen}
                                  aria-controls={translationModelListboxId}
                                  className="group relative flex h-full w-full items-center overflow-hidden rounded-[1.35rem] border border-[#E5E7EB] bg-gradient-to-r from-white via-white to-[#F8FAFC] px-3.5 text-left shadow-[0_10px_24px_rgba(15,23,42,0.06)] transition duration-200 hover:border-[#D1D5DB] hover:shadow-[0_14px_30px_rgba(15,23,42,0.10)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/80"
                                >
                                  <div className="min-w-0 flex-1 text-center">
                                    <div className="truncate text-[0.95rem] font-semibold text-gray-900">
                                      {selectedTranslationModelOption.label}
                                    </div>
                                  </div>
                                  <span
                                    className={`ml-2 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full transition-colors duration-200 ${
                                      translationModelMenuOpen
                                        ? 'bg-transparent text-amber-700'
                                        : 'bg-transparent text-gray-500 group-hover:text-amber-600'
                                    }`}
                                  >
                                    <ChevronDown
                                      size={16}
                                      strokeWidth={2.3}
                                      className={`transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
                                        translationModelMenuOpen ? 'rotate-180' : 'rotate-0'
                                      }`}
                                    />
                                  </span>
                                </button>
                                <AnimatePresence initial={false}>
                                  {translationModelMenuOpen && (
                                    <motion.div
                                      initial={{ opacity: 0, y: -8, scale: 0.98 }}
                                      animate={{ opacity: 1, y: 0, scale: 1 }}
                                      exit={{ opacity: 0, y: -6, scale: 0.985 }}
                                      transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                                      className="absolute right-0 top-[calc(100%+0.6rem)] z-30 w-[240px] overflow-hidden rounded-[1.35rem] border border-gray-200/90 bg-white/95 shadow-[0_22px_48px_rgba(15,23,42,0.16)] backdrop-blur-sm"
                                    >
                                      <motion.div
                                        initial={{ opacity: 0, height: 0 }}
                                        animate={{ opacity: 1, height: 'auto' }}
                                        exit={{ opacity: 0, height: 0 }}
                                        transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                                        className="overflow-hidden"
                                      >
                                        <div
                                          id={translationModelListboxId}
                                          role="listbox"
                                          aria-label={translationModelLabel}
                                          className="space-y-1.5 p-2.5"
                                        >
                                          {TRANSLATION_MODEL_OPTIONS.map((option) => {
                                            const isSelected = option.value === translationModel

                                            return (
                                              <button
                                                key={option.value}
                                                type="button"
                                                role="option"
                                                aria-selected={isSelected}
                                                onClick={() => handleTranslationModelSelect(option.value)}
                                                className={`group flex w-full items-center gap-3 rounded-[1rem] px-3 py-3 text-left transition duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/80 ${
                                                  isSelected
                                                    ? 'bg-gradient-to-r from-amber-50 via-orange-50 to-amber-50 text-gray-950 shadow-[inset_0_0_0_1px_rgba(251,191,36,0.35)]'
                                                    : 'bg-white text-gray-800 hover:bg-gray-50'
                                                }`}
                                              >
                                                <div className="min-w-0 flex-1 text-center">
                                                  <div className="truncate text-[0.94rem] font-semibold">
                                                    {option.label}
                                                  </div>
                                                </div>
                                                <span
                                                  className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full transition-all duration-200 ${
                                                    isSelected
                                                      ? 'scale-100 bg-amber-500 text-white shadow-[0_6px_14px_rgba(245,158,11,0.28)]'
                                                      : 'scale-95 bg-gray-100 text-transparent group-hover:bg-amber-100 group-hover:text-amber-500'
                                                  }`}
                                                >
                                                  <Check size={14} strokeWidth={2.6} />
                                                </span>
                                              </button>
                                            )
                                          })}
                                        </div>
                                      </motion.div>
                                    </motion.div>
                                  )}
                                </AnimatePresence>
                                </div>
                              </div>
                            </div>

                            {isNativeAppRuntime && (
                              <div className="block">
                                <div className="mb-2 flex items-center justify-between gap-3 text-[0.8125rem] font-semibold text-gray-700">
                                  <span className="shrink-0 whitespace-nowrap">{adBannerPositionLabel}</span>
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                  {([
                                    { value: 'top', label: adBannerPositionTopLabel },
                                    { value: 'bottom', label: adBannerPositionBottomLabel },
                                  ] satisfies Array<{ value: LivePhoneDemoAdBannerPosition, label: string }>).map((option) => {
                                    const isSelected = displayedAdBannerPosition === option.value

                                    return (
                                      <button
                                        key={option.value}
                                        type="button"
                                        aria-pressed={isSelected}
                                        onClick={() => handleAdBannerPositionSelect(option.value)}
                                        className={`flex h-11 items-center justify-center rounded-2xl border text-[0.92rem] font-semibold transition duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/80 ${
                                          isSelected
                                            ? 'border-amber-300 bg-gradient-to-r from-amber-50 via-orange-50 to-amber-50 text-amber-900 shadow-[inset_0_0_0_1px_rgba(251,191,36,0.3)]'
                                            : 'border-[#E5E7EB] bg-white text-gray-700 hover:border-[#D1D5DB] hover:bg-gray-50'
                                        }`}
                                      >
                                        {option.label}
                                      </button>
                                    )
                                  })}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="px-4 pb-4">
                          <button
                            type="button"
                            onClick={handleFeedbackMenuItemPress}
                            className="flex w-full items-center justify-between gap-3 rounded-xl px-1 py-3 text-left text-[0.98rem] font-medium text-gray-900 transition-colors hover:text-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-300"
                          >
                            <span className="min-w-0 flex-1">{feedbackCopy.feedbackMenuItemLabel}</span>
                            <span className="shrink-0 text-gray-500">
                              <ChevronRight size={18} strokeWidth={2.4} />
                            </span>
                          </button>
                        </div>

                        {isNativeAppRuntime && (
                          <div className="px-4 py-4">
                            <div className="rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 via-white to-orange-50 px-3 py-3">
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0 flex-1">
                                  <div className="text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-amber-700">
                                    {nativeAppUpdateCopy.sectionLabel}
                                  </div>
                                  <div className="mt-2 text-sm font-semibold text-gray-900">
                                    {nativeAppUpdateCopy.installedLabel} {nativeAppInstalledVersion}
                                  </div>
                                  {nativeAppLatestVersion ? (
                                    <div className="mt-1 text-xs font-medium text-gray-600">
                                      {nativeAppUpdateCopy.latestLabel} {nativeAppLatestVersion}
                                    </div>
                                  ) : null}
                                  <div className="mt-2 text-xs leading-5 text-gray-600">
                                    {nativeAppUpdateStatusMessage}
                                  </div>
                                </div>
                                {showNativeAppUpdateAction ? (
                                  <button
                                    type="button"
                                    onClick={handleNativeAppUpdatePress}
                                    className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-500 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-amber-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
                                  >
                                    <Download size={13} strokeWidth={2.2} />
                                    <span>{nativeAppUpdateCopy.updateButtonLabel}</span>
                                  </button>
                                ) : null}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>

                      {showAccountMenuItems && (
                        <div
                          className="shrink-0 border-t border-gray-200 px-4 pt-4"
                          style={{ paddingBottom: 'max(calc(env(safe-area-inset-bottom) + 12px), 16px)' }}
                        >
                          <div className="space-y-2">
                            <button
                              type="button"
                              onClick={() => {
                                closeMenuPanel()
                                onLogout()
                              }}
                              disabled={isAuthActionPending || !showAccountActions}
                              className="inline-flex w-full items-center gap-2 rounded-2xl border border-gray-200 px-3 py-3 text-left text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 hover:text-gray-900 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              <LogOut size={16} strokeWidth={2} />
                              <span>{logoutLabel}</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                closeMenuPanel()
                                setDeleteAccountDialogOpen(true)
                              }}
                              disabled={isAuthActionPending || !showAccountActions}
                              className="inline-flex w-full items-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-3 py-3 text-left text-sm font-medium text-rose-600 transition-colors hover:bg-rose-100 hover:text-rose-700 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              <Trash2 size={16} strokeWidth={2} />
                              <span>{deleteAccountLabel}</span>
                            </button>
                          </div>
                        </div>
                      )}
                    </section>

                    <section className="flex h-full w-1/2 min-w-0 flex-col bg-white">
                      <div
                        className="flex shrink-0 items-center border-b border-gray-200 px-4"
                        style={{
                          paddingTop: 'max(calc(env(safe-area-inset-top) + 10px), 16px)',
                          paddingBottom: '12px',
                        }}
                      >
                        <button
                          type="button"
                          aria-label={feedbackCopy.backButtonLabel}
                          onClick={requestMenuBackStep}
                          className="inline-flex h-10 w-10 items-center justify-center rounded-full text-gray-700 transition hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
                        >
                          <ChevronLeft size={22} strokeWidth={2.2} />
                        </button>
                        <div className="flex-1 text-center text-[1.1rem] font-semibold text-gray-950">
                          {feedbackCopy.pageTitle}
                        </div>
                        <div className="w-10" />
                      </div>

                      <div className="flex shrink-0 border-b border-gray-100 px-4">
                        {([
                          { value: 'compose', label: feedbackCopy.composeTabLabel },
                          { value: 'history', label: feedbackCopy.historyTabLabel },
                        ] satisfies Array<{ value: FeedbackPageTab, label: string }>).map((tab) => {
                          const isSelected = feedbackTab === tab.value

                          return (
                            <button
                              key={tab.value}
                              type="button"
                              onClick={() => setFeedbackTab(tab.value)}
                              className="flex-1 border-b-2 py-3 text-[1.02rem] font-semibold transition"
                              style={{
                                borderBottomColor: isSelected ? '#111827' : 'transparent',
                                color: isSelected ? '#111827' : '#9CA3AF',
                              }}
                            >
                              {tab.label}
                            </button>
                          )
                        })}
                      </div>

                      <div
                        className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
                        style={{
                          paddingBottom: 'max(calc(env(safe-area-inset-bottom) + 16px), 20px)',
                        }}
                      >
                        {feedbackTab === 'compose' ? (
                          <div className="px-4 py-4">
                            <div>
                              <form className="space-y-4" onSubmit={handleFeedbackSubmit}>
                                <div className="space-y-2">
                                  <div className="text-[0.9rem] font-semibold text-gray-700">
                                    {feedbackCopy.categoryLabel}
                                  </div>
                                  <div className="grid grid-cols-3 gap-2">
                                    {([
                                      'feedback',
                                      'suggestion',
                                      'inquiry',
                                    ] satisfies LivePhoneDemoFeedbackCategory[]).map((category) => {
                                      const isSelected = feedbackCategory === category

                                      return (
                                        <button
                                          key={category}
                                          type="button"
                                          aria-pressed={isSelected}
                                          disabled={isSubmittingFeedback}
                                          onClick={() => {
                                            clearFeedbackSubmitState()
                                            setFeedbackCategory(category)
                                          }}
                                          className={`rounded-xl border px-2.5 py-2 text-[0.9rem] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-300 disabled:cursor-not-allowed disabled:opacity-60 ${
                                            isSelected
                                              ? 'border-gray-900 bg-gray-900 text-white'
                                              : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300 hover:text-gray-900'
                                          }`}
                                        >
                                          {feedbackCopy.categoryLabels[category]}
                                        </button>
                                      )
                                    })}
                                  </div>
                                </div>

                                <label className="block space-y-2">
                                  <span className="text-[0.9rem] font-semibold text-gray-700">
                                    {feedbackCopy.messageLabel}
                                  </span>
                                  <textarea
                                    value={feedbackMessage}
                                    rows={4}
                                    disabled={isSubmittingFeedback}
                                    onChange={(event) => {
                                      clearFeedbackSubmitState()
                                      setFeedbackMessage(event.target.value)
                                    }}
                                    placeholder={feedbackCopy.messagePlaceholder}
                                    className="min-h-[108px] w-full resize-none rounded-xl border border-gray-200 bg-white px-3.5 py-3 text-[1.02rem] text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-gray-400 focus:ring-2 focus:ring-gray-200 disabled:cursor-not-allowed disabled:opacity-60"
                                  />
                                </label>

                                <label className="block space-y-2">
                                  <span className="text-[0.9rem] font-semibold text-gray-700">
                                    {feedbackCopy.emailLabel}
                                  </span>
                                  <input
                                    type="email"
                                    value={feedbackEmail}
                                    disabled={isSubmittingFeedback}
                                    onChange={(event) => {
                                      setFeedbackEmailEdited(true)
                                      clearFeedbackSubmitState()
                                      setFeedbackEmail(event.target.value)
                                    }}
                                    placeholder={feedbackCopy.emailPlaceholder}
                                    className="h-11 w-full rounded-xl border border-gray-200 bg-white px-3.5 text-[1.02rem] text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-gray-400 focus:ring-2 focus:ring-gray-200 disabled:cursor-not-allowed disabled:opacity-60"
                                  />
                                </label>

                                <button
                                  type="submit"
                                  disabled={isSubmittingFeedback}
                                  className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-gray-900 px-3 text-[1.02rem] font-semibold text-white transition hover:bg-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-300 disabled:cursor-not-allowed disabled:bg-slate-300"
                                >
                                  {isSubmittingFeedback ? (
                                    <>
                                      <Loader2 size={15} className="animate-spin" />
                                      <span>{feedbackCopy.sendingButtonLabel}</span>
                                    </>
                                  ) : (
                                    <span>{feedbackCopy.sendButtonLabel}</span>
                                  )}
                                </button>

                                <div aria-live="polite" className="min-h-[1.25rem] text-[0.88rem]">
                                  {feedbackSubmitError ? (
                                    <p className="font-medium text-rose-600">{feedbackSubmitError}</p>
                                  ) : null}
                                  {!feedbackSubmitError && feedbackSubmitSuccess ? (
                                    <p className="font-medium text-emerald-600">{feedbackCopy.successMessage}</p>
                                  ) : null}
                                </div>
                              </form>
                            </div>
                          </div>
                        ) : (
                          <div className="px-4 py-4">
                            <div>
                              <div className="text-[1.02rem] font-semibold text-gray-900">
                                {feedbackCopy.historyTitle}
                              </div>
                              <p className="mt-1 text-[0.92rem] leading-5 text-gray-500">
                                {feedbackCopy.historyDescription}
                              </p>
                            </div>

                            <div className="mt-3 space-y-3">
                              {isFeedbackHistoryLoading ? (
                                <div className="flex items-center gap-2 rounded-2xl border border-sky-100 bg-white/80 px-3 py-3 text-[0.94rem] text-gray-600">
                                  <Loader2 size={14} className="animate-spin text-sky-600" />
                                  <span>{feedbackCopy.historyLoadingLabel}</span>
                                </div>
                              ) : null}

                              {!isFeedbackHistoryLoading && feedbackHistoryError ? (
                                <div className="rounded-2xl border border-rose-100 bg-rose-50 px-3 py-3 text-[0.94rem] font-medium text-rose-600">
                                  {feedbackHistoryError}
                                </div>
                              ) : null}

                              {!isFeedbackHistoryLoading && !feedbackHistoryError && feedbackThreads.length === 0 ? (
                                <div className="rounded-2xl border border-sky-100 bg-white/80 px-3 py-3 text-[0.94rem] text-gray-500">
                                  {feedbackCopy.historyEmptyLabel}
                                </div>
                              ) : null}

                              {!isFeedbackHistoryLoading && !feedbackHistoryError && feedbackThreads.map((thread) => {
                                const hasTeamReply = thread.messages.some((message) => message.authorType === 'team')

                                return (
                                  <div
                                    key={thread.id}
                                    className="rounded-[1.3rem] border border-sky-100 bg-white/85 px-3 py-3 shadow-[0_8px_20px_rgba(14,116,144,0.05)]"
                                  >
                                    <div className="flex items-center justify-between gap-3">
                                      <span className="inline-flex items-center rounded-full bg-sky-50 px-2.5 py-1 text-[0.82rem] font-semibold text-sky-700">
                                        {feedbackCopy.categoryLabels[thread.category]}
                                      </span>
                                      <span className="text-[0.82rem] text-gray-500">
                                        {formatFeedbackTimestamp(thread.createdAt, uiLocale)}
                                      </span>
                                    </div>

                                    {!hasTeamReply ? (
                                      <div className="mt-2 inline-flex items-center rounded-full bg-amber-50 px-2.5 py-1 text-[0.82rem] font-medium text-amber-700">
                                        {feedbackCopy.pendingReplyLabel}
                                      </div>
                                    ) : null}

                                    <div className="mt-3 space-y-2.5">
                                      {thread.messages.map((message, index) => {
                                        const isTeamMessage = message.authorType === 'team'
                                        const authorLabel = isTeamMessage
                                          ? feedbackCopy.teamLabel
                                          : feedbackCopy.meLabel

                                        return (
                                          <div
                                            key={message.id}
                                            className={`rounded-[1.1rem] px-3 py-2.5 ${
                                              isTeamMessage
                                                ? 'border border-emerald-100 bg-emerald-50/70'
                                                : 'border border-sky-100 bg-sky-50/70'
                                            }`}
                                          >
                                            <div className="flex items-center justify-between gap-3">
                                              <span
                                                className={`text-[0.82rem] font-semibold ${
                                                  isTeamMessage ? 'text-emerald-700' : 'text-sky-700'
                                                }`}
                                              >
                                                {authorLabel}
                                              </span>
                                              <span className="text-[0.8rem] text-gray-500">
                                                {formatFeedbackTimestamp(message.createdAt, uiLocale)}
                                              </span>
                                            </div>
                                            <p className="mt-1.5 whitespace-pre-wrap break-words text-[0.98rem] leading-5 text-gray-800">
                                              {message.message}
                                            </p>
                                            {index === 0 && thread.contactEmail ? (
                                              <p className="mt-2 text-[0.8rem] text-gray-500">
                                                {thread.contactEmail}
                                              </p>
                                            ) : null}
                                          </div>
                                        )
                                      })}
                                    </div>
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    </section>
                  </motion.div>
                </motion.div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="relative flex min-h-0 flex-1 flex-col">
          {/* Chat Area */}
          <div className="relative min-h-0 flex-1 bg-gray-50/50">
            <div
              ref={chatRef}
              onScroll={handleScroll}
              onWheel={markUserScrollIntent}
              onTouchMove={markUserScrollIntent}
              onPointerDown={markUserScrollIntent}
              className="min-h-0 h-full overflow-y-auto no-scrollbar py-2.5 space-y-3"
              style={{
                paddingTop: chatPaddingTop,
                paddingBottom: chatPaddingBottom,
                paddingLeft: "max(calc(env(safe-area-inset-left) + 6px), 10px)",
                paddingRight: "max(calc(env(safe-area-inset-right) + 6px), 10px)",
              }}
            >
              {hasOlderUtterances && (
                <button
                  onClick={handleLoadOlder}
                  className="w-full py-2 text-xs text-gray-400 hover:text-gray-500 active:text-gray-600 transition-colors"
                >
                  ···
                </button>
              )}
              <AnimatePresence mode="popLayout">
                {displayUtterances.map((u) => (
                  <div
                    key={u.id}
                    data-utterance-created-at={
                      (typeof u.createdAtMs === 'number' && Number.isFinite(u.createdAtMs))
                        ? String(Math.floor(u.createdAtMs))
                        : ''
                    }
                  >
                    <ChatBubble
                      utterance={u}
                      uiLocale={uiLocale}
                      isDraft={draftUtteranceIds.has(u.id)}
                      onPlayOriginal={handlePlayOriginalBubbleTts}
                      onPlayTranslation={handlePlayTranslationBubbleTts}
                      bubbleTextClassName={chatBubbleTextClassName}
                      speakingPlaybackKey={speakingItem?.playbackKey ?? pendingManualTtsTarget?.playbackKey}
                    />
                  </div>
                ))}
              </AnimatePresence>

            {/* Demo typing animation */}
            {demoTypingLang && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex flex-col gap-1"
              >
                <div
                  style={{ borderTopLeftRadius: '1px' }}
                  className="w-fit max-w-[85%] rounded-2xl rounded-tl-sm border border-gray-200 bg-white/80 px-3.5 py-2.5"
                >
                  <div className="min-w-0">
                    <p style={{ lineHeight: LIVE_CHAT_BUBBLE_TEXT_LINE_HEIGHT }} className={`${chatBubbleTextClassName} text-gray-600`}>
                      <span className="mr-1.5 inline-flex items-center gap-1 whitespace-nowrap align-middle rounded-full px-1 py-0.5 text-gray-500">
                        <span className="text-base leading-none">{getSttLanguageFlag(demoTypingLang)}</span>
                        <span className="text-[11px] font-semibold uppercase leading-none">{demoTypingLang}</span>
                      </span>
                      <span className="align-middle">
                        {demoTypingText}
                        <span className="inline-block w-1 h-3 ml-0.5 bg-amber-400 rounded-full align-middle animate-pulse" />
                      </span>
                    </p>
                  </div>
                </div>
                {/* Demo translations - typed in parallel */}
                {Object.entries(demoTypingTranslations).map(([lang, text]) => (
                  <motion.div
                    key={lang}
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                  >
                    <TranslationBubbleRow
                      lang={lang}
                      bubbleClassName="bg-amber-50/80 border border-amber-100"
                      metaClassName="text-amber-500"
                      contentStyle={{ lineHeight: LIVE_CHAT_BUBBLE_TEXT_LINE_HEIGHT }}
                      contentClassName={`${chatBubbleTextClassName} text-gray-500`}
                    >
                      <>
                        {text}
                        <span className="inline-block w-0.5 h-3 ml-0.5 bg-amber-300 rounded-full animate-pulse" />
                      </>
                    </TranslationBubbleRow>
                  </motion.div>
                ))}
              </motion.div>
            )}

            {/* Limit reached state */}
              {isLimitReached && !isActive && (
                <div className="flex flex-col items-center justify-center gap-2 pt-4 text-center text-gray-400">
                  <div className="rounded-xl border border-amber-200 bg-amber-50 px-5 py-3.5 text-center">
                    <p className="mb-1 text-sm font-semibold text-amber-600">{usageLimitReachedLabel}</p>
                    <p className="text-xs text-amber-500/80">{usageLimitRetryHintLabel}</p>
                  </div>
                </div>
              )}

            {/* Connecting state */}
              {isConnecting && (
                <div className="flex items-center justify-center gap-2 py-4">
                  <Loader2 size={20} className="animate-spin text-amber-400" />
                  <p className="text-sm text-gray-400">{connectingLabel}</p>
                </div>
              )}

            {/* Error state */}
              {isError && (
                <div className="flex min-h-full flex-col items-center justify-center gap-2 text-center text-red-400">
                  <p className="text-sm">{connectionFailedLabel}</p>
                </div>
              )}
            </div>

            <AnimatePresence>
              {scrollUiVisible && scrollMetrics.scrollable && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2, ease: 'easeOut' }}
                  className="pointer-events-none absolute inset-y-0 right-1 z-20"
                >
                  {scrollDateLabel && (
                    <div
                      className="absolute right-2.5 -translate-y-1/2 whitespace-nowrap rounded-full border border-black/10 bg-white/48 px-3 py-1 text-[11px] font-medium tracking-tight text-black/[0.46] shadow-sm backdrop-blur-[1px]"
                      style={{ top: scrollDateTop }}
                    >
                      {scrollDateLabel}
                    </div>
                  )}
                  <div
                    className="absolute right-0 w-[3px] rounded-full bg-black/28"
                    style={{
                      top: scrollMetrics.thumbTop,
                      height: scrollMetrics.thumbHeight,
                    }}
                  />
                </motion.div>
              )}
            </AnimatePresence>

            <AnimatePresence>
              {showScrollToBottom && (
                <motion.div
                  initial={{ opacity: 0, y: 8, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 8, scale: 0.98 }}
                  transition={{ duration: 0.2, ease: 'easeOut' }}
                  className="pointer-events-none absolute inset-x-0 z-20 flex justify-center"
                  style={{ bottom: scrollToBottomButtonBottomPx }}
                >
                  <button
                    type="button"
                    onClick={handleScrollToBottom}
                    className="pointer-events-auto inline-flex items-center justify-center rounded-full border border-black/10 bg-white text-black shadow-[0_4px_12px_rgba(0,0,0,0.18)]"
                    style={{
                      width: SCROLL_TO_BOTTOM_BUTTON_SIZE_PX,
                      minWidth: SCROLL_TO_BOTTOM_BUTTON_SIZE_PX,
                      height: SCROLL_TO_BOTTOM_BUTTON_SIZE_PX,
                    }}
                    aria-label="Scroll to latest"
                  >
                    <ChevronDown size={28} strokeWidth={1.85} />
                  </button>
                </motion.div>
              )}
            </AnimatePresence>

            <AnimatePresence>
              {copyToastVisible && (
                <motion.div
                  key="copy-toast"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 4 }}
                  transition={{ duration: 0.18, ease: 'easeOut' }}
                  className="pointer-events-none absolute inset-x-0 z-30 flex justify-center"
                  style={{ bottom: copyToastBottomOffsetPx }}
                >
                  <div className="flex items-center gap-2 rounded-full bg-white px-4 py-2.5 shadow-[0_4px_16px_rgba(15,23,42,0.14),0_1px_4px_rgba(15,23,42,0.07)]">
                    <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                      <Check className="h-3 w-3" strokeWidth={3} />
                    </span>
                    <span className="text-[14px] font-medium text-gray-800">
                      {copyActionCopy.copiedToastLabel}
                    </span>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
            {showEmptyState && (
              <div className="pointer-events-none absolute inset-0 z-10">
                <p
                  className="absolute inset-x-0 -translate-y-1/2 px-8 text-center text-base font-medium text-gray-400"
                  style={{ top: '48%' }}
                >
                  {tapPlayToStartLabel}
                </p>
                <div
                  className="absolute left-1/2 w-7 -translate-x-1/2"
                  style={{
                    top: 'calc(48% + 24px)',
                    bottom: '16px',
                  }}
                >
                  <svg
                    viewBox="0 0 24 100"
                    preserveAspectRatio="none"
                    className="h-full w-full text-gray-300/95"
                    aria-hidden="true"
                  >
                    <path
                      d={`M12 4V${EMPTY_STATE_ARROW_END_Y}M12 ${EMPTY_STATE_ARROW_END_Y}L4 ${EMPTY_STATE_ARROW_HEAD_Y}M12 ${EMPTY_STATE_ARROW_END_Y}L20 ${EMPTY_STATE_ARROW_HEAD_Y}`}
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.4"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </div>
              </div>
            )}
          </div>

          <AnimatePresence>
            {showAccountMenuItems && deleteAccountDialogOpen && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.16, ease: 'easeOut' }}
                className="absolute inset-0 z-[60] flex items-center justify-center bg-black/40 px-5"
                onClick={closeDeleteAccountDialog}
              >
                <motion.div
                  initial={{ opacity: 0, y: 12, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 10, scale: 0.98 }}
                  transition={{ duration: 0.2, ease: 'easeOut' }}
                  role="dialog"
                  aria-modal="true"
                  aria-label={deleteAccountLabel}
                  onClick={(event) => event.stopPropagation()}
                  className="w-full max-w-[19rem] rounded-2xl border border-gray-200 bg-white p-4 shadow-xl"
                >
                  <p className="text-sm font-semibold text-gray-900">
                    {deleteAccountLabel}
                  </p>
                  <p className="mt-2 text-sm leading-relaxed text-gray-600">
                    {deleteAccountConfirmMessage}
                  </p>
                  <div className="mt-4 grid grid-cols-2 gap-2">
                    <button
                      ref={deleteAccountCancelButtonRef}
                      type="button"
                      onClick={closeDeleteAccountDialog}
                      disabled={isAuthActionPending}
                      className="inline-flex h-10 items-center justify-center rounded-lg border border-gray-300 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {deleteAccountCancelLabel}
                    </button>
                    <button
                      type="button"
                      onClick={handleDeleteAccountConfirm}
                      disabled={isAuthActionPending}
                      className="inline-flex h-10 items-center justify-center rounded-lg bg-rose-600 text-sm font-semibold text-white transition-colors hover:bg-rose-700 disabled:cursor-not-allowed disabled:bg-rose-400"
                    >
                      {deleteAccountConfirmLabel}
                    </button>
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Bottom Bar with STT / Text Composer Toggle */}
          <motion.div
            layout
            className="shrink-0 border-t border-gray-100 bg-white"
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            style={{
              paddingTop: '10px',
              paddingBottom: bottomBarPaddingBottom,
              paddingLeft: 'max(calc(env(safe-area-inset-left) + 10px), 14px)',
              paddingRight: 'max(calc(env(safe-area-inset-right) + 10px), 14px)',
            }}
          >
            <AnimatePresence initial={false}>
              {isComposerOpen ? (
                <motion.div
                  key="composer-bottom-bar"
                  layout
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 10 }}
                  transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
                  className="flex min-h-[4rem] items-end gap-1.5"
                >
                  <motion.div
                    layoutId="live-phone-demo-mic-shell"
                    className="flex shrink-0 items-end justify-center self-end"
                  >
                    <button
                      onPointerDown={handleMicPointerDown}
                      onClick={handleMicClick}
                      disabled={isConnecting || isError}
                      className="relative flex h-[2.3rem] w-[2.3rem] items-center justify-center rounded-full transition-all duration-200 active:scale-95 disabled:opacity-50"
                    >
                      {showRipple && (
                        <span
                          className="absolute inset-0 rounded-full bg-red-400 transition-transform duration-150"
                          style={{ transform: `scale(${rippleScale})`, opacity: 0.22 }}
                        />
                      )}

                      {isReady && (
                        <span className="absolute inset-0 rounded-full bg-red-500 opacity-20 animate-ping" />
                      )}

                      <span
                        className={`relative flex h-full w-full items-center justify-center rounded-full shadow-lg ${
                          isLimitReached
                            ? 'bg-gray-300'
                            : isReady
                              ? 'bg-red-500'
                              : isConnecting
                                ? 'bg-gray-300'
                                : 'bg-gradient-to-br from-amber-400 to-orange-500'
                        }`}
                      >
                        {isConnecting ? (
                          <Loader2 size={17} className="animate-spin text-white" />
                        ) : isReady ? (
                          <span
                            aria-hidden
                            className="h-[0.65rem] w-[0.65rem] rounded-[3px] bg-white"
                          />
                        ) : (
                          <Mic size={17} className="text-white" />
                        )}
                      </span>
                    </button>
                  </motion.div>

                  <motion.form
                    layout
                    onSubmit={handleComposerSubmit}
                    className="flex min-h-[4rem] min-w-0 flex-1 items-end gap-1.5 self-end"
                  >
                    <div className="flex min-h-[2.3rem] min-w-0 flex-1 items-end overflow-hidden rounded-[0.95rem] border border-gray-200 bg-white px-1 shadow-none">
                      <div className="flex min-w-0 flex-1 items-end px-1">
                        <textarea
                          ref={composerTextareaRef}
                          value={composerDraft}
                          onChange={handleComposerDraftChange}
                          rows={1}
                          placeholder={composerCopy.composerPlaceholder}
                          className="block box-border h-full min-h-0 flex-1 resize-none self-end bg-transparent px-0.5 py-[7px] text-[16px] leading-[22px] text-gray-900 outline-none placeholder:text-gray-400"
                          style={{ height: `${COMPOSER_TEXTAREA_MIN_HEIGHT_PX}px` }}
                        />
                      </div>

                      <motion.button
                        layoutId="live-phone-demo-keyboard-toggle"
                        type="button"
                        onClick={handleToggleComposer}
                        aria-label={composerCopy.closeKeyboardLabel}
                        className="inline-flex h-[2.3rem] w-[2.3rem] shrink-0 items-center justify-center self-end rounded-full text-gray-500 transition-colors hover:bg-gray-50 active:scale-95"
                      >
                        <Keyboard size={18} strokeWidth={2.2} />
                      </motion.button>
                    </div>

                    <button
                      type="submit"
                      disabled={!composerCanSend}
                      aria-label={composerCopy.sendMessageLabel}
                      className={`inline-flex h-[2.3rem] w-[2.3rem] shrink-0 items-center justify-center self-end rounded-full transition-all duration-200 active:scale-95 ${
                        composerCanSend
                          ? 'bg-gradient-to-br from-amber-400 to-orange-500 text-white'
                          : 'bg-transparent text-gray-300'
                      }`}
                    >
                      <svg
                        aria-hidden
                        viewBox="0 0 24 24"
                        className="h-[1.05rem] w-[1.05rem]"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.4"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M12 18.5V6.5" />
                        <path d="M7.75 10.75L12 6.5l4.25 4.25" />
                      </svg>
                    </button>
                  </motion.form>
                </motion.div>
              ) : (
                <motion.div
                  key="default-bottom-bar"
                  layout
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 8 }}
                  transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                  className="grid min-h-[4rem] items-end"
                  style={{ gridTemplateColumns: '1fr auto 1fr' }}
                >
                  <motion.div
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -12 }}
                    transition={{ duration: 0.18, ease: 'easeOut' }}
                    className="self-end justify-self-start pl-2"
                  >
                    <div className="flex items-center gap-1.5">
                      {isUsageLimited ? (
                        <>
                          <div className="h-2 w-28 overflow-hidden rounded-full bg-gray-200">
                            <div
                              className={`h-full rounded-full transition-all duration-500 ${usageSec >= 25 ? 'bg-red-400' : 'bg-amber-400'}`}
                              style={{ width: `${usagePercent}%` }}
                            />
                          </div>
                          <span className={`text-sm tabular-nums ${isLimitReached ? 'font-semibold text-red-400' : 'text-gray-400'}`}>
                            {formatLivePhoneDemoUsageDuration(remainingSec)}
                          </span>
                        </>
                      ) : (
                        <span className="text-sm tabular-nums text-gray-400">
                          {formatLivePhoneDemoUsageDuration(usageSec)}
                        </span>
                      )}
                    </div>
                  </motion.div>

                  <motion.div
                    layoutId="live-phone-demo-mic-shell"
                    className="flex self-end justify-center"
                  >
                    <button
                      onPointerDown={handleMicPointerDown}
                      onClick={handleMicClick}
                      disabled={isConnecting || isError}
                      className="relative flex h-[4rem] w-[4rem] items-center justify-center rounded-full transition-all duration-200 active:scale-95 disabled:opacity-50"
                    >
                      {showRipple && (
                        <span
                          className="absolute inset-0 rounded-full bg-red-400 transition-transform duration-150"
                          style={{ transform: `scale(${rippleScale})`, opacity: 0.25 }}
                        />
                      )}

                      {isReady && (
                        <span className="absolute inset-0 rounded-full bg-red-500 opacity-20 animate-ping" />
                      )}

                      <span
                        className={`relative flex h-full w-full items-center justify-center rounded-full shadow-lg ${
                          isLimitReached
                            ? 'bg-gray-300'
                            : isReady
                              ? 'bg-red-500'
                              : isConnecting
                                ? 'bg-gray-300'
                                : 'bg-gradient-to-br from-amber-400 to-orange-500'
                        }`}
                      >
                        {isConnecting ? (
                          <Loader2 size={30} className="animate-spin text-white" />
                        ) : isReady ? (
                          <span
                            aria-hidden
                            className="h-5 w-5 rounded-[4px] bg-white"
                          />
                        ) : (
                          <Mic size={28} className="text-white" />
                        )}
                      </span>
                    </button>
                  </motion.div>

                  <div className="self-end justify-self-end">
                    <motion.button
                      layoutId="live-phone-demo-keyboard-toggle"
                      type="button"
                      onClick={handleToggleComposer}
                      aria-label={composerCopy.openKeyboardLabel}
                      className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-500 shadow-[0_6px_16px_rgba(15,23,42,0.08)] transition-all duration-200 hover:border-gray-300 hover:bg-gray-50 active:scale-95"
                    >
                      <Keyboard size={19} strokeWidth={2.15} />
                    </motion.button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </div>
      </div>
    </PhoneFrame>
  )
})

export default LivePhoneDemo
