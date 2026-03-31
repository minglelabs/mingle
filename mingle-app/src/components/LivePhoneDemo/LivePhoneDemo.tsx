'use client'

import { useState, useRef, useEffect, useLayoutEffect, useImperativeHandle, forwardRef, useCallback, useMemo, useId, useSyncExternalStore, type PointerEvent as ReactPointerEvent } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Play, Loader2, Volume2, VolumeX, Mic, ArrowRight, ChevronDown, ChevronLeft, Check, Menu, LogOut, Trash2, Download } from 'lucide-react'
import { toast } from 'sonner'
import PhoneFrame from './PhoneFrame'
import ChatBubble from './ChatBubble'
import type { Utterance } from './ChatBubble'
import LanguageSelector from './LanguageSelector'
import MingleWordmark from '@/components/mingle-wordmark'
import TranslationBubbleRow from './TranslationBubbleRow'
import useRealtimeSTT from './useRealtimeSTT'
import { getOrCreateSessionKey, getOrCreateTrackingUserId, mergeDisplayUtterances } from './use-realtime-stt'
import { clientApiNamespace } from '@/lib/api-contract'
import { useTtsSettings } from '@/context/tts-settings'
import {
  DEFAULT_STT_LANGUAGES,
  canonicalizeSttLanguageCode,
  deriveDefaultSttLanguagesForLocale,
  getSttLanguageFlag,
} from '@/lib/stt-languages'
import {
  DEFAULT_SONIOX_SILENCE_MS,
  DEFAULT_TEXT_SIZE_LEVEL,
  LS_KEY_AD_BANNER_POSITION,
  LS_KEY_LANGUAGES,
  LS_KEY_TEXT_SIZE_LEVEL,
  MAX_SONIOX_SILENCE_MS,
  MIN_SONIOX_SILENCE_MS,
  normalizeLivePhoneDemoAdBannerPosition,
  readPersistedLivePhoneDemoPreferences,
  type LivePhoneDemoAdBannerPosition,
} from './live-phone-demo.preferences'
import {
  buildHydratedAccountPreferences,
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
  shouldEnableIosTopTapFallback,
  type NativeUiBannerLayoutEventDetail,
} from './live-phone-demo.native-ui.logic'
import {
  clearNativeHistoryBackAnimateFlag,
  registerNativeBackHandler,
} from '@/lib/native-back-handler'
import {
  DEFAULT_NATIVE_APP_UPDATE_DETAIL,
  NATIVE_APP_UPDATE_EVENT,
  parseNativeAppUpdateDetail,
  readRequestedApiNamespaceFromSearch,
  resolveNativeAppTrackingContext,
  resolveNativeAppUpdateCopy,
  type NativeAppUpdateDetail,
} from './live-phone-demo.app-update.logic'

const VOLUME_THRESHOLD = 0.05
const ACCOUNT_PREFERENCES_API_PATH = '/api/account/preferences'
const ACCOUNT_PREFERENCES_SYNC_DEBOUNCE_MS = 1500
const SILENT_WAV_DATA_URI = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA='
// Boost factor applied to TTS playback while STT is active.
// iOS .playAndRecord reduces speaker output; this compensates in software.
const TTS_STT_GAIN = 1.0
const NATIVE_TTS_EVENT = 'mingle:native-tts'
const SCROLL_TO_BOTTOM_BUTTON_THRESHOLD_PX = 400
const SCROLL_TO_BOTTOM_BUTTON_BOTTOM_PX = 24
const SCROLL_TO_BOTTOM_BUTTON_SIZE_PX = 48
const SCROLL_UI_HIDE_DELAY_MS = 1000
const SCROLLBAR_MIN_THUMB_HEIGHT_PX = 28
const USER_SCROLL_INTENT_WINDOW_MS = 1400
const NATIVE_TTS_EVENT_TIMEOUT_MS = 15000
const LIVE_CHAT_BUBBLE_TEXT_LINE_HEIGHT = 1.25
const NATIVE_INSET_QUERY_MAX_PX = 240
const SILENCE_SLIDER_UPGRADE_TOAST_COOLDOWN_MS = 5000
const MENU_PANEL_CLOSE_DRAG_DISTANCE_PX = 88
const MENU_PANEL_CLOSE_DRAG_VELOCITY_PX_PER_MS = 0.45
const WEB_CANVAS_BASE_WIDTH_PX = 400
const NATIVE_AD_BANNER_DEFAULT_HEIGHT_PX = 50

const TEXT_SIZE_CLASS_BY_LEVEL: Record<number, string> = {
  1: 'text-[13px]',
  2: 'text-sm',
  3: 'text-[15px]',
  4: 'text-base',
  5: 'text-[18px]',
}
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
  isAuthActionPending?: boolean
  showMenuButton?: boolean
  showAccountActions?: boolean
  enableAccountPreferencesSync?: boolean
  headerMode?: 'default' | 'conversation'
  backButtonLabel?: string
  onBack?: () => void
  sessionKeyOverride?: string
  storageNamespace?: string
}

const TTS_AUDIO_WAIT_TIMEOUT_MS = 3000
const COMPACT_BOTTOM_BAR_HEIGHT_PX = 64
const IOS_COMPACT_BOTTOM_BAR_HEIGHT_PX = 56

type TtsQueueItem = {
  utteranceId: string
  audioBlob: Blob | null
  language: string
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

function EchoInputRouteIcon({ echoAllowed }: { echoAllowed: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`relative inline-flex items-center ${
        echoAllowed ? 'text-amber-500' : 'text-gray-400'
      }`}
    >
      <Volume2 size={12} strokeWidth={2} />
      <ArrowRight size={12} strokeWidth={2} />
      <Mic size={12} strokeWidth={2} />
      {!echoAllowed && (
        <span className="absolute left-0 top-1/2 h-[2px] w-full -translate-y-1/2 rotate-[-24deg] rounded bg-current" />
      )}
    </span>
  )
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
  muteTtsLabel,
  unmuteTtsLabel,
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
  isAuthActionPending = false,
  showMenuButton = true,
  showAccountActions = true,
  enableAccountPreferencesSync = true,
  headerMode = 'default',
  backButtonLabel = 'Back',
  onBack,
  sessionKeyOverride,
  storageNamespace,
}, ref) {
  const fallbackLanguages = useMemo(() => resolveDefaultSelectedLanguages(uiLocale), [uiLocale])
  const nativeAppUpdateCopy = useMemo(() => resolveNativeAppUpdateCopy(uiLocale), [uiLocale])
  const [selectedLanguages, setSelectedLanguages] = useState<string[]>(fallbackLanguages)
  const [langSelectorOpen, setLangSelectorOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [translationModelMenuOpen, setTranslationModelMenuOpen] = useState(false)
  const [textSizeLevel, setTextSizeLevel] = useState<number>(DEFAULT_TEXT_SIZE_LEVEL)
  const [sonioxManualFinalizeSilenceMs, setSonioxManualFinalizeSilenceMs] = useState<number>(DEFAULT_SONIOX_SILENCE_MS)
  const [translationModel, setTranslationModel] = useState<UserSelectableTranslationModel>(DEFAULT_SELECTABLE_TRANSLATION_MODEL)
  const [adBannerPosition, setAdBannerPosition] = useState<LivePhoneDemoAdBannerPosition | null>(null)
  const [isSilenceFinalizeSliderLocked, setIsSilenceFinalizeSliderLocked] = useState(false)
  const [deleteAccountDialogOpen, setDeleteAccountDialogOpen] = useState(false)
  const [isNativeAppRuntime, setIsNativeAppRuntime] = useState(false)
  const [isNativeIosAppRuntime, setIsNativeIosAppRuntime] = useState(false)
  const [nativeAppUpdate, setNativeAppUpdate] = useState<NativeAppUpdateDetail | null>(null)
  const [nativeBannerLayout, setNativeBannerLayout] = useState<NativeUiBannerLayoutEventDetail | null>(null)
  const silenceSliderUpgradeToastLastShownAtRef = useRef(0)
  const { ttsEnabled: isSoundEnabled, setTtsEnabled: setIsSoundEnabled, aecEnabled, setAecEnabled } = useTtsSettings()
  const [speakingItem, setSpeakingItem] = useState<{ utteranceId: string, language: string } | null>(null)
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
  const accountPreferencesSyncTimerRef = useRef<number | null>(null)
  const langSelectorButtonRef = useRef<HTMLButtonElement | null>(null)
  const menuButtonRef = useRef<HTMLButtonElement | null>(null)
  const menuPanelRef = useRef<HTMLDivElement | null>(null)
  const translationModelDropdownRef = useRef<HTMLDivElement | null>(null)
  const translationModelButtonRef = useRef<HTMLButtonElement | null>(null)
  const menuSwipeSessionRef = useRef<{
    pointerId: number
    startX: number
    startedAt: number
  } | null>(null)
  const deleteAccountCancelButtonRef = useRef<HTMLButtonElement | null>(null)
  const [isIosTopTapEnabled, setIsIosTopTapEnabled] = useState(false)
  const [menuDragOffsetX, setMenuDragOffsetX] = useState(0)
  const [isMenuDragging, setIsMenuDragging] = useState(false)
  const accountPreferencesHydrationGenerationRef = useRef(0)
  const [accountPreferencesHydratedGeneration, setAccountPreferencesHydratedGeneration] = useState(0)
  const accountPreferencesLastSyncedStateKeyRef = useRef<string | null>(null)
  const silenceFinalizeLockedDescriptionId = useId()
  const translationModelListboxId = useId()
  const nativeBannerPositionFromQuery = useNativeBannerPositionFromSearch()
  const latestAccountPreferencesRef = useRef<LivePhoneDemoAccountPreferences>({
    textSizeLevel: DEFAULT_TEXT_SIZE_LEVEL,
    sonioxManualFinalizeSilenceMs: DEFAULT_SONIOX_SILENCE_MS,
    translationModel: DEFAULT_SELECTABLE_TRANSLATION_MODEL,
    adBannerPosition: null,
  })
  const latestAccountPreferences = useMemo(() => ({
    textSizeLevel,
    sonioxManualFinalizeSilenceMs,
    translationModel,
    adBannerPosition,
  }), [adBannerPosition, sonioxManualFinalizeSilenceMs, textSizeLevel, translationModel])
  const resolveConversationSessionKey = useCallback(
    () => getOrCreateSessionKey(storageNamespace, sessionKeyOverride),
    [sessionKeyOverride, storageNamespace],
  )
  const displayedAdBannerPosition = adBannerPosition
    || normalizeLivePhoneDemoAdBannerPosition(nativeBannerLayout?.position)
    || nativeBannerPositionFromQuery
  const selectedTranslationModelOption = useMemo(
    () => TRANSLATION_MODEL_OPTIONS.find((option) => option.value === translationModel) || TRANSLATION_MODEL_OPTIONS[0],
    [translationModel],
  )

  useEffect(() => {
    latestAccountPreferencesRef.current = latestAccountPreferences
  }, [latestAccountPreferences])

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
      const nextIsSilenceFinalizeSliderLocked = isLegacySonioxSilenceSliderNamespace(clientApiNamespace)
      setIsSilenceFinalizeSliderLocked(nextIsSilenceFinalizeSliderLocked)
      setSelectedLanguages(next.selectedLanguages)
      setTextSizeLevel(next.textSizeLevel)
      setSonioxManualFinalizeSilenceMs(DEFAULT_SONIOX_SILENCE_MS)
      setAdBannerPosition(next.adBannerPosition)

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
      setIsNativeIosAppRuntime(isLikelyIOSPlatform())
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
    const sessionKey = resolveConversationSessionKey()
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
  }, [clearAccountPreferencesSyncTimer, enableAccountPreferencesSync, nativeAppUpdate, resolveConversationSessionKey])

  const syncAccountPreferences = useCallback(() => {
    if (!enableAccountPreferencesSync) return
    const currentPreferences = latestAccountPreferencesRef.current
    const currentSyncStateKey = serializeAccountPreferencesSyncState(currentPreferences)
    const sessionKey = resolveConversationSessionKey()
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
  }, [enableAccountPreferencesSync, nativeAppUpdate, resolveConversationSessionKey])

  const syncAccountPreferencesOverride = useCallback((nextPreferences: LivePhoneDemoAccountPreferences) => {
    if (!enableAccountPreferencesSync) return
    latestAccountPreferencesRef.current = nextPreferences
    const currentSyncStateKey = serializeAccountPreferencesSyncState(nextPreferences)
    const sessionKey = resolveConversationSessionKey()
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
  }, [enableAccountPreferencesSync, nativeAppUpdate, resolveConversationSessionKey])

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

  const closeMenuPanel = useCallback(() => {
    setTranslationModelMenuOpen(false)
    setMenuOpen(false)
  }, [])

  const requestCloseMenuPanel = useCallback(() => {
    clearNativeHistoryBackAnimateFlag()
    setDeleteAccountDialogOpen(false)
    closeMenuPanel()
    setMenuDragOffsetX(0)
    setIsMenuDragging(false)
  }, [closeMenuPanel])

  useEffect(() => {
    if (!isNativeApp()) return

    const command: NativeUiOverlayStateCommand = {
      type: 'native_ui_overlay_state',
      payload: { menuOpen },
    }

    try {
      window.ReactNativeWebView?.postMessage(JSON.stringify(command))
    } catch {
      // Ignore bridge errors and leave the native banner state unchanged.
    }

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
  }, [menuOpen])

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
    if (!menuOpen) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      if (translationModelMenuOpen) {
        setTranslationModelMenuOpen(false)
        try {
          translationModelButtonRef.current?.focus({ preventScroll: true })
        } catch {
          translationModelButtonRef.current?.focus()
        }
        return
      }
      setMenuOpen(false)
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [menuOpen, translationModelMenuOpen])

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
      requestCloseMenuPanel()
    }, 0)

    return () => {
      window.clearTimeout(closeMenuState)
    }
  }, [requestCloseMenuPanel, showMenuButton])
  const closeDeleteAccountDialog = useCallback(() => {
    if (isAuthActionPending) return
    setDeleteAccountDialogOpen(false)
  }, [isAuthActionPending])

  useEffect(() => registerNativeBackHandler(() => {
    if (isAuthActionPending) return false
    if (deleteAccountDialogOpen) {
      clearNativeHistoryBackAnimateFlag()
      setDeleteAccountDialogOpen(false)
      return true
    }
    if (translationModelMenuOpen) {
      clearNativeHistoryBackAnimateFlag()
      setTranslationModelMenuOpen(false)
      return true
    }
    if (!menuOpen) return false
    requestCloseMenuPanel()
    return true
  }, 20), [deleteAccountDialogOpen, isAuthActionPending, menuOpen, requestCloseMenuPanel, translationModelMenuOpen])

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
      requestCloseMenuPanel()
      return
    }

    setMenuDragOffsetX(0)
  }, [requestCloseMenuPanel])

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

  const allocateNativeTtsPlaybackId = useCallback((utteranceId: string) => {
    nativeTtsPlaybackSeqRef.current += 1
    return `${utteranceId}::${nativeTtsPlaybackSeqRef.current}`
  }, [])

  const armNativeTtsEventTimeout = useCallback((playbackId: string, utteranceId: string) => {
    if (!isNativeApp()) return
    clearNativeTtsEventTimer()
    activeNativeTtsPlaybackIdRef.current = playbackId
    activeNativeTtsUtteranceIdRef.current = utteranceId
    nativeTtsEventTimerRef.current = window.setTimeout(() => {
      if (
        activeNativeTtsPlaybackIdRef.current !== playbackId
        && activeNativeTtsUtteranceIdRef.current !== utteranceId
      ) {
        return
      }
      activeNativeTtsPlaybackIdRef.current = null
      activeNativeTtsUtteranceIdRef.current = null
      nativeTtsEventTimerRef.current = null
      setSpeakingItem(prev => (prev?.utteranceId === utteranceId ? null : prev))
      isTtsProcessingRef.current = false
      processTtsQueueRef.current()
    }, NATIVE_TTS_EVENT_TIMEOUT_MS)
  }, [clearNativeTtsEventTimer])

  const processTtsQueue = useCallback(() => {
    if (isTtsProcessingRef.current) return
    if (!enableAutoTTS || !isSoundEnabled) {
      clearTtsWaitTimer()
      return
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
    setSpeakingItem({ utteranceId: next.utteranceId, language: next.language })

    const onPlaybackDone = () => {
      clearNativeTtsEventTimer()
      activeNativeTtsPlaybackIdRef.current = null
      activeNativeTtsUtteranceIdRef.current = null
      setSpeakingItem(prev => (prev?.utteranceId === next.utteranceId ? null : prev))
      isTtsProcessingRef.current = false
      processTtsQueueRef.current()
    }

    const playViaNativeBridge = async () => {
      try {
        const playbackId = allocateNativeTtsPlaybackId(next.utteranceId)
        const audioBase64 = await blobToBase64(audioBlob)
        window.ReactNativeWebView!.postMessage(JSON.stringify({
          type: 'native_tts_play',
          payload: {
            playbackId,
            utteranceId: next.utteranceId,
            audioBase64,
            contentType: audioBlob.type || 'audio/mpeg',
          },
        }))
        armNativeTtsEventTimeout(playbackId, next.utteranceId)
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
        setSpeakingItem(prev => (prev?.utteranceId === next.utteranceId ? null : prev))
        ttsNeedsUnlockRef.current = true
        // Re-insert at front of queue so it can be retried after audio unlock
        ttsQueueRef.current.unshift(next)
        isTtsProcessingRef.current = false
      })
    }

    if (isNativeApp()) {
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
          if (utteranceId && prev?.utteranceId === utteranceId) return null
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
          if (prev?.utteranceId === utteranceId) return null
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
    if (queue.some(item => item.utteranceId === utteranceId)) {
      return
    }
    queue.push({ utteranceId, audioBlob: null, language })
  }, [enableAutoTTS, isSoundEnabled])

  // Handle TTS audio received inline with translation response.
  const handleTtsAudio = useCallback((utteranceId: string, audioBlob: Blob, language: string) => {
    if (!enableAutoTTS || !isSoundEnabled) return
    const queue = ttsQueueRef.current
    // Fill in existing placeholder
    const existing = queue.find(item => item.utteranceId === utteranceId)
    if (existing) {
      existing.audioBlob = audioBlob
      existing.language = language
    } else {
      // No placeholder (edge case) — append to end
      queue.push({ utteranceId, audioBlob, language })
    }
    processTtsQueue()
  }, [enableAutoTTS, isSoundEnabled, processTtsQueue])

  const handleTtsCanceled = useCallback((utteranceId: string) => {
    const queue = ttsQueueRef.current
    const nextQueue = queue.filter((item) => item.utteranceId !== utteranceId)
    if (nextQueue.length === queue.length) return
    ttsQueueRef.current = nextQueue
    clearTtsWaitTimer()
    processTtsQueue()
  }, [clearTtsWaitTimer, processTtsQueue])

  const {
    utterances,
    liveUtterances,
    partialTranscript,
    volume,
    toggleRecording,
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
    sessionKeyOverride,
    storageNamespace,
  })
  const isSttSessionRunning = isConnecting || isReady || isActive
  const isSilenceFinalizeSliderDisabled = isSttSessionRunning || isSilenceFinalizeSliderLocked

  const chatBubbleTextClassName = TEXT_SIZE_CLASS_BY_LEVEL[textSizeLevel] || TEXT_SIZE_CLASS_BY_LEVEL[DEFAULT_TEXT_SIZE_LEVEL]
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
    if (!enableAutoTTS || !isSoundEnabled) return
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
    if (!enableAutoTTS) return
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
  }, [enableAutoTTS, resumeTtsPlayback])

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

    requestCloseMenuPanel()

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
  }, [nativeAppUpdate?.updateUrl, requestCloseMenuPanel])

  useEffect(() => {
    if (!isNativeApp()) return

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
  const isConversationMode = headerMode === 'conversation'
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
  const scrollToBottomButtonReservedPx = isNativeAppRuntime && displayedAdBannerPosition === 'bottom'
    ? effectiveNativeBottomContentInsetPx
    : 0
  const scrollToBottomButtonBottomPx = SCROLL_TO_BOTTOM_BUTTON_BOTTOM_PX + scrollToBottomButtonReservedPx
  const chatPaddingTop = effectiveNativeTopInsetPx > 0 ? `calc(0.625rem + ${effectiveNativeTopInsetPx}px)` : '0.625rem'
  const chatPaddingBottom = effectiveNativeBottomContentInsetPx > 0 ? `calc(0.625rem + ${effectiveNativeBottomContentInsetPx}px)` : '0.625rem'
  const compactBottomBarHeightPx = isConversationMode && isNativeIosAppRuntime
    ? IOS_COMPACT_BOTTOM_BAR_HEIGHT_PX
    : COMPACT_BOTTOM_BAR_HEIGHT_PX
  const bottomBarHeightStyle = isConversationMode
    ? `calc(${compactBottomBarHeightPx}px + env(safe-area-inset-bottom, 0px))`
    : undefined
  const bottomBarPaddingTop = isConversationMode ? "0px" : "10px"
  const bottomBarPaddingBottom = isConversationMode
    ? "env(safe-area-inset-bottom, 0px)"
    : "max(calc(env(safe-area-inset-bottom) + 16px), 20px)"
  const micButtonClassName = isConversationMode
    ? "relative flex h-[3.5rem] w-[3.5rem] items-center justify-center rounded-full transition-all duration-200 active:scale-95 disabled:opacity-50"
    : "relative flex h-[4rem] w-[4rem] items-center justify-center rounded-full transition-all duration-200 active:scale-95 disabled:opacity-50"
  const micIconSize = isConversationMode ? 28 : 30
  const showEmptyState = utterances.length === 0
    && liveUtterances.length === 0
    && !partialTranscript
    && !demoTypingText
    && !demoTypingLang
    && !isDemoAnimating
    && !isActive
    && !isError
    && !isLimitReached
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
          {headerMode === 'conversation' && onBack ? (
            <button
              type="button"
              onClick={onBack}
              aria-label={backButtonLabel}
              className={`relative z-20 inline-flex h-11 min-w-[44px] items-center justify-center px-1 text-gray-700 transition-colors hover:text-gray-900 active:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 ${navSurfaceClassName}`}
            >
              <ChevronLeft size={24} strokeWidth={2.4} />
            </button>
          ) : (
            <MingleWordmark className="relative z-20" />
          )}
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
                  onClick={() => {
                    setLangSelectorOpen(false)
                    setMenuOpen((open) => {
                      const nextOpen = !open
                      if (!nextOpen) {
                        setTranslationModelMenuOpen(false)
                      }
                      return nextOpen
                    })
                  }}
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
                className={`absolute inset-y-0 right-0 flex h-full w-[70%] max-w-[24rem] flex-col overflow-hidden border-l border-gray-200 will-change-transform ${navSurfaceClassName}`}
                style={{
                  boxShadow: '-18px 0 40px rgba(15, 23, 42, 0.22)',
                  touchAction: 'pan-y',
                }}
              >
                <div
                  className="flex-1 overflow-y-auto overscroll-contain"
                  style={{
                    paddingTop: 'max(calc(env(safe-area-inset-top) + 18px), 24px)',
                    paddingBottom: 'max(calc(env(safe-area-inset-bottom) + 12px), 16px)',
                  }}
                >
                  <div className="border-b border-gray-200 px-4 py-4">
                    <div className="space-y-4">
                      <label className="block">
                        <div className="mb-1 flex items-center justify-between gap-3 text-[0.8125rem] font-semibold text-gray-700">
                          <span className="shrink-0 whitespace-nowrap">{textSizeLabel}</span>
                          <span className="shrink-0 whitespace-nowrap">Level {textSizeLevel}</span>
                        </div>
                        <input
                          type="range"
                          min={1}
                          max={5}
                          step={1}
                          value={textSizeLevel}
                          onPointerDown={(event) => {
                            event.currentTarget.setPointerCapture(event.pointerId)
                            const next = deriveRangeValueFromPointer(event, 1, 5, 1)
                            setTextSizeLevel(next)
                          }}
                          onPointerMove={(event) => {
                            if (event.buttons !== 1) return
                            const next = deriveRangeValueFromPointer(event, 1, 5, 1)
                            setTextSizeLevel(next)
                          }}
                          onPointerUp={(event) => {
                            if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                              event.currentTarget.releasePointerCapture(event.pointerId)
                            }
                            flushAccountPreferencesSync()
                          }}
                          onChange={(event) => {
                            const next = Math.max(1, Math.min(5, Number(event.target.value) || DEFAULT_TEXT_SIZE_LEVEL))
                            setTextSizeLevel(next)
                          }}
                          className={sliderClassName}
                          aria-label={`${textSizeLabel} level`}
                        />
                      </label>

                      <label className="block">
                        <div
                          className={`mb-1 flex items-start gap-3 text-[0.8125rem] font-semibold transition-colors ${
                            isSilenceFinalizeSliderDisabled ? 'text-gray-400' : 'text-gray-700'
                          }`}
                        >
                          <span className="min-w-0 flex-1 whitespace-normal break-words leading-tight text-[0.72rem]">
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
                            className={`${sliderClassName} ${isSilenceFinalizeSliderDisabled ? 'pointer-events-none cursor-not-allowed opacity-40' : ''}`}
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
                        <div className="mb-1 flex items-center justify-between gap-3 text-[0.8125rem] font-semibold text-gray-700">
                          <span className="shrink-0 whitespace-nowrap">{translationModelLabel}</span>
                        </div>
                        <div ref={translationModelDropdownRef} className="relative">
                          <button
                            ref={translationModelButtonRef}
                            type="button"
                            onClick={() => setTranslationModelMenuOpen((open) => !open)}
                            aria-label={translationModelLabel}
                            aria-haspopup="listbox"
                            aria-expanded={translationModelMenuOpen}
                            aria-controls={translationModelListboxId}
                            className="group relative flex h-14 w-full items-center gap-3 overflow-hidden rounded-[1.35rem] border border-[#E5E7EB] bg-gradient-to-r from-white via-white to-[#F8FAFC] px-3.5 text-left shadow-[0_10px_24px_rgba(15,23,42,0.06)] transition duration-200 hover:border-[#D1D5DB] hover:shadow-[0_14px_30px_rgba(15,23,42,0.10)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/80"
                          >
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-[0.95rem] font-semibold text-gray-900">
                                {selectedTranslationModelOption.label}
                              </div>
                            </div>
                            <span
                              className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors duration-200 ${
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
                                className="absolute left-0 right-0 top-[calc(100%+0.6rem)] z-30 overflow-hidden rounded-[1.35rem] border border-gray-200/90 bg-white/95 shadow-[0_22px_48px_rgba(15,23,42,0.16)] backdrop-blur-sm"
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
                                          <div className="min-w-0 flex-1">
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
                  <div className="shrink-0 border-t border-gray-200 px-4 py-4">
                    <div className="space-y-2">
                      <button
                        type="button"
                      onClick={() => {
                          requestCloseMenuPanel()
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
                          requestCloseMenuPanel()
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
              </motion.div>
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
                      isSpeaking={speakingItem?.utteranceId === u.id}
                      speakingLanguage={speakingItem?.language ?? null}
                      bubbleTextClassName={chatBubbleTextClassName}
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
                      d="M12 4V96M12 96L4 90M12 96L20 90"
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

          {/* Bottom Bar with Mic Button */}
          <div
            className="grid shrink-0 grid-cols-[1fr_auto_1fr] items-center border-t border-gray-100 bg-white"
            style={{
              height: bottomBarHeightStyle,
              paddingTop: bottomBarPaddingTop,
              paddingBottom: bottomBarPaddingBottom,
              paddingLeft: "max(calc(env(safe-area-inset-left) + 10px), 14px)",
              paddingRight: "max(calc(env(safe-area-inset-right) + 10px), 14px)",
            }}
          >
            <div className="justify-self-start pl-2">
              {/* Usage progress bar */}
              {usageSec > 0 && (
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
                        {remainingSec}s
                      </span>
                    </>
                  ) : (
                    <span className="text-sm tabular-nums text-gray-400">
                      {usageSec}s
                    </span>
                  )}
                </div>
              )}
            </div>
            <div className="flex justify-center">
              <button
                onPointerDown={handleMicPointerDown}
                onClick={handleMicClick}
                disabled={isConnecting || isError}
                className={micButtonClassName}
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
                    <Loader2 size={micIconSize} className="animate-spin text-white" />
                  ) : (
                    <Play size={micIconSize} className="text-white" />
                  )}
                </span>
              </button>
            </div>
            <div className="justify-self-end">
              {usageSec > 0 && (
                <div className="flex items-center gap-1">
                  {enableAutoTTS && (
                    <button
                      onClick={() => {
                        const next = !isSoundEnabled
                        setIsSoundEnabled(next)
                        if (!next) {
                          setSpeakingItem(null)
                        }
                      }}
                      className="rounded-full p-2 transition-colors hover:bg-gray-100 active:scale-90"
                      aria-label={isSoundEnabled ? muteTtsLabel : unmuteTtsLabel}
                    >
                      {isSoundEnabled ? (
                        <Volume2 size={18} className="text-amber-500" />
                      ) : (
                        <VolumeX size={18} className="text-gray-400" />
                      )}
                    </button>
                  )}
                  <button
                    onClick={() => setAecEnabled(!aecEnabled)}
                    className="rounded-full p-2 transition-colors hover:bg-gray-100 active:scale-90"
                    aria-label={aecEnabled ? 'Echo off (AEC on)' : 'Echo on (AEC off)'}
                    title={aecEnabled ? 'Echo off (AEC on)' : 'Echo on (AEC off)'}
                  >
                    <EchoInputRouteIcon echoAllowed={!aecEnabled} />
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </PhoneFrame>
  )
})

export default LivePhoneDemo
