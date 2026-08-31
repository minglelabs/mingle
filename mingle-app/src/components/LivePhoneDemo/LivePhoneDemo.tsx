'use client'

import { memo, useState, useRef, useEffect, useLayoutEffect, useImperativeHandle, forwardRef, useCallback, useMemo, useId, useSyncExternalStore, type CSSProperties, type ChangeEvent, type FormEvent, type PointerEvent as ReactPointerEvent } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useSession } from 'next-auth/react'
import { Mic, Loader2, ChevronDown, Check, Menu, LogOut, Trash2, Download, ChevronLeft, ChevronRight, Keyboard, Instagram } from 'lucide-react'
import ConversationParticipantsPanel from '@/components/LivePhoneDemo/conversation-participants-panel'
import SlideSurface from '@/components/slide-surface'
import { toast } from 'sonner'
import PhoneFrame from './PhoneFrame'
import ChatBubble from './ChatBubble'
import type { Utterance } from './ChatBubble'
import LanguageSelector from './LanguageSelector'
import ConversationEmptyState from './ConversationEmptyState'
import { shouldShowConversationEmptyState } from './conversation-empty-state.logic'
import {
  buildLanguageSelectorHistoryState,
  buildLanguageSelectorButtonCodes,
  clearLanguageSelectorHistoryState,
  isLanguageSelectorHistoryOpen,
  resolveLanguageSelectorOwnSelectedLanguages,
} from './language-selector.logic'
import TranslationBubbleRow from './TranslationBubbleRow'
import LanguageFlag from '@/components/language-flag'
import useRealtimeSTT from './useRealtimeSTT'
import { buildStorageKey, getOrCreateSessionKey, getOrCreateTrackingUserId, mergeDisplayUtterances, type ConversationInviteNotice, type ConversationLeaveNotice } from './use-realtime-stt'
import MingleWordmark from '@/components/mingle-wordmark'
import { buildClientApiPath, clientApiNamespace } from '@/lib/api-contract'
import { useTtsSettings } from '@/context/tts-settings'
import {
  DEFAULT_STT_LANGUAGES,
  MAX_STT_LANGUAGE_SELECTION,
  canonicalizeSttLanguageCode,
  deriveDefaultSttLanguagesForLocale,
  getSttLanguageDisplayName,
  sanitizeSttLanguageSelection,
  sanitizeSttLanguageUnion,
} from '@/lib/stt-languages'
import {
  DEFAULT_INPUT_MODE,
  DEFAULT_SONIOX_ENDPOINT_MAX_DELAY_MS,
  DEFAULT_SONIOX_ENDPOINT_TUNING_STEP,
  DEFAULT_SONIOX_SILENCE_MS,
  DEFAULT_TEXT_SIZE_LEVEL,
  MAX_SONIOX_SILENCE_MS,
  LS_KEY_AD_BANNER_POSITION,
  LS_KEY_INPUT_MODE,
  LS_KEY_LANGUAGES,
  LS_KEY_SPEECH_LANGUAGES,
  LS_KEY_TEXT_SIZE_LEVEL,
  LS_KEY_TRANSLATION_LANGUAGES_LINKED,
  MIN_SONIOX_SILENCE_MS,
  normalizeLivePhoneDemoAdBannerPosition,
  type LivePhoneDemoInputMode,
  readPersistedLivePhoneDemoPreferences,
  resolveDisplayedLivePhoneDemoAdBannerPosition,
  shouldShowEndpointTuningControl,
  shouldShowManualSilenceControl,
  type LivePhoneDemoAdBannerPosition,
} from './live-phone-demo.preferences'
import {
  buildAccountPreferencesPatchBody,
  buildHydratedAccountPreferences,
  DEFAULT_ECHO_ALLOWED,
  DEFAULT_SPEAKER_ENABLED,
  readCachedAccountPreferencesSnapshot,
  serializeAccountPreferencesSyncState,
  shouldApplyAccountPreferencesHydration,
  shouldScheduleAccountPreferencesSync,
  shouldSendTranslationModelPreference,
  writeCachedAccountPreferences,
  type AccountPreferencesResponse,
  type AccountPreferencesCacheIdentity,
  type LivePhoneDemoAccountPreferences,
  SttSegmentationMode,
  DEFAULT_STT_SEGMENTATION_MODE,
  DEFAULT_STT_SEGMENTATION_PREFERENCE,
} from './live-phone-demo.account-preferences'
import {
  DEFAULT_BUBBLE_DISPLAY_MODE,
  type LivePhoneDemoBubbleDisplayMode,
} from './live-phone-demo.bubble-display'
import { resolveLivePhoneDemoBubbleDisplayCopy } from './live-phone-demo.bubble-display-copy'
import { resolveLivePhoneDemoMessageSpacingClass } from './live-phone-demo.message-spacing'
import {
  DEFAULT_SELECTABLE_TRANSLATION_MODEL,
  TRANSLATION_MODEL_OPTIONS,
  type TranslationModelBadge,
  type UserSelectableTranslationModel,
} from '@/lib/translation-models'
import { isLegacySonioxSilenceSliderNamespace } from '@/lib/api-namespace-version'
import { postNativeBannerZone } from '@/lib/native-banner-zone'
import {
  AUTO_SCROLL_BOTTOM_THRESHOLD_PX,
  INITIAL_SCROLL_METRICS,
  LIVE_DEMO_SCROLL_HANDLER_MEASUREMENT_COUNTER,
  LIVE_DEMO_SCROLL_HANDLER_MEASUREMENT_SAMPLE_TARGET,
  LIVE_DEMO_SCROLL_MEASUREMENT_STORAGE_KEY,
  SCROLL_TO_BOTTOM_BUTTON_THRESHOLD_PX,
  areScrollMetricsEqual,
  createAutoScrollScheduler,
  deriveLateMessageHeightChangeEffectAboveViewportAnchor,
  deriveLivePhoneDemoScrollMetrics,
  deriveNewMessageAutoScrollState,
  deriveScrollAutoFollowState,
  deriveScrollUiVisibility,
  readLivePhoneDemoScrollHandlerMeasurement,
  recordLivePhoneDemoScrollHandlerMeasurement,
  resolveLateMessageHeightChangeAnchorScrollTop,
  resolveLivePhoneDemoScrollMeasurementCounter,
  resolveNewMessageAutoScrollTargetTop,
  resolveScrollViewportAnchorSnapshot,
  resolveTopVisibleScrollDateLabelAnchor,
  resolvePrependScrollAnchorTop,
  shouldCapturePrependScrollTopSnapshot,
  shouldReadPrependScrollHeightForSnapshot,
  shouldUpdateScrollDateLabelState,
  type ChatScrollMessageCountSnapshot,
  type LateMessageHeightChangeEffectAboveViewportAnchor,
  type LivePhoneDemoScrollHandlerMeasurementSnapshot,
  type LivePhoneDemoScrollHandlerMeasurementState,
  type LivePhoneDemoScrollMetrics,
  type ScrollDateLabelAnchor,
  type ScrollViewportAnchorSnapshot,
} from './live-phone-demo.scroll.logic'
import {
  NATIVE_UI_EVENT,
  isNativeUiBridgeEnabledFromSearch,
  parseNativeUiBannerLayoutDetail,
  readCachedNativeUiBannerLayout,
  resolveNativeBottomBarBannerClearancePx,
  shouldEnableNativeDebugWebViewRemount,
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
import { LivePhoneDemoFeedbackMessageText } from './live-phone-demo.feedback-links'
import {
  LIVE_DEMO_LANGUAGE_BUTTON_DATA_QA,
  LIVE_DEMO_LANGUAGE_CHEVRON_DATA_QA,
  LIVE_DEMO_LANGUAGE_TRIGGER_ARIA_HASPOPUP,
  LIVE_DEMO_LANGUAGE_TRIGGER_CLASSNAME,
  LIVE_DEMO_MENU_OVERLAY_CLASSNAME,
  LIVE_DEMO_MENU_SCROLL_CONTAINER_CLASSNAME,
  resolveLiveDemoMenuPanelClassName,
  resolveLiveDemoMenuTriggerClassName,
} from './live-phone-demo.chrome-contract'
import { COPY_SUCCESS_EVENT } from './live-phone-demo.copy'
import { resolveLivePhoneDemoCopyActionCopy } from './live-phone-demo.copy-actions'
import { resolveLivePhoneDemoConversationDeleteCopy } from './live-phone-demo.delete-copy'
import { formatLivePhoneDemoLeaveNoticeText, resolveLivePhoneDemoConversationLeaveCopy } from './live-phone-demo.leave-copy'
import { formatLivePhoneDemoInviteNoticeText } from './live-phone-demo.invite-copy'
import { resolveLivePhoneDemoRoomManagementCopy } from './live-phone-demo.room-management-copy'
import { resolveLivePhoneDemoTtsActionCopy } from './live-phone-demo.tts-actions'
import {
  formatLivePhoneDemoMessageCount,
  formatLivePhoneDemoUsageDuration,
} from './live-phone-demo.usage-format'
import { resolveAnimatedLiveDemoMessageIds } from './live-phone-demo.message-animation'
import { resolveLivePhoneDemoComposerCopy } from '@/i18n/live-phone-demo-composer-copy'
import { registerNativeBackHandler } from '@/lib/native-back-handler'
import { readNativeQaBridgeAuthority, shouldExposeNativeQaBridge } from '@/lib/native-qa-bridge'
import {
  buildNativeRemountRestoreUrl,
  rememberNativeRemountRestoreConversation,
} from '@/lib/native-remount-restore'

const VOLUME_THRESHOLD = 0.05
const ACCOUNT_PREFERENCES_API_PATH = buildClientApiPath('/account/preferences')
const FEEDBACK_API_PATH = buildClientApiPath('/feedback')
const FEEDBACK_INSTAGRAM_CONTACT_URL = 'https://www.instagram.com/mingle.labs/'
const TTS_API_PATH = buildClientApiPath('/tts/inworld')
const ACCOUNT_PREFERENCES_SYNC_DEBOUNCE_MS = 1500
const ACCOUNT_PREFERENCES_LOCAL_CACHE_DEBOUNCE_MS = 200
const CONVERSATION_STATS_REPORT_INTERVAL_MS = 5_000
const FEEDBACK_MIN_MESSAGE_LENGTH = 5
const LS_KEY_FEEDBACK_DRAFT = 'mingle_live_phone_demo_feedback_draft_v1'
const DEBUG_WEBVIEW_REMOUNT_MENU_LABEL = 'Remount WebView'
const SILENT_WAV_DATA_URI = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA='
// Boost factor applied to TTS playback while STT is active.
// iOS .playAndRecord reduces speaker output; this compensates in software.
const TTS_STT_GAIN = 1.0
const NATIVE_TTS_EVENT = 'mingle:native-tts'
const SCROLL_TO_BOTTOM_BUTTON_BOTTOM_PX = 24
const SCROLL_TO_BOTTOM_BUTTON_SIZE_PX = 48
const SCROLL_UI_HIDE_DELAY_MS = 1000
const USER_SCROLL_INTENT_WINDOW_MS = 2000
const NATIVE_TTS_EVENT_TIMEOUT_MS = 15000
const LIVE_CHAT_BUBBLE_TEXT_LINE_HEIGHT = 1.25
const NATIVE_INSET_QUERY_MAX_PX = 240
const SILENCE_SLIDER_UPGRADE_TOAST_COOLDOWN_MS = 5000
const MENU_HISTORY_STATE_KEY = '__mingle_live_phone_demo_menu_depth'
const MENU_HISTORY_SCREEN_STATE_KEY = '__mingle_live_phone_demo_menu_screen'
const MENU_IOS_HISTORY_SETTLE_WINDOW_MS = 300
const WEB_CANVAS_BASE_WIDTH_PX = 400
const NATIVE_AD_BANNER_DEFAULT_HEIGHT_PX = 50
const COMPOSER_TEXTAREA_MIN_HEIGHT_PX = 36
const COMPOSER_TEXTAREA_MAX_HEIGHT_PX = 104
const COMPOSER_TEXTAREA_LINE_HEIGHT_PX = 22
const KEYBOARD_VIEWPORT_INSET_STABILITY_THRESHOLD_PX = 2
const COMPOSER_SHELL_MIN_HEIGHT_PX = 37
const VOICE_MODE_TOP_MARGIN_PX = 8
const VOICE_MODE_BOTTOM_MARGIN_PX = 0
const COMPOSER_MODE_TOP_MARGIN_PX = 16
const COMPOSER_MODE_BOTTOM_MARGIN_PX = 0
const VOICE_MODE_STT_BUTTON_WIDTH_PX = 136
const VOICE_MODE_STT_BUTTON_HEIGHT_PX = 45
const VOICE_MODE_STT_ICON_SIZE_PX = 20
const VOICE_MODE_STT_STOP_SIZE_PX = 14
const VOICE_MODE_SIDE_BUTTON_SIZE_PX = 44
const COMPOSER_MODE_CONTROL_SIZE_PX = 36
const VOICE_MODE_STT_BUTTON_RADIUS_PX = 20
// Intentionally not localized: review requested fixed English CTA labels for the voice-mode STT button.
const VOICE_MODE_START_LABEL = 'Start'
const VOICE_MODE_STOP_LABEL = 'Stop'
const LS_KEY_COMPOSER_DRAFT = 'mingle_live_phone_demo_composer_draft_v1'
const SAFE_AREA_BOTTOM_ENV_MEASURER_ID = '__mingle_live_phone_demo_safe_area_bottom_probe'

type PersistedFeedbackDraft = {
  category: LivePhoneDemoFeedbackCategory
  message: string
  email: string
  emailEdited: boolean
}

type LivePhoneDemoQaSnapshot = {
  routePathname: string
  documentLanguage: string
  uiLocale: string
  isNativeAppRuntime: boolean
  isStorageHydrated: boolean
  persistedUtteranceCount: number
  menuOpen: boolean
  menuScreen: LivePhoneDemoMenuScreen
  menuButtonLabel: string
  displayedAdBannerPosition: LivePhoneDemoAdBannerPosition | null
  nativeBannerLayoutPosition: 'top' | 'bottom' | null
  effectiveNativeTopInsetPx: number
  effectiveNativeBottomContentInsetPx: number
  effectiveNativeBottomBannerInsetPx: number
  nativeBottomBarClearancePx: number
  nativeChatTopSpacerPx: number
  nativeChatBottomSpacerPx: number
  headerHeightPx: number
  bottomBarHeightPx: number
  chatPaddingTopPx: number
  chatPaddingBottomPx: number
  chatClientHeight: number
  chatScrollHeight: number
  chatScrollTop: number
  isAtBottom: boolean
  showScrollToBottom: boolean
  isComposerOpen: boolean
  composerTextareaHeightPx: number
  utteranceCount: number
  micVisualState: 'idle' | 'connecting' | 'running' | 'error'
}

const SCROLL_PERFORMANCE_CHAT_UTTERANCE_COUNT = 500
const SCROLL_PERFORMANCE_CHAT_STARTED_AT_MS = Date.UTC(2026, 0, 15, 9, 0, 0)
const SCROLL_PERFORMANCE_CHAT_TURN_INTERVAL_MS = 45_000
const SCROLL_PERFORMANCE_CHAT_SPEAKERS = ['qa-alex', 'qa-mina', 'qa-sam', 'qa-ji'] as const
const SCROLL_PERFORMANCE_CHAT_ORIGINAL_TEXTS = [
  'We are checking the train platform and the meeting point before everyone arrives.',
  'The hallway is busy, so I will repeat the room number and wait near the sign.',
  'Please confirm whether the next update should be short or include the full context.',
  'I heard the schedule changed, and I want to make sure the group has the same details.',
  'The first option is faster, but the second option gives people more time to prepare.',
  'Can you summarize the last decision and tell me what action is still open?',
  'I will stay on this call while the rest of the team joins from the lobby.',
  'The connection is clear now, so we can continue with the translation demo.',
] as const
const SCROLL_PERFORMANCE_CHAT_TRANSLATION_TEXTS = [
  'QA Korean translation for the platform and meeting point check.',
  'QA Korean translation for the busy hallway and room number update.',
  'QA Korean translation for choosing a short or detailed update.',
  'QA Korean translation for the schedule change confirmation.',
  'QA Korean translation for comparing the faster and slower options.',
  'QA Korean translation for summarizing the decision and open action.',
  'QA Korean translation for waiting while the team joins.',
  'QA Korean translation for continuing the clear connection demo.',
] as const

const CHAT_SCROLL_SURFACE_STYLE: CSSProperties = {
  contain: 'layout paint style',
  isolation: 'isolate',
}

const CHAT_MESSAGE_ROW_STYLE: CSSProperties = {
  contain: 'layout style',
  isolation: 'isolate',
}

function buildQaSeededUtterances(count: number): Utterance[] {
  const safeCount = Number.isFinite(count) ? Math.max(1, Math.floor(count)) : 48
  const startedAtMs = Date.now() - 60_000

  return Array.from({ length: safeCount }, (_, index) => {
    const createdAtMs = startedAtMs + (index * 1000)
    return {
      id: `u-${createdAtMs}-${index}`,
      speaker: 'qa',
      originalText: `Seeded QA utterance ${index + 1}`,
      originalLang: 'en',
      targetLanguages: ['ko'],
      translations: {
        ko: `자동화 QA 번역 ${index + 1}`,
      },
      translationFinalized: {
        ko: true,
      },
      createdAtMs,
    }
  })
}

function buildQaScrollPerformanceUtterances(): Utterance[] {
  return Array.from({ length: SCROLL_PERFORMANCE_CHAT_UTTERANCE_COUNT }, (_, index) => {
    const turnNumber = index + 1
    const textIndex = index % SCROLL_PERFORMANCE_CHAT_ORIGINAL_TEXTS.length
    const speakerIndex = index % SCROLL_PERFORMANCE_CHAT_SPEAKERS.length
    const createdAtMs = SCROLL_PERFORMANCE_CHAT_STARTED_AT_MS + (index * SCROLL_PERFORMANCE_CHAT_TURN_INTERVAL_MS)

    return {
      id: `scroll-perf-${String(turnNumber).padStart(3, '0')}`,
      speaker: SCROLL_PERFORMANCE_CHAT_SPEAKERS[speakerIndex],
      speakerAvatarSeed: `scroll-performance-speaker-${speakerIndex + 1}`,
      speakerAvatarIndex: speakerIndex,
      originalText: `${SCROLL_PERFORMANCE_CHAT_ORIGINAL_TEXTS[textIndex]} Turn ${turnNumber}.`,
      originalLang: 'en',
      targetLanguages: ['ko'],
      translations: {
        ko: `${SCROLL_PERFORMANCE_CHAT_TRANSLATION_TEXTS[textIndex]} Turn ${turnNumber}.`,
      },
      translationFinalized: {
        ko: true,
      },
      createdAtMs,
    }
  })
}

declare global {
  interface Window {
    __MINGLE_QA__?: {
      getLiveDemoSnapshot: () => LivePhoneDemoQaSnapshot
      seedPersistedHistory: (count?: number) => number
      seedScrollPerformanceHistory: () => number
      resetPersistedHistory: () => void
      resetUiState: () => void
      getLiveDemoChatScrollHandlerMeasurement: () => LivePhoneDemoScrollHandlerMeasurementSnapshot | null
      resetLiveDemoChatScrollHandlerMeasurement: () => boolean
      setMenuOpen: (nextOpen: boolean) => void
      setAdBannerPosition: (nextPosition: LivePhoneDemoAdBannerPosition) => void
      setComposerOpen: (nextOpen: boolean) => void
      remountWebView: () => boolean
      setNativeSttStatusForQa: (status: string) => boolean
    }
  }
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

function TranslationModelBadgeChip({ badge }: { badge: TranslationModelBadge }) {
  const badgeClassName = badge === 'Best'
    ? 'border border-amber-200/80 bg-gradient-to-r from-amber-100 via-amber-50 to-orange-50 text-amber-800 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]'
    : 'border border-gray-200/90 bg-gray-100/95 text-gray-600'

  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full px-2 py-1 text-[0.66rem] font-semibold leading-none tracking-[0.01em] ${badgeClassName}`}
    >
      {badge}
    </span>
  )
}

function isNativeApp(): boolean {
  return typeof window !== 'undefined'
    && typeof window.ReactNativeWebView?.postMessage === 'function'
}

function isNativeUiRuntimeSignalPresent(): boolean {
  return typeof window !== 'undefined'
    && (
      isNativeApp()
      || isNativeUiBridgeEnabledFromSearch(window.location.search || '')
    )
}

function isNativeIosAppRuntime(): boolean {
  if (!isNativeApp()) return false

  const apiNamespace = typeof window === 'undefined'
    ? clientApiNamespace
    : readRequestedApiNamespaceFromSearch(window.location.search || '') || clientApiNamespace

  return apiNamespace.startsWith('ios/')
}

function isLikelyIOSPlatform(): boolean {
  if (typeof navigator === 'undefined') {
    return false
  }

  const userAgent = navigator.userAgent || ''
  if (/iPhone|iPad|iPod/i.test(userAgent)) {
    return true
  }

  return /Mac/i.test(userAgent) && typeof navigator.maxTouchPoints === 'number' && navigator.maxTouchPoints > 1
}

function readBrowserPerformanceNowMs(): number {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now()
}

function readLiveDemoScrollMeasurementStorageValue(): string | null {
  if (typeof window === 'undefined') return null

  try {
    return window.localStorage.getItem(LIVE_DEMO_SCROLL_MEASUREMENT_STORAGE_KEY)
  } catch {
    return null
  }
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

function resolveEffectiveNativeBannerInsetPx(explicitInsetPx: number, estimatedInsetPx: number): number {
  return explicitInsetPx > 0 ? explicitInsetPx : estimatedInsetPx
}

function isLivePhoneDemoFeedbackCategory(value: unknown): value is LivePhoneDemoFeedbackCategory {
  return value === 'feedback' || value === 'suggestion' || value === 'inquiry'
}

export function resolveKeyboardViewportInsetPx(viewport: VisualViewport | null | undefined): number {
  if (typeof window === 'undefined' || !viewport) return 0

  const inset = window.innerHeight - viewport.height - viewport.offsetTop
  if (!Number.isFinite(inset) || inset <= 0) return 0
  return Math.round(inset)
}

export function resolveHydratedComposerOpenState(input: {
  currentIsComposerOpen: boolean
  persistedInputMode: LivePhoneDemoInputMode | null
}): boolean {
  if (input.persistedInputMode === null) {
    return input.currentIsComposerOpen
  }

  return input.persistedInputMode === 'text'
}

export function resolveScrollToBottomButtonBottomPx(input: {
  baseBottomPx: number
  isNativeAppRuntime: boolean
  displayedAdBannerPosition: LivePhoneDemoAdBannerPosition | null
  bottomBannerInsetPx: number
}): number {
  const reservedPx = input.isNativeAppRuntime && input.displayedAdBannerPosition === 'bottom'
    ? Math.max(0, Math.round(input.bottomBannerInsetPx))
    : 0

  return input.baseBottomPx + reservedPx
}

export function resolveNativeBottomBannerOverlayInsetPx(input: {
  isNativeAppRuntime: boolean
  displayedAdBannerPosition: LivePhoneDemoAdBannerPosition | null
  reportedBottomInsetPx: number
  bottomBarClearancePx: number | null
  estimatedBottomBannerInsetPx: number
}): number {
  if (!input.isNativeAppRuntime || input.displayedAdBannerPosition !== 'bottom') return 0

  const reportedBottomInsetPx = Number(input.reportedBottomInsetPx)
  const safeReportedBottomInsetPx = Number.isFinite(reportedBottomInsetPx) && reportedBottomInsetPx > 0
    ? Math.round(reportedBottomInsetPx)
    : 0
  const estimatedBottomBannerInsetPx = Number(input.estimatedBottomBannerInsetPx)
  const safeEstimatedBottomBannerInsetPx = Number.isFinite(estimatedBottomBannerInsetPx) && estimatedBottomBannerInsetPx > 0
    ? Math.round(estimatedBottomBannerInsetPx)
    : 0
  const bottomBarClearancePx = Number(input.bottomBarClearancePx)
  const safeBottomBarClearancePx = Number.isFinite(bottomBarClearancePx) && bottomBarClearancePx > 0
    ? Math.round(bottomBarClearancePx)
    : 0

  const fallbackInsetPx = safeReportedBottomInsetPx > 0 && safeEstimatedBottomBannerInsetPx > 0
    ? Math.min(safeReportedBottomInsetPx, safeEstimatedBottomBannerInsetPx)
    : Math.max(safeReportedBottomInsetPx, safeEstimatedBottomBannerInsetPx)

  if (safeReportedBottomInsetPx <= 0 || safeBottomBarClearancePx <= 0) {
    return fallbackInsetPx
  }

  if (
    safeEstimatedBottomBannerInsetPx > 0
    && safeReportedBottomInsetPx <= safeEstimatedBottomBannerInsetPx + 8
  ) {
    return safeReportedBottomInsetPx
  }

  const derivedOverlayInsetPx = safeReportedBottomInsetPx - safeBottomBarClearancePx
  return derivedOverlayInsetPx > 0 ? derivedOverlayInsetPx : fallbackInsetPx
}

function readSafeAreaInsetBottomPx(): number {
  if (typeof window === 'undefined' || typeof document === 'undefined') return 0

  let probe = document.getElementById(SAFE_AREA_BOTTOM_ENV_MEASURER_ID) as HTMLDivElement | null
  if (!probe) {
    probe = document.createElement('div')
    probe.id = SAFE_AREA_BOTTOM_ENV_MEASURER_ID
    probe.setAttribute('aria-hidden', 'true')
    probe.style.position = 'fixed'
    probe.style.left = '0'
    probe.style.bottom = '0'
    probe.style.width = '0'
    probe.style.height = '0'
    probe.style.visibility = 'hidden'
    probe.style.pointerEvents = 'none'
    probe.style.paddingBottom = 'env(safe-area-inset-bottom)'
    document.body.appendChild(probe)
  }

  const paddingBottomPx = Number.parseFloat(window.getComputedStyle(probe).paddingBottom || '')
  return Number.isFinite(paddingBottomPx) && paddingBottomPx > 0
    ? Math.round(paddingBottomPx)
    : 0
}

export function resizeComposerTextarea(textarea: HTMLTextAreaElement | null): number {
  if (!textarea) return COMPOSER_TEXTAREA_MIN_HEIGHT_PX

  textarea.style.height = 'auto'
  textarea.style.lineHeight = `${COMPOSER_TEXTAREA_LINE_HEIGHT_PX}px`
  textarea.style.overflowY = 'hidden'
  const nextHeight = Math.max(
    COMPOSER_TEXTAREA_MIN_HEIGHT_PX,
    Math.min(COMPOSER_TEXTAREA_MAX_HEIGHT_PX, textarea.scrollHeight),
  )
  textarea.style.height = `${nextHeight}px`
  textarea.style.overflowY = nextHeight >= COMPOSER_TEXTAREA_MAX_HEIGHT_PX ? 'auto' : 'hidden'
  return nextHeight
}

export function resolveStableKeyboardViewportInsetPx(currentInsetPx: number, nextInsetPx: number): number {
  const safeCurrentInsetPx = Number.isFinite(currentInsetPx) && currentInsetPx > 0
    ? Math.round(currentInsetPx)
    : 0
  const safeNextInsetPx = Number.isFinite(nextInsetPx) && nextInsetPx > 0
    ? Math.round(nextInsetPx)
    : 0

  if (safeCurrentInsetPx === 0 || safeNextInsetPx === 0) return safeNextInsetPx
  return Math.abs(safeCurrentInsetPx - safeNextInsetPx) < KEYBOARD_VIEWPORT_INSET_STABILITY_THRESHOLD_PX
    ? safeCurrentInsetPx
    : safeNextInsetPx
}

export function resolveComposerDraftStorageKey(
  conversationId?: string,
  storageNamespace?: string,
): string {
  const namespace = (conversationId || storageNamespace || '').trim()
  return buildStorageKey(LS_KEY_COMPOSER_DRAFT, namespace || undefined)
}

function readPersistedComposerDraft(storageKey: string): string {
  if (typeof window === 'undefined') return ''

  try {
    const rawValue = window.localStorage.getItem(storageKey)
    return typeof rawValue === 'string' ? rawValue : ''
  } catch {
    return ''
  }
}

function persistComposerDraft(nextDraft: string, storageKey: string): void {
  if (typeof window === 'undefined') return

  try {
    if (nextDraft) {
      window.localStorage.setItem(storageKey, nextDraft)
      return
    }
    window.localStorage.removeItem(storageKey)
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

function parseNativeBannerPositionFromSearch(
  search: string,
  queryKey: string,
): LivePhoneDemoAdBannerPosition | null {
  try {
    const params = new URLSearchParams(search)
    return normalizeLivePhoneDemoAdBannerPosition(params.get(queryKey))
  } catch {
    return null
  }
}

function readNativeBannerPositionFromWindow(queryKey: string): LivePhoneDemoAdBannerPosition | null {
  if (typeof window === 'undefined') return null
  return parseNativeBannerPositionFromSearch(window.location.search || '', queryKey)
}

function useNativeBannerPositionFromSearch(queryKey: string): LivePhoneDemoAdBannerPosition | null {
  return useSyncExternalStore(
    subscribeToLocationSearch,
    () => readNativeBannerPositionFromWindow(queryKey),
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

function areLanguageSelectionsEqual(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((language, index) => language === right[index])
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

function readScrollDateLabelAnchors(container: HTMLDivElement): ScrollDateLabelAnchor[] {
  const anchors: ScrollDateLabelAnchor[] = []

  for (const child of Array.from(container.children)) {
    if (!(child instanceof HTMLElement)) continue

    const createdAtMs = Number(child.dataset.utteranceCreatedAt || '')
    if (!Number.isFinite(createdAtMs) || createdAtMs <= 0) continue

    const { offsetTop, offsetHeight } = child
    if (!Number.isFinite(offsetTop) || !Number.isFinite(offsetHeight)) continue

    anchors.push({
      utteranceId: child.dataset.utteranceId || undefined,
      createdAtMs,
      offsetTop,
      offsetHeight,
    })
  }

  return anchors
}

function findTopVisibleUtteranceDateLabel(
  anchors: readonly ScrollDateLabelAnchor[],
  scrollTop: number,
  locale: string,
): string {
  const anchor = resolveTopVisibleScrollDateLabelAnchor({
    anchors,
    scrollTop,
  })
  if (!anchor) return ''
  return formatScrollDateLabel(anchor.createdAtMs, locale)
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

type LivePhoneDemoMenuScreen = 'root' | 'feedback' | 'conversation-management' | 'participants' | 'display-language'
type LivePhoneDemoMenuTransitionMode = 'animate' | 'instant'
type LivePhoneDemoMenuScreenDirection = 'forward' | 'back'

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

type LivePhoneDemoPanelHeaderProps = {
  title: string
  backLabel: string
  onBack: () => void
  className?: string
}

function LivePhoneDemoPanelHeader({
  title,
  backLabel,
  onBack,
  className = '',
}: LivePhoneDemoPanelHeaderProps) {
  return (
    <div
      className={`flex shrink-0 items-center border-b border-gray-200 px-4 ${className}`.trim()}
      style={{
        paddingTop: 'env(safe-area-inset-top, 0px)',
        height: 'calc(55px + env(safe-area-inset-top, 0px))',
      }}
    >
      <button
        type="button"
        aria-label={backLabel}
        onClick={onBack}
        className="inline-flex h-[38px] w-10 items-center justify-center text-gray-700 transition hover:text-gray-900 active:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
      >
        <ChevronLeft size={22} strokeWidth={2.2} />
      </button>
      <div className="flex-1 text-center text-[1rem] font-semibold text-gray-950">
        {title}
      </div>
      <div className="w-10" aria-hidden="true" />
    </div>
  )
}

function isLivePhoneDemoMenuScreen(value: unknown): value is LivePhoneDemoMenuScreen {
  return value === 'root'
    || value === 'feedback'
    || value === 'conversation-management'
    || value === 'participants'
    || value === 'display-language'
}

function resolveMenuScreenForDepth(
  depth: number,
  preferredScreen?: LivePhoneDemoMenuScreen,
): LivePhoneDemoMenuScreen {
  if (depth <= 1) return 'root'
  if (depth >= 3) {
    if (preferredScreen === 'display-language') return 'display-language'
    if (preferredScreen === 'participants') return 'participants'
    return 'conversation-management'
  }
  if (preferredScreen === 'display-language') return 'display-language'
  if (preferredScreen === 'conversation-management') return 'conversation-management'
  if (preferredScreen === 'participants') return 'participants'
  return 'feedback'
}

function buildMenuHistoryState(
  depth: number,
  screen: LivePhoneDemoMenuScreen = 'root',
): Record<string, unknown> {
  if (typeof window === 'undefined') {
    return {
      [MENU_HISTORY_STATE_KEY]: depth,
      [MENU_HISTORY_SCREEN_STATE_KEY]: resolveMenuScreenForDepth(depth, screen),
    }
  }

  const currentState = window.history.state
  if (!currentState || typeof currentState !== 'object') {
    return {
      [MENU_HISTORY_STATE_KEY]: depth,
      [MENU_HISTORY_SCREEN_STATE_KEY]: resolveMenuScreenForDepth(depth, screen),
    }
  }

  return {
    ...(currentState as Record<string, unknown>),
    [MENU_HISTORY_STATE_KEY]: depth,
    [MENU_HISTORY_SCREEN_STATE_KEY]: resolveMenuScreenForDepth(depth, screen),
  }
}

function resolveMenuContentTransition(
  transitionMode: LivePhoneDemoMenuTransitionMode,
) {
  return transitionMode === 'animate'
    ? { duration: 0.32, ease: [0.22, 1, 0.36, 1] as const }
    : { duration: 0 }
}

export interface LivePhoneDemoRef {
  startRecording: () => Promise<void>
  stopRecording: (options?: { deferRunningStateChange?: boolean, discardPendingFinalization?: boolean, forceNativeStop?: boolean }) => Promise<void>
  prepareForDeletion: () => void
  isSttSessionRunning: () => boolean
  requestCloseTopmostOverlay: () => boolean
  resetNavigationOverlays: () => Promise<void>
}

export type LatestUtterancePayload = {
  preview: string
  createdAt: string
  speaker?: string
  speakerAvatarSeed?: string
  speakerAvatarIndex?: number
}

type LivePhoneDemoStartRecordingPreparation = {
  switchedFromLiveConversation: boolean
}

interface LivePhoneDemoProps {
  onLimitReached?: () => void
  enableAutoTTS?: boolean
  uiLocale: string
  usageLimitReachedLabel: string
  usageLimitRetryHintLabel: string
  connectingLabel: string
  connectionFailedLabel: string
  switchLiveRoomToastLabel: string
  muteTtsLabel: string
  unmuteTtsLabel: string
  textSizeLabel: string
  silenceFinalizeLabel: string
  sttSegmentationModeLabel: string
  sttSegmentationModeEndLabel: string
  sttSegmentationModeFinLabel: string
  endpointTuningLabel: string
  endpointTuningShortLabel: string
  endpointTuningLongLabel: string
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
  headerMode?: 'default' | 'conversation'
  backButtonLabel?: string
  onBack?: () => void
  onConversationDeleted?: () => void
  conversationTitle?: string
  conversationId?: string
  preferredDisplayLanguage?: string | null
  preferredDisplayLanguages?: string[]
  sessionKeyOverride?: string
  storageNamespace?: string
  initialSelectedLanguages?: string[]
  // The caller's OWN picks, distinct from initialSelectedLanguages (the room
  // union) once a room has 2+ members. Solo rooms: identical to the above.
  initialOwnSelectedLanguages?: string[]
  // language code -> ids of the members who picked it, for the language
  // picker's per-row avatar attribution. Empty/undefined for solo rooms.
  selectedLanguagesAttribution?: Record<string, string[]>
  initialSpeechLanguages?: string[]
  initialTranslationLanguagesLinked?: boolean
  initialDefaultDisplayLanguage?: string | null
  autoStartOnMount?: boolean
  onAutoStartHandled?: () => void
  isVisible?: boolean
  enableNativeBannerBridge?: boolean
  onStartRecordingRequested?: () => Promise<LivePhoneDemoStartRecordingPreparation | void> | LivePhoneDemoStartRecordingPreparation | void
  onSttSessionRunningChange?: (isRunning: boolean) => void
  onLatestUtteranceChange?: (payload: LatestUtterancePayload) => void
  onLatestUtterancePreviewChange?: (payload: LatestUtterancePayload | null) => void
  onConversationStatsChange?: (payload: {
    usageSec: number
    messageCount: number
  }) => void
  onSelectedLanguagesChange?: (selectedLanguages: string[]) => void | Promise<void>
  onSpeechLanguagesChange?: (speechLanguages: string[]) => void | Promise<void>
  onTranslationLanguagesLinkedChange?: (translationLanguagesLinked: boolean) => void | Promise<void>
  onDefaultDisplayLanguageChange?: (defaultDisplayLanguage: string | null) => void
  onOpenProfile?: (userId: string) => void
  // Invoked when the participants panel's invite button is tapped — the
  // panel itself has no router, so navigating to the invite-picker screen
  // (see invite-friends-screen.tsx, reused in "add to this room" mode) is
  // the caller's job, same as onConversationDeleted above.
  onInvite?: () => void
  // True when this is a 2-real-member room and a block exists between the
  // viewer and the other member (either direction) — see
  // ConversationChannelSummary.isBlockedCounterpart. KakaoTalk-style: the
  // room itself stays mounted/reachable, but the header title falls back to
  // a generic placeholder, the composer/mic are replaced with a "blocked"
  // message, and tapping the counterpart's avatar opens nothing.
  isBlockedCounterpart?: boolean
  // See ConversationChannelSummary.isMultiMember — decides whether the
  // room-management menu's row-removal action is "delete" (solo room,
  // deletes for the owner) or "leave" (shared room, removes just the
  // caller's own membership — see leaveConversationChannel).
  isMultiMember?: boolean
}

const TTS_AUDIO_WAIT_TIMEOUT_MS = 3000
const LIVE_UTTERANCE_PREVIEW_DEBOUNCE_MS = 250

function buildLatestUtterancePayload(utterance: Utterance): LatestUtterancePayload | null {
  const preview = utterance.originalText.trim()
  if (!preview) return null

  const createdAtMs = typeof utterance.createdAtMs === 'number'
    && Number.isFinite(utterance.createdAtMs)
    ? utterance.createdAtMs
    : Date.now()

  return {
    preview,
    createdAt: new Date(createdAtMs).toISOString(),
    speaker: utterance.speaker,
    speakerAvatarSeed: utterance.speakerAvatarSeed,
    speakerAvatarIndex: utterance.speakerAvatarIndex,
  }
}

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

type NativeSetBottomBarClearanceCommand = {
  type: 'native_set_bottom_bar_clearance'
  payload?: {
    clearancePx?: number
  }
}

type NativeRemountWebViewCommand = {
  type: 'native_remount_webview'
  payload?: {
    url?: string
  }
}

type NativeQaSetSttStatusCommand = {
  type: 'native_qa_set_stt_status'
  payload?: {
    status?: string
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

type LivePhoneDemoChatMessageRowProps = {
  utterance: Utterance
  uiLocale: string
  preferredDisplayLanguage?: string | null
  preferredDisplayLanguages?: readonly string[]
  defaultDisplayLanguage?: string | null
  languageOrder: readonly string[]
  isDraft: boolean
  onPlayOriginal: (utterance: Utterance) => void
  onPlayTranslation: (utterance: Utterance, language: string, text: string) => void
  bubbleTextClassName: string
  speakingPlaybackKey?: string
  shouldAnimateEntrance: boolean
  viewerUserId?: string | null
  onOpenProfile?: (userId: string) => void
  bubbleDisplayMode: LivePhoneDemoBubbleDisplayMode
}

function resolveUtteranceCreatedAtDataAttribute(utterance: Utterance): string {
  return (typeof utterance.createdAtMs === 'number' && Number.isFinite(utterance.createdAtMs))
    ? String(Math.floor(utterance.createdAtMs))
    : ''
}

function isPlaybackKeyForUtterance(playbackKey: string | undefined, utteranceId: string): boolean {
  if (!playbackKey) return false

  return (
    playbackKey.startsWith(`original:${utteranceId}:`)
    || playbackKey.startsWith(`translation:${utteranceId}:`)
  )
}

function LivePhoneDemoChatMessageRow({
  utterance,
  uiLocale,
  preferredDisplayLanguage,
  preferredDisplayLanguages,
  defaultDisplayLanguage,
  languageOrder,
  isDraft,
  onPlayOriginal,
  onPlayTranslation,
  bubbleTextClassName,
  speakingPlaybackKey,
  shouldAnimateEntrance,
  viewerUserId,
  onOpenProfile,
  bubbleDisplayMode,
}: LivePhoneDemoChatMessageRowProps) {
  return (
    <div
      data-utterance-id={utterance.id}
      data-utterance-created-at={resolveUtteranceCreatedAtDataAttribute(utterance)}
      style={CHAT_MESSAGE_ROW_STYLE}
    >
      <ChatBubble
        utterance={utterance}
        uiLocale={uiLocale}
        preferredDisplayLanguage={preferredDisplayLanguage}
        preferredDisplayLanguages={preferredDisplayLanguages}
        defaultDisplayLanguage={defaultDisplayLanguage}
        languageOrder={languageOrder}
        isDraft={isDraft}
        onPlayOriginal={onPlayOriginal}
        onPlayTranslation={onPlayTranslation}
        bubbleTextClassName={bubbleTextClassName}
        speakingPlaybackKey={speakingPlaybackKey}
        shouldAnimateEntrance={shouldAnimateEntrance}
        viewerUserId={viewerUserId}
        onOpenProfile={onOpenProfile}
        bubbleDisplayMode={bubbleDisplayMode}
      />
    </div>
  )
}

const MemoizedLivePhoneDemoChatMessageRow = memo(
  LivePhoneDemoChatMessageRow,
  function areLivePhoneDemoChatMessageRowsEqual(prev, next) {
    if (prev.utterance !== next.utterance) return false
    if (prev.uiLocale !== next.uiLocale) return false
    if (prev.preferredDisplayLanguage !== next.preferredDisplayLanguage) return false
    if (prev.preferredDisplayLanguages !== next.preferredDisplayLanguages) return false
    if (prev.defaultDisplayLanguage !== next.defaultDisplayLanguage) return false
    if (prev.languageOrder !== next.languageOrder) return false
    if (prev.isDraft !== next.isDraft) return false
    if (prev.onPlayOriginal !== next.onPlayOriginal) return false
    if (prev.onPlayTranslation !== next.onPlayTranslation) return false
    if (prev.bubbleTextClassName !== next.bubbleTextClassName) return false
    if (prev.shouldAnimateEntrance !== next.shouldAnimateEntrance) return false
    if (prev.viewerUserId !== next.viewerUserId) return false
    if (prev.onOpenProfile !== next.onOpenProfile) return false
    if (prev.bubbleDisplayMode !== next.bubbleDisplayMode) return false

    const wasSpeakingThisUtterance = isPlaybackKeyForUtterance(prev.speakingPlaybackKey, prev.utterance.id)
    const isSpeakingThisUtterance = isPlaybackKeyForUtterance(next.speakingPlaybackKey, next.utterance.id)
    if (wasSpeakingThisUtterance || isSpeakingThisUtterance) {
      return prev.speakingPlaybackKey === next.speakingPlaybackKey
    }

    return true
  },
)

// Renders a departed member's "{name} left" line in the message timeline —
// KakaoTalk-style: plain centered text, not a bubble, shown only inside the
// room itself (never a toast, push notification, or list-preview text). See
// ConversationLeaveNotice / leaveConversationChannel.
function LivePhoneDemoLeaveNoticeRow({
  notice,
  uiLocale,
}: {
  notice: ConversationLeaveNotice
  uiLocale: string
}) {
  const displayName = notice.name?.trim() || (notice.handle ? `@${notice.handle.trim()}` : '')
  if (!displayName) return null

  return (
    <div
      data-leave-notice-user-id={notice.userId}
      style={CHAT_MESSAGE_ROW_STYLE}
      className="flex justify-center py-1"
    >
      <span className="rounded-full bg-gray-100 px-3 py-1 text-[0.78rem] text-gray-500">
        {formatLivePhoneDemoLeaveNoticeText(uiLocale, displayName)}
      </span>
    </div>
  )
}

const MemoizedLivePhoneDemoLeaveNoticeRow = memo(LivePhoneDemoLeaveNoticeRow)

// Renders "{inviter} invited {invitee}" in the message timeline — same
// KakaoTalk-style plain centered text as LivePhoneDemoLeaveNoticeRow above,
// shown the moment the invite happens (see ConversationInviteNotice /
// inviteMembersToConversationChannel), not deferred to the invitee's first
// message.
function LivePhoneDemoInviteNoticeRow({
  notice,
  uiLocale,
}: {
  notice: ConversationInviteNotice
  uiLocale: string
}) {
  const inviterName = notice.invitedByName?.trim() || (notice.invitedByHandle ? `@${notice.invitedByHandle.trim()}` : '')
  const inviteeName = notice.inviteeName?.trim() || (notice.inviteeHandle ? `@${notice.inviteeHandle.trim()}` : '')
  if (!inviterName || !inviteeName) return null

  return (
    <div
      data-invite-notice-invitee-user-id={notice.inviteeUserId}
      style={CHAT_MESSAGE_ROW_STYLE}
      className="flex justify-center py-1"
    >
      <span className="rounded-full bg-gray-100 px-3 py-1 text-[0.78rem] text-gray-500">
        {formatLivePhoneDemoInviteNoticeText(uiLocale, inviterName, inviteeName)}
      </span>
    </div>
  )
}

const MemoizedLivePhoneDemoInviteNoticeRow = memo(LivePhoneDemoInviteNoticeRow)

type LivePhoneDemoTimelineItem =
  | { kind: 'message'; timestampMs: number; utterance: Utterance }
  | { kind: 'leave-notice'; timestampMs: number; notice: ConversationLeaveNotice }
  | { kind: 'invite-notice'; timestampMs: number; notice: ConversationInviteNotice }

function postNativeQaCommand(command: NativeRemountWebViewCommand | NativeQaSetSttStatusCommand): boolean {
  if (typeof window === 'undefined') return false
  const bridge = window.ReactNativeWebView
  if (!bridge || typeof bridge.postMessage !== 'function') return false

  try {
    bridge.postMessage(JSON.stringify(command))
    return true
  } catch {
    return false
  }
}

function buildTrackingRequestHeaders(args: {
  sessionKey: string
  trackingUserId: string
  nativeAppUpdate: NativeAppUpdateDetail | null
  extraHeaders?: Record<string, string>
}): Record<string, string> {
  const headers: Record<string, string> = {
    'x-mingle-session-key': args.sessionKey,
    'x-mingle-user-id': args.trackingUserId,
    ...(args.extraHeaders || {}),
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
  usageLimitReachedLabel,
  usageLimitRetryHintLabel,
  connectingLabel,
  connectionFailedLabel,
  switchLiveRoomToastLabel,
  textSizeLabel,
  silenceFinalizeLabel,
  sttSegmentationModeLabel,
  sttSegmentationModeEndLabel,
  sttSegmentationModeFinLabel,
  endpointTuningLabel,
  endpointTuningShortLabel,
  endpointTuningLongLabel,
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
  headerMode = 'default',
  backButtonLabel = 'Back',
  onBack,
  onConversationDeleted,
  conversationTitle,
  conversationId,
  preferredDisplayLanguage,
  preferredDisplayLanguages,
  sessionKeyOverride,
  storageNamespace,
  initialSelectedLanguages,
  initialOwnSelectedLanguages,
  selectedLanguagesAttribution: initialSelectedLanguagesAttribution,
  initialSpeechLanguages,
  initialTranslationLanguagesLinked,
  initialDefaultDisplayLanguage,
  isVisible = true,
  enableNativeBannerBridge = true,
  onStartRecordingRequested,
  onSttSessionRunningChange,
  onLatestUtteranceChange,
  onLatestUtterancePreviewChange,
  onConversationStatsChange,
  onSelectedLanguagesChange,
  onSpeechLanguagesChange,
  onDefaultDisplayLanguageChange,
  onOpenProfile,
  onInvite,
  isBlockedCounterpart = false,
  isMultiMember = false,
}, ref) {
  // Only used to tell "my" bubbles from "theirs" in a room shared by more
  // than one real account — the solo room's own layout never depends on it.
  const { data: session } = useSession()
  const viewerUserId = typeof session?.user?.id === 'string' ? session.user.id : null
  const viewerImage = typeof session?.user?.image === 'string' ? session.user.image : null
  const accountPreferencesTrackingUserId = useMemo(() => getOrCreateTrackingUserId(), [])
  const accountPreferencesCacheIdentity = useMemo<AccountPreferencesCacheIdentity>(() => ({
    apiNamespace: clientApiNamespace,
    userId: viewerUserId,
    trackingUserId: accountPreferencesTrackingUserId,
  }), [accountPreferencesTrackingUserId, viewerUserId])
  const initialCachedAccountPreferencesSnapshot = useMemo(() => readCachedAccountPreferencesSnapshot(
    accountPreferencesCacheIdentity,
    isLegacySonioxSilenceSliderNamespace(clientApiNamespace),
  ), [accountPreferencesCacheIdentity])
  const initialCachedAccountPreferences = initialCachedAccountPreferencesSnapshot?.preferences ?? null
  const fallbackLanguages = useMemo(() => resolveDefaultSelectedLanguages(uiLocale), [uiLocale])
  const composerCopy = useMemo(() => resolveLivePhoneDemoComposerCopy(uiLocale), [uiLocale])
  const blockedComposerMessageLabel = composerCopy.blockedComposerMessage
  // Blocking hides the counterpart's PHOTO and stops messaging — their name
  // stays visible, and tapping my own avatar should keep opening my own
  // profile.
  const handleOpenProfileForBubble = useCallback((userId: string) => {
    if (isBlockedCounterpart && userId !== viewerUserId) return
    onOpenProfile?.(userId)
  }, [isBlockedCounterpart, viewerUserId, onOpenProfile])
  const conversationSelectedLanguages = useMemo(
    () => sanitizeSttLanguageUnion(initialSelectedLanguages, fallbackLanguages),
    [fallbackLanguages, initialSelectedLanguages],
  )
  const conversationSpeechLanguages = useMemo(
    () => sanitizeSttLanguageSelection(
      initialSpeechLanguages,
      conversationSelectedLanguages.slice(0, MAX_STT_LANGUAGE_SELECTION),
    ),
    [conversationSelectedLanguages, initialSpeechLanguages],
  )
  // Falls back to the union only when the server hasn't sent an own-list
  // (e.g. an older solo-room response). An explicit empty list remains empty
  // for a newly materialized invitee who has not picked a language yet.
  const conversationOwnSelectedLanguages = useMemo(
    () => resolveLanguageSelectorOwnSelectedLanguages(
      conversationSelectedLanguages,
      initialOwnSelectedLanguages,
    ),
    [conversationSelectedLanguages, initialOwnSelectedLanguages],
  )
  const conversationTranslationLanguagesLinked = initialTranslationLanguagesLinked !== false
  const normalizedPreferredDisplayLanguages = useMemo(
    () => sanitizeSttLanguageSelection(
      preferredDisplayLanguages,
      preferredDisplayLanguage ? [preferredDisplayLanguage] : [],
    ),
    [preferredDisplayLanguage, preferredDisplayLanguages],
  )
  const [defaultDisplayLanguage, setDefaultDisplayLanguage] = useState<string | null>(
    initialDefaultDisplayLanguage?.trim() || null,
  )
  useEffect(() => {
    setDefaultDisplayLanguage(initialDefaultDisplayLanguage?.trim() || null)
  }, [conversationId, initialDefaultDisplayLanguage])
  const nativeAppUpdateCopy = useMemo(() => resolveNativeAppUpdateCopy(uiLocale), [uiLocale])
  const composerDraftStorageKey = useMemo(
    () => resolveComposerDraftStorageKey(conversationId, storageNamespace),
    [conversationId, storageNamespace],
  )
  const [selectedLanguages, setSelectedLanguages] = useState<string[]>(
    conversationId ? conversationSelectedLanguages : fallbackLanguages,
  )
  // The caller's own picks — see initialOwnSelectedLanguages above. Drives
  // the language picker's add/remove decision and what gets PATCHed; the
  // union (selectedLanguages) drives what's shown as checked and what's sent
  // as translation targets.
  const [ownSelectedLanguages, setOwnSelectedLanguages] = useState<string[]>(
    conversationId ? conversationOwnSelectedLanguages : fallbackLanguages,
  )
  const ownSelectedLanguagesRef = useRef<string[]>(ownSelectedLanguages)
  const [selectedLanguagesAttribution, setSelectedLanguagesAttribution] = useState<Record<string, string[]>>(
    initialSelectedLanguagesAttribution ?? {},
  )
  const selectedLanguagesAttributionRef = useRef(selectedLanguagesAttribution)
  const [speechLanguages, setSpeechLanguages] = useState<string[]>(
    conversationId ? conversationSpeechLanguages : fallbackLanguages,
  )
  const [translationLanguagesLinked, setTranslationLanguagesLinked] = useState(
    conversationId ? conversationTranslationLanguagesLinked : true,
  )
  const resolveConversationSessionKey = useCallback(
    () => getOrCreateSessionKey(storageNamespace, sessionKeyOverride),
    [sessionKeyOverride, storageNamespace],
  )
  const feedbackCopy = useMemo(() => resolveLivePhoneDemoFeedbackCopy(uiLocale), [uiLocale])
  const deleteConversationCopy = useMemo(() => resolveLivePhoneDemoConversationDeleteCopy(uiLocale), [uiLocale])
  const leaveConversationCopy = useMemo(() => resolveLivePhoneDemoConversationLeaveCopy(uiLocale), [uiLocale])
  const roomManagementCopy = useMemo(() => resolveLivePhoneDemoRoomManagementCopy(uiLocale), [uiLocale])
  const defaultDisplayLanguageCopy = useMemo(() => {
    return {
      menuItemLabel: roomManagementCopy.defaultDisplayLanguageMenuItemLabel,
      pageTitle: roomManagementCopy.defaultDisplayLanguagePageTitle,
    }
  }, [roomManagementCopy])
  const participantsCopy = useMemo(() => {
    return {
      menuItemLabel: roomManagementCopy.participantsMenuItemLabel,
      pageTitle: roomManagementCopy.participantsPageTitle,
      selfLabel: roomManagementCopy.participantsSelfLabel,
      loadingLabel: roomManagementCopy.participantsLoadingLabel,
      errorLabel: roomManagementCopy.participantsErrorLabel,
      retryLabel: roomManagementCopy.participantsRetryLabel,
      inviteButtonLabel: roomManagementCopy.participantsInviteButtonLabel,
    }
  }, [roomManagementCopy])
  const accountPreferencesApiPath = ACCOUNT_PREFERENCES_API_PATH
  const copyActionCopy = useMemo(() => resolveLivePhoneDemoCopyActionCopy(uiLocale), [uiLocale])
  const ttsActionCopy = useMemo(() => resolveLivePhoneDemoTtsActionCopy(uiLocale), [uiLocale])
  const bubbleDisplayCopy = useMemo(() => resolveLivePhoneDemoBubbleDisplayCopy(uiLocale), [uiLocale])
  const [langSelectorOpen, setLangSelectorOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [menuScreen, setMenuScreen] = useState<LivePhoneDemoMenuScreen>('root')
  const [menuScreenDirection, setMenuScreenDirection] = useState<LivePhoneDemoMenuScreenDirection>('forward')
  // Display-language is a second-level surface opened directly from the room
  // menu. The conversation-management page remains an independent surface.
  const menuContentScreen: LivePhoneDemoMenuScreen = menuScreen
  const [textSizeMenuOpen, setTextSizeMenuOpen] = useState(false)
  const [translationModelMenuOpen, setTranslationModelMenuOpen] = useState(false)
  const [bubbleDisplayModeMenuOpen, setBubbleDisplayModeMenuOpen] = useState(false)
  const [textSizeLevel, setTextSizeLevel] = useState<number>(
    initialCachedAccountPreferences?.textSizeLevel ?? DEFAULT_TEXT_SIZE_LEVEL,
  )
  const [sonioxManualFinalizeSilenceMs, setSonioxManualFinalizeSilenceMs] = useState<number>(
    initialCachedAccountPreferences?.sonioxManualFinalizeSilenceMs ?? DEFAULT_SONIOX_SILENCE_MS,
  )
  const [sttSegmentationMode, setSttSegmentationMode] = useState<SttSegmentationMode | null>(
    initialCachedAccountPreferences?.sttSegmentationMode ?? DEFAULT_STT_SEGMENTATION_PREFERENCE,
  )
  const [sonioxEndpointMaxDelayMs, setSonioxEndpointMaxDelayMs] = useState<number>(
    initialCachedAccountPreferences?.sonioxEndpointMaxDelayMs ?? DEFAULT_SONIOX_ENDPOINT_MAX_DELAY_MS,
  )
  const [sonioxEndpointTuningStep, setSonioxEndpointTuningStep] = useState<number>(
    initialCachedAccountPreferences?.sonioxEndpointTuningStep ?? DEFAULT_SONIOX_ENDPOINT_TUNING_STEP,
  )
  const [translationModel, setTranslationModel] = useState<UserSelectableTranslationModel>(
    initialCachedAccountPreferences?.translationModel ?? DEFAULT_SELECTABLE_TRANSLATION_MODEL,
  )
  const [bubbleDisplayMode, setBubbleDisplayMode] = useState<LivePhoneDemoBubbleDisplayMode>(
    initialCachedAccountPreferences?.bubbleDisplayMode ?? DEFAULT_BUBBLE_DISPLAY_MODE,
  )
  const [adBannerPosition, setAdBannerPosition] = useState<LivePhoneDemoAdBannerPosition | null>(
    initialCachedAccountPreferences?.adBannerPosition ?? null,
  )
  const [sessionAdBannerPositionOverride, setSessionAdBannerPositionOverride] = useState<LivePhoneDemoAdBannerPosition | null>(null)
  const [isSilenceFinalizeSliderLocked, setIsSilenceFinalizeSliderLocked] = useState(false)
  const [deleteAccountDialogOpen, setDeleteAccountDialogOpen] = useState(false)
  const [deleteConversationDialogOpen, setDeleteConversationDialogOpen] = useState(false)
  const [isDeletingConversation, setIsDeletingConversation] = useState(false)
  const [renameConversationDialogOpen, setRenameConversationDialogOpen] = useState(false)
  const [renameConversationValue, setRenameConversationValue] = useState(conversationTitle ?? '')
  const [isRenamingConversation, setIsRenamingConversation] = useState(false)
  const [displayConversationTitle, setDisplayConversationTitle] = useState(conversationTitle ?? '')
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
  const [nativeBottomBarClearancePx, setNativeBottomBarClearancePx] = useState<number | null>(null)
  const [isComposerOpen, setIsComposerOpen] = useState(false)
  const [composerHasDraft, setComposerHasDraft] = useState(false)
  const [composerTextareaHeightPx, setComposerTextareaHeightPx] = useState(COMPOSER_TEXTAREA_MIN_HEIGHT_PX)
  const [keyboardViewportInsetPx, setKeyboardViewportInsetPx] = useState(0)
  const [floatingToastMessage, setFloatingToastMessage] = useState('')
  const silenceSliderUpgradeToastLastShownAtRef = useRef(0)
  const floatingToastTimerRef = useRef<number | null>(null)
  const effectiveTranslationLanguages = useMemo(
    () => selectedLanguages,
    [selectedLanguages],
  )
  const normalizedDisplayLanguageOptions = useMemo(
    () => sanitizeSttLanguageUnion([
      ...effectiveTranslationLanguages,
      ...conversationSelectedLanguages,
    ]),
    [
      conversationSelectedLanguages,
      effectiveTranslationLanguages,
    ],
  )
  const resolvedDefaultDisplayLanguage = useMemo(() => {
    const requestedLanguage = canonicalizeSttLanguageCode(defaultDisplayLanguage || '')
    if (requestedLanguage && normalizedDisplayLanguageOptions.includes(requestedLanguage)) {
      return requestedLanguage
    }

    for (const preferredLanguage of normalizedPreferredDisplayLanguages) {
      if (normalizedDisplayLanguageOptions.includes(preferredLanguage)) {
        return preferredLanguage
      }
    }

    return normalizedDisplayLanguageOptions[0] || null
  }, [
    defaultDisplayLanguage,
    normalizedDisplayLanguageOptions,
    normalizedPreferredDisplayLanguages,
  ])
  const displayLanguageSelectionKey = [
    resolvedDefaultDisplayLanguage || 'none',
    normalizedPreferredDisplayLanguages.join(','),
    normalizedDisplayLanguageOptions.join(','),
  ].join('|')
  const languageSelectorButtonLanguages = useMemo(
    () => buildLanguageSelectorButtonCodes(selectedLanguages, []),
    [selectedLanguages],
  )

  const {
    ttsEnabled: isSoundEnabled,
    aecEnabled,
  } = useTtsSettings()
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
  const accountPreferencesCacheWriteTimerRef = useRef<number | null>(null)
  const accountPreferencesSyncInFlightRef = useRef<Promise<void> | null>(null)
  const accountPreferencesSyncQueuedRef = useRef(false)
  const accountPreferencesSyncRunnerRef = useRef<() => void>(() => {})
  const accountPreferencesComponentMountedRef = useRef(true)
  const selectedLanguagesChangePendingRef = useRef(false)
  const speechLanguagesChangePendingRef = useRef(false)
  const selectedLanguagesRef = useRef<string[]>(selectedLanguages)
  const speechLanguagesRef = useRef<string[]>(speechLanguages)
  const langSelectorButtonRef = useRef<HTMLButtonElement | null>(null)
  const headerRef = useRef<HTMLDivElement | null>(null)
  const menuButtonRef = useRef<HTMLButtonElement | null>(null)
  const textSizeDropdownRef = useRef<HTMLDivElement | null>(null)
  const textSizeButtonRef = useRef<HTMLButtonElement | null>(null)
  const translationModelDropdownRef = useRef<HTMLDivElement | null>(null)
  const translationModelButtonRef = useRef<HTMLButtonElement | null>(null)
  const bubbleDisplayModeDropdownRef = useRef<HTMLDivElement | null>(null)
  const bubbleDisplayModeButtonRef = useRef<HTMLButtonElement | null>(null)
  const menuHistoryDepthRef = useRef(0)
  const menuHistoryTargetDepthRef = useRef<number | null>(null)
  const menuIosHistorySettleRef = useRef<{ depth: number, expiresAt: number } | null>(null)
  const langSelectorHistoryTargetOpenRef = useRef<boolean | null>(null)
  const langSelectorIosHistorySettleRef = useRef<{ open: boolean, expiresAt: number } | null>(null)
  const langSelectorOpenRef = useRef(false)
  const deleteAccountCancelButtonRef = useRef<HTMLButtonElement | null>(null)
  const deleteConversationCancelButtonRef = useRef<HTMLButtonElement | null>(null)
  const renameConversationInputRef = useRef<HTMLInputElement | null>(null)
  const composerTextareaRef = useRef<HTMLTextAreaElement | null>(null)
  const composerDraftRef = useRef('')
  // Restored text mode must not steal focus during a programmatic room
  // transition. Only an explicit user toggle may request the keyboard.
  const composerFocusRequestedRef = useRef(false)
  const bottomBarRef = useRef<HTMLDivElement | null>(null)
  const persistedInputModeRef = useRef<LivePhoneDemoInputMode | null>(null)
  const lastNativeBottomBarClearancePxRef = useRef<number | null>(null)
  const feedbackHistoryLoadedRef = useRef(false)
  const initialDefaultFeedbackEmailRef = useRef(defaultFeedbackEmail.trim())
  const [hasHydratedFeedbackDraft, setHasHydratedFeedbackDraft] = useState(false)
  const [hasHydratedLocalUiPreferences, setHasHydratedLocalUiPreferences] = useState(false)
  const [hasHydratedComposerDraft, setHasHydratedComposerDraft] = useState(false)
  const [menuScreenTransitionMode, setMenuScreenTransitionMode] = useState<LivePhoneDemoMenuTransitionMode>('animate')
  const accountPreferencesHydrationGenerationRef = useRef(0)
  const [accountPreferencesRequestedHydrationGeneration, setAccountPreferencesRequestedHydrationGeneration] = useState(0)
  const [accountPreferencesHydratedGeneration, setAccountPreferencesHydratedGeneration] = useState(0)
  const [accountPreferencesSuccessfulHydrationGeneration, setAccountPreferencesSuccessfulHydrationGeneration] = useState(0)
  const [translationModelUserSelectedSinceHydrationStart, setTranslationModelUserSelectedSinceHydrationStart] = useState(false)
  const accountPreferencesLastSyncedStateKeyRef = useRef<string | null>(null)
  const accountPreferencesLocalRevisionRef = useRef(0)
  const accountPreferencesPendingSyncRef = useRef(
    initialCachedAccountPreferencesSnapshot?.pendingSync === true,
  )
  const silenceFinalizeLockedDescriptionId = useId()
  const textSizeListboxId = useId()
  const translationModelListboxId = useId()
  const bubbleDisplayModeListboxId = useId()
  const legacyNativeBannerPositionFromQuery = useNativeBannerPositionFromSearch('nativeBannerPosition')
  const nativeConversationBannerPositionFromQuery = useNativeBannerPositionFromSearch('nativeConversationBannerPosition')
  const nativeBannerPositionFromQuery = nativeConversationBannerPositionFromQuery ?? legacyNativeBannerPositionFromQuery

  const showFloatingToast = useCallback((message: string) => {
    const normalizedMessage = message.trim()
    if (!normalizedMessage) return
    if (floatingToastTimerRef.current) {
      clearTimeout(floatingToastTimerRef.current)
    }
    setFloatingToastMessage(normalizedMessage)
    floatingToastTimerRef.current = window.setTimeout(() => {
      setFloatingToastMessage('')
    }, 1500)
  }, [])
  const latestAccountPreferencesRef = useRef<LivePhoneDemoAccountPreferences>({
    textSizeLevel: initialCachedAccountPreferences?.textSizeLevel ?? DEFAULT_TEXT_SIZE_LEVEL,
    sonioxManualFinalizeSilenceMs:
      initialCachedAccountPreferences?.sonioxManualFinalizeSilenceMs ?? DEFAULT_SONIOX_SILENCE_MS,
    sonioxEndpointMaxDelayMs:
      initialCachedAccountPreferences?.sonioxEndpointMaxDelayMs ?? DEFAULT_SONIOX_ENDPOINT_MAX_DELAY_MS,
    sonioxEndpointTuningStep:
      initialCachedAccountPreferences?.sonioxEndpointTuningStep ?? DEFAULT_SONIOX_ENDPOINT_TUNING_STEP,
    translationModel:
      initialCachedAccountPreferences?.translationModel ?? DEFAULT_SELECTABLE_TRANSLATION_MODEL,
    adBannerPosition: initialCachedAccountPreferences?.adBannerPosition ?? null,
    inputMode: initialCachedAccountPreferences?.inputMode ?? DEFAULT_INPUT_MODE,
    speakerEnabled: initialCachedAccountPreferences?.speakerEnabled ?? DEFAULT_SPEAKER_ENABLED,
    echoAllowed: initialCachedAccountPreferences?.echoAllowed ?? DEFAULT_ECHO_ALLOWED,
    bubbleDisplayMode:
      initialCachedAccountPreferences?.bubbleDisplayMode ?? DEFAULT_BUBBLE_DISPLAY_MODE,
    sttSegmentationMode:
      initialCachedAccountPreferences?.sttSegmentationMode ?? DEFAULT_STT_SEGMENTATION_PREFERENCE,
  })
  const latestAccountPreferences = useMemo<LivePhoneDemoAccountPreferences>(() => ({
    textSizeLevel,
    sonioxManualFinalizeSilenceMs,
    sonioxEndpointMaxDelayMs,
    sonioxEndpointTuningStep,
    translationModel,
    adBannerPosition,
    inputMode: isComposerOpen ? 'text' : 'voice',
    speakerEnabled: isSoundEnabled,
    echoAllowed: !aecEnabled,
    bubbleDisplayMode,
    sttSegmentationMode,
  }), [adBannerPosition, aecEnabled, bubbleDisplayMode, isComposerOpen, isSoundEnabled, sonioxEndpointMaxDelayMs, sonioxEndpointTuningStep, sonioxManualFinalizeSilenceMs, sttSegmentationMode, textSizeLevel, translationModel])
  const normalizedDefaultFeedbackEmail = defaultFeedbackEmail.trim()
  const displayedAdBannerPosition = resolveDisplayedLivePhoneDemoAdBannerPosition({
    preferredPosition: adBannerPosition,
    nativeLayoutPosition: normalizeLivePhoneDemoAdBannerPosition(nativeBannerLayout?.position),
    queryPosition: nativeBannerPositionFromQuery,
    isNativeAppRuntime,
    sessionOverridePosition: sessionAdBannerPositionOverride,
  })
  const selectedTranslationModelOption = useMemo(
    () => TRANSLATION_MODEL_OPTIONS.find((option) => option.value === translationModel) || TRANSLATION_MODEL_OPTIONS[0],
    [translationModel],
  )
  const requestTranslationModel = useMemo<UserSelectableTranslationModel | undefined>(() => {
    return shouldSendTranslationModelPreference({
      allowSync: enableAccountPreferencesSync,
      requestedHydrationGeneration: accountPreferencesRequestedHydrationGeneration,
      successfulHydrationGeneration: accountPreferencesSuccessfulHydrationGeneration,
      userSelectedSinceHydrationStart: translationModelUserSelectedSinceHydrationStart,
    }) ? translationModel : undefined
  }, [
    accountPreferencesRequestedHydrationGeneration,
    accountPreferencesSuccessfulHydrationGeneration,
    enableAccountPreferencesSync,
    translationModel,
    translationModelUserSelectedSinceHydrationStart,
  ])
  const isNativeMenuOverlayVisible = langSelectorOpen || menuOpen || menuScreen !== 'root'
  const shouldShowDebugWebViewRemountMenuItem = isNativeAppRuntime && shouldEnableNativeDebugWebViewRemount({
    rawUrl: typeof window === 'undefined' ? '' : window.location.href,
    isDevelopmentMode: process.env.NODE_ENV !== 'production',
  })

  const commitLocalAccountPreferences = useCallback((
    nextPreferences: LivePhoneDemoAccountPreferences,
  ) => {
    accountPreferencesLocalRevisionRef.current += 1
    accountPreferencesPendingSyncRef.current = true
    latestAccountPreferencesRef.current = nextPreferences
    if (accountPreferencesCacheWriteTimerRef.current !== null) {
      window.clearTimeout(accountPreferencesCacheWriteTimerRef.current)
    }
    accountPreferencesCacheWriteTimerRef.current = window.setTimeout(() => {
      accountPreferencesCacheWriteTimerRef.current = null
      writeCachedAccountPreferences(
        accountPreferencesCacheIdentity,
        latestAccountPreferencesRef.current,
        { pendingSync: true },
      )
    }, ACCOUNT_PREFERENCES_LOCAL_CACHE_DEBOUNCE_MS)
    return nextPreferences
  }, [accountPreferencesCacheIdentity])

  useEffect(() => () => {
    if (accountPreferencesCacheWriteTimerRef.current === null) return
    window.clearTimeout(accountPreferencesCacheWriteTimerRef.current)
    accountPreferencesCacheWriteTimerRef.current = null
    writeCachedAccountPreferences(
      accountPreferencesCacheIdentity,
      latestAccountPreferencesRef.current,
      { pendingSync: accountPreferencesPendingSyncRef.current },
    )
  }, [accountPreferencesCacheIdentity])

  useEffect(() => {
    accountPreferencesComponentMountedRef.current = true
    return () => {
      accountPreferencesComponentMountedRef.current = false
    }
  }, [])

  useEffect(() => {
    latestAccountPreferencesRef.current = latestAccountPreferences
  }, [latestAccountPreferences])

  useEffect(() => {
    langSelectorOpenRef.current = langSelectorOpen
  }, [langSelectorOpen])

  const syncComposerTextareaHeight = useCallback((textarea: HTMLTextAreaElement | null) => {
    const nextHeight = resizeComposerTextarea(textarea)
    setComposerTextareaHeightPx((current) => current === nextHeight ? current : nextHeight)
    return nextHeight
  }, [])

  const focusComposerTextarea = useCallback(() => {
    const textarea = composerTextareaRef.current
    if (!textarea) return

    textarea.focus({ preventScroll: true })
    const cursor = textarea.value.length
    textarea.setSelectionRange(cursor, cursor)
  }, [])

  useEffect(() => {
    if (!normalizedDefaultFeedbackEmail) return
    if (feedbackEmailEdited) return
    setFeedbackEmail(normalizedDefaultFeedbackEmail)
  }, [feedbackEmailEdited, normalizedDefaultFeedbackEmail])

  useEffect(() => {
    setRenameConversationValue(conversationTitle ?? '')
  }, [conversationTitle])

  useEffect(() => {
    setDisplayConversationTitle(conversationTitle ?? '')
  }, [conversationTitle])

  useLayoutEffect(() => {
    let cancelled = false
    const schedule = typeof queueMicrotask === 'function'
      ? queueMicrotask
      : (callback: () => void) => { void Promise.resolve().then(callback) }

    schedule(() => {
      if (cancelled) return

      const persistedDraft = readPersistedFeedbackDraft()
      if (persistedDraft) {
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
      }
      setHasHydratedFeedbackDraft(true)
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
      persistedInputModeRef.current = initialCachedAccountPreferences?.inputMode ?? next.inputMode
      const nextIsSilenceFinalizeSliderLocked = isLegacySonioxSilenceSliderNamespace(clientApiNamespace)
      setIsSilenceFinalizeSliderLocked(nextIsSilenceFinalizeSliderLocked)
      if (!conversationId) {
        setSelectedLanguages(next.selectedLanguages)
        setOwnSelectedLanguages(next.selectedLanguages)
        setSpeechLanguages(next.speechLanguages)
        setTranslationLanguagesLinked(next.translationLanguagesLinked)
      }
      setTextSizeLevel(initialCachedAccountPreferences?.textSizeLevel ?? next.textSizeLevel)
      setAdBannerPosition(initialCachedAccountPreferences?.adBannerPosition ?? next.adBannerPosition)
      composerFocusRequestedRef.current = false
      setIsComposerOpen((current) => resolveHydratedComposerOpenState({
        currentIsComposerOpen: current,
        persistedInputMode: initialCachedAccountPreferences?.inputMode ?? next.inputMode,
      }))
      const persistedComposerDraft = readPersistedComposerDraft(composerDraftStorageKey)
      composerDraftRef.current = persistedComposerDraft
      setComposerHasDraft(persistedComposerDraft.trim().length > 0)
      setHasHydratedLocalUiPreferences(true)
      setHasHydratedComposerDraft(true)
    })

    return () => {
      cancelled = true
    }
  }, [composerDraftStorageKey, conversationId, fallbackLanguages, initialCachedAccountPreferences])

  useEffect(() => {
    if (!conversationId) return

    let cancelled = false
    const schedule = typeof queueMicrotask === 'function'
      ? queueMicrotask
      : (callback: () => void) => { void Promise.resolve().then(callback) }

    schedule(() => {
      if (cancelled) return

      const nextSelectedLanguages = conversationSelectedLanguages
      setSelectedLanguages((current) => {
        if (areLanguageSelectionsEqual(current, nextSelectedLanguages)) {
          return current
        }

        return [...nextSelectedLanguages]
      })
      const nextOwnSelectedLanguages = conversationOwnSelectedLanguages
      setOwnSelectedLanguages((current) => {
        if (areLanguageSelectionsEqual(current, nextOwnSelectedLanguages)) {
          return current
        }

        return [...nextOwnSelectedLanguages]
      })
      setSpeechLanguages((current) => {
        if (areLanguageSelectionsEqual(current, conversationSpeechLanguages)) {
          return current
        }

        return [...conversationSpeechLanguages]
      })
      setTranslationLanguagesLinked(conversationTranslationLanguagesLinked)
    })

    return () => {
      cancelled = true
    }
  }, [
    conversationId,
    conversationSelectedLanguages,
    conversationOwnSelectedLanguages,
    conversationSpeechLanguages,
    conversationTranslationLanguagesLinked,
  ])

  useEffect(() => {
    setSelectedLanguagesAttribution(initialSelectedLanguagesAttribution ?? {})
  }, [initialSelectedLanguagesAttribution])

  useEffect(() => {
    selectedLanguagesRef.current = selectedLanguages
  }, [selectedLanguages])

  useEffect(() => {
    ownSelectedLanguagesRef.current = ownSelectedLanguages
  }, [ownSelectedLanguages])

  useEffect(() => {
    selectedLanguagesAttributionRef.current = selectedLanguagesAttribution
  }, [selectedLanguagesAttribution])

  useEffect(() => {
    speechLanguagesRef.current = speechLanguages
  }, [speechLanguages])

  useEffect(() => {
    if (!selectedLanguagesChangePendingRef.current) return

    selectedLanguagesChangePendingRef.current = false
    onSelectedLanguagesChange?.(ownSelectedLanguages)
  }, [onSelectedLanguagesChange, ownSelectedLanguages])

  useEffect(() => {
    if (!speechLanguagesChangePendingRef.current) return

    speechLanguagesChangePendingRef.current = false
    onSpeechLanguagesChange?.(speechLanguages)
  }, [onSpeechLanguagesChange, speechLanguages])

  useEffect(() => {
    if (typeof window === 'undefined') return

    const syncNativeRuntime = () => {
      if (!isNativeUiRuntimeSignalPresent()) return
      setIsNativeAppRuntime(true)
    }

    syncNativeRuntime()
    const nativeRuntimeTimerId = window.setTimeout(syncNativeRuntime, 0)
    const nativeRuntimeRetryTimerId = window.setTimeout(syncNativeRuntime, 250)

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
      window.clearTimeout(nativeRuntimeRetryTimerId)
      window.clearTimeout(nativeUpdateTimerId)
      window.removeEventListener(NATIVE_APP_UPDATE_EVENT, handleNativeAppUpdate as EventListener)
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return

    const viewport = window.visualViewport
    if (!viewport) return

    const syncKeyboardInset = () => {
      const nextInsetPx = resolveKeyboardViewportInsetPx(viewport)
      setKeyboardViewportInsetPx((currentInsetPx) => resolveStableKeyboardViewportInsetPx(currentInsetPx, nextInsetPx))
    }

    syncKeyboardInset()
    viewport.addEventListener('resize', syncKeyboardInset)
    viewport.addEventListener('scroll', syncKeyboardInset)

    return () => {
      viewport.removeEventListener('resize', syncKeyboardInset)
      viewport.removeEventListener('scroll', syncKeyboardInset)
    }
  }, [])

  const syncNativeBottomBarClearance = useCallback(() => {
    if (typeof window === 'undefined') return
    if (!window.ReactNativeWebView?.postMessage) return

    const bottomBarNode = bottomBarRef.current
    if (!bottomBarNode) return

    const bottomBarRect = bottomBarNode.getBoundingClientRect()
    const nextClearancePx = resolveNativeBottomBarBannerClearancePx({
      bottomBarTopPx: bottomBarRect.top,
      viewportHeightPx: window.innerHeight,
      safeAreaInsetBottomPx: readSafeAreaInsetBottomPx(),
    })

    if (lastNativeBottomBarClearancePxRef.current === nextClearancePx) return
    lastNativeBottomBarClearancePxRef.current = nextClearancePx
    setNativeBottomBarClearancePx((current) => current === nextClearancePx ? current : nextClearancePx)

    const command: NativeSetBottomBarClearanceCommand = {
      type: 'native_set_bottom_bar_clearance',
      payload: { clearancePx: nextClearancePx },
    }
    window.ReactNativeWebView.postMessage(JSON.stringify(command))
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return

    const bottomBarNode = bottomBarRef.current
    if (!bottomBarNode) return

    let frameId = 0
    const requestSync = () => {
      if (frameId) {
        window.cancelAnimationFrame(frameId)
      }
      frameId = window.requestAnimationFrame(() => {
        frameId = 0
        syncNativeBottomBarClearance()
      })
    }

    requestSync()

    const resizeObserver = typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver(() => {
          requestSync()
        })
    resizeObserver?.observe(bottomBarNode)

    window.addEventListener('resize', requestSync)
    const viewport = window.visualViewport
    viewport?.addEventListener('resize', requestSync)
    viewport?.addEventListener('scroll', requestSync)

    return () => {
      if (frameId) {
        window.cancelAnimationFrame(frameId)
      }
      resizeObserver?.disconnect()
      window.removeEventListener('resize', requestSync)
      viewport?.removeEventListener('resize', requestSync)
      viewport?.removeEventListener('scroll', requestSync)
    }
  }, [syncNativeBottomBarClearance])

  useEffect(() => {
    if (typeof window === 'undefined') return

    const frameId = window.requestAnimationFrame(() => {
      syncNativeBottomBarClearance()
    })
    const timeout180Id = window.setTimeout(() => {
      syncNativeBottomBarClearance()
    }, 180)
    const timeout360Id = window.setTimeout(() => {
      syncNativeBottomBarClearance()
    }, 360)

    return () => {
      window.cancelAnimationFrame(frameId)
      window.clearTimeout(timeout180Id)
      window.clearTimeout(timeout360Id)
    }
  }, [isComposerOpen, keyboardViewportInsetPx, syncNativeBottomBarClearance])

  useEffect(() => {
    if (!isComposerOpen) {
      composerFocusRequestedRef.current = false
      return
    }
    if (!composerFocusRequestedRef.current) return

    const timerId = window.setTimeout(() => {
      const textarea = composerTextareaRef.current
      if (!textarea) return
      composerFocusRequestedRef.current = false
      if (textarea.value !== composerDraftRef.current) {
        textarea.value = composerDraftRef.current
      }
      syncComposerTextareaHeight(textarea)
      focusComposerTextarea()
    }, 40)

    return () => {
      window.clearTimeout(timerId)
    }
  }, [focusComposerTextarea, isComposerOpen, syncComposerTextareaHeight])

  useEffect(() => {
    const textarea = composerTextareaRef.current
    if (!textarea) return
    if (textarea.value === composerDraftRef.current) return
    textarea.value = composerDraftRef.current
    syncComposerTextareaHeight(textarea)
  }, [composerDraftStorageKey, hasHydratedComposerDraft, syncComposerTextareaHeight])

  useLayoutEffect(() => {
    syncComposerTextareaHeight(composerTextareaRef.current)
  }, [isComposerOpen, syncComposerTextareaHeight])

  useEffect(() => {
    if (isComposerOpen) return
    setComposerTextareaHeightPx(COMPOSER_TEXTAREA_MIN_HEIGHT_PX)
  }, [isComposerOpen])

  // Persist selected languages
  useEffect(() => {
    if (!hasHydratedLocalUiPreferences) return
    try {
      localStorage.setItem(LS_KEY_LANGUAGES, JSON.stringify(selectedLanguages))
    } catch { /* ignore */ }
  }, [hasHydratedLocalUiPreferences, selectedLanguages])

  useEffect(() => {
    if (!hasHydratedLocalUiPreferences) return
    try {
      localStorage.setItem(LS_KEY_SPEECH_LANGUAGES, JSON.stringify(speechLanguages))
    } catch { /* ignore */ }
  }, [hasHydratedLocalUiPreferences, speechLanguages])

  useEffect(() => {
    if (!hasHydratedLocalUiPreferences) return
    try {
      localStorage.setItem(LS_KEY_TRANSLATION_LANGUAGES_LINKED, translationLanguagesLinked ? '1' : '0')
    } catch { /* ignore */ }
  }, [hasHydratedLocalUiPreferences, translationLanguagesLinked])

  useEffect(() => {
    if (!hasHydratedLocalUiPreferences) return
    try {
      localStorage.setItem(LS_KEY_TEXT_SIZE_LEVEL, String(textSizeLevel))
    } catch { /* ignore */ }
  }, [hasHydratedLocalUiPreferences, textSizeLevel])

  useEffect(() => {
    if (!hasHydratedLocalUiPreferences) return
    try {
      if (adBannerPosition) {
        localStorage.setItem(LS_KEY_AD_BANNER_POSITION, adBannerPosition)
      } else {
        localStorage.removeItem(LS_KEY_AD_BANNER_POSITION)
      }
    } catch { /* ignore */ }
  }, [adBannerPosition, hasHydratedLocalUiPreferences])

  useEffect(() => {
    if (!hasHydratedLocalUiPreferences) return
    try {
      localStorage.setItem(LS_KEY_INPUT_MODE, isComposerOpen ? 'text' : 'voice')
    } catch { /* ignore */ }
  }, [hasHydratedLocalUiPreferences, isComposerOpen])

  useEffect(() => {
    if (!hasHydratedFeedbackDraft) return
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
  }, [feedbackCategory, feedbackEmail, feedbackEmailEdited, feedbackMessage, hasHydratedFeedbackDraft])

  const clearAccountPreferencesSyncTimer = useCallback(() => {
    if (accountPreferencesSyncTimerRef.current === null) return
    window.clearTimeout(accountPreferencesSyncTimerRef.current)
    accountPreferencesSyncTimerRef.current = null
  }, [])

  useEffect(() => {
    // Hydrate from the server only on lifecycle inputs. Re-fetching on live local
    // preference changes would clobber in-progress edits with the last server snapshot.
    let cancelled = false
    clearAccountPreferencesSyncTimer()

    if (!enableAccountPreferencesSync) {
      accountPreferencesLastSyncedStateKeyRef.current = null
      setAccountPreferencesRequestedHydrationGeneration(0)
      setAccountPreferencesSuccessfulHydrationGeneration(0)
      setTranslationModelUserSelectedSinceHydrationStart(false)
      return () => {
        cancelled = true
      }
    }

    const hydrationGeneration = accountPreferencesHydrationGenerationRef.current + 1
    accountPreferencesHydrationGenerationRef.current = hydrationGeneration
    const hydrationStartedAtLocalRevision = accountPreferencesLocalRevisionRef.current
    const hydrationStartedWithPendingSync = accountPreferencesPendingSyncRef.current
    setAccountPreferencesRequestedHydrationGeneration(hydrationGeneration)
    setTranslationModelUserSelectedSinceHydrationStart(false)
    const sessionKey = resolveConversationSessionKey()
    const trackingUserId = getOrCreateTrackingUserId()

    void fetch(accountPreferencesApiPath, {
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
        const hydratedSyncStateKey = serializeAccountPreferencesSyncState(hydratedPreferences)
        const currentLocalSyncStateKey = serializeAccountPreferencesSyncState(
          latestAccountPreferencesRef.current,
        )
        const hydrationMatchesLocalState = hydratedSyncStateKey === currentLocalSyncStateKey
        const shouldApplyHydration = hydrationMatchesLocalState
          || (!hydrationStartedWithPendingSync && shouldApplyAccountPreferencesHydration({
            hydrationStartedAtLocalRevision,
            currentLocalRevision: accountPreferencesLocalRevisionRef.current,
          }))

        accountPreferencesLastSyncedStateKeyRef.current = hydratedSyncStateKey

        if (shouldApplyHydration) {
          accountPreferencesPendingSyncRef.current = false
          latestAccountPreferencesRef.current = hydratedPreferences
          writeCachedAccountPreferences(accountPreferencesCacheIdentity, hydratedPreferences, { pendingSync: false })
          setTextSizeLevel(hydratedPreferences.textSizeLevel)
          setSonioxManualFinalizeSilenceMs(hydratedPreferences.sonioxManualFinalizeSilenceMs)
          setSttSegmentationMode(hydratedPreferences.sttSegmentationMode)
          setSonioxEndpointMaxDelayMs(hydratedPreferences.sonioxEndpointMaxDelayMs)
          setSonioxEndpointTuningStep(hydratedPreferences.sonioxEndpointTuningStep)
          setTranslationModel(hydratedPreferences.translationModel)
          setBubbleDisplayMode(hydratedPreferences.bubbleDisplayMode)
          setAdBannerPosition(hydratedPreferences.adBannerPosition)
          if (persistedInputModeRef.current === null) {
            composerFocusRequestedRef.current = false
            setIsComposerOpen(hydratedPreferences.inputMode === 'text')
          }
        } else {
          writeCachedAccountPreferences(
            accountPreferencesCacheIdentity,
            latestAccountPreferencesRef.current,
            { pendingSync: true },
          )
        }
        setAccountPreferencesSuccessfulHydrationGeneration(hydrationGeneration)
        setAccountPreferencesHydratedGeneration(hydrationGeneration)
      })
      .catch(() => {
        if (cancelled) return
        accountPreferencesLastSyncedStateKeyRef.current =
          accountPreferencesPendingSyncRef.current
            ? null
            : serializeAccountPreferencesSyncState(latestAccountPreferencesRef.current)
        setAccountPreferencesHydratedGeneration(hydrationGeneration)
      })

    return () => {
      cancelled = true
    }
  }, [
    accountPreferencesApiPath,
    accountPreferencesCacheIdentity,
    clearAccountPreferencesSyncTimer,
    enableAccountPreferencesSync,
    nativeAppUpdate,
    resolveConversationSessionKey,
  ])

  const syncAccountPreferences = useCallback(() => {
    if (!enableAccountPreferencesSync) return
    if (accountPreferencesSyncInFlightRef.current) {
      accountPreferencesSyncQueuedRef.current = true
      return
    }

    const currentPreferences = latestAccountPreferencesRef.current
    const currentSyncStateKey = serializeAccountPreferencesSyncState(currentPreferences)
    accountPreferencesPendingSyncRef.current = true
    writeCachedAccountPreferences(accountPreferencesCacheIdentity, currentPreferences, { pendingSync: true })
    const sessionKey = resolveConversationSessionKey()
    const trackingUserId = getOrCreateTrackingUserId()

    const syncPromise = fetch(accountPreferencesApiPath, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...buildTrackingRequestHeaders({
          sessionKey,
          trackingUserId,
          nativeAppUpdate,
        }),
      },
      body: JSON.stringify(buildAccountPreferencesPatchBody(currentPreferences)),
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error(`account_preferences_patch_failed:${response.status}`)
        }
        accountPreferencesLastSyncedStateKeyRef.current = currentSyncStateKey
        if (
          serializeAccountPreferencesSyncState(latestAccountPreferencesRef.current)
          === currentSyncStateKey
        ) {
          accountPreferencesSyncQueuedRef.current = false
          accountPreferencesPendingSyncRef.current = false
          writeCachedAccountPreferences(
            accountPreferencesCacheIdentity,
            latestAccountPreferencesRef.current,
            { pendingSync: false },
          )
        } else {
          accountPreferencesSyncQueuedRef.current = true
        }
      })
      .catch(() => {
        // Keep the current in-memory state and retry on the next change.
      })
      .finally(() => {
        accountPreferencesSyncInFlightRef.current = null
        if (
          !accountPreferencesComponentMountedRef.current
          || !accountPreferencesSyncQueuedRef.current
        ) {
          return
        }
        accountPreferencesSyncQueuedRef.current = false
        accountPreferencesSyncRunnerRef.current()
      })
    accountPreferencesSyncInFlightRef.current = syncPromise
  }, [accountPreferencesApiPath, accountPreferencesCacheIdentity, enableAccountPreferencesSync, nativeAppUpdate, resolveConversationSessionKey])
  accountPreferencesSyncRunnerRef.current = syncAccountPreferences

  const syncAccountPreferencesOverride = useCallback((nextPreferences: LivePhoneDemoAccountPreferences) => {
    latestAccountPreferencesRef.current = nextPreferences
    syncAccountPreferences()
  }, [syncAccountPreferences])

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
      const sessionKey = resolveConversationSessionKey()
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
  }, [feedbackCopy.historyErrorMessage, nativeAppUpdate, resolveConversationSessionKey])

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
      const sessionKey = resolveConversationSessionKey()
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
  }, [feedbackCategory, feedbackCopy.errorMessage, feedbackCopy.invalidEmailMessage, feedbackCopy.messageTooShortMessage, feedbackEmail, feedbackMessage, loadFeedbackThreads, nativeAppUpdate, resolveConversationSessionKey, uiLocale])

  const applyMenuNavigationDepth = useCallback((
    nextDepth: number,
    options?: {
      screenTransitionMode?: LivePhoneDemoMenuTransitionMode
      screen?: LivePhoneDemoMenuScreen
    },
  ) => {
    const previousDepth = menuHistoryDepthRef.current
    const boundedDepth = Math.max(0, Math.min(3, nextDepth))
    const nextScreenTransitionMode = options?.screenTransitionMode ?? 'animate'
    const nextScreen = resolveMenuScreenForDepth(boundedDepth, options?.screen)
    const nextDirection: LivePhoneDemoMenuScreenDirection = boundedDepth < previousDepth ? 'back' : 'forward'
    menuHistoryDepthRef.current = boundedDepth
    setTextSizeMenuOpen(false)
    setTranslationModelMenuOpen(false)
    setBubbleDisplayModeMenuOpen(false)
    setMenuScreenTransitionMode(nextScreenTransitionMode)
    setMenuScreenDirection(nextDirection)

    if (boundedDepth === 0) {
      setDeleteAccountDialogOpen(false)
      setDeleteConversationDialogOpen(false)
      setMenuScreen('root')
      setMenuOpen(false)
      return
    }

    setMenuOpen(true)
    setMenuScreen(nextScreen)
  }, [])

  const pushMenuHistoryEntry = useCallback((
    nextDepth: number,
    screen: LivePhoneDemoMenuScreen = 'root',
    options?: {
      screenTransitionMode?: LivePhoneDemoMenuTransitionMode
    },
  ) => {
    applyMenuNavigationDepth(nextDepth, {
      screenTransitionMode: options?.screenTransitionMode ?? 'animate',
      screen,
    })
    if (typeof window === 'undefined') return
    menuHistoryTargetDepthRef.current = null
    window.history.pushState(buildMenuHistoryState(nextDepth, screen), '')
  }, [applyMenuNavigationDepth])

  const closeMenuPanel = useCallback(() => {
    menuHistoryTargetDepthRef.current = null
    applyMenuNavigationDepth(0, {
      screenTransitionMode: 'animate',
    })
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

  const applyLanguageSelectorOpen = useCallback((nextOpen: boolean) => {
    setLangSelectorOpen(nextOpen)
  }, [])

  const closeLanguageSelector = useCallback((options?: {
    syncHistory?: 'back' | 'replace' | 'none'
  }) => {
    const syncHistory = options?.syncHistory ?? 'none'
    langSelectorIosHistorySettleRef.current = null

    if (
      syncHistory === 'back'
      && typeof window !== 'undefined'
      && isLanguageSelectorHistoryOpen(window.history.state)
    ) {
      langSelectorHistoryTargetOpenRef.current = false
      applyLanguageSelectorOpen(false)
      window.history.back()
      return
    }

    langSelectorHistoryTargetOpenRef.current = null
    applyLanguageSelectorOpen(false)

    if (syncHistory === 'replace' && typeof window !== 'undefined') {
      window.history.replaceState(
        clearLanguageSelectorHistoryState(window.history.state),
        '',
      )
    }
  }, [applyLanguageSelectorOpen])

  const resetNavigationOverlays = useCallback(async () => {
    closeLanguageSelector({ syncHistory: 'replace' })
    setRenameConversationDialogOpen(false)
    setRenameConversationValue(conversationTitle ?? '')

    const currentDepth = menuHistoryDepthRef.current
    if (typeof window === 'undefined' || currentDepth <= 0) {
      menuHistoryTargetDepthRef.current = null
      applyMenuNavigationDepth(0, { screenTransitionMode: 'instant' })
      return
    }

    await new Promise<void>((resolve) => {
      let settled = false
      let timeoutId: number | null = null
      let frameId: number | null = null

      const scheduleFrame = (callback: () => void) => (
        typeof window.requestAnimationFrame === 'function'
          ? window.requestAnimationFrame(callback)
          : window.setTimeout(callback, 0)
      )

      const cancelFrame = (id: number) => {
        if (typeof window.cancelAnimationFrame === 'function') {
          window.cancelAnimationFrame(id)
        } else {
          window.clearTimeout(id)
        }
      }

      const finish = () => {
        if (settled) return
        settled = true
        if (timeoutId !== null) window.clearTimeout(timeoutId)
        if (frameId !== null) cancelFrame(frameId)
        resolve()
      }

      const checkSettled = () => {
        frameId = null
        if (settled) return
        if (menuHistoryDepthRef.current <= 0) {
          finish()
          return
        }
        frameId = scheduleFrame(checkSettled)
      }

      timeoutId = window.setTimeout(() => {
        // History navigation should normally settle through the menu popstate
        // handler. Keep the transition from hanging forever if a restricted
        // WebView drops the event, while still leaving the browser target at
        // the requested depth.
        menuHistoryTargetDepthRef.current = null
        const currentState = window.history.state
        if (currentState && typeof currentState === 'object' && !Array.isArray(currentState)) {
          const nextState = { ...(currentState as Record<string, unknown>) }
          delete nextState[MENU_HISTORY_STATE_KEY]
          delete nextState[MENU_HISTORY_SCREEN_STATE_KEY]
          window.history.replaceState(nextState, '', window.location.href)
        }
        applyMenuNavigationDepth(0, { screenTransitionMode: 'instant' })
        finish()
      }, 2000)

      requestCloseMenuPanel()
      checkSettled()
    })
  }, [applyMenuNavigationDepth, closeLanguageSelector, conversationTitle, requestCloseMenuPanel])

  const handleMenuSurfaceRequestClose = useCallback(() => {
    if (langSelectorOpen) {
      closeLanguageSelector({ syncHistory: 'back' })
      return false
    }

    if (renameConversationDialogOpen) {
      if (!isRenamingConversation) {
        setRenameConversationDialogOpen(false)
        setRenameConversationValue(conversationTitle ?? '')
      }
      return false
    }

    if (deleteConversationDialogOpen) {
      if (!isDeletingConversation) {
        setDeleteConversationDialogOpen(false)
      }
      return false
    }

    if (textSizeMenuOpen) {
      setTextSizeMenuOpen(false)
      return false
    }

    if (translationModelMenuOpen) {
      setTranslationModelMenuOpen(false)
      return false
    }

    if (bubbleDisplayModeMenuOpen) {
      setBubbleDisplayModeMenuOpen(false)
      return false
    }

    // The menu depth is the source of truth for nested menu history. Consume
    // exactly one entry before allowing the room surface to close.
    if (menuHistoryDepthRef.current > 0) {
      requestMenuBackStep()
      return false
    }

    // Recover gracefully if a stale render says the menu is open while its
    // history depth has already been reset.
    if (menuOpen) {
      closeMenuPanel()
      return false
    }

    return true
  }, [bubbleDisplayModeMenuOpen, closeLanguageSelector, closeMenuPanel, conversationTitle, deleteConversationDialogOpen, isDeletingConversation, isRenamingConversation, langSelectorOpen, menuOpen, renameConversationDialogOpen, requestMenuBackStep, textSizeMenuOpen, translationModelMenuOpen])

  const requestCloseTopmostOverlay = useCallback(() => (
    !handleMenuSurfaceRequestClose()
  ), [handleMenuSurfaceRequestClose])

  const openLanguageSelector = useCallback((options?: {
    syncHistory?: 'push' | 'none'
  }) => {
    const syncHistory = options?.syncHistory ?? 'none'
    closeMenuPanel()
    langSelectorHistoryTargetOpenRef.current = null
    langSelectorIosHistorySettleRef.current = null
    applyLanguageSelectorOpen(true)

    if (
      syncHistory === 'push'
      && typeof window !== 'undefined'
      && !isLanguageSelectorHistoryOpen(window.history.state)
    ) {
      window.history.pushState(
        buildLanguageSelectorHistoryState(window.history.state),
        '',
      )
    }
  }, [applyLanguageSelectorOpen, closeMenuPanel])

  const handleLanguageSelectorButtonPress = useCallback(() => {
    if (langSelectorOpenRef.current) {
      closeLanguageSelector({ syncHistory: 'back' })
      return
    }

    openLanguageSelector({ syncHistory: 'push' })
  }, [closeLanguageSelector, openLanguageSelector])

  const handleDebugWebViewRemountMenuItemPress = useCallback(() => {
    if (!isNativeApp()) return

    if (conversationId) {
      rememberNativeRemountRestoreConversation(conversationId)
    }
    postNativeQaCommand({
      type: 'native_remount_webview',
      payload: {
        url: buildNativeRemountRestoreUrl(window.location.href, conversationId),
      },
    } satisfies NativeRemountWebViewCommand)
  }, [conversationId])

  const handleMenuButtonPress = useCallback(() => {
    closeLanguageSelector({ syncHistory: 'replace' })

    if (menuOpen) {
      requestCloseMenuPanel()
      return
    }

    clearFeedbackSubmitState()
    setFeedbackTab('compose')
    pushMenuHistoryEntry(1)
  }, [clearFeedbackSubmitState, closeLanguageSelector, menuOpen, pushMenuHistoryEntry, requestCloseMenuPanel])

  const handleFeedbackMenuItemPress = useCallback(() => {
    if (!menuOpen || menuScreen === 'feedback') return
    clearFeedbackSubmitState()
    setFeedbackTab('compose')
    pushMenuHistoryEntry(2, 'feedback')
  }, [clearFeedbackSubmitState, menuOpen, menuScreen, pushMenuHistoryEntry])

  const handleConversationManagementMenuItemPress = useCallback(() => {
    if (!menuOpen || menuScreen === 'conversation-management') return
    pushMenuHistoryEntry(2, 'conversation-management')
  }, [menuOpen, menuScreen, pushMenuHistoryEntry])

  const handleParticipantsMenuItemPress = useCallback(() => {
    if (!menuOpen || menuScreen === 'participants') return
    pushMenuHistoryEntry(2, 'participants')
  }, [menuOpen, menuScreen, pushMenuHistoryEntry])

  const handleDefaultDisplayLanguageMenuItemPress = useCallback(() => {
    if (!menuOpen || menuScreen === 'display-language' || !conversationId) return
    pushMenuHistoryEntry(2, 'display-language')
  }, [conversationId, menuOpen, menuScreen, pushMenuHistoryEntry])

  const handleDefaultDisplayLanguageSelect = useCallback((nextLanguage: string) => {
    const normalizedLanguage = canonicalizeSttLanguageCode(nextLanguage)
    if (!normalizedLanguage || !normalizedDisplayLanguageOptions.includes(normalizedLanguage)) return

    setDefaultDisplayLanguage(normalizedLanguage)
    onDefaultDisplayLanguageChange?.(normalizedLanguage)
  }, [normalizedDisplayLanguageOptions, onDefaultDisplayLanguageChange])

  const handleDeleteConversationMenuItemPress = useCallback(() => {
    setDeleteConversationDialogOpen(true)
  }, [])

  const handleTextSizeLevelSelect = useCallback((nextTextSizeLevel: number) => {
    setTextSizeMenuOpen(false)
    if (latestAccountPreferencesRef.current.textSizeLevel === nextTextSizeLevel) return
    const nextPreferences = commitLocalAccountPreferences({
      ...latestAccountPreferencesRef.current,
      textSizeLevel: nextTextSizeLevel,
    })
    setTextSizeLevel(nextTextSizeLevel)
    clearAccountPreferencesSyncTimer()
    syncAccountPreferencesOverride(nextPreferences)
  }, [clearAccountPreferencesSyncTimer, commitLocalAccountPreferences, syncAccountPreferencesOverride])

  const handleTranslationModelSelect = useCallback((nextTranslationModel: UserSelectableTranslationModel) => {
    setTranslationModelMenuOpen(false)
    setTranslationModelUserSelectedSinceHydrationStart(true)
    const nextPreferences = commitLocalAccountPreferences({
      ...latestAccountPreferencesRef.current,
      translationModel: nextTranslationModel,
    })
    setTranslationModel(nextTranslationModel)
    clearAccountPreferencesSyncTimer()
    syncAccountPreferencesOverride(nextPreferences)
  }, [clearAccountPreferencesSyncTimer, commitLocalAccountPreferences, syncAccountPreferencesOverride])

  const handleBubbleDisplayModeSelect = useCallback((nextBubbleDisplayMode: LivePhoneDemoBubbleDisplayMode) => {
    setBubbleDisplayModeMenuOpen(false)
    if (latestAccountPreferencesRef.current.bubbleDisplayMode === nextBubbleDisplayMode) return
    const nextPreferences = commitLocalAccountPreferences({
      ...latestAccountPreferencesRef.current,
      bubbleDisplayMode: nextBubbleDisplayMode,
    })
    setBubbleDisplayMode(nextBubbleDisplayMode)
    clearAccountPreferencesSyncTimer()
    syncAccountPreferencesOverride(nextPreferences)
  }, [clearAccountPreferencesSyncTimer, commitLocalAccountPreferences, syncAccountPreferencesOverride])

  const handleAdBannerPositionSelect = useCallback((nextAdBannerPosition: LivePhoneDemoAdBannerPosition) => {
    setSessionAdBannerPositionOverride(nextAdBannerPosition)
    if (latestAccountPreferencesRef.current.adBannerPosition === nextAdBannerPosition) {
      setAdBannerPosition(nextAdBannerPosition)
      return
    }
    const nextPreferences = commitLocalAccountPreferences({
      ...latestAccountPreferencesRef.current,
      adBannerPosition: nextAdBannerPosition,
    })
    setAdBannerPosition(nextAdBannerPosition)
    clearAccountPreferencesSyncTimer()
    syncAccountPreferencesOverride(nextPreferences)
  }, [clearAccountPreferencesSyncTimer, commitLocalAccountPreferences, syncAccountPreferencesOverride])

  useEffect(() => {
    if (isVisible) return

    const timerId = window.setTimeout(() => {
      closeLanguageSelector({ syncHistory: 'replace' })
      closeMenuPanel()
    }, 0)

    return () => {
      window.clearTimeout(timerId)
    }
  }, [closeLanguageSelector, closeMenuPanel, isVisible])

  useEffect(() => {
    if (!enableNativeBannerBridge || !isVisible) return
    if (!isNativeApp()) return

    if (isNativeMenuOverlayVisible) {
      postNativeBannerZone('hidden')
      return
    }

    const timerId = window.setTimeout(() => {
      postNativeBannerZone('conversation')
    }, 280)

    return () => {
      window.clearTimeout(timerId)
    }
  }, [enableNativeBannerBridge, isNativeMenuOverlayVisible, isVisible])

  useEffect(() => {
    if (!enableNativeBannerBridge || !isVisible) return
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
  }, [enableNativeBannerBridge, isNativeMenuOverlayVisible, isVisible])

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
  }, [enableNativeBannerBridge, isVisible])

  useEffect(() => {
    if (!enableNativeBannerBridge || !isVisible) return
    if (!isNativeApp()) return

    const nextBannerPosition = sessionAdBannerPositionOverride
      || nativeBannerPositionFromQuery
      || adBannerPosition
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
  }, [adBannerPosition, enableNativeBannerBridge, isVisible, nativeBannerPositionFromQuery, sessionAdBannerPositionOverride])

  const flushAccountPreferencesSync = useCallback(() => {
    if (!shouldScheduleAccountPreferencesSync({
      allowSync: enableAccountPreferencesSync,
      hydratedGeneration: accountPreferencesHydratedGeneration,
      requestedHydrationGeneration: accountPreferencesHydrationGenerationRef.current,
      currentPreferences: latestAccountPreferencesRef.current,
      lastSyncedStateKey: accountPreferencesLastSyncedStateKeyRef.current,
    })) {
      return
    }
    clearAccountPreferencesSyncTimer()
    syncAccountPreferences()
  }, [accountPreferencesHydratedGeneration, clearAccountPreferencesSyncTimer, enableAccountPreferencesSync, syncAccountPreferences])

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
    const handlePopState = (event: PopStateEvent) => {
      const requestedDepth = menuHistoryTargetDepthRef.current
      menuHistoryTargetDepthRef.current = null
      const currentHistoryState = typeof window === 'undefined' ? null : window.history.state
      const state = (
        currentHistoryState && typeof currentHistoryState === 'object'
          ? currentHistoryState
          : event.state
      ) as Record<string, unknown> | null
      const hasMenuDepthState = Boolean(
        state
        && typeof state[MENU_HISTORY_STATE_KEY] === 'number'
      )
      const nextStateDepth = hasMenuDepthState
        ? Math.max(0, Math.min(3, Number(state?.[MENU_HISTORY_STATE_KEY])))
        : 0
      const nextStateScreen = (
        state
        && typeof state === 'object'
        && isLivePhoneDemoMenuScreen((state as Record<string, unknown>)[MENU_HISTORY_SCREEN_STATE_KEY])
      )
        ? (state as Record<string, unknown>)[MENU_HISTORY_SCREEN_STATE_KEY] as LivePhoneDemoMenuScreen
        : undefined
      const isNativeIosHistoryGesture = requestedDepth === null && isNativeIosAppRuntime()
      const settleState = menuIosHistorySettleRef.current
      const nowMs = typeof performance !== 'undefined' ? performance.now() : Date.now()

      if (settleState && nowMs > settleState.expiresAt) {
        menuIosHistorySettleRef.current = null
      }
      const activeSettleState = menuIosHistorySettleRef.current

      if (requestedDepth !== null) {
        menuIosHistorySettleRef.current = null
        applyMenuNavigationDepth(requestedDepth, {
          screenTransitionMode: 'animate',
          screen: nextStateScreen,
        })
        return
      }

      if (menuHistoryDepthRef.current <= 0 && nextStateDepth <= 0) return
      const nextDepth = nextStateDepth
      const shouldIgnoreSettlingReplay = (
        isNativeIosHistoryGesture
        && activeSettleState !== null
        && nowMs <= activeSettleState.expiresAt
        && activeSettleState.depth !== nextDepth
        && (activeSettleState.depth === 0 || nextDepth === 0)
      )

      if (shouldIgnoreSettlingReplay) {
        // iOS already moved history, but we're treating this as a delayed replay.
        // Correct browser history to match the settled JS state so they stay in sync.
        const correctionDelta = activeSettleState!.depth - nextDepth
        if (correctionDelta !== 0) {
          menuHistoryTargetDepthRef.current = activeSettleState!.depth
          window.history.go(correctionDelta)
        }
        return
      }

      applyMenuNavigationDepth(nextDepth, {
        screenTransitionMode: isNativeIosHistoryGesture ? 'instant' : 'animate',
        screen: nextStateScreen,
      })

      if (isNativeIosHistoryGesture) {
        menuIosHistorySettleRef.current = {
          depth: nextDepth,
          expiresAt: nowMs + MENU_IOS_HISTORY_SETTLE_WINDOW_MS,
        }
        return
      }

      menuIosHistorySettleRef.current = null
    }

    window.addEventListener('popstate', handlePopState)
    return () => {
      window.removeEventListener('popstate', handlePopState)
    }
  }, [applyMenuNavigationDepth])

  useEffect(() => {
    const handlePopState = (event: PopStateEvent) => {
      const requestedOpen = langSelectorHistoryTargetOpenRef.current
      langSelectorHistoryTargetOpenRef.current = null
      const nextStateOpen = isLanguageSelectorHistoryOpen(event.state ?? window.history.state)
      const isNativeIosHistoryGesture = requestedOpen === null && isNativeIosAppRuntime()
      const nowMs = typeof performance !== 'undefined' ? performance.now() : Date.now()

      if (
        langSelectorIosHistorySettleRef.current
        && nowMs > langSelectorIosHistorySettleRef.current.expiresAt
      ) {
        langSelectorIosHistorySettleRef.current = null
      }
      const activeSettleState = langSelectorIosHistorySettleRef.current

      if (requestedOpen !== null) {
        langSelectorIosHistorySettleRef.current = null
        applyLanguageSelectorOpen(nextStateOpen)
        return
      }

      if (langSelectorOpenRef.current === nextStateOpen) return

      const shouldIgnoreSettlingReplay = (
        isNativeIosHistoryGesture
        && activeSettleState !== null
        && nowMs <= activeSettleState.expiresAt
        && activeSettleState.open !== nextStateOpen
        && (!activeSettleState.open || !nextStateOpen)
      )

      if (shouldIgnoreSettlingReplay) {
        const correctionDelta = Number(activeSettleState!.open) - Number(nextStateOpen)
        if (correctionDelta !== 0) {
          langSelectorHistoryTargetOpenRef.current = activeSettleState!.open
          window.history.go(correctionDelta)
        }
        return
      }

      applyLanguageSelectorOpen(nextStateOpen)

      if (isNativeIosHistoryGesture) {
        langSelectorIosHistorySettleRef.current = {
          open: nextStateOpen,
          expiresAt: nowMs + MENU_IOS_HISTORY_SETTLE_WINDOW_MS,
        }
        return
      }

      langSelectorIosHistorySettleRef.current = null
    }

    window.addEventListener('popstate', handlePopState)
    return () => {
      window.removeEventListener('popstate', handlePopState)
    }
  }, [applyLanguageSelectorOpen])

  useEffect(() => {
    return () => {
      if (typeof window === 'undefined') return
      if (!isLanguageSelectorHistoryOpen(window.history.state)) return
      window.history.replaceState(
        clearLanguageSelectorHistoryState(window.history.state),
        '',
      )
    }
  }, [])

  useEffect(() => {
    if (!menuOpen) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      if (renameConversationDialogOpen) {
        if (!isRenamingConversation) {
          setRenameConversationDialogOpen(false)
          setRenameConversationValue(conversationTitle ?? '')
        }
        return
      }
      if (deleteConversationDialogOpen) {
        if (!isDeletingConversation) {
          setDeleteConversationDialogOpen(false)
        }
        return
      }
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
      if (bubbleDisplayModeMenuOpen) {
        setBubbleDisplayModeMenuOpen(false)
        try {
          bubbleDisplayModeButtonRef.current?.focus({ preventScroll: true })
        } catch {
          bubbleDisplayModeButtonRef.current?.focus()
        }
        return
      }
      requestMenuBackStep()
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [bubbleDisplayModeButtonRef, bubbleDisplayModeMenuOpen, conversationTitle, deleteConversationDialogOpen, isDeletingConversation, isRenamingConversation, menuOpen, renameConversationDialogOpen, requestMenuBackStep, textSizeMenuOpen, translationModelMenuOpen])

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
    if (!bubbleDisplayModeMenuOpen) return

    const handlePointerDown = (event: PointerEvent) => {
      if (!(event.target instanceof Node)) return
      if (bubbleDisplayModeDropdownRef.current?.contains(event.target)) return
      setBubbleDisplayModeMenuOpen(false)
    }

    window.addEventListener('pointerdown', handlePointerDown)
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown)
    }
  }, [bubbleDisplayModeMenuOpen])

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

  const closeDeleteConversationDialog = useCallback(() => {
    if (isDeletingConversation) return
    setDeleteConversationDialogOpen(false)
  }, [isDeletingConversation])

  const closeRenameConversationDialog = useCallback(() => {
    if (isRenamingConversation) return
    setRenameConversationDialogOpen(false)
    setRenameConversationValue(conversationTitle ?? '')
  }, [conversationTitle, isRenamingConversation])

  const openRenameConversationDialog = useCallback(() => {
    if (!conversationId || isRenamingConversation) return
    setRenameConversationValue(conversationTitle ?? '')
    setRenameConversationDialogOpen(true)
  }, [conversationId, conversationTitle, isRenamingConversation])

  useEffect(() => registerNativeBackHandler(() => {
    if (langSelectorOpen) {
      closeLanguageSelector({ syncHistory: 'back' })
      return true
    }

    if (deleteAccountDialogOpen) {
      if (!isAuthActionPending) {
        closeDeleteAccountDialog()
      }
      return true
    }

    if (renameConversationDialogOpen) {
      if (!isRenamingConversation) {
        closeRenameConversationDialog()
      }
      return true
    }

    if (deleteConversationDialogOpen) {
      if (!isDeletingConversation) {
        closeDeleteConversationDialog()
      }
      return true
    }

    if (textSizeMenuOpen) {
      setTextSizeMenuOpen(false)
      return true
    }

    if (translationModelMenuOpen) {
      setTranslationModelMenuOpen(false)
      return true
    }

    if (bubbleDisplayModeMenuOpen) {
      setBubbleDisplayModeMenuOpen(false)
      return true
    }

    if (isComposerOpen) {
      commitLocalAccountPreferences({
        ...latestAccountPreferencesRef.current,
        inputMode: 'voice',
      })
      setIsComposerOpen(false)
      composerTextareaRef.current?.blur()
      return true
    }

    if (menuHistoryDepthRef.current > 0 || menuOpen) {
      requestMenuBackStep()
      return true
    }

    return false
  }, 10), [
    closeDeleteConversationDialog,
    closeDeleteAccountDialog,
    closeLanguageSelector,
    closeRenameConversationDialog,
    commitLocalAccountPreferences,
    deleteAccountDialogOpen,
    deleteConversationDialogOpen,
    isAuthActionPending,
    isComposerOpen,
    isDeletingConversation,
    isRenamingConversation,
    langSelectorOpen,
    menuOpen,
    renameConversationDialogOpen,
    requestMenuBackStep,
    textSizeMenuOpen,
    translationModelMenuOpen,
    bubbleDisplayModeMenuOpen,
  ])

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

  useEffect(() => {
    if (!deleteConversationDialogOpen) return
    deleteConversationCancelButtonRef.current?.focus()

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      closeDeleteConversationDialog()
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [closeDeleteConversationDialog, deleteConversationDialogOpen])

  useEffect(() => {
    if (!renameConversationDialogOpen) return
    renameConversationInputRef.current?.focus()
    renameConversationInputRef.current?.select()

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      closeRenameConversationDialog()
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [closeRenameConversationDialog, renameConversationDialogOpen])

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

    const sessionKey = resolveConversationSessionKey()
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
  }, [nativeAppUpdate, resolveConversationSessionKey])

  const {
    utterances,
    liveUtterances,
    partialTranscript,
    volume,
    startRecording,
    stopRecording,
    submitExternalUtterance,
    clearConversationHistory,
    prepareForDeletion,
    isActive,
    isReady,
    isConnecting,
    isError,
    isNativeSttSessionOwner,
    usageSec,
    isLimitReached,
    usageLimitSec,
    loadOlderUtterances,
    hasOlderUtterances,
    isStorageHydrated,
    persistedUtteranceCount,
    leaveNotices,
    inviteNotices,
    replaceConversationHistoryForQa,
    // Demo animation states
    isDemoAnimating,
    demoTypingText,
    demoTypingLang,
    demoTypingTranslations,
  } = useRealtimeSTT({
    targetLanguages: effectiveTranslationLanguages,
    onLimitReached,
    onTtsRequested: handleTtsRequested,
    onTtsAudio: handleTtsAudio,
    onTtsCanceled: handleTtsCanceled,
    enableTts: enableAutoTTS && isSoundEnabled,
    enableAec: aecEnabled,
    sonioxManualFinalizeSilenceMs,
    sttSegmentationMode: sttSegmentationMode ?? DEFAULT_STT_SEGMENTATION_MODE,
    sonioxEndpointMaxDelayMs,
    sonioxEndpointTuningStep,
    conversationId,
    sessionKeyOverride,
    storageNamespace,
    translationModel: requestTranslationModel,
    viewerUserId,
    viewerImage,
  })
  const isSttSessionRunning = isNativeAppRuntime
    ? (isNativeSttSessionOwner && (isConnecting || isReady || isActive))
    : (isConnecting || isReady || isActive)
  const isSilenceFinalizeSliderDisabled = isSttSessionRunning || isSilenceFinalizeSliderLocked
  const selectedSttSegmentationMode: SttSegmentationMode = sttSegmentationMode ?? DEFAULT_STT_SEGMENTATION_MODE
  const handleSttSegmentationModeSelect = useCallback((nextMode: SttSegmentationMode) => {
    if (isSttSessionRunning) return
    if (latestAccountPreferencesRef.current.sttSegmentationMode === nextMode) return
    const nextPreferences = commitLocalAccountPreferences({
      ...latestAccountPreferencesRef.current,
      sttSegmentationMode: nextMode,
    })
    setSttSegmentationMode(nextMode)
    clearAccountPreferencesSyncTimer()
    syncAccountPreferencesOverride(nextPreferences)
  }, [clearAccountPreferencesSyncTimer, commitLocalAccountPreferences, isSttSessionRunning, syncAccountPreferencesOverride])
  const handleSonioxManualFinalizeSilenceChange = useCallback((next: number) => {
    commitLocalAccountPreferences({
      ...latestAccountPreferencesRef.current,
      sonioxManualFinalizeSilenceMs: next,
    })
    setSonioxManualFinalizeSilenceMs(next)
  }, [commitLocalAccountPreferences])
  const handleSonioxEndpointTuningStepChange = useCallback((next: number) => {
    const nextPreferences = commitLocalAccountPreferences({
      ...latestAccountPreferencesRef.current,
      sonioxEndpointTuningStep: next,
    })
    setSonioxEndpointTuningStep(next)
    clearAccountPreferencesSyncTimer()
    syncAccountPreferencesOverride(nextPreferences)
  }, [clearAccountPreferencesSyncTimer, commitLocalAccountPreferences, syncAccountPreferencesOverride])
  const onSttSessionRunningChangeRef = useRef(onSttSessionRunningChange)

  useEffect(() => {
    onSttSessionRunningChangeRef.current = onSttSessionRunningChange
  }, [onSttSessionRunningChange])

  useEffect(() => {
    onSttSessionRunningChangeRef.current?.(isSttSessionRunning)
  }, [isSttSessionRunning])

  const conversationStatsReportTimerRef = useRef<number | null>(null)
  const latestConversationStatsRef = useRef({
    usageSec,
    messageCount: persistedUtteranceCount,
  })
  const lastReportedConversationStatsRef = useRef<{
    usageSec: number
    messageCount: number
  } | null>(null)
  const onConversationStatsChangeRef = useRef(onConversationStatsChange)
  onConversationStatsChangeRef.current = onConversationStatsChange
  latestConversationStatsRef.current = {
    usageSec,
    messageCount: persistedUtteranceCount,
  }

  useEffect(() => {
    const nextStats = latestConversationStatsRef.current
    const previousStats = lastReportedConversationStatsRef.current
    const shouldReportImmediately = previousStats === null
      || previousStats.messageCount !== nextStats.messageCount
      || !isSttSessionRunning

    if (shouldReportImmediately) {
      if (conversationStatsReportTimerRef.current !== null) {
        window.clearTimeout(conversationStatsReportTimerRef.current)
        conversationStatsReportTimerRef.current = null
      }
      lastReportedConversationStatsRef.current = nextStats
      onConversationStatsChangeRef.current?.(nextStats)
      return
    }

    if (conversationStatsReportTimerRef.current !== null) return
    conversationStatsReportTimerRef.current = window.setTimeout(() => {
      conversationStatsReportTimerRef.current = null
      const latestStats = latestConversationStatsRef.current
      lastReportedConversationStatsRef.current = latestStats
      onConversationStatsChangeRef.current?.(latestStats)
    }, CONVERSATION_STATS_REPORT_INTERVAL_MS)
  }, [isSttSessionRunning, persistedUtteranceCount, usageSec])

  useEffect(() => () => {
    if (conversationStatsReportTimerRef.current === null) return
    window.clearTimeout(conversationStatsReportTimerRef.current)
    conversationStatsReportTimerRef.current = null
  }, [])

  const committedUtteranceIdsRef = useRef<Set<string>>(new Set())
  committedUtteranceIdsRef.current = new Set(utterances.map((utterance) => utterance.id))
  const lastReportedUtteranceIdRef = useRef('')
  const liveUtterancePreviewTimerRef = useRef<number | null>(null)
  const lastReportedLiveUtterancePreviewRef = useRef<{
    utteranceId: string
    preview: string
  } | null>(null)
  const onLatestUtterancePreviewChangeRef = useRef(onLatestUtterancePreviewChange)

  useEffect(() => {
    onLatestUtterancePreviewChangeRef.current = onLatestUtterancePreviewChange
  }, [onLatestUtterancePreviewChange])

  useEffect(() => {
    if (!onLatestUtteranceChange && !onLatestUtterancePreviewChangeRef.current) return
    const latestUtterance = utterances[utterances.length - 1]
    const latestPayload = latestUtterance
      ? buildLatestUtterancePayload(latestUtterance)
      : null
    if (!latestPayload || !latestUtterance) return

    const isNewFinalUtterance = lastReportedUtteranceIdRef.current !== latestUtterance.id
    if (isNewFinalUtterance) {
      if (liveUtterancePreviewTimerRef.current !== null) {
        window.clearTimeout(liveUtterancePreviewTimerRef.current)
        liveUtterancePreviewTimerRef.current = null
      }
      lastReportedLiveUtterancePreviewRef.current = null
      onLatestUtterancePreviewChangeRef.current?.(null)
    }

    if (!isNewFinalUtterance) return
    lastReportedUtteranceIdRef.current = latestUtterance.id
    onLatestUtteranceChange?.(latestPayload)
  }, [onLatestUtteranceChange, utterances])

  useEffect(() => {
    const onPreviewChange = onLatestUtterancePreviewChangeRef.current
    if (!onPreviewChange) return

    if (liveUtterancePreviewTimerRef.current !== null) {
      window.clearTimeout(liveUtterancePreviewTimerRef.current)
      liveUtterancePreviewTimerRef.current = null
    }

    const latestLiveUtterance = [...liveUtterances]
      .reverse()
      .find((utterance) => (
        !committedUtteranceIdsRef.current.has(utterance.id)
        && Boolean(utterance.originalText.trim())
      ))
    const latestPayload = latestLiveUtterance
      ? buildLatestUtterancePayload(latestLiveUtterance)
      : null

    if (!latestLiveUtterance || !latestPayload) {
      if (lastReportedLiveUtterancePreviewRef.current) {
        lastReportedLiveUtterancePreviewRef.current = null
        onPreviewChange(null)
      }
      return
    }

    const previousPreview = lastReportedLiveUtterancePreviewRef.current
    if (
      previousPreview?.utteranceId === latestLiveUtterance.id
      && previousPreview.preview === latestPayload.preview
    ) {
      return
    }

    const previewUtteranceId = latestLiveUtterance.id
    const previewPayload = latestPayload
    liveUtterancePreviewTimerRef.current = window.setTimeout(() => {
      liveUtterancePreviewTimerRef.current = null
      if (committedUtteranceIdsRef.current.has(previewUtteranceId)) {
        lastReportedLiveUtterancePreviewRef.current = null
        onPreviewChange(null)
        return
      }

      lastReportedLiveUtterancePreviewRef.current = {
        utteranceId: previewUtteranceId,
        preview: previewPayload.preview,
      }
      onPreviewChange(previewPayload)
    }, LIVE_UTTERANCE_PREVIEW_DEBOUNCE_MS)

    return () => {
      if (liveUtterancePreviewTimerRef.current !== null) {
        window.clearTimeout(liveUtterancePreviewTimerRef.current)
        liveUtterancePreviewTimerRef.current = null
      }
    }
  }, [liveUtterances, utterances])

  const chatBubbleTextClassName = TEXT_SIZE_CLASS_BY_LEVEL[textSizeLevel] || TEXT_SIZE_CLASS_BY_LEVEL[DEFAULT_TEXT_SIZE_LEVEL]
  const textSizePreviewLanguage = effectiveTranslationLanguages[0] || fallbackLanguages[0] || DEFAULT_STT_LANGUAGES[0] || 'en'
  const textSizePreviewBadgeLabel = textSizePreviewLanguage.trim().replace('_', '-').split('-')[0]?.toUpperCase() || 'EN'
  const textSizePreviewLabel = `Level ${textSizeLevel}`
  const sliderClassName = [
    // Keep the visible thumb compact while giving the native thumb a 44px touch target.
    // Mask the track ends by the same 22px inset so the visible range still reaches both ends.
    'h-12 w-full cursor-pointer touch-none appearance-none bg-transparent py-1.5',
    'accent-[#0A84FF]',
    '[&::-webkit-slider-runnable-track]:h-1.5 [&::-webkit-slider-runnable-track]:appearance-none [&::-webkit-slider-runnable-track]:rounded-full [&::-webkit-slider-runnable-track]:bg-white [&::-webkit-slider-runnable-track]:bg-[linear-gradient(to_right,_white_0_22px,_#d1d1d6_22px_calc(100%_-_22px),_white_calc(100%_-_22px)_100%)]',
    '[&::-webkit-slider-thumb]:-mt-[19px] [&::-webkit-slider-thumb]:h-11 [&::-webkit-slider-thumb]:w-11 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-0 [&::-webkit-slider-thumb]:bg-transparent [&::-webkit-slider-thumb]:bg-[radial-gradient(circle,_#fff_0_9px,_#c7c7cc_9px_10px,_transparent_10px)] [&::-webkit-slider-thumb]:shadow-none',
    '[&::-moz-range-track]:h-1.5 [&::-moz-range-track]:appearance-none [&::-moz-range-track]:rounded-full [&::-moz-range-track]:bg-white [&::-moz-range-track]:bg-[linear-gradient(to_right,_white_0_22px,_#d1d1d6_22px_calc(100%_-_22px),_white_calc(100%_-_22px)_100%)]',
    '[&::-moz-range-thumb]:h-11 [&::-moz-range-thumb]:w-11 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-transparent [&::-moz-range-thumb]:bg-[radial-gradient(circle,_#fff_0_9px,_#c7c7cc_9px_10px,_transparent_10px)] [&::-moz-range-thumb]:shadow-none',
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

  const handleDeleteConversationConfirm = useCallback(async () => {
    if (isDeletingConversation || !conversationId) return
    setIsDeletingConversation(true)

    try {
      if (isSttSessionRunning) {
        try {
          prepareForDeletion()
          await stopRecording({ discardPendingFinalization: true })
          scheduleTtsResumeAfterStopClick()
        } catch {
          // Continue deleting the room even if the native stop path races.
        }
      }

      const trackingUserId = getOrCreateTrackingUserId()
      // A multi-member room's row-removal action is "leave" (removes just
      // this caller's membership, see leaveConversationChannel), not
      // "delete" — see the isMultiMember prop doc comment.
      const response = await fetch(
        buildClientApiPath(`/conversations/${conversationId}${isMultiMember ? '/leave' : ''}`),
        {
          method: isMultiMember ? 'POST' : 'DELETE',
          headers: buildTrackingRequestHeaders({
            sessionKey: resolveConversationSessionKey(),
            trackingUserId,
            nativeAppUpdate,
          }),
        },
      )

      if (!response.ok && response.status !== 404) {
        throw new Error(`conversation_delete_failed:${response.status}`)
      }

      manualTtsRequestSeqRef.current += 1
      setPendingManualTtsTarget(null)
      forceStopTtsPlayback('force_reset', { clearSpeakingItem: true })
      clearConversationHistory()
      setDeleteConversationDialogOpen(false)
      requestCloseMenuPanel()
      onConversationDeleted?.()
      toast.success(isMultiMember ? leaveConversationCopy.successToastLabel : deleteConversationCopy.successToastLabel)
    } catch {
      toast.error(isMultiMember ? leaveConversationCopy.errorToastLabel : deleteConversationCopy.errorToastLabel)
    } finally {
      setIsDeletingConversation(false)
    }
  }, [
    clearConversationHistory,
    conversationId,
    deleteConversationCopy.errorToastLabel,
    deleteConversationCopy.successToastLabel,
    forceStopTtsPlayback,
    isDeletingConversation,
    isMultiMember,
    isSttSessionRunning,
    leaveConversationCopy.errorToastLabel,
    leaveConversationCopy.successToastLabel,
    nativeAppUpdate,
    onConversationDeleted,
    prepareForDeletion,
    resolveConversationSessionKey,
    requestCloseMenuPanel,
    scheduleTtsResumeAfterStopClick,
    stopRecording,
  ])

  const handleRenameConversationConfirm = useCallback(async () => {
    if (isRenamingConversation || !conversationId) return

    const normalizedTitle = renameConversationValue.trim()
    if (!normalizedTitle) {
      toast.error(roomManagementCopy.renameEmptyMessage)
      return
    }

    setIsRenamingConversation(true)

    try {
      const response = await fetch(buildClientApiPath(`/conversations/${conversationId}`), {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...buildTrackingRequestHeaders({
            sessionKey: resolveConversationSessionKey(),
            trackingUserId: getOrCreateTrackingUserId(),
            nativeAppUpdate,
          }),
        },
        body: JSON.stringify({ title: normalizedTitle }),
      })

      if (!response.ok) {
        throw new Error(`conversation_rename_failed:${response.status}`)
      }

      setDisplayConversationTitle(normalizedTitle)
      setRenameConversationValue(normalizedTitle)
      setRenameConversationDialogOpen(false)
      toast.success(roomManagementCopy.renameSuccessToastLabel)
    } catch {
      toast.error(roomManagementCopy.renameErrorToastLabel)
    } finally {
      setIsRenamingConversation(false)
    }
  }, [
    conversationId,
    isRenamingConversation,
    nativeAppUpdate,
    renameConversationValue,
    resolveConversationSessionKey,
    roomManagementCopy.renameEmptyMessage,
    roomManagementCopy.renameErrorToastLabel,
    roomManagementCopy.renameSuccessToastLabel,
  ])

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

  const handleToggleSelectedLanguage = useCallback((code: string) => {
    const normalizedCode = canonicalizeSttLanguageCode(code)
    if (!normalizedCode) return
    // Add/remove decisions read the caller's OWN picks, not the room union —
    // tapping a language that's only checked because another member picked
    // it should add the caller as a co-picker, never remove it from the room.
    const currentOwnLanguages = ownSelectedLanguagesRef.current
    const isOwnSelected = currentOwnLanguages.includes(normalizedCode)
    const nextOwnLanguages = isOwnSelected
      ? currentOwnLanguages.filter(c => c !== normalizedCode)
      : [...currentOwnLanguages, normalizedCode]
    ownSelectedLanguagesRef.current = nextOwnLanguages
    selectedLanguagesChangePendingRef.current = true
    setOwnSelectedLanguages(nextOwnLanguages)

    // Optimistically keep the displayed union (what's checked, and what
    // drives translation targets) in sync with the caller's own edit: adding
    // always adds to the union; removing only drops from the union if no
    // OTHER member still holds it — solo rooms have no other member, so this
    // reduces to the old "remove == remove" behavior exactly.
    const currentUnion = selectedLanguagesRef.current
    const otherHolders = (selectedLanguagesAttributionRef.current[normalizedCode] ?? [])
      .filter((memberId) => memberId !== viewerUserId)
    const nextUnion = !isOwnSelected
      ? (currentUnion.includes(normalizedCode) ? currentUnion : [...currentUnion, normalizedCode])
      : (otherHolders.length > 0
          ? currentUnion
          : currentUnion.filter(c => c !== normalizedCode))
    selectedLanguagesRef.current = nextUnion
    setSelectedLanguages(nextUnion)

    // The per-language "who picked this" avatar badge reads this attribution
    // map — without updating it here too, the viewer's own avatar wouldn't
    // appear next to a language they just picked until the next full
    // hydration from the server.
    if (viewerUserId) {
      const currentAttribution = selectedLanguagesAttributionRef.current
      const nextAttribution = { ...currentAttribution }
      if (!isOwnSelected) {
        nextAttribution[normalizedCode] = [...otherHolders, viewerUserId]
      } else if (otherHolders.length > 0) {
        nextAttribution[normalizedCode] = otherHolders
      } else {
        delete nextAttribution[normalizedCode]
      }
      selectedLanguagesAttributionRef.current = nextAttribution
      setSelectedLanguagesAttribution(nextAttribution)
    }
  }, [viewerUserId])

  const micPointerActivationRef = useRef(false)
  const suppressMicClickUntilRef = useRef(0)
  const startPreparationInFlightRef = useRef(false)
  const handleMicPointerDown = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
    event.preventDefault()
    if (event.button === 0) {
      micPointerActivationRef.current = true
    }
    if (!enableAutoTTS || isActive) return
    void primeAudioPlayback()
  }, [enableAutoTTS, isActive, primeAudioPlayback])

  const [isPreparingStart, setIsPreparingStart] = useState(false)
  const showConnectingOverlay = isPreparingStart || isConnecting

  const handleStartRecording = useCallback(async () => {
    if (isLimitReached) {
      onLimitReached?.()
      return
    }
    if (isSttSessionRunning || isPreparingStart || startPreparationInFlightRef.current) return

    startPreparationInFlightRef.current = true
    setIsPreparingStart(true)
    try {
      const startPreparation = await onStartRecordingRequested?.()
      if (startPreparation?.switchedFromLiveConversation) {
        showFloatingToast(switchLiveRoomToastLabel)
      }

      let primeAudioPromise: Promise<boolean> | null = null
      if (enableAutoTTS) {
        // Do not block STT start on iOS/WebView audio priming.
        // HTMLMediaElement.play() may stay pending until a later user gesture,
        // which makes the room look "stuck" in connecting even though STT has
        // not started yet. Prime in the background and let STT start first.
        primeAudioPromise = primeAudioPlayback()
      }
      await startRecording()
      if (primeAudioPromise) {
        void primeAudioPromise.then((ok) => {
          if (!ok) {
            ttsNeedsUnlockRef.current = true
          }
        })
      }
    } finally {
      startPreparationInFlightRef.current = false
      setIsPreparingStart(false)
    }
  }, [
    enableAutoTTS,
    isLimitReached,
    isPreparingStart,
    isSttSessionRunning,
    onLimitReached,
    onStartRecordingRequested,
    primeAudioPlayback,
    startRecording,
    showFloatingToast,
    switchLiveRoomToastLabel,
  ])

  const handleStopRecording = useCallback(async (options?: { deferRunningStateChange?: boolean, discardPendingFinalization?: boolean, forceNativeStop?: boolean }) => {
    if (!isSttSessionRunning && options?.forceNativeStop !== true) return
    if (options?.deferRunningStateChange !== true) {
      onSttSessionRunningChange?.(false)
    }
    await stopRecording({
      discardPendingFinalization: options?.discardPendingFinalization,
      forceNativeStop: options?.forceNativeStop,
    })
    if (options?.deferRunningStateChange === true) {
      onSttSessionRunningChange?.(false)
    }
    scheduleTtsResumeAfterStopClick()
  }, [isSttSessionRunning, onSttSessionRunningChange, scheduleTtsResumeAfterStopClick, stopRecording])

  const performMicAction = useCallback(() => {
    const shouldStopConnectingSession = isConnecting
      && (!isNativeAppRuntime || isNativeSttSessionOwner)
    if (isSttSessionRunning || shouldStopConnectingSession) {
      // A missed native `ready` event can leave the hook in connecting while
      // the native recorder is already active. Keep the control recoverable by
      // allowing the user to cancel that session instead of disabling it.
      void handleStopRecording({ forceNativeStop: !isSttSessionRunning })
      return
    }
    void handleStartRecording()
  }, [handleStartRecording, handleStopRecording, isConnecting, isNativeAppRuntime, isNativeSttSessionOwner, isSttSessionRunning])

  const handleMicClick = useCallback(() => {
    micPointerActivationRef.current = false
    if (Date.now() < suppressMicClickUntilRef.current) {
      suppressMicClickUntilRef.current = 0
      return
    }
    performMicAction()
  }, [performMicAction])

  const handleMicPointerUp = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!micPointerActivationRef.current) return
    micPointerActivationRef.current = false
    event.preventDefault()
    // Some Android WebViews still dispatch a compatibility click after the
    // pointer sequence even though pointerdown prevented focus movement.
    // Activate on pointerup and suppress only that duplicate click.
    suppressMicClickUntilRef.current = Date.now() + 500
    performMicAction()
  }, [performMicAction])

  const handleMicPointerCancel = useCallback(() => {
    micPointerActivationRef.current = false
  }, [])

  const handleToggleComposer = useCallback(() => {
    const next = !isComposerOpen
    commitLocalAccountPreferences({
      ...latestAccountPreferencesRef.current,
      inputMode: next ? 'text' : 'voice',
    })
    composerFocusRequestedRef.current = next
    persistedInputModeRef.current = next ? 'text' : 'voice'
    try {
      localStorage.setItem(LS_KEY_INPUT_MODE, next ? 'text' : 'voice')
    } catch {
      // Ignore local persistence failures and keep in-memory state.
    }
    if (isComposerOpen) {
      composerTextareaRef.current?.blur()
    }
    setIsComposerOpen(next)
  }, [commitLocalAccountPreferences, isComposerOpen])

  const handleComposerDraftChange = useCallback((event: ChangeEvent<HTMLTextAreaElement>) => {
    const nextDraft = event.currentTarget.value
    composerDraftRef.current = nextDraft
    persistComposerDraft(nextDraft, composerDraftStorageKey)
    const nextHasDraft = nextDraft.trim().length > 0
    setComposerHasDraft((current) => current === nextHasDraft ? current : nextHasDraft)
    syncComposerTextareaHeight(event.currentTarget)
  }, [composerDraftStorageKey, syncComposerTextareaHeight])

  const handleComposerSubmit = useCallback((event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const textarea = composerTextareaRef.current
    const nextText = (textarea?.value ?? composerDraftRef.current).trim()
    if (!nextText) {
      focusComposerTextarea()
      return
    }

    const submittedUtteranceId = submitExternalUtterance({
      text: nextText,
      sourceLanguage: 'unknown',
      speaker: composerCopy.manualSpeakerLabel,
    })
    if (!submittedUtteranceId) return
    composerDraftRef.current = ''
    if (textarea) {
      textarea.value = ''
    }
    setComposerHasDraft(false)
    persistComposerDraft('', composerDraftStorageKey)
    // Keep the same textarea focused so submitting does not dismiss the
    // mobile keyboard or require the user to tap the field again.
    focusComposerTextarea()
    if (typeof window !== 'undefined') {
      window.requestAnimationFrame(() => {
        syncComposerTextareaHeight(composerTextareaRef.current)
      })
    } else {
      syncComposerTextareaHeight(composerTextareaRef.current)
    }
  }, [composerCopy.manualSpeakerLabel, composerDraftStorageKey, focusComposerTextarea, submitExternalUtterance, syncComposerTextareaHeight])

  useImperativeHandle(ref, () => ({
    startRecording: async () => {
      await handleStartRecording()
    },
    stopRecording: async (options) => {
      if (options?.discardPendingFinalization) {
        prepareForDeletion()
      }
      await handleStopRecording(options)
    },
    prepareForDeletion,
    isSttSessionRunning: () => isSttSessionRunning,
    requestCloseTopmostOverlay,
    resetNavigationOverlays,
  }), [handleStartRecording, handleStopRecording, isSttSessionRunning, prepareForDeletion, requestCloseTopmostOverlay, resetNavigationOverlays])

  const chatRef = useRef<HTMLDivElement>(null)
  const scrollDateLabelAnchorsRef = useRef<ScrollDateLabelAnchor[]>([])
  const viewportAnchorSnapshotRef = useRef<ScrollViewportAnchorSnapshot | null>(null)
  const lateMessageHeightChangeEffectAboveViewportAnchorRef = useRef<LateMessageHeightChangeEffectAboveViewportAnchor>({
    anchorUtteranceId: null,
    deltaAboveAnchorPx: 0,
    changedMessages: [],
  })
  const lastDistanceToBottomRef = useRef(0)
  const renderedMessageCountsRef = useRef<ChatScrollMessageCountSnapshot>({
    utteranceCount: utterances.length,
    liveUtteranceCount: liveUtterances.length,
  })
  const shouldAutoScroll = useRef(true)
  const suppressAutoScrollRef = useRef(false)
  const userScrollIntentUntilRef = useRef(0)
  const hasInitialBottomAnchorRef = useRef(false)
  const allowAutoTopPaginationRef = useRef(false)
  const isPaginatingRef = useRef(false)
  const prevScrollHeightRef = useRef<number | null>(null)
  const prevScrollTopRef = useRef<number | null>(null)
  const isLoadingOlderRef = useRef(false)
  const autoScrollSchedulerRef = useRef(createAutoScrollScheduler())
  const scrollUiHideTimerRef = useRef<number | null>(null)
  const scrollStateFrameRef = useRef<{
    frameId: number | null
    fromUserScroll: boolean
  }>({
    frameId: null,
    fromUserScroll: false,
  })
  const openSmoothScrollTimerRef = useRef<number | null>(null)
  const openSmoothScrollDeadlineRef = useRef(0)
  const openSmoothScrollLastHeightRef = useRef(0)
  const openSmoothScrollStableTicksRef = useRef(0)
  const scrollUiVisibleRef = useRef(false)
  const scrollDateLabelRef = useRef('')
  const previousDisplayUtteranceIdsRef = useRef<string[] | null>(null)
  const scrollMetricsRef = useRef<LivePhoneDemoScrollMetrics>(INITIAL_SCROLL_METRICS)
  const scrollHandlerMeasurementRef = useRef<LivePhoneDemoScrollHandlerMeasurementState | null>(null)
  const scrollHandlerMeasurementLoggedSampleCountRef = useRef(0)
  const [scrollUiVisible, setScrollUiVisible] = useState(false)
  const [scrollDateLabel, setScrollDateLabel] = useState('')
  const [scrollMetrics, setScrollMetrics] = useState<LivePhoneDemoScrollMetrics>(INITIAL_SCROLL_METRICS)

  const configureScrollHandlerMeasurement = useCallback(() => {
    if (process.env.NODE_ENV === 'production' || typeof window === 'undefined') {
      scrollHandlerMeasurementRef.current = null
      return
    }

    const activeCounter = resolveLivePhoneDemoScrollMeasurementCounter({
      nodeEnv: process.env.NODE_ENV,
      search: window.location.search || '',
      storageValue: readLiveDemoScrollMeasurementStorageValue(),
    })

    scrollHandlerMeasurementLoggedSampleCountRef.current = 0
    scrollHandlerMeasurementRef.current = activeCounter === LIVE_DEMO_SCROLL_HANDLER_MEASUREMENT_COUNTER
      ? {
          counter: LIVE_DEMO_SCROLL_HANDLER_MEASUREMENT_COUNTER,
          samplesMs: [],
          latestMs: 0,
          maxMs: 0,
        }
      : null
  }, [])

  const recordScrollHandlerMeasurement = useCallback((durationMs: number) => {
    if (process.env.NODE_ENV === 'production') return

    const measurementState = scrollHandlerMeasurementRef.current
    if (!measurementState) return

    const snapshot = recordLivePhoneDemoScrollHandlerMeasurement(measurementState, durationMs)
    if (
      !snapshot.representative
      || snapshot.sampleCount % LIVE_DEMO_SCROLL_HANDLER_MEASUREMENT_SAMPLE_TARGET !== 0
      || scrollHandlerMeasurementLoggedSampleCountRef.current === snapshot.sampleCount
    ) {
      return
    }

    scrollHandlerMeasurementLoggedSampleCountRef.current = snapshot.sampleCount
    console.info('[MingleLiveDemoScroll]', snapshot)
  }, [])

  useEffect(() => {
    configureScrollHandlerMeasurement()
  }, [configureScrollHandlerMeasurement])

  const captureCurrentViewportAnchorSnapshot = useCallback((scrollTop: number) => {
    viewportAnchorSnapshotRef.current = resolveScrollViewportAnchorSnapshot({
      anchors: scrollDateLabelAnchorsRef.current,
      scrollTop,
    })
  }, [])

  const handleLoadOlder = useCallback(() => {
    const node = chatRef.current
    if (isLoadingOlderRef.current || !hasOlderUtterances || !node) return
    isLoadingOlderRef.current = true
    suppressAutoScrollRef.current = true
    shouldAutoScroll.current = false
    isPaginatingRef.current = true
    captureCurrentViewportAnchorSnapshot(node.scrollTop)
    prevScrollHeightRef.current = node.scrollHeight
    prevScrollTopRef.current = node.scrollTop
    void loadOlderUtterances().then((didLoad) => {
      if (didLoad) return
      prevScrollHeightRef.current = null
      prevScrollTopRef.current = null
      isPaginatingRef.current = false
      isLoadingOlderRef.current = false
    }).catch(() => {
      prevScrollHeightRef.current = null
      prevScrollTopRef.current = null
      isPaginatingRef.current = false
      isLoadingOlderRef.current = false
    })
  }, [captureCurrentViewportAnchorSnapshot, hasOlderUtterances, loadOlderUtterances])

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

  const clearOpenSmoothScrollTimer = useCallback(() => {
    if (openSmoothScrollTimerRef.current) {
      window.clearTimeout(openSmoothScrollTimerRef.current)
      openSmoothScrollTimerRef.current = null
    }
  }, [])

  const clearPendingAutoScrollTimer = useCallback(() => {
    autoScrollSchedulerRef.current.cancel()
  }, [])

  const refreshScrollDateLabelAnchors = useCallback(() => {
    const node = chatRef.current
    if (!node) {
      scrollDateLabelAnchorsRef.current = []
      lateMessageHeightChangeEffectAboveViewportAnchorRef.current = {
        anchorUtteranceId: null,
        deltaAboveAnchorPx: 0,
        changedMessages: [],
      }
      return
    }

    const previousAnchors = scrollDateLabelAnchorsRef.current
    const nextAnchors = readScrollDateLabelAnchors(node)
    const lateMessageHeightChangeEffect = deriveLateMessageHeightChangeEffectAboveViewportAnchor({
      previousAnchors,
      nextAnchors,
      viewportAnchor: viewportAnchorSnapshotRef.current,
    })
    lateMessageHeightChangeEffectAboveViewportAnchorRef.current = lateMessageHeightChangeEffect
    const adjustedScrollTop = resolveLateMessageHeightChangeAnchorScrollTop({
      viewportAnchor: viewportAnchorSnapshotRef.current,
      nextAnchors,
      currentScrollTop: node.scrollTop,
      deltaAboveAnchorPx: lateMessageHeightChangeEffect.deltaAboveAnchorPx,
      maxScrollTop: node.scrollHeight - node.clientHeight,
    })
    if (adjustedScrollTop !== null) {
      node.scrollTop = adjustedScrollTop
    }
    scrollDateLabelAnchorsRef.current = nextAnchors
  }, [])

  const applyScrollMetricsState = useCallback((nextMetrics: LivePhoneDemoScrollMetrics) => {
    if (areScrollMetricsEqual(scrollMetricsRef.current, nextMetrics)) return
    scrollMetricsRef.current = nextMetrics
    setScrollMetrics(nextMetrics)
  }, [])

  const applyScrollDateLabelState = useCallback((nextDateLabel: string) => {
    if (!shouldUpdateScrollDateLabelState(scrollDateLabelRef.current, nextDateLabel)) return
    scrollDateLabelRef.current = nextDateLabel
    setScrollDateLabel(nextDateLabel)
  }, [])

  const applyScrollUiVisibleState = useCallback((nextVisible: boolean) => {
    if (scrollUiVisibleRef.current === nextVisible) return
    scrollUiVisibleRef.current = nextVisible
    setScrollUiVisible(nextVisible)
  }, [])

  const updateScrollDerivedState = useCallback((options?: { fromUserScroll?: boolean }) => {
    if (!chatRef.current) return
    const fromUserScroll = options?.fromUserScroll === true
    const { scrollTop, scrollHeight, clientHeight } = chatRef.current
    captureCurrentViewportAnchorSnapshot(scrollTop)
    if (shouldCapturePrependScrollTopSnapshot({
      isPaginating: isPaginatingRef.current,
      previousScrollHeight: prevScrollHeightRef.current,
      currentScrollHeight: scrollHeight,
    })) {
      prevScrollTopRef.current = scrollTop
    }
    const distanceToBottom = Math.max(0, scrollHeight - scrollTop - clientHeight)
    lastDistanceToBottomRef.current = distanceToBottom
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

    const nextScrollMetrics = deriveLivePhoneDemoScrollMetrics({
      scrollTop,
      scrollHeight,
      clientHeight,
    })
    applyScrollMetricsState(nextScrollMetrics)

    applyScrollDateLabelState(findTopVisibleUtteranceDateLabel(
      scrollDateLabelAnchorsRef.current,
      scrollTop,
      uiLocale,
    ))

    if (
      allowAutoTopPaginationRef.current
      && scrollTop < 100
      && hasOlderUtterances
      && !isLoadingOlderRef.current
    ) {
      handleLoadOlder()
    }
  }, [
    applyScrollDateLabelState,
    applyScrollMetricsState,
    captureCurrentViewportAnchorSnapshot,
    hasOlderUtterances,
    handleLoadOlder,
    uiLocale,
  ])

  const processScrollEventDerivedState = useCallback((options: { fromUserScroll: boolean }) => {
    const { fromUserScroll } = options
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
      applyScrollUiVisibleState(false)
      return
    }

    applyScrollUiVisibleState(true)
    clearScrollUiHideTimer()
    if (scrollUi.scheduleHideTimer) {
      scrollUiHideTimerRef.current = window.setTimeout(() => {
        applyScrollUiVisibleState(false)
      }, SCROLL_UI_HIDE_DELAY_MS)
    }
  }, [
    applyScrollUiVisibleState,
    clearPendingAutoScrollTimer,
    clearScrollUiHideTimer,
    updateScrollDerivedState,
  ])

  const cancelScheduledScrollEventDerivedState = useCallback(() => {
    if (scrollStateFrameRef.current.frameId !== null) {
      window.cancelAnimationFrame(scrollStateFrameRef.current.frameId)
      scrollStateFrameRef.current.frameId = null
    }
    scrollStateFrameRef.current.fromUserScroll = false
  }, [])

  const scheduleScrollEventDerivedState = useCallback((options: { fromUserScroll: boolean }) => {
    scrollStateFrameRef.current.fromUserScroll = (
      scrollStateFrameRef.current.fromUserScroll
      || options.fromUserScroll
    )

    if (scrollStateFrameRef.current.frameId !== null) return

    scrollStateFrameRef.current.frameId = window.requestAnimationFrame(() => {
      const fromUserScroll = scrollStateFrameRef.current.fromUserScroll
      scrollStateFrameRef.current.frameId = null
      scrollStateFrameRef.current.fromUserScroll = false
      processScrollEventDerivedState({ fromUserScroll })
    })
  }, [processScrollEventDerivedState])

  const handleScroll = useCallback(() => {
    const measurementStartMs = scrollHandlerMeasurementRef.current ? readBrowserPerformanceNowMs() : null
    const node = chatRef.current
    if (node) {
      const scrollTop = node.scrollTop
      captureCurrentViewportAnchorSnapshot(scrollTop)
      const previousScrollHeight = prevScrollHeightRef.current

      if (
        shouldReadPrependScrollHeightForSnapshot({
          isPaginating: isPaginatingRef.current,
          previousScrollHeight,
        })
        && shouldCapturePrependScrollTopSnapshot({
          isPaginating: true,
          previousScrollHeight,
          currentScrollHeight: node.scrollHeight,
        })
      ) {
        prevScrollTopRef.current = scrollTop
      }
    }
    scheduleScrollEventDerivedState({ fromUserScroll: isUserScrollIntentActive() })
    if (measurementStartMs !== null) {
      recordScrollHandlerMeasurement(readBrowserPerformanceNowMs() - measurementStartMs)
    }
  }, [
    captureCurrentViewportAnchorSnapshot,
    isUserScrollIntentActive,
    recordScrollHandlerMeasurement,
    scheduleScrollEventDerivedState,
  ])

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
    if (typeof window === 'undefined') return

    const cachedBannerLayout = readCachedNativeUiBannerLayout(window)
    if (cachedBannerLayout) {
      setNativeBannerLayout(cachedBannerLayout)
    }

    const handleNativeUiEvent = (event: Event) => {
      const detail = (event as CustomEvent<unknown>).detail
      const bannerLayout = parseNativeUiBannerLayoutDetail(detail)
      if (!bannerLayout) return
      setNativeBannerLayout(bannerLayout)
    }

    window.addEventListener(NATIVE_UI_EVENT, handleNativeUiEvent as EventListener)
    return () => {
      window.removeEventListener(NATIVE_UI_EVENT, handleNativeUiEvent as EventListener)
    }
  }, [])

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

  useLayoutEffect(() => {
    const nextCounts: ChatScrollMessageCountSnapshot = {
      utteranceCount: utterances.length,
      liveUtteranceCount: liveUtterances.length,
    }
    const autoScrollState = deriveNewMessageAutoScrollState({
      previousCounts: renderedMessageCountsRef.current,
      nextCounts,
      previousDistanceToBottom: lastDistanceToBottomRef.current,
      isPaginating: isPaginatingRef.current,
      isLoadingOlder: isLoadingOlderRef.current,
      nearBottomThresholdPx: AUTO_SCROLL_BOTTOM_THRESHOLD_PX,
    })

    renderedMessageCountsRef.current = nextCounts

    if (!autoScrollState.shouldAutoScroll || !hasInitialBottomAnchorRef.current || !chatRef.current) return

    const node = chatRef.current
    suppressAutoScrollRef.current = false
    shouldAutoScroll.current = true

    const autoScrollTargetTop = resolveNewMessageAutoScrollTargetTop({
      shouldAutoScroll: autoScrollState.shouldAutoScroll,
      currentScrollTop: node.scrollTop,
      currentScrollHeight: node.scrollHeight,
      currentClientHeight: node.clientHeight,
    })

    if (autoScrollTargetTop !== null) {
      node.scrollTop = autoScrollTargetTop
      autoScrollSchedulerRef.current.markPerformed()
    }

    updateScrollDerivedState()
  }, [
    liveUtterances.length,
    updateScrollDerivedState,
    utterances.length,
  ])

  useLayoutEffect(() => {
    refreshScrollDateLabelAnchors()
    updateScrollDerivedState()
  }, [
    chatBubbleTextClassName,
    demoTypingText,
    liveUtterances.length,
    refreshScrollDateLabelAnchors,
    updateScrollDerivedState,
    utterances,
  ])

  useEffect(() => {
    if (typeof MutationObserver === 'undefined' || !chatRef.current) return

    const node = chatRef.current
    let rafId: number | null = null
    const scheduleRefresh = () => {
      captureCurrentViewportAnchorSnapshot(node.scrollTop)
      if (rafId !== null) return
      rafId = window.requestAnimationFrame(() => {
        rafId = null
        refreshScrollDateLabelAnchors()
        updateScrollDerivedState()
      })
    }
    const observer = new MutationObserver(scheduleRefresh)

    observer.observe(node, {
      childList: true,
      subtree: true,
      characterData: true,
    })

    return () => {
      observer.disconnect()
      if (rafId !== null) {
        window.cancelAnimationFrame(rafId)
      }
    }
  }, [captureCurrentViewportAnchorSnapshot, refreshScrollDateLabelAnchors, updateScrollDerivedState])

  // Wait for stored conversation hydration, then pin to the latest messages once.
  // This prevents initial top-pagination from running before we settle at bottom.
  useLayoutEffect(() => {
    if (!chatRef.current || hasInitialBottomAnchorRef.current || !isStorageHydrated) return
    const node = chatRef.current
    if (utterances.length > 0) {
      node.scrollTop = node.scrollHeight
      lastDistanceToBottomRef.current = 0
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

  useLayoutEffect(() => {
    if (!isVisible || !chatRef.current) return

    const node = chatRef.current
    node.scrollTop = node.scrollHeight
    lastDistanceToBottomRef.current = 0
    shouldAutoScroll.current = true
    suppressAutoScrollRef.current = false
    autoScrollSchedulerRef.current.markPerformed()

    const rafId = window.requestAnimationFrame(() => {
      if (!chatRef.current) return
      chatRef.current.scrollTop = chatRef.current.scrollHeight
      updateScrollDerivedState()
    })

    return () => window.cancelAnimationFrame(rafId)
  }, [isVisible, updateScrollDerivedState])

  useEffect(() => {
    clearOpenSmoothScrollTimer()
    if (!isVisible) {
      openSmoothScrollDeadlineRef.current = 0
      openSmoothScrollLastHeightRef.current = 0
      openSmoothScrollStableTicksRef.current = 0
      return
    }

    openSmoothScrollDeadlineRef.current = Date.now() + 2500
    openSmoothScrollLastHeightRef.current = 0
    openSmoothScrollStableTicksRef.current = 0

    return () => {
      clearOpenSmoothScrollTimer()
    }
  }, [clearOpenSmoothScrollTimer, isVisible])

  useEffect(() => {
    if (
      !isVisible
      || !isStorageHydrated
      || !chatRef.current
      || Date.now() > openSmoothScrollDeadlineRef.current
    ) {
      return
    }

    openSmoothScrollDeadlineRef.current = Date.now() + 900
    clearOpenSmoothScrollTimer()
    const followToBottom = () => {
      openSmoothScrollTimerRef.current = null
      if (!chatRef.current || !isVisible) return

      const nextScrollHeight = chatRef.current.scrollHeight
      const distanceToBottom = Math.max(
        0,
        chatRef.current.scrollHeight - chatRef.current.scrollTop - chatRef.current.clientHeight,
      )
      const heightChanged = Math.abs(nextScrollHeight - openSmoothScrollLastHeightRef.current) > 1
      openSmoothScrollLastHeightRef.current = nextScrollHeight

      if (heightChanged) {
        openSmoothScrollStableTicksRef.current = 0
      } else {
        openSmoothScrollStableTicksRef.current += 1
      }

      if (distanceToBottom > 1) {
        suppressAutoScrollRef.current = false
        shouldAutoScroll.current = true
        chatRef.current.scrollTop = nextScrollHeight
        autoScrollSchedulerRef.current.markPerformed()
        updateScrollDerivedState()
        openSmoothScrollStableTicksRef.current = 0
      }

      if (
        Date.now() <= openSmoothScrollDeadlineRef.current
        && (heightChanged || distanceToBottom > 1 || openSmoothScrollStableTicksRef.current < 3)
      ) {
        openSmoothScrollTimerRef.current = window.setTimeout(followToBottom, 120)
      }
    }

    openSmoothScrollTimerRef.current = window.setTimeout(followToBottom, 180)

    return () => {
      clearOpenSmoothScrollTimer()
    }
  }, [
    clearOpenSmoothScrollTimer,
    demoTypingText,
    isStorageHydrated,
    isVisible,
    liveUtterances.length,
    utterances.length,
    updateScrollDerivedState,
  ])

  // Preserve scroll position after prepending older utterances
  useLayoutEffect(() => {
    if (!isPaginatingRef.current || prevScrollHeightRef.current === null || !chatRef.current) return
    const node = chatRef.current
    node.scrollTop = resolvePrependScrollAnchorTop({
      previousScrollHeight: prevScrollHeightRef.current,
      nextScrollHeight: node.scrollHeight,
      previousScrollTop: prevScrollTopRef.current ?? node.scrollTop,
      maxScrollTop: node.scrollHeight - node.clientHeight,
    })
    prevScrollHeightRef.current = null
    prevScrollTopRef.current = null
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
      clearOpenSmoothScrollTimer()
    }
  }, [
    clearOpenSmoothScrollTimer,
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
      showFloatingToast(copyActionCopy.copiedToastLabel)
    }
    window.addEventListener(COPY_SUCCESS_EVENT, handleCopySuccess)
    return () => {
      window.removeEventListener(COPY_SUCCESS_EVENT, handleCopySuccess)
      if (floatingToastTimerRef.current) clearTimeout(floatingToastTimerRef.current)
    }
  }, [copyActionCopy.copiedToastLabel, showFloatingToast])

  useEffect(() => {
    return () => {
      cancelScheduledScrollEventDerivedState()
      clearPendingAutoScrollTimer()
      clearScrollUiHideTimer()
    }
  }, [cancelScheduledScrollEventDerivedState, clearPendingAutoScrollTimer, clearScrollUiHideTimer])

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
  const displayUtteranceIds = useMemo(
    () => displayUtterances.map((utterance) => utterance.id),
    [displayUtterances],
  )
  const animatedDisplayUtteranceIds = useMemo(
    () => resolveAnimatedLiveDemoMessageIds({
      previousIds: previousDisplayUtteranceIdsRef.current,
      nextIds: displayUtteranceIds,
      maxAnimatedMessages: 1,
    }),
    [displayUtteranceIds],
  )
  // Interleaves "{name} left" and "{inviter} invited {invitee}" notices into
  // the message timeline by timestamp — display-only merge, kept separate
  // from displayUtterances so every existing scroll/animation/draft-tracking
  // consumer above keeps reading message-only data untouched.
  const timelineItems = useMemo<LivePhoneDemoTimelineItem[]>(() => {
    const items: LivePhoneDemoTimelineItem[] = displayUtterances.map((utterance) => ({
      kind: 'message',
      timestampMs: typeof utterance.createdAtMs === 'number' && Number.isFinite(utterance.createdAtMs)
        ? utterance.createdAtMs
        : 0,
      utterance,
    }))
    for (const notice of leaveNotices) {
      items.push({ kind: 'leave-notice', timestampMs: notice.leftAtMs, notice })
    }
    for (const notice of inviteNotices) {
      items.push({ kind: 'invite-notice', timestampMs: notice.invitedAtMs, notice })
    }
    items.sort((a, b) => a.timestampMs - b.timestampMs)
    return items
  }, [displayUtterances, leaveNotices, inviteNotices])

  useEffect(() => {
    previousDisplayUtteranceIdsRef.current = displayUtteranceIds
  }, [displayUtteranceIds])

  const isUsageLimited = typeof usageLimitSec === 'number'
  const remainingSec = isUsageLimited
    ? Math.max(0, usageLimitSec - usageSec)
    : null
  const usagePercent = isUsageLimited
    ? Math.min(100, (usageSec / usageLimitSec) * 100)
    : null
  const storedMessageCountLabel = formatLivePhoneDemoMessageCount(persistedUtteranceCount)
  const showScrollToBottom = scrollMetrics.distanceToBottom > SCROLL_TO_BOTTOM_BUTTON_THRESHOLD_PX
  const activeBubblePlaybackKey = speakingItem?.playbackKey ?? pendingManualTtsTarget?.playbackKey
  const scrollDateTop = Math.max(
    16,
    Math.min(
      scrollMetrics.clientHeight - 16,
      scrollMetrics.thumbTop + (scrollMetrics.thumbHeight / 2),
    ),
  )
  const navSurfaceClassName = 'bg-white'
  const viewportWidthPx = useViewportWidthPx()
  const legacyNativeTopInsetPxFromQuery = useNativeInsetPx('nativeTopInsetPx')
  const legacyNativeBottomInsetPxFromQuery = useNativeInsetPx('nativeBottomInsetPx')
  const nativeConversationTopInsetPxFromQuery = useNativeInsetPx('nativeConversationTopInsetPx')
  const nativeConversationBottomInsetPxFromQuery = useNativeInsetPx('nativeConversationBottomInsetPx')
  // Treat a layout-reported 0 as "no inset for this edge right now" so the
  // URL query fallback still drives conversation spacer/scroll-to-bottom
  // math before the conversation-zone banner_layout event arrives. Without
  // this, `0 ?? query` short-circuits to 0 and leaves the transcript glued
  // to the banner on Android where the list-zone emit fires first.
  const nativeTopInsetPx = (nativeBannerLayout?.topInsetPx ?? 0) > 0
    ? (nativeBannerLayout!.topInsetPx)
    : (nativeConversationTopInsetPxFromQuery > 0
        ? nativeConversationTopInsetPxFromQuery
        : (legacyNativeBannerPositionFromQuery === 'top' ? legacyNativeTopInsetPxFromQuery : 0))
  const nativeBottomInsetPx = (nativeBannerLayout?.bottomInsetPx ?? 0) > 0
    ? (nativeBannerLayout!.bottomInsetPx)
    : (nativeConversationBottomInsetPxFromQuery > 0
        ? nativeConversationBottomInsetPxFromQuery
        : (legacyNativeBannerPositionFromQuery === 'bottom' ? legacyNativeBottomInsetPxFromQuery : 0))
  const estimatedNativeBannerInsetPx = resolveEstimatedNativeBannerInsetPx(viewportWidthPx)
  const effectiveNativeTopInsetPx = isNativeAppRuntime && displayedAdBannerPosition === 'top'
    ? resolveEffectiveNativeBannerInsetPx(nativeTopInsetPx, estimatedNativeBannerInsetPx)
    : nativeTopInsetPx
  const effectiveNativeBottomContentInsetPx = isNativeAppRuntime && displayedAdBannerPosition === 'bottom'
    ? resolveEffectiveNativeBannerInsetPx(nativeBottomInsetPx, estimatedNativeBannerInsetPx)
    : nativeBottomInsetPx
  const effectiveNativeBottomBannerInsetPx = resolveNativeBottomBannerOverlayInsetPx({
    isNativeAppRuntime,
    displayedAdBannerPosition,
    reportedBottomInsetPx: effectiveNativeBottomContentInsetPx,
    bottomBarClearancePx: nativeBottomBarClearancePx,
    estimatedBottomBannerInsetPx: estimatedNativeBannerInsetPx,
  })
  const activeKeyboardInsetPx = isComposerOpen ? keyboardViewportInsetPx : 0
  const scrollToBottomButtonBottomPx = resolveScrollToBottomButtonBottomPx({
    baseBottomPx: SCROLL_TO_BOTTOM_BUTTON_BOTTOM_PX,
    isNativeAppRuntime,
    displayedAdBannerPosition,
    bottomBannerInsetPx: effectiveNativeBottomBannerInsetPx,
  })
  const copyToastBottomOffsetPx = scrollToBottomButtonBottomPx + SCROLL_TO_BOTTOM_BUTTON_SIZE_PX + 12
  const nativeChatTopSpacerPx = Math.max(0, Math.round(effectiveNativeTopInsetPx))
  const nativeChatBottomSpacerPx = Math.max(0, Math.round(effectiveNativeBottomBannerInsetPx))
  const chatPaddingTop = '0.625rem'
  const chatPaddingBottom = '0.625rem'
  const chatViewportStyle = useMemo<CSSProperties>(() => ({
    WebkitOverflowScrolling: 'touch',
    overscrollBehaviorY: 'contain',
    touchAction: 'pan-y',
    willChange: 'scroll-position',
    paddingTop: chatPaddingTop,
    paddingBottom: chatPaddingBottom,
    paddingLeft: 'max(calc(env(safe-area-inset-left) + 6px), 10px)',
    paddingRight: 'max(calc(env(safe-area-inset-right) + 6px), 10px)',
  }), [chatPaddingBottom, chatPaddingTop])
  const showEmptyState = shouldShowConversationEmptyState({
    utteranceCount: utterances.length,
    liveUtteranceCount: liveUtterances.length,
    hasPartialTranscript: Boolean(partialTranscript),
    hasDemoTypingText: Boolean(demoTypingText),
    hasDemoTypingLanguage: Boolean(demoTypingLang),
    isDemoAnimating,
    isError,
    isLimitReached,
    hasComposerDraft: composerHasDraft,
  })
  const bottomBarTopPaddingPx = isComposerOpen
    ? COMPOSER_MODE_TOP_MARGIN_PX
    : VOICE_MODE_TOP_MARGIN_PX
  const bottomBarBottomMarginPx = isComposerOpen
    ? COMPOSER_MODE_BOTTOM_MARGIN_PX
    : VOICE_MODE_BOTTOM_MARGIN_PX
  const bottomBarPaddingBottom = `max(calc(env(safe-area-inset-bottom, 0px) + ${bottomBarBottomMarginPx + activeKeyboardInsetPx}px), ${bottomBarBottomMarginPx + activeKeyboardInsetPx}px)`
  const composerCanSend = composerHasDraft
  // Hidden by default to avoid exposing account actions in demo/review builds.
  const showAccountMenuItems = showAccountActions && process.env.NEXT_PUBLIC_ENABLE_ACCOUNT_MENU_ACTIONS === 'true'
  const handleSilenceFinalizeLockedInteraction = useCallback(() => {
    const now = Date.now()
    if (now - silenceSliderUpgradeToastLastShownAtRef.current < SILENCE_SLIDER_UPGRADE_TOAST_COOLDOWN_MS) return
    silenceSliderUpgradeToastLastShownAtRef.current = now
    toast(silenceFinalizeLockedMessage)
  }, [silenceFinalizeLockedMessage])

  useEffect(() => {
    if (typeof window === 'undefined') return

    if (!shouldExposeNativeQaBridge({
      search: window.location.search || '',
      isNativeAppRuntime,
      runtimeQaBridgeAuthorized: readNativeQaBridgeAuthority(window),
    })) {
      delete window.__MINGLE_QA__
      return
    }

    window.__MINGLE_QA__ = {
      getLiveDemoSnapshot: () => {
        const headerNode = headerRef.current
        const chatNode = chatRef.current
        const bottomBarNode = bottomBarRef.current
        const menuButtonNode = menuButtonRef.current
        const computedChatStyle = chatNode ? window.getComputedStyle(chatNode) : null
        const headerHeightPx = headerNode ? Math.round(headerNode.getBoundingClientRect().height) : 0
        const bottomBarHeightPx = bottomBarNode ? Math.round(bottomBarNode.getBoundingClientRect().height) : 0
        const chatPaddingTopPx = computedChatStyle ? Math.round(parseFloat(computedChatStyle.paddingTop) || 0) : 0
        const chatPaddingBottomPx = computedChatStyle ? Math.round(parseFloat(computedChatStyle.paddingBottom) || 0) : 0
        const chatClientHeight = chatNode ? Math.round(chatNode.clientHeight) : 0
        const chatScrollHeight = chatNode ? Math.round(chatNode.scrollHeight) : 0
        const chatScrollTop = chatNode ? Math.round(chatNode.scrollTop) : 0
        const bottomDelta = Math.max(0, chatScrollHeight - chatClientHeight - chatScrollTop)
        const micVisualState: LivePhoneDemoQaSnapshot['micVisualState'] = isError
          ? 'error'
          : isConnecting
            ? 'connecting'
            : isReady
              ? 'running'
              : 'idle'

        return {
          routePathname: window.location.pathname,
          documentLanguage: document.documentElement.lang || '',
          uiLocale,
          isNativeAppRuntime,
          isStorageHydrated,
          persistedUtteranceCount,
          menuOpen,
          menuScreen,
          menuButtonLabel: menuButtonNode?.getAttribute('aria-label') || '',
          displayedAdBannerPosition,
          nativeBannerLayoutPosition: nativeBannerLayout?.position ?? null,
          effectiveNativeTopInsetPx,
          effectiveNativeBottomContentInsetPx,
          effectiveNativeBottomBannerInsetPx,
          nativeBottomBarClearancePx: Math.max(0, Math.round(nativeBottomBarClearancePx ?? 0)),
          nativeChatTopSpacerPx,
          nativeChatBottomSpacerPx,
          headerHeightPx,
          bottomBarHeightPx,
          chatPaddingTopPx,
          chatPaddingBottomPx,
          chatClientHeight,
          chatScrollHeight,
          chatScrollTop,
          isAtBottom: bottomDelta <= 8,
          showScrollToBottom,
          isComposerOpen,
          composerTextareaHeightPx,
          utteranceCount: utterances.length,
          micVisualState,
        }
      },
      seedPersistedHistory: (count = 48) => {
        hasInitialBottomAnchorRef.current = false
        allowAutoTopPaginationRef.current = false
        replaceConversationHistoryForQa(buildQaSeededUtterances(count))
        return Number.isFinite(count) ? Math.max(1, Math.floor(count)) : 48
      },
      seedScrollPerformanceHistory: () => {
        const seededUtterances = buildQaScrollPerformanceUtterances()
        hasInitialBottomAnchorRef.current = false
        allowAutoTopPaginationRef.current = false
        replaceConversationHistoryForQa(seededUtterances, { loadAll: true })
        return seededUtterances.length
      },
      resetPersistedHistory: () => {
        hasInitialBottomAnchorRef.current = false
        allowAutoTopPaginationRef.current = false
        clearConversationHistory()
      },
      resetUiState: () => {
        hasInitialBottomAnchorRef.current = false
        allowAutoTopPaginationRef.current = false
        clearConversationHistory()
        composerDraftRef.current = ''
        if (composerTextareaRef.current) {
          composerTextareaRef.current.value = ''
          syncComposerTextareaHeight(composerTextareaRef.current)
        }
        setComposerHasDraft(false)
        persistComposerDraft('', composerDraftStorageKey)
        persistedInputModeRef.current = 'voice'
        composerFocusRequestedRef.current = false
        setIsComposerOpen(false)
        setAdBannerPosition('bottom')
        setSessionAdBannerPositionOverride('bottom')
        closeMenuPanel()
        try {
          localStorage.removeItem(LS_KEY_AD_BANNER_POSITION)
          localStorage.setItem(LS_KEY_INPUT_MODE, 'voice')
        } catch {
          // Ignore persistence failures during QA-only state reset.
        }
      },
      getLiveDemoChatScrollHandlerMeasurement: () => {
        const measurementState = scrollHandlerMeasurementRef.current
        return measurementState ? readLivePhoneDemoScrollHandlerMeasurement(measurementState) : null
      },
      resetLiveDemoChatScrollHandlerMeasurement: () => {
        const measurementState = scrollHandlerMeasurementRef.current
        if (!measurementState) return false

        measurementState.samplesMs = []
        measurementState.latestMs = 0
        measurementState.maxMs = 0
        scrollHandlerMeasurementLoggedSampleCountRef.current = 0
        return true
      },
      setMenuOpen: (nextOpen: boolean) => {
        if (nextOpen) {
          pushMenuHistoryEntry(1)
          return
        }
        closeMenuPanel()
      },
      setAdBannerPosition: (nextPosition: LivePhoneDemoAdBannerPosition) => {
        setAdBannerPosition(nextPosition)
        setSessionAdBannerPositionOverride(nextPosition)
        try {
          localStorage.setItem(LS_KEY_AD_BANNER_POSITION, nextPosition)
        } catch {
          // Ignore persistence failures during QA-only state control.
        }
      },
      setComposerOpen: (nextOpen: boolean) => {
        persistedInputModeRef.current = nextOpen ? 'text' : 'voice'
        composerFocusRequestedRef.current = false
        setIsComposerOpen(nextOpen)
        if (!nextOpen) {
          composerTextareaRef.current?.blur()
        }
        try {
          localStorage.setItem(LS_KEY_INPUT_MODE, nextOpen ? 'text' : 'voice')
        } catch {
          // Ignore persistence failures during QA-only state control.
        }
      },
      remountWebView: () => {
        if (!isNativeAppRuntime) return false
        if (conversationId) {
          rememberNativeRemountRestoreConversation(conversationId)
        }
        return postNativeQaCommand({
          type: 'native_remount_webview',
          payload: {
            url: buildNativeRemountRestoreUrl(window.location.href, conversationId),
          },
        } satisfies NativeRemountWebViewCommand)
      },
      setNativeSttStatusForQa: (status: string) => {
        if (!isNativeAppRuntime) return false
        const normalizedStatus = typeof status === 'string' ? status.trim() : ''
        if (!normalizedStatus) return false
        return postNativeQaCommand({
          type: 'native_qa_set_stt_status',
          payload: {
            status: normalizedStatus,
          },
        } satisfies NativeQaSetSttStatusCommand)
      },
    }

    return () => {
      delete window.__MINGLE_QA__
    }
  }, [
    clearConversationHistory,
    closeMenuPanel,
    composerDraftStorageKey,
    syncComposerTextareaHeight,
    composerTextareaHeightPx,
    composerTextareaRef,
    conversationId,
    displayedAdBannerPosition,
    effectiveNativeBottomBannerInsetPx,
    effectiveNativeBottomContentInsetPx,
    effectiveNativeTopInsetPx,
    isComposerOpen,
    isConnecting,
    isError,
    isNativeAppRuntime,
    isReady,
    isStorageHydrated,
    menuOpen,
    menuScreen,
    nativeBannerLayout?.position,
    nativeBottomBarClearancePx,
    nativeChatBottomSpacerPx,
    nativeChatTopSpacerPx,
    persistedUtteranceCount,
    pushMenuHistoryEntry,
    setAdBannerPosition,
    setIsComposerOpen,
    replaceConversationHistoryForQa,
    showScrollToBottom,
    uiLocale,
    utterances.length,
  ])

  return (
    <PhoneFrame>
      <div
        data-qa="live-demo-root"
        className="relative flex h-full min-h-0 flex-col overflow-hidden"
      >

        {/* Header */}
        <div
          ref={headerRef}
          data-qa="live-demo-header"
          className={`relative z-40 shrink-0 flex items-center justify-between border-b border-gray-100 px-4 ${navSurfaceClassName}`}
          style={{
            paddingTop: "env(safe-area-inset-top, 0px)",
            height: "calc(54px + env(safe-area-inset-top, 0px))",
          }}
        >
          {headerMode === 'conversation' && onBack ? (
            <div className="relative z-20 flex min-w-0 flex-1 items-center gap-2 pr-3">
              <button
                type="button"
                onClick={onBack}
                aria-label={backButtonLabel}
                className={`inline-flex h-[38px] min-w-[40px] shrink-0 items-center justify-center px-1 text-gray-700 transition-colors hover:text-gray-900 active:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 ${navSurfaceClassName}`}
              >
                <ChevronLeft size={24} strokeWidth={2.4} />
              </button>
              <div className="min-w-0 flex-1">
                <button
                  type="button"
                  onClick={openRenameConversationDialog}
                  disabled={!conversationId || isRenamingConversation}
                  aria-label={roomManagementCopy.renameButtonLabel}
                  className="block w-full truncate text-left text-[0.98rem] font-semibold text-gray-950 outline-none transition-colors hover:text-gray-700 focus-visible:ring-2 focus-visible:ring-amber-300 disabled:cursor-default disabled:opacity-100"
                >
                  {displayConversationTitle || ''}
                </button>
              </div>
            </div>
          ) : (
            <MingleWordmark className="relative z-20" />
          )}
          <div className="relative z-20 flex items-center gap-1">
            <div className="relative mr-1.5">
              <button
                ref={langSelectorButtonRef}
                data-qa={LIVE_DEMO_LANGUAGE_BUTTON_DATA_QA}
                type="button"
                onClick={handleLanguageSelectorButtonPress}
                aria-label={roomManagementCopy.languageSelectorTitle}
                aria-haspopup={LIVE_DEMO_LANGUAGE_TRIGGER_ARIA_HASPOPUP}
                aria-expanded={langSelectorOpen}
                className={LIVE_DEMO_LANGUAGE_TRIGGER_CLASSNAME}
                style={{ backgroundColor: '#ffffff' }}
              >
                {languageSelectorButtonLanguages.map((lang) => (
                  <span
                    key={lang}
                    className="text-[1.35rem]"
                    title={lang.toUpperCase()}
                  >
                    <LanguageFlag language={lang} className="text-[1.35rem] leading-none" />
                  </span>
                ))}
                <ChevronDown
                  data-qa={LIVE_DEMO_LANGUAGE_CHEVRON_DATA_QA}
                  size={14}
                  strokeWidth={2.4}
                  className={`shrink-0 text-black transition-transform ${
                    langSelectorOpen ? 'rotate-180' : ''
                  }`}
                />
              </button>
              {langSelectorOpen ? (
                <LanguageSelector
                  isOpen={langSelectorOpen}
                  onClose={() => closeLanguageSelector({ syncHistory: 'back' })}
                  selectedLanguages={selectedLanguages}
                  onToggleLanguage={handleToggleSelectedLanguage}
                  uiLocale={uiLocale}
                  copy={roomManagementCopy}
                  triggerRef={langSelectorButtonRef}
                  conversationId={conversationId}
                  selectedLanguagesAttribution={selectedLanguagesAttribution}
                  viewerSelectedLanguages={ownSelectedLanguages}
                />
              ) : null}
            </div>
            {showMenuButton ? (
              <div className="relative">
                <button
                  ref={menuButtonRef}
                  data-qa="live-demo-menu-button"
                  type="button"
                  onClick={handleMenuButtonPress}
                  disabled={isAuthActionPending}
                  className={resolveLiveDemoMenuTriggerClassName(navSurfaceClassName)}
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

        <SlideSurface
          open={menuOpen}
          onClose={requestMenuBackStep}
          ariaLabel={menuLabel}
          nativeBackPriority={9}
          onRequestClose={handleMenuSurfaceRequestClose}
          backdropClassName={`${LIVE_DEMO_MENU_OVERLAY_CLASSNAME} flex h-full w-full justify-end sm:justify-center`}
          backdropFadeWithSurface={false}
          className={resolveLiveDemoMenuPanelClassName(navSurfaceClassName)}
          style={{ touchAction: 'pan-y' }}
          onBackdropClick={requestCloseMenuPanel}
          stopPropagation
        >
          <div data-qa="live-demo-menu-panel" className="relative h-full overflow-hidden">
                    <motion.section
                      initial={false}
                      animate={{ x: '0%', opacity: 1 }}
                      transition={resolveMenuContentTransition(menuScreenTransitionMode)}
                      aria-hidden={menuScreen !== 'root'}
                      className="absolute inset-0 flex h-full min-w-0 flex-col bg-white"
                      style={{
                        pointerEvents: menuScreen === 'root' ? 'auto' : 'none',
                        zIndex: 1,
                      }}
                    >
                      <LivePhoneDemoPanelHeader
                        title={menuLabel}
                        backLabel={feedbackCopy.closeButtonLabel}
                        onBack={requestMenuBackStep}
                      />

                      <div
                        className={LIVE_DEMO_MENU_SCROLL_CONTAINER_CLASSNAME}
                        style={{
                          paddingBottom: showAccountMenuItems ? '16px' : 'max(calc(env(safe-area-inset-bottom) + 16px), 20px)',
                        }}
                      >
                        <div className="px-4 py-4">
                          <div className="space-y-4">
                            {conversationId && (
                              <button
                                type="button"
                                onClick={handleDefaultDisplayLanguageMenuItemPress}
                                className="flex w-full items-center justify-between gap-3 rounded-xl px-1 py-1 text-left text-[0.98rem] font-medium text-gray-900 transition-colors hover:text-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-300"
                              >
                                <span className="min-w-0 flex-1">{defaultDisplayLanguageCopy.menuItemLabel}</span>
                                <span className="flex shrink-0 items-center gap-2 text-gray-500">
                                  <LanguageFlag
                                    language={resolvedDefaultDisplayLanguage || ''}
                                    className="text-[0.9rem] leading-none"
                                  />
                                  <ChevronRight size={18} strokeWidth={2.4} />
                                </span>
                              </button>
                            )}

                            <div className="block">
                              <div className="mb-1 flex items-start justify-between gap-3 text-[0.8125rem] leading-[1.05] text-gray-700">
                                <span className="min-w-0 flex-1 pt-2 font-semibold">{textSizeLabel}</span>
                                <div ref={textSizeDropdownRef} className="relative flex h-12 max-w-[68%] shrink-0 items-center">
                                  <button
                                    ref={textSizeButtonRef}
                                    type="button"
                                    onClick={() => {
                                      setTranslationModelMenuOpen(false)
                                      setBubbleDisplayModeMenuOpen(false)
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
                                          <LanguageFlag language={textSizePreviewLanguage} className="text-base leading-none" />
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
                                                        <LanguageFlag language={textSizePreviewLanguage} className="text-base leading-none" />
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

                            <div className="block">
                              <div className="mb-1 flex items-start justify-between gap-3 text-[0.8125rem] leading-[1.05] text-gray-700">
                                <span className="min-w-0 flex-1 pt-1.5 font-semibold">{sttSegmentationModeLabel}</span>
                                <span className="shrink-0 whitespace-nowrap text-gray-500">
                                  {selectedSttSegmentationMode === 'end'
                                    ? sttSegmentationModeEndLabel
                                    : sttSegmentationModeFinLabel}
                                </span>
                              </div>
                              <div
                                role="group"
                                aria-label={sttSegmentationModeLabel}
                                className="grid grid-cols-2 gap-2 rounded-[1.25rem] bg-gray-100 p-1"
                              >
                                {([
                                  { value: 'end' as const, label: sttSegmentationModeEndLabel },
                                  { value: 'fin' as const, label: sttSegmentationModeFinLabel },
                                ]).map((option) => {
                                  const isSelected = selectedSttSegmentationMode === option.value
                                  return (
                                    <button
                                      key={option.value}
                                      type="button"
                                      aria-pressed={isSelected}
                                      disabled={isSttSessionRunning}
                                      onClick={() => handleSttSegmentationModeSelect(option.value)}
                                      className={`min-h-10 rounded-[1rem] px-2 py-2 text-[0.75rem] font-semibold leading-tight transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/80 disabled:cursor-not-allowed disabled:opacity-50 ${
                                        isSelected
                                          ? 'border border-amber-300 bg-gradient-to-r from-amber-50 via-orange-50 to-amber-50 text-amber-900 shadow-[inset_0_0_0_1px_rgba(251,191,36,0.3)]'
                                          : 'border border-transparent text-gray-500 hover:border-amber-200 hover:bg-white hover:text-amber-700'
                                      }`}
                                    >
                                      {option.label}
                                    </button>
                                  )
                                })}
                              </div>
                            </div>

                            {shouldShowManualSilenceControl(selectedSttSegmentationMode) && (
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
                                    handleSonioxManualFinalizeSilenceChange(next)
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
                                    handleSonioxManualFinalizeSilenceChange(next)
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
                                    handleSonioxManualFinalizeSilenceChange(next)
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
                            )}

                            {shouldShowEndpointTuningControl(selectedSttSegmentationMode) && (
                            <label className="block">
                              <div
                                className={`mb-0 flex items-start gap-3 text-[0.8125rem] font-semibold leading-[1.05] transition-colors ${
                                  isSilenceFinalizeSliderDisabled ? 'text-gray-400' : 'text-gray-700'
                                }`}
                              >
                                <span className="min-w-0 flex-1 whitespace-normal break-words leading-[1.1]">
                                  {endpointTuningLabel}
                                </span>
                                <span className="shrink-0 whitespace-nowrap">{sonioxEndpointTuningStep + 1}/5</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span
                                  className={`shrink-0 text-[0.6875rem] font-medium ${
                                    isSilenceFinalizeSliderDisabled ? 'text-gray-400' : 'text-gray-600'
                                  }`}
                                >
                                  {endpointTuningShortLabel}
                                </span>
                                <div className="relative min-w-0 flex-1">
                                  <input
                                    type="range"
                                    min={0}
                                    max={4}
                                    step={1}
                                    value={sonioxEndpointTuningStep}
                                    disabled={isSilenceFinalizeSliderDisabled}
                                    onChange={(event) => {
                                      if (isSilenceFinalizeSliderDisabled) return
                                      const next = Math.max(0, Math.min(4, Math.round(Number(event.target.value))))
                                      handleSonioxEndpointTuningStepChange(next)
                                    }}
                                    className={`${sliderClassName} -mt-1 ${isSilenceFinalizeSliderDisabled ? 'pointer-events-none cursor-not-allowed opacity-40' : ''}`}
                                    aria-label={endpointTuningLabel}
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
                                <span
                                  className={`shrink-0 text-[0.6875rem] font-medium ${
                                    isSilenceFinalizeSliderDisabled ? 'text-gray-400' : 'text-gray-600'
                                  }`}
                                >
                                  {endpointTuningLongLabel}
                                </span>
                              </div>
                            </label>
                            )}

                            <div className="block">
                              <div className="mb-1 flex items-start justify-between gap-3 text-[0.8125rem] leading-[1.05] text-gray-700">
                                <span className="min-w-0 flex-1 pt-1.5 font-semibold">{translationModelLabel}</span>
                                <div ref={translationModelDropdownRef} className="relative flex h-10 min-w-[236px] max-w-[72%] shrink-0 items-center">
                                  <button
                                    ref={translationModelButtonRef}
                                    type="button"
                                    onClick={() => {
                                      setTextSizeMenuOpen(false)
                                      setBubbleDisplayModeMenuOpen(false)
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
                                        className="absolute right-0 top-[calc(100%+0.6rem)] z-30 w-[272px] max-w-[calc(100vw-2.5rem)] overflow-hidden rounded-[1.35rem] border border-gray-200/90 bg-white/95 shadow-[0_22px_48px_rgba(15,23,42,0.16)] backdrop-blur-sm"
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
                                                  <div className="min-w-0 flex flex-1 items-center justify-center gap-2.5 text-center">
                                                    <span className="truncate text-[0.94rem] font-semibold">
                                                      {option.label}
                                                    </span>
                                                    {option.badge ? (
                                                      <TranslationModelBadgeChip badge={option.badge} />
                                                    ) : null}
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

                            <div className="block">
                              <div className="mb-1 flex items-start justify-between gap-3 text-[0.8125rem] leading-[1.05] text-gray-700">
                                <span className="min-w-0 flex-1 pt-1.5 font-semibold">{bubbleDisplayCopy.displayModeLabel}</span>
                                <div ref={bubbleDisplayModeDropdownRef} className="relative flex h-10 min-w-[236px] max-w-[72%] shrink-0 items-center">
                                  <button
                                    ref={bubbleDisplayModeButtonRef}
                                    data-qa="live-demo-bubble-display-mode"
                                    type="button"
                                    onClick={() => {
                                      setTextSizeMenuOpen(false)
                                      setTranslationModelMenuOpen(false)
                                      setBubbleDisplayModeMenuOpen((open) => !open)
                                    }}
                                    aria-label={bubbleDisplayCopy.displayModeLabel}
                                    aria-haspopup="listbox"
                                    aria-expanded={bubbleDisplayModeMenuOpen}
                                    aria-controls={bubbleDisplayModeListboxId}
                                    className="group relative flex h-full w-full items-center overflow-hidden rounded-[1.35rem] border border-[#E5E7EB] bg-gradient-to-r from-white via-white to-[#F8FAFC] px-3.5 text-left shadow-[0_10px_24px_rgba(15,23,42,0.06)] transition duration-200 hover:border-[#D1D5DB] hover:shadow-[0_14px_30px_rgba(15,23,42,0.10)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/80"
                                  >
                                    <div className="min-w-0 flex-1 text-center">
                                      <div className="truncate text-[0.95rem] font-semibold text-gray-900">
                                        {bubbleDisplayMode === 'expanded'
                                          ? bubbleDisplayCopy.expandedModeLabel
                                          : bubbleDisplayCopy.collapsedModeLabel}
                                      </div>
                                    </div>
                                    <span
                                      className={`ml-2 inline-flex h-6 w-6 shrink-0 items-center justify-center text-gray-500 transition-colors duration-200 group-hover:text-amber-600 ${
                                        bubbleDisplayModeMenuOpen ? 'text-amber-700' : ''
                                      }`}
                                    >
                                      <ChevronDown
                                        size={16}
                                        strokeWidth={2.3}
                                        className={`transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
                                          bubbleDisplayModeMenuOpen ? 'rotate-180' : 'rotate-0'
                                        }`}
                                      />
                                    </span>
                                  </button>
                                  <AnimatePresence initial={false}>
                                    {bubbleDisplayModeMenuOpen && (
                                      <motion.div
                                        initial={{ opacity: 0, y: -8, scale: 0.98 }}
                                        animate={{ opacity: 1, y: 0, scale: 1 }}
                                        exit={{ opacity: 0, y: -6, scale: 0.985 }}
                                        transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                                        className="absolute right-0 top-[calc(100%+0.6rem)] z-30 w-[272px] max-w-[calc(100vw-2.5rem)] overflow-hidden rounded-[1.35rem] border border-gray-200/90 bg-white/95 shadow-[0_22px_48px_rgba(15,23,42,0.16)] backdrop-blur-sm"
                                      >
                                        <motion.div
                                          initial={{ opacity: 0, height: 0 }}
                                          animate={{ opacity: 1, height: 'auto' }}
                                          exit={{ opacity: 0, height: 0 }}
                                          transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                                          className="overflow-hidden"
                                        >
                                          <div
                                            id={bubbleDisplayModeListboxId}
                                            role="listbox"
                                            aria-label={bubbleDisplayCopy.displayModeLabel}
                                            className="space-y-1.5 p-2.5"
                                          >
                                            {([
                                              { value: 'expanded' as const, label: bubbleDisplayCopy.expandedModeLabel },
                                              { value: 'collapsed' as const, label: bubbleDisplayCopy.collapsedModeLabel },
                                            ]).map((option) => {
                                              const isSelected = option.value === bubbleDisplayMode

                                              return (
                                                <button
                                                  key={option.value}
                                                  type="button"
                                                  role="option"
                                                  aria-selected={isSelected}
                                                  onClick={() => handleBubbleDisplayModeSelect(option.value)}
                                                  className={`group flex w-full items-center gap-3 rounded-[1rem] px-3 py-3 text-left transition duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/80 ${
                                                    isSelected
                                                      ? 'bg-gradient-to-r from-amber-50 via-orange-50 to-amber-50 text-gray-950 shadow-[inset_0_0_0_1px_rgba(251,191,36,0.35)]'
                                                      : 'bg-white text-gray-800 hover:bg-gray-50'
                                                  }`}
                                                >
                                                  <span className="min-w-0 flex-1 truncate text-[0.94rem] font-semibold">
                                                    {option.label}
                                                  </span>
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
                                        data-qa={`live-demo-ad-banner-${option.value}`}
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
                            onClick={handleConversationManagementMenuItemPress}
                            className="flex w-full items-center justify-between gap-3 rounded-xl px-1 py-3 text-left text-[0.98rem] font-medium text-gray-900 transition-colors hover:text-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-300"
                          >
                            <span className="min-w-0 flex-1">{roomManagementCopy.menuItemLabel}</span>
                            <span className="shrink-0 text-gray-500">
                              <ChevronRight size={18} strokeWidth={2.4} />
                            </span>
                          </button>
                        </div>

                        <div className="px-4 pb-4">
                          <button
                            type="button"
                            onClick={handleParticipantsMenuItemPress}
                            className="flex w-full items-center justify-between gap-3 rounded-xl px-1 py-3 text-left text-[0.98rem] font-medium text-gray-900 transition-colors hover:text-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-300"
                          >
                            <span className="min-w-0 flex-1">{participantsCopy.menuItemLabel}</span>
                            <span className="shrink-0 text-gray-500">
                              <ChevronRight size={18} strokeWidth={2.4} />
                            </span>
                          </button>
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

                        {shouldShowDebugWebViewRemountMenuItem && (
                          <div className="px-4 pt-0 pb-4">
                            <button
                              type="button"
                              onClick={handleDebugWebViewRemountMenuItemPress}
                              className="flex w-full items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-gradient-to-r from-amber-50 via-white to-orange-50 px-3.5 py-3 text-left transition duration-200 hover:border-amber-300 hover:shadow-[0_10px_24px_rgba(245,158,11,0.12)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/80"
                            >
                              <div className="min-w-0 flex-1">
                                <div className="text-[0.94rem] font-semibold text-gray-900">
                                  {DEBUG_WEBVIEW_REMOUNT_MENU_LABEL}
                                </div>
                                <div className="mt-0.5 text-[0.78rem] text-amber-700">
                                  Local and dev only
                                </div>
                              </div>
                              <span className="shrink-0 text-amber-600">
                                <ChevronRight size={18} strokeWidth={2.4} />
                              </span>
                            </button>
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
                    </motion.section>

                    <SlideSurface
                      open={menuOpen && menuScreen !== 'root'}
                      onClose={requestMenuBackStep}
                      onRequestClose={handleMenuSurfaceRequestClose}
                      ariaLabel={menuLabel}
                      nativeBackPriority={20}
                      className="absolute inset-0 z-[60] flex h-full min-w-0 w-full flex-col overflow-hidden bg-white will-change-transform"
                      style={{ touchAction: 'pan-y' }}
                      stopPropagation
                    >
                      <div className="relative h-full overflow-hidden">
                    <motion.section
                      initial={false}
                      animate={menuContentScreen === 'feedback' ? { x: '0%', opacity: 1 } : { x: '8%', opacity: 0 }}
                      transition={resolveMenuContentTransition(menuScreenTransitionMode)}
                      aria-hidden={menuContentScreen !== 'feedback'}
                      className="absolute inset-0 flex h-full min-w-0 flex-col bg-white"
                      style={{
                        pointerEvents: menuContentScreen === 'feedback' ? 'auto' : 'none',
                        zIndex: menuContentScreen === 'feedback'
                          ? 3
                          : (menuScreen === 'root' && menuScreenDirection === 'back' ? 3 : 1),
                      }}
                    >
                      <LivePhoneDemoPanelHeader
                        title={feedbackCopy.pageTitle}
                        backLabel={feedbackCopy.backButtonLabel}
                        onBack={requestMenuBackStep}
                      />

                      <div className="shrink-0 border-b border-gray-100 px-4 py-3">
                        <a
                          href={FEEDBACK_INSTAGRAM_CONTACT_URL}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl border border-pink-200 bg-white px-3 py-2.5 text-[0.95rem] font-semibold leading-tight text-gray-900 shadow-sm transition hover:border-pink-300 hover:bg-pink-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-300"
                        >
                          <Instagram size={18} strokeWidth={2.2} aria-hidden="true" />
                          <span className="min-w-0 text-center">{feedbackCopy.instagramContactButtonLabel}</span>
                        </a>
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
                        className={LIVE_DEMO_MENU_SCROLL_CONTAINER_CLASSNAME}
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
                                              <LivePhoneDemoFeedbackMessageText message={message.message} />
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
                    </motion.section>

                    <motion.section
                      initial={false}
                      animate={menuContentScreen === 'conversation-management' ? { x: '0%', opacity: 1 } : { x: '8%', opacity: 0 }}
                      transition={resolveMenuContentTransition(menuScreenTransitionMode)}
                      aria-hidden={menuContentScreen !== 'conversation-management'}
                      className="absolute inset-0 flex h-full min-w-0 flex-col bg-white"
                      style={{
                        pointerEvents: menuContentScreen === 'conversation-management' ? 'auto' : 'none',
                        zIndex: menuContentScreen === 'conversation-management'
                          ? 3
                          : (menuScreen === 'root' && menuScreenDirection === 'back' ? 3 : 1),
                      }}
                    >
                      <LivePhoneDemoPanelHeader
                        title={roomManagementCopy.pageTitle}
                        backLabel={roomManagementCopy.backButtonLabel}
                        onBack={requestMenuBackStep}
                      />

                      <div
                        className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
                        style={{
                          paddingBottom: 'max(calc(env(safe-area-inset-bottom) + 16px), 20px)',
                        }}
                      >
                        <div className="px-4 py-4">
                          <button
                            type="button"
                            onClick={openRenameConversationDialog}
                            disabled={!conversationId || isRenamingConversation}
                            className="mb-3 flex w-full items-center justify-between gap-3 rounded-xl px-1 py-3 text-left text-[0.98rem] font-medium text-gray-900 transition-colors hover:text-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-300 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            <span className="min-w-0 flex-1">{roomManagementCopy.renameButtonLabel}</span>
                            <span className="shrink-0 text-gray-500">
                              <ChevronRight size={18} strokeWidth={2.4} />
                            </span>
                          </button>

                          <button
                            type="button"
                            onClick={handleDeleteConversationMenuItemPress}
                            disabled={isDeletingConversation}
                            className="flex w-full items-center justify-between gap-3 rounded-2xl border border-rose-200 bg-rose-50/70 px-3.5 py-3 text-left text-[0.98rem] font-medium text-rose-700 transition-colors hover:bg-rose-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            <span className="flex min-w-0 flex-1 items-center gap-2.5">
                              {isMultiMember ? <LogOut size={17} strokeWidth={2.2} /> : <Trash2 size={17} strokeWidth={2.2} />}
                              <span className="min-w-0 flex-1">
                                {isMultiMember ? leaveConversationCopy.menuItemLabel : deleteConversationCopy.menuItemLabel}
                              </span>
                            </span>
                            <span className="shrink-0 text-rose-500">
                              <ChevronRight size={18} strokeWidth={2.4} />
                            </span>
                          </button>
                        </div>
                      </div>
                    </motion.section>

                    <motion.section
                      initial={false}
                      animate={menuContentScreen === 'participants' ? { x: '0%', opacity: 1 } : { x: '8%', opacity: 0 }}
                      transition={resolveMenuContentTransition(menuScreenTransitionMode)}
                      aria-hidden={menuContentScreen !== 'participants'}
                      className="absolute inset-0 flex h-full min-w-0 flex-col bg-white"
                      style={{
                        pointerEvents: menuContentScreen === 'participants' ? 'auto' : 'none',
                        zIndex: menuContentScreen === 'participants' ? 4 : 1,
                      }}
                    >
                      <ConversationParticipantsPanel
                        active={menuScreen === 'participants'}
                        uiLocale={uiLocale}
                        pageTitle={participantsCopy.pageTitle}
                        backLabel={roomManagementCopy.backButtonLabel}
                        selfLabel={participantsCopy.selfLabel}
                        loadingLabel={participantsCopy.loadingLabel}
                        errorLabel={participantsCopy.errorLabel}
                        retryLabel={participantsCopy.retryLabel}
                        onOpenProfile={onOpenProfile}
                        onBack={requestMenuBackStep}
                        conversationId={conversationId}
                        inviteButtonLabel={participantsCopy.inviteButtonLabel}
                        onInvite={onInvite}
                      />
                    </motion.section>

                    <SlideSurface
                      open={menuOpen && menuScreen === 'display-language'}
                      onClose={requestMenuBackStep}
                      onRequestClose={handleMenuSurfaceRequestClose}
                      ariaLabel={defaultDisplayLanguageCopy.pageTitle}
                      nativeBackPriority={30}
                      className="absolute inset-0 z-[70] flex h-full min-w-0 w-full flex-col overflow-hidden bg-white"
                      style={{ touchAction: 'pan-y' }}
                      stopPropagation
                    >
                      <LivePhoneDemoPanelHeader
                        title={defaultDisplayLanguageCopy.pageTitle}
                        backLabel={roomManagementCopy.backButtonLabel}
                        onBack={requestMenuBackStep}
                      />

                      <div
                        className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
                        style={{
                          paddingBottom: 'max(calc(env(safe-area-inset-bottom) + 16px), 20px)',
                        }}
                      >
                        <div className="space-y-2 px-4 py-4">
                          {normalizedDisplayLanguageOptions.map((language) => {
                            const isSelected = resolvedDefaultDisplayLanguage === language
                            const displayName = getSttLanguageDisplayName(language, uiLocale) || language

                            return (
                              <button
                                key={language}
                                type="button"
                                role="radio"
                                aria-checked={isSelected}
                                onClick={() => handleDefaultDisplayLanguageSelect(language)}
                                className={`flex w-full items-center gap-3 rounded-2xl border px-3.5 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/80 ${
                                  isSelected
                                    ? 'border-amber-300 bg-amber-50/70'
                                    : 'border-gray-200 bg-white hover:bg-gray-50'
                                }`}
                              >
                                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gray-50 text-[1.45rem]">
                                  <LanguageFlag language={language} className="text-[1.45rem] leading-none" />
                                </span>
                                <span className="min-w-0 flex-1 truncate text-[0.98rem] font-semibold text-gray-900">
                                  {displayName}
                                </span>
                                <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${
                                  isSelected ? 'bg-amber-500 text-white' : 'bg-gray-100 text-transparent'
                                }`}>
                                  <Check size={14} strokeWidth={2.8} />
                                </span>
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    </SlideSurface>
                      </div>
                    </SlideSurface>
          </div>
        </SlideSurface>

        <div className="relative flex min-h-0 flex-1 flex-col">
          {/* Chat Area */}
          <div
            className="relative min-h-0 flex-1 bg-gray-50/50"
            style={CHAT_SCROLL_SURFACE_STYLE}
          >
            <div
              ref={chatRef}
              data-qa="live-demo-chat-scroll"
              onScroll={handleScroll}
              onWheel={markUserScrollIntent}
              onTouchMove={markUserScrollIntent}
              onPointerDown={markUserScrollIntent}
              className="relative min-h-0 h-full overflow-y-auto no-scrollbar py-2.5"
              style={chatViewportStyle}
            >
              {nativeChatTopSpacerPx > 0 && (
                <div
                  aria-hidden="true"
                  className="pointer-events-none shrink-0"
                  style={{ height: `${nativeChatTopSpacerPx}px` }}
                />
              )}
              {hasOlderUtterances && (
                <button
                  onClick={handleLoadOlder}
                  className="w-full py-2 text-xs text-gray-400 hover:text-gray-500 active:text-gray-600 transition-colors"
                >
                  ···
                </button>
              )}
              {timelineItems.map((item, index) => {
                const previousItem = timelineItems[index - 1]
                const spacingClass = item.kind === 'message' && previousItem?.kind === 'message'
                  ? resolveLivePhoneDemoMessageSpacingClass(previousItem.utterance, item.utterance)
                  : index > 0
                    ? 'mt-1.5'
                    : ''

                return (
                  <div
                    key={item.kind === 'leave-notice'
                      ? `leave:${item.notice.userId}:${item.notice.leftAtMs}`
                      : item.kind === 'invite-notice'
                        ? `invite:${item.notice.inviteeUserId}:${item.notice.invitedAtMs}`
                        : `${item.utterance.id}:${displayLanguageSelectionKey}`
                    }
                    className={spacingClass}
                  >
                    {item.kind === 'leave-notice' ? (
                      <MemoizedLivePhoneDemoLeaveNoticeRow
                        notice={item.notice}
                        uiLocale={uiLocale}
                      />
                    ) : item.kind === 'invite-notice' ? (
                      <MemoizedLivePhoneDemoInviteNoticeRow
                        notice={item.notice}
                        uiLocale={uiLocale}
                      />
                    ) : (
                      <MemoizedLivePhoneDemoChatMessageRow
                        utterance={item.utterance}
                        uiLocale={uiLocale}
                        preferredDisplayLanguage={preferredDisplayLanguage}
                        preferredDisplayLanguages={normalizedPreferredDisplayLanguages}
                        defaultDisplayLanguage={resolvedDefaultDisplayLanguage}
                        languageOrder={normalizedDisplayLanguageOptions}
                        isDraft={draftUtteranceIds.has(item.utterance.id)}
                        onPlayOriginal={handlePlayOriginalBubbleTts}
                        onPlayTranslation={handlePlayTranslationBubbleTts}
                        bubbleTextClassName={chatBubbleTextClassName}
                        speakingPlaybackKey={activeBubblePlaybackKey}
                        shouldAnimateEntrance={animatedDisplayUtteranceIds.has(item.utterance.id)}
                        viewerUserId={viewerUserId}
                        onOpenProfile={handleOpenProfileForBubble}
                        bubbleDisplayMode={bubbleDisplayMode}
                      />
                    )}
                  </div>
                )
              })}

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
                        <LanguageFlag language={demoTypingLang} className="text-base leading-none" />
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

            {/* Error state */}
              {isError && (
                <div className="flex min-h-full flex-col items-center justify-center gap-2 text-center text-red-400">
                  <p className="text-sm">{connectionFailedLabel}</p>
                </div>
              )}
              {nativeChatBottomSpacerPx > 0 && (
                <div
                  aria-hidden="true"
                  className="pointer-events-none shrink-0"
                  style={{ height: `${nativeChatBottomSpacerPx}px` }}
                />
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
              {floatingToastMessage && (
                <motion.div
                  key="copy-toast"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 4 }}
                  transition={{ duration: 0.18, ease: 'easeOut' }}
                  className="pointer-events-none absolute inset-x-0 z-30 flex justify-center"
                  style={{ bottom: copyToastBottomOffsetPx }}
                >
                  <div className="flex items-center gap-2 rounded-full bg-black px-4 py-2.5 text-white shadow-[0_4px_16px_rgba(15,23,42,0.24),0_1px_4px_rgba(0,0,0,0.2)]">
                    <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white text-black">
                      <Check className="h-3 w-3" strokeWidth={3} />
                    </span>
                    <span className="text-[14px] font-medium text-white">
                      {floatingToastMessage}
                    </span>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
            {showEmptyState && (
              <ConversationEmptyState uiLocale={uiLocale} />
            )}
            <AnimatePresence>
              {showConnectingOverlay && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.18, ease: 'easeOut' }}
                  className="pointer-events-none absolute inset-0 z-[15] bg-slate-950/18 backdrop-blur-[1px]"
                >
                  <div className="absolute inset-0 flex items-center justify-center px-6">
                    <div className="flex items-center gap-2 rounded-full bg-white/92 px-4 py-2.5 shadow-[0_6px_20px_rgba(15,23,42,0.14)]">
                      <Loader2 size={18} className="animate-spin text-amber-500" />
                      <p className="text-sm font-medium text-slate-700">{connectingLabel}</p>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <AnimatePresence>
            {renameConversationDialogOpen && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.16, ease: 'easeOut' }}
                className="absolute inset-0 z-[60] flex items-start justify-center bg-black/40 px-5 pb-8"
                style={{
                  paddingTop: "calc(env(safe-area-inset-top, 0px) + 56px)",
                }}
                onClick={closeRenameConversationDialog}
              >
                <motion.div
                  initial={{ opacity: 0, y: 12, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 10, scale: 0.98 }}
                  transition={{ duration: 0.2, ease: 'easeOut' }}
                  role="dialog"
                  aria-modal="true"
                  aria-label={roomManagementCopy.renameDialogTitle}
                  onClick={(event) => event.stopPropagation()}
                  className="w-full max-w-[20rem] rounded-2xl border border-gray-200 bg-white p-4 shadow-xl"
                >
                  <p className="text-sm font-semibold text-gray-900">
                    {roomManagementCopy.renameDialogTitle}
                  </p>
                  <label className="mt-3 block text-sm font-medium text-gray-700">
                    {roomManagementCopy.renameFieldLabel}
                  </label>
                  <input
                    ref={renameConversationInputRef}
                    type="text"
                    value={renameConversationValue}
                    onChange={(event) => setRenameConversationValue(event.target.value)}
                    placeholder={roomManagementCopy.renameFieldPlaceholder}
                    disabled={isRenamingConversation}
                    maxLength={120}
                    className="mt-2 h-11 w-full rounded-xl border border-gray-300 px-3 text-[0.98rem] text-gray-900 outline-none transition focus:border-gray-400 focus:ring-2 focus:ring-gray-200 disabled:cursor-not-allowed disabled:bg-gray-100"
                  />
                  <div className="mt-4 grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={closeRenameConversationDialog}
                      disabled={isRenamingConversation}
                      className="inline-flex h-10 items-center justify-center rounded-lg border border-gray-300 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {roomManagementCopy.renameCancelLabel}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        void handleRenameConversationConfirm()
                      }}
                      disabled={isRenamingConversation}
                      className="inline-flex h-10 items-center justify-center rounded-lg bg-gray-900 text-sm font-semibold text-white transition-colors hover:bg-gray-800 disabled:cursor-not-allowed disabled:bg-gray-400"
                    >
                      {isRenamingConversation
                        ? roomManagementCopy.renamingLabel
                        : roomManagementCopy.renameConfirmLabel}
                    </button>
                  </div>
                </motion.div>
              </motion.div>
            )}
            {deleteConversationDialogOpen && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.16, ease: 'easeOut' }}
                className="absolute inset-0 z-[60] flex items-center justify-center bg-black/40 px-5"
                onClick={closeDeleteConversationDialog}
              >
                <motion.div
                  initial={{ opacity: 0, y: 12, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 10, scale: 0.98 }}
                  transition={{ duration: 0.2, ease: 'easeOut' }}
                  role="dialog"
                  aria-modal="true"
                  aria-label={isMultiMember ? leaveConversationCopy.dialogTitle : deleteConversationCopy.dialogTitle}
                  onClick={(event) => event.stopPropagation()}
                  className="w-full max-w-[19rem] rounded-2xl border border-gray-200 bg-white p-4 shadow-xl"
                >
                  <p className="text-sm font-semibold text-gray-900">
                    {isMultiMember ? leaveConversationCopy.dialogTitle : deleteConversationCopy.dialogTitle}
                  </p>
                  <p className="mt-2 text-sm leading-relaxed text-gray-600">
                    {isMultiMember ? leaveConversationCopy.dialogMessage : deleteConversationCopy.dialogMessage}
                  </p>
                  <div className="mt-4 grid grid-cols-2 gap-2">
                    <button
                      ref={deleteConversationCancelButtonRef}
                      type="button"
                      onClick={closeDeleteConversationDialog}
                      disabled={isDeletingConversation}
                      className="inline-flex h-10 items-center justify-center rounded-lg border border-gray-300 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isMultiMember ? leaveConversationCopy.cancelLabel : deleteConversationCopy.cancelLabel}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        void handleDeleteConversationConfirm()
                      }}
                      disabled={isDeletingConversation}
                      className="inline-flex h-10 items-center justify-center rounded-lg bg-rose-600 text-sm font-semibold text-white transition-colors hover:bg-rose-700 disabled:cursor-not-allowed disabled:bg-rose-400"
                    >
                      {isMultiMember
                        ? (isDeletingConversation ? leaveConversationCopy.leavingLabel : leaveConversationCopy.confirmLabel)
                        : (isDeletingConversation ? deleteConversationCopy.deletingLabel : deleteConversationCopy.confirmLabel)}
                    </button>
                  </div>
                </motion.div>
              </motion.div>
            )}
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
            layout={!isComposerOpen}
            layoutDependency={isComposerOpen}
            onLayoutAnimationComplete={syncNativeBottomBarClearance}
            ref={bottomBarRef}
            data-qa="live-demo-bottom-bar"
            className="relative shrink-0 border-t border-gray-100 bg-white"
            transition={{ duration: 0.14, ease: [0.22, 1, 0.36, 1] }}
            style={{
              paddingTop: `${bottomBarTopPaddingPx}px`,
              paddingBottom: bottomBarPaddingBottom,
              paddingLeft: 'max(calc(env(safe-area-inset-left) + 10px), 14px)',
              paddingRight: 'max(calc(env(safe-area-inset-right) + 10px), 14px)',
            }}
          >
            {isBlockedCounterpart ? (
              <div
                data-qa="live-demo-blocked-bottom-bar"
                className="flex items-center justify-center py-3 text-[0.92rem] font-medium text-gray-400"
              >
                {blockedComposerMessageLabel}
              </div>
            ) : (
            <AnimatePresence initial={false} mode="popLayout">
              {isComposerOpen ? (
                <motion.div
                  key="composer-bottom-bar"
                  layout={false}
                  layoutDependency={isComposerOpen}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 10 }}
                  transition={{ duration: 0.12, ease: [0.22, 1, 0.36, 1] }}
                  className="flex items-end gap-1.5"
                >
                  <motion.div className="flex shrink-0 items-end justify-center self-end">
                    <button
                      data-qa="live-demo-mic-button"
                      onPointerDown={handleMicPointerDown}
                      onPointerUp={handleMicPointerUp}
                      onPointerCancel={handleMicPointerCancel}
                      onClick={handleMicClick}
                      disabled={isPreparingStart && !isConnecting}
                      className="relative flex items-center justify-center rounded-full transition-all duration-200 active:scale-95 disabled:opacity-50"
                      style={{
                        width: `${COMPOSER_MODE_CONTROL_SIZE_PX}px`,
                        height: `${COMPOSER_MODE_CONTROL_SIZE_PX}px`,
                      }}
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
                              : showConnectingOverlay
                                ? 'bg-gray-300'
                                : 'bg-gradient-to-br from-amber-400 to-orange-500'
                        }`}
                      >
                        {showConnectingOverlay ? (
                          <Loader2 size={16} className="animate-spin text-white" />
                        ) : isReady ? (
                          <span
                            aria-hidden
                            className="rounded-[3px] bg-white"
                            style={{
                              width: `${Math.round(COMPOSER_MODE_CONTROL_SIZE_PX * 0.28)}px`,
                              height: `${Math.round(COMPOSER_MODE_CONTROL_SIZE_PX * 0.28)}px`,
                            }}
                          />
                        ) : (
                          <Mic size={16} className="text-white" />
                        )}
                      </span>
                    </button>
                  </motion.div>

                  <motion.form
                    onSubmit={handleComposerSubmit}
                    className="flex min-w-0 flex-1 items-end gap-1.5 self-end"
                  >
                    <div
                      className="flex min-w-0 flex-1 items-end overflow-hidden rounded-[0.95rem] border border-gray-200 bg-white px-1 shadow-none"
                      style={{ height: `${Math.max(COMPOSER_SHELL_MIN_HEIGHT_PX, composerTextareaHeightPx)}px` }}
                    >
                      <div className="flex min-w-0 flex-1 items-end px-1">
                        <textarea
                          ref={composerTextareaRef}
                          data-qa="live-demo-composer-textarea"
                          defaultValue={composerDraftRef.current}
                          onChange={handleComposerDraftChange}
                          rows={1}
                          placeholder={composerCopy.composerPlaceholder}
                          className="block box-border h-full min-h-0 flex-1 resize-none self-end bg-transparent px-0.5 py-[7px] text-[16px] leading-[22px] text-gray-900 outline-none placeholder:text-gray-400"
                          style={{ height: `${composerTextareaHeightPx}px` }}
                        />
                      </div>

                      <motion.button
                        layoutId="live-phone-demo-keyboard-toggle"
                        data-qa="live-demo-keyboard-close"
                        type="button"
                        onClick={handleToggleComposer}
                        aria-label={composerCopy.closeKeyboardLabel}
                        className="inline-flex shrink-0 items-center justify-center self-end rounded-full text-gray-500 transition-colors hover:bg-gray-50 active:scale-95"
                        style={{
                          width: `${COMPOSER_MODE_CONTROL_SIZE_PX}px`,
                          height: `${COMPOSER_MODE_CONTROL_SIZE_PX}px`,
                        }}
                      >
                        <Keyboard size={18} strokeWidth={2.2} />
                      </motion.button>
                    </div>

                    <button
                      type="submit"
                      disabled={!composerCanSend}
                      onPointerDown={(event) => {
                        // Do not let the send button steal focus from the textarea.
                        event.preventDefault()
                      }}
                      aria-label={composerCopy.sendMessageLabel}
                      className={`inline-flex shrink-0 items-center justify-center self-end rounded-full transition-all duration-200 active:scale-95 ${
                        composerCanSend
                          ? 'bg-gradient-to-br from-amber-400 to-orange-500 text-white'
                          : 'bg-transparent text-gray-300'
                      }`}
                      style={{
                        width: `${COMPOSER_MODE_CONTROL_SIZE_PX}px`,
                        height: `${COMPOSER_MODE_CONTROL_SIZE_PX}px`,
                      }}
                    >
                      <svg
                        aria-hidden
                        viewBox="0 0 24 24"
                        className="h-5 w-5"
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
                  layoutDependency={isComposerOpen}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 8 }}
                  transition={{ duration: 0.11, ease: [0.22, 1, 0.36, 1] }}
                  className="grid items-end"
                  style={{ gridTemplateColumns: '1fr auto 1fr' }}
                >
                  <motion.div
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -12 }}
                    transition={{ duration: 0.09, ease: 'easeOut' }}
                    className="self-end justify-self-start pl-2"
                  >
                    <div className="flex h-[33px] flex-col items-start justify-end gap-0">
                      <div className="flex items-center gap-1.5">
                        {isUsageLimited ? (
                          <>
                            <div className="h-2 w-28 overflow-hidden rounded-full bg-gray-200">
                              <div
                                className={`h-full rounded-full transition-all duration-500 ${usageSec >= 25 ? 'bg-red-400' : 'bg-amber-400'}`}
                                style={{ width: `${usagePercent}%` }}
                              />
                            </div>
                            <span className={`text-sm leading-4 tabular-nums ${isLimitReached ? 'font-semibold text-red-400' : 'text-gray-400'}`}>
                              {formatLivePhoneDemoUsageDuration(remainingSec)}
                            </span>
                          </>
                        ) : (
                          <span className="text-sm leading-4 tabular-nums text-gray-400">
                            {formatLivePhoneDemoUsageDuration(usageSec)}
                          </span>
                        )}
                      </div>
                      <span className="text-sm leading-4 tabular-nums text-gray-400">
                        {storedMessageCountLabel}
                      </span>
                    </div>
                  </motion.div>

                  <motion.div className="flex self-end justify-center">
                    <button
                      data-qa="live-demo-mic-button"
                      onPointerDown={handleMicPointerDown}
                      onPointerUp={handleMicPointerUp}
                      onPointerCancel={handleMicPointerCancel}
                      onClick={handleMicClick}
                      disabled={isPreparingStart && !isConnecting}
                      aria-label={isReady || isConnecting ? VOICE_MODE_STOP_LABEL : VOICE_MODE_START_LABEL}
                      className="relative flex items-center justify-center px-[18px] transition-all duration-200 active:scale-95 disabled:opacity-50"
                      style={{
                        width: `${VOICE_MODE_STT_BUTTON_WIDTH_PX}px`,
                        height: `${VOICE_MODE_STT_BUTTON_HEIGHT_PX}px`,
                        borderRadius: `${VOICE_MODE_STT_BUTTON_RADIUS_PX}px`,
                      }}
                    >
                      {showRipple && (
                        <span
                          className="absolute inset-0 bg-red-400 transition-transform duration-150"
                          style={{
                            transform: `scale(${rippleScale})`,
                            opacity: 0.25,
                            borderRadius: `${VOICE_MODE_STT_BUTTON_RADIUS_PX}px`,
                          }}
                        />
                      )}

                      {isReady && (
                        <span
                          className="absolute inset-0 bg-red-500 opacity-20 animate-ping"
                          style={{ borderRadius: `${VOICE_MODE_STT_BUTTON_RADIUS_PX}px` }}
                        />
                      )}

                      <span
                        className={`relative flex h-full w-full items-center justify-center gap-3 px-[18px] shadow-lg ${
                          isLimitReached
                            ? 'bg-gray-300'
                            : isReady
                              ? 'bg-red-500'
                              : showConnectingOverlay
                                ? 'bg-gray-300'
                                : 'bg-gradient-to-br from-amber-400 to-orange-500'
                        }`}
                        style={{ borderRadius: `${VOICE_MODE_STT_BUTTON_RADIUS_PX}px` }}
                      >
                        {showConnectingOverlay ? (
                          <Loader2 size={VOICE_MODE_STT_ICON_SIZE_PX} className="shrink-0 animate-spin text-white" />
                        ) : isReady ? (
                          <span
                            aria-hidden
                            className="shrink-0 rounded-[4px] bg-white"
                            style={{
                              width: `${VOICE_MODE_STT_STOP_SIZE_PX}px`,
                              height: `${VOICE_MODE_STT_STOP_SIZE_PX}px`,
                            }}
                          />
                        ) : (
                          <Mic size={VOICE_MODE_STT_ICON_SIZE_PX} className="shrink-0 text-white" />
                        )}
                        <span className="text-[0.98rem] font-semibold tracking-[0.01em] text-white">
                          {isReady ? VOICE_MODE_STOP_LABEL : VOICE_MODE_START_LABEL}
                        </span>
                      </span>
                    </button>
                  </motion.div>

                  <div className="self-end justify-self-end">
                    <motion.button
                      layoutId="live-phone-demo-keyboard-toggle"
                      data-qa="live-demo-keyboard-open"
                      type="button"
                      onPointerDown={(event) => event.preventDefault()}
                      onClick={handleToggleComposer}
                      aria-label={composerCopy.openKeyboardLabel}
                      className="inline-flex items-center justify-center text-gray-500 transition-all duration-200 hover:text-gray-700 active:scale-95"
                      style={{
                        width: `${VOICE_MODE_SIDE_BUTTON_SIZE_PX}px`,
                        height: `${VOICE_MODE_SIDE_BUTTON_SIZE_PX}px`,
                      }}
                    >
                      <Keyboard size={18} strokeWidth={2.15} />
                    </motion.button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
            )}
          </motion.div>
        </div>
      </div>
    </PhoneFrame>
  )
})

export default LivePhoneDemo
