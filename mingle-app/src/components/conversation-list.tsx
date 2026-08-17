"use client";

import type { AppLocale } from "@/i18n/config";
import type { AppDictionary } from "@/i18n/types";
import type { ConversationChannelSummary } from "@/lib/app-conversations";
import { getConversationDictionary } from "@/i18n/conversations";
import { storeAppLocale } from "@/components/app-locale-preference-sync";
import { buildClientApiPath, clientApiNamespace } from "@/lib/api-contract";
import Image from "next/image";
import {
  forwardRef,
  lazy,
  Suspense,
  type FormEvent,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, type Variants } from "framer-motion";
import { ArrowRight, Bell, Loader2, PencilLine, Search, Trash2 } from "lucide-react";
import { useSession } from "next-auth/react";
import { buildStorageKey, getOrCreateTrackingUserId } from "@/components/LivePhoneDemo/realtime-storage";
import {
  formatLivePhoneDemoMessageCount,
  formatLivePhoneDemoUsageDuration,
} from "@/components/LivePhoneDemo/live-phone-demo.usage-format";
import { resolveLivePhoneDemoConversationDeleteCopy } from "@/components/LivePhoneDemo/live-phone-demo.delete-copy";
import {
  LS_KEY_LANGUAGE_ONBOARDING_CONFIRMED,
  LS_KEY_LANGUAGES,
  LS_KEY_PENDING_DEFAULT_CONVERSATION_LANGUAGES,
  LS_KEY_PENDING_PRIMARY_LANGUAGES,
  LS_KEY_SPEECH_LANGUAGES,
  LS_KEY_TRANSLATION_LANGUAGES_LINKED,
  DEFAULT_CONVERSATION_LANGUAGES_SYNC_EVENT,
  normalizeLivePhoneDemoAdBannerPosition,
  readPersistedBooleanPreference,
  readPersistedLivePhoneDemoPreferences,
  type LivePhoneDemoAdBannerPosition,
} from "@/components/LivePhoneDemo/live-phone-demo.preferences";
import { resolveLivePhoneDemoRoomManagementCopy } from "@/components/LivePhoneDemo/live-phone-demo.room-management-copy";
import LanguageOnboardingModal from "@/components/LivePhoneDemo/LanguageOnboardingModal";
import {
  resolveOnboardingDefaultLanguage,
  resolveUiLocaleForLanguage,
  shouldAutoOpenLanguageOnboarding,
} from "@/components/LivePhoneDemo/language-onboarding.logic";
import { buildPathWithCurrentSearchParams } from "@/lib/build-path-with-search-params";
import {
  deriveDefaultConversationLanguages,
  deriveDefaultSttLanguagesForLocale,
  sanitizeSttLanguageSelection,
} from "@/lib/stt-languages";
import {
  NATIVE_UI_EVENT,
  parseNativeUiBannerLayoutDetail,
  type NativeUiBannerLayoutEventDetail,
} from "@/components/LivePhoneDemo/live-phone-demo.native-ui.logic";
import {
  buildConversationRequestIdentityHeaders,
  buildConversationHistoryState,
  calculateConversationRowTooltipPosForRect,
  compareConversationRecency,
  CONVERSATION_AVATAR_IMAGE_STYLE,
  CONVERSATION_ROW_TOUCH_SAFE_STYLE,
  createMutationVersionTracker,
  findNativeSttRestoreConversation,
  isSearchOverlayHistoryOpen,
  MAX_RECENT_SEARCHES,
  mergeConversationLists,
  mergeSearchOverlayHistoryState,
  type MutationVersionTracker,
  normalizeRecentSearches,
  normalizeSearchTerm,
  replaceConversationLists,
  releaseConversationCreateLock,
  resolveConversationDisplayMessageCount,
  resolveConversationHistoryNavigationDirection,
  resolveConversationHistoryRoute,
  readConversationHistoryRouteFromState,
  type ConversationHistoryNavigationDirection,
  type TooltipPos,
  tryAcquireConversationCreateLock,
  upsertConversation,
  updateConversationSummaryStatus,
} from "@/components/conversation-list.logic";
import {
  isAbortLikeMutationError,
  logConversationMutationFailure,
} from "@/components/conversation-list.diagnostics";
import NotificationPanel from "@/components/notification-panel";
import NativePushRegistration from "@/components/native-push-registration";
import PublicUserProfileScreen from "@/components/public-user-profile-screen";
import {
  readConversationListCache,
  readConversationListMemoryCache,
  resolveConversationListInitialState,
  writeConversationListCache,
  type CachedConversationLocalStats,
  type ConversationListCacheIdentity,
} from "@/components/conversation-list-cache";
import {
  NATIVE_HISTORY_BACK_ANIMATE_FLAG,
  registerNativeBackHandler,
} from "@/lib/native-back-handler";
import {
  postNativeBannerZone,
  resolveConversationListNativeBannerZone,
  shouldReassertNativeAuthBannerZone,
} from "@/lib/native-banner-zone";
import {
  readNativeQaBridgeAuthority,
  shouldExposeNativeQaBridge,
} from "@/lib/native-qa-bridge";
import { takeNativeRemountRestoreConversation } from "@/lib/native-remount-restore";
import BottomTabBar, { BOTTOM_TAB_BAR_HEIGHT_PX } from "@/components/bottom-tab-bar";
import LanguageFlag from "@/components/language-flag";
import type { MingleHomeRef } from "@/components/mingle-home";
import type { LatestUtterancePayload } from "@/components/LivePhoneDemo/LivePhoneDemo";
import MingleWordmark from "@/components/mingle-wordmark";
import { getSpeakerAvatar } from "@/components/LivePhoneDemo/speaker-avatar";
import { NATIVE_SKIP_CONVERSATION_RESTORE_QUERY_KEY, NATIVE_TAB_ROOT_QUERY_KEY } from "@/lib/tab-navigation";

const MingleHome = lazy(() => import("@/components/mingle-home"));

const RECENT_SEARCHES_STORAGE_KEY = "mingle:conversation-searches";
const RECENT_SEARCHES_SYNC_EVENT = "mingle:conversation-searches-sync";
const SEARCH_OVERLAY_HISTORY_CLOSE_ANIMATE_FLAG = "__MINGLE_SEARCH_HISTORY_CLOSE_ANIMATE__";
const NATIVE_STT_EVENT = "mingle:native-stt";
const LEGACY_SINGLE_ROOM_MIGRATION_MARKER_KEY_PREFIX = "mingle:legacy-single-room-migrated";
const NOTIFICATION_PROFILE_HISTORY_KEY = "__MINGLE_NOTIFICATION_PROFILE__";
const EMPTY_RECENT_SEARCHES: string[] = [];
const CONVERSATION_QUERY_KEY = "conversation";
const LEGACY_SINGLE_ROOM_UTTERANCES_KEY = "mingle_demo_utterances";
const LEGACY_SINGLE_ROOM_USAGE_KEY = "mingle_demo_usage_sec";
const LEGACY_SINGLE_ROOM_MESSAGE_COUNT_KEY = "mingle_demo_message_count";
const LEGACY_SINGLE_ROOM_SESSION_KEY = "mingle_demo_session_key";
const CONVERSATION_OVERLAY_TRANSITION = {
  duration: 0.28,
  ease: [0.22, 1, 0.36, 1] as const,
};
const WEB_CANVAS_BASE_WIDTH_PX = 400;
const NATIVE_AD_BANNER_DEFAULT_HEIGHT_PX = 50;
const NATIVE_INSET_QUERY_MAX_PX = 240;
const ROW_ACTION_LONG_PRESS_DELAY_MS = 450;
const ROW_ACTION_CANCEL_DISTANCE_PX = 10;
const LIST_PULL_REFRESH_TRIGGER_PX = 72;
const LIST_PULL_REFRESH_MAX_PX = 108;
const LIST_PULL_REFRESH_RESISTANCE = 0.45;
const CONVERSATION_CREATE_BUTTON_HEIGHT_PX = 72;

let recentSearchesSnapshot = EMPTY_RECENT_SEARCHES;
let recentSearchesSnapshotRaw = "__initial__";

type ConversationOverlayExitMode = "animate" | "instant";
type ConversationOverlayEnterMode = "animate" | "instant";
type SearchOverlayTransitionMode = "animate" | "instant";
type LanguageOnboardingPhase = "resolving" | "selection" | "locale-switching" | "ready";
type ConversationOverlayTransitionState = {
  enterMode: ConversationOverlayEnterMode;
  exitMode: ConversationOverlayExitMode;
};
type ConversationHistoryPopStateTarget = {
  conversationId: string | null;
};
type ConversationHistoryPopStateTransition = ConversationHistoryPopStateTarget & {
  direction: ConversationHistoryNavigationDirection;
};

type ConversationListWindow = Window & {
  [NATIVE_HISTORY_BACK_ANIMATE_FLAG]?: boolean;
  [SEARCH_OVERLAY_HISTORY_CLOSE_ANIMATE_FLAG]?: boolean;
  __MINGLE_LAST_NATIVE_MIC_PERMISSION?: "unknown" | "granted" | "denied" | "prompt";
};

type ConversationListQaSnapshot = {
  routePathname: string;
  documentLanguage: string;
  uiLocale: string;
  isNativeAppRuntime: boolean;
  isHydratingConversations: boolean;
  conversationCount: number;
  activeConversationId: string | null;
  nativeSttStatus: string | null;
  showSearch: boolean;
  effectiveNativeTopInsetPx: number;
  effectiveNativeBottomInsetPx: number;
  nativeBannerLayoutPosition: "top" | "bottom" | null;
  createButtonLabel: string;
};

type ConversationListQaEnsureRoomResult = {
  conversationId: string;
  action: "active" | "opened-existing" | "created";
};

type ConversationLocalStats = CachedConversationLocalStats;

declare global {
  interface Window {
    __MINGLE_CONVERSATION_LIST_QA__?: {
      getConversationListSnapshot: () => ConversationListQaSnapshot;
      ensureConversationRoom: () => Promise<ConversationListQaEnsureRoomResult>;
    };
  }
}

const conversationOverlayVariants: Variants = {
  initial: (transitionState: ConversationOverlayTransitionState) => (
    transitionState.enterMode === "animate"
      ? { x: "100%" }
      : { x: "0%" }
  ),
  active: (transitionState: ConversationOverlayTransitionState) => ({
    x: "0%",
    transition: transitionState.enterMode === "animate"
      ? CONVERSATION_OVERLAY_TRANSITION
      : { duration: 0 },
  }),
  retained: (transitionState: ConversationOverlayTransitionState) => ({
    x: "100%",
    transition: transitionState.exitMode === "animate"
      ? CONVERSATION_OVERLAY_TRANSITION
      : { duration: 0 },
  }),
  exit: (transitionState: ConversationOverlayTransitionState) => (
    transitionState.exitMode === "animate"
      ? { x: "100%", transition: CONVERSATION_OVERLAY_TRANSITION }
      : { x: "0%", transition: { duration: 0 } }
  ),
};

interface ConversationItem {
  id: string;
  title: string;
  preview: string;
  previewFullText: string;
  timeLabel: string;
  statsLabel: string;
  statsFullLabel: string;
  status: "active" | "paused";
  statusLabel: string;
  avatarSrc: string;
  avatarAlt: string;
  sequenceNumber: number;
  sessionKey: string;
  createdAt: string;
  updatedAt: string;
  pausedAt: string | null;
  selectedLanguages: string[];
  speechLanguages: string[];
  translationLanguagesLinked: boolean;
  languageCodes: string[];
  isInterimPreview: boolean;
}

type ConversationRowActionMenuState = {
  item: ConversationItem;
  position: TooltipPos;
};

function truncateConversationPreview(value: string, maxLength = 20): string {
  const normalized = value.trim();
  if (!normalized) return "";

  const characters = [...normalized];
  if (characters.length <= maxLength) {
    return normalized;
  }

  return `${characters.slice(0, maxLength).join("")}...`;
}

type LegacySingleRoomSnapshot = {
  utterancesRaw: string | null;
  usageRaw: string | null;
  sessionKey: string;
  selectedLanguages: string[];
  speechLanguages: string[];
  translationLanguagesLinked: boolean;
};

const EMPTY_CONVERSATION_LOCAL_STATS: ConversationLocalStats = {
  usageSec: 0,
  messageCount: 0,
};

function normalizeConversationStatsValue(value: number): number {
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

function readPersistedConversationUsageSec(conversationId: string): number {
  if (typeof window === "undefined") return 0;

  try {
    const parsed = Number.parseInt(
      window.localStorage.getItem(buildStorageKey(LEGACY_SINGLE_ROOM_USAGE_KEY, conversationId)) || "0",
      10,
    );
    return normalizeConversationStatsValue(parsed);
  } catch {
    return 0;
  }
}

function countPersistedConversationUtterances(rawValue: string | null): number {
  if (!rawValue) return 0;

  try {
    const parsed = JSON.parse(rawValue) as unknown;
    if (!Array.isArray(parsed)) return 0;

    const seenIds = new Set<string>();
    let messageCount = 0;
    for (const item of parsed) {
      if (!item || typeof item !== "object") continue;
      const id = typeof (item as { id?: unknown }).id === "string"
        ? (item as { id: string }).id.trim()
        : "";
      const originalText = typeof (item as { originalText?: unknown }).originalText === "string"
        ? (item as { originalText: string }).originalText.trim()
        : "";
      if (!id || !originalText || seenIds.has(id)) continue;
      seenIds.add(id);
      messageCount += 1;
    }
    return messageCount;
  } catch {
    return 0;
  }
}

function readPersistedConversationMessageCount(conversationId: string): number {
  if (typeof window === "undefined") return 0;

  try {
    const persistedMessageCount = Number.parseInt(
      window.localStorage.getItem(buildStorageKey(LEGACY_SINGLE_ROOM_MESSAGE_COUNT_KEY, conversationId)) || "0",
      10,
    );
    const normalizedPersistedMessageCount = normalizeConversationStatsValue(persistedMessageCount);
    const snapshotMessageCount = countPersistedConversationUtterances(window.localStorage.getItem(
      buildStorageKey(LEGACY_SINGLE_ROOM_UTTERANCES_KEY, conversationId),
    ));
    return Math.max(normalizedPersistedMessageCount, snapshotMessageCount);
  } catch {
    return 0;
  }
}

function readPersistedConversationLocalStats(conversationId: string): ConversationLocalStats {
  return {
    usageSec: readPersistedConversationUsageSec(conversationId),
    messageCount: readPersistedConversationMessageCount(conversationId),
  };
}

function areConversationLocalStatsEqual(
  left: ConversationLocalStats | undefined,
  right: ConversationLocalStats | undefined,
): boolean {
  const leftStats = left ?? EMPTY_CONVERSATION_LOCAL_STATS;
  const rightStats = right ?? EMPTY_CONVERSATION_LOCAL_STATS;
  return leftStats.usageSec === rightStats.usageSec
    && leftStats.messageCount === rightStats.messageCount;
}

function buildConversationLocalStatsSnapshot(
  conversations: ConversationChannelSummary[],
): Record<string, ConversationLocalStats> {
  const snapshot: Record<string, ConversationLocalStats> = {};
  for (const conversation of conversations) {
    snapshot[conversation.id] = readPersistedConversationLocalStats(conversation.id);
  }
  return snapshot;
}

function areConversationLocalStatsSnapshotsEqual(
  left: Record<string, ConversationLocalStats>,
  right: Record<string, ConversationLocalStats>,
): boolean {
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  if (leftKeys.length !== rightKeys.length) return false;

  for (const key of leftKeys) {
    if (!areConversationLocalStatsEqual(left[key], right[key])) {
      return false;
    }
  }

  return true;
}

function isNativeAppRuntime(): boolean {
  return typeof window !== "undefined"
    && typeof window.ReactNativeWebView?.postMessage === "function";
}

function readPendingDefaultConversationLanguages(): string[] {
  if (typeof window === "undefined") return [];

  try {
    const rawValue = window.localStorage.getItem(LS_KEY_PENDING_DEFAULT_CONVERSATION_LANGUAGES);
    if (!rawValue) return [];
    return sanitizeSttLanguageSelection(JSON.parse(rawValue));
  } catch {
    return [];
  }
}

function readPendingPrimaryLanguages(): string[] {
  if (typeof window === "undefined") return [];

  try {
    const rawValue = window.localStorage.getItem(LS_KEY_PENDING_PRIMARY_LANGUAGES);
    if (!rawValue) return [];
    return sanitizeSttLanguageSelection(JSON.parse(rawValue));
  } catch {
    return [];
  }
}

type ProfileLanguagePreferencesPayload = {
  primaryLanguages?: unknown;
  defaultConversationLanguages?: unknown;
};

type ResolvedOnboardingLanguagePreferences = {
  primaryLanguages: string[];
  defaultConversationLanguages: string[];
  patch: {
    primaryLanguages?: string[];
    defaultConversationLanguages?: string[];
  };
};

function resolveOnboardingLanguagePreferences(
  profile: ProfileLanguagePreferencesPayload,
  pendingPrimaryLanguages: readonly string[],
  pendingDefaultConversationLanguages: readonly string[],
): ResolvedOnboardingLanguagePreferences {
  const serverPrimaryLanguages = sanitizeSttLanguageSelection(profile.primaryLanguages);
  const serverDefaultConversationLanguages = sanitizeSttLanguageSelection(
    profile.defaultConversationLanguages,
  );
  const fallbackPrimaryLanguages = sanitizeSttLanguageSelection(pendingPrimaryLanguages);
  const fallbackDefaultConversationLanguages = sanitizeSttLanguageSelection(
    pendingDefaultConversationLanguages,
  );
  const primaryLanguages = serverPrimaryLanguages.length > 0
    ? serverPrimaryLanguages
    : fallbackPrimaryLanguages;
  const defaultConversationLanguages = serverDefaultConversationLanguages.length > 0
    ? serverDefaultConversationLanguages
    : fallbackDefaultConversationLanguages;

  return {
    primaryLanguages,
    defaultConversationLanguages,
    patch: {
      ...(serverPrimaryLanguages.length === 0 && primaryLanguages.length > 0
        ? { primaryLanguages }
        : {}),
      ...(serverDefaultConversationLanguages.length === 0 && defaultConversationLanguages.length > 0
        ? { defaultConversationLanguages }
        : {}),
    },
  };
}

function clearPendingLanguagePreferences(): void {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.removeItem(LS_KEY_PENDING_DEFAULT_CONVERSATION_LANGUAGES);
    window.localStorage.removeItem(LS_KEY_PENDING_PRIMARY_LANGUAGES);
  } catch {
    // Keep the marker when storage is temporarily unavailable so the next authenticated launch retries.
  }
}

function shouldSkipCreateConversationMicWarmup(): boolean {
  if (typeof window === "undefined") return false;
  if (!isNativeAppRuntime()) return false;
  if (!clientApiNamespace.startsWith("ios/")) return false;

  const cachedWindow = window as ConversationListWindow;
  const cachedPermission = typeof cachedWindow.__MINGLE_LAST_NATIVE_MIC_PERMISSION === "string"
    ? cachedWindow.__MINGLE_LAST_NATIVE_MIC_PERMISSION.trim().toLowerCase()
    : "";

  return cachedPermission === "denied";
}

function rememberDeniedCreateConversationMicWarmup(): void {
  if (typeof window === "undefined") return;
  if (!isNativeAppRuntime()) return;
  if (!clientApiNamespace.startsWith("ios/")) return;

  const cachedWindow = window as ConversationListWindow;
  cachedWindow.__MINGLE_LAST_NATIVE_MIC_PERMISSION = "denied";
}

function buildLegacySingleRoomMigrationMarkerKey(): string {
  return `${LEGACY_SINGLE_ROOM_MIGRATION_MARKER_KEY_PREFIX}:${getOrCreateTrackingUserId()}`;
}

function hasLegacySingleRoomMigrationCompleted(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(buildLegacySingleRoomMigrationMarkerKey()) === "1";
  } catch {
    return false;
  }
}

function markLegacySingleRoomMigrationCompleted(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(buildLegacySingleRoomMigrationMarkerKey(), "1");
  } catch {
    // Ignore restricted storage failures.
  }
}

function readLegacySingleRoomSnapshot(): LegacySingleRoomSnapshot | null {
  if (typeof window === "undefined") return null;

  try {
    const defaultSelectedLanguages = deriveDefaultSttLanguagesForLocale(document.documentElement.lang || "");
    const utterancesRaw = window.localStorage.getItem(LEGACY_SINGLE_ROOM_UTTERANCES_KEY);
    const usageRaw = window.localStorage.getItem(LEGACY_SINGLE_ROOM_USAGE_KEY);
    const sessionKey = (window.localStorage.getItem(LEGACY_SINGLE_ROOM_SESSION_KEY) || "").trim();
    let selectedLanguages = [...defaultSelectedLanguages];
    let speechLanguages = [...defaultSelectedLanguages];
    let translationLanguagesLinked = true;
    try {
      selectedLanguages = sanitizeSttLanguageSelection(
        JSON.parse(window.localStorage.getItem(LS_KEY_LANGUAGES) || "null"),
        defaultSelectedLanguages,
      );
      speechLanguages = [...selectedLanguages];
    } catch {
      selectedLanguages = [...defaultSelectedLanguages];
      speechLanguages = [...defaultSelectedLanguages];
    }
    try {
      speechLanguages = sanitizeSttLanguageSelection(
        JSON.parse(window.localStorage.getItem(LS_KEY_SPEECH_LANGUAGES) || "null"),
        selectedLanguages,
      );
    } catch {
      speechLanguages = [...selectedLanguages];
    }
    try {
      const rawLinked = window.localStorage.getItem(LS_KEY_TRANSLATION_LANGUAGES_LINKED);
      translationLanguagesLinked = rawLinked === null
        ? true
        : rawLinked.trim().toLowerCase() !== "0" && rawLinked.trim().toLowerCase() !== "false";
    } catch {
      translationLanguagesLinked = true;
    }
    if (translationLanguagesLinked) {
      selectedLanguages = [...speechLanguages];
    }

    const hasUtterances = typeof utterancesRaw === "string" && utterancesRaw.trim().length > 0;
    const hasUsage = typeof usageRaw === "string" && usageRaw.trim().length > 0 && usageRaw.trim() !== "0";
    const hasSessionKey = sessionKey.length > 0;
    if (!hasUtterances && !hasUsage && !hasSessionKey) {
      return null;
    }

    if (hasUtterances) {
      try {
        const parsed = JSON.parse(utterancesRaw) as unknown;
        if (!Array.isArray(parsed)) {
          return null;
        }
      } catch {
        return null;
      }
    }

    return {
      utterancesRaw: hasUtterances ? utterancesRaw : null,
      usageRaw: hasUsage ? usageRaw : null,
      sessionKey,
      selectedLanguages,
      speechLanguages,
      translationLanguagesLinked,
    };
  } catch {
    return null;
  }
}

function copyLegacySingleRoomSnapshotToConversation(
  conversationId: string,
  sessionKey: string,
  snapshot: LegacySingleRoomSnapshot,
): void {
  if (typeof window === "undefined") return;

  try {
    if (snapshot.utterancesRaw) {
      window.localStorage.setItem(
        buildStorageKey(LEGACY_SINGLE_ROOM_UTTERANCES_KEY, conversationId),
        snapshot.utterancesRaw,
      );
      window.localStorage.setItem(
        buildStorageKey(LEGACY_SINGLE_ROOM_MESSAGE_COUNT_KEY, conversationId),
        String(countPersistedConversationUtterances(snapshot.utterancesRaw)),
      );
    }
    if (snapshot.usageRaw) {
      window.localStorage.setItem(
        buildStorageKey(LEGACY_SINGLE_ROOM_USAGE_KEY, conversationId),
        snapshot.usageRaw,
      );
    }
    const resolvedSessionKey = snapshot.sessionKey || sessionKey;
    if (resolvedSessionKey) {
      window.localStorage.setItem(
        buildStorageKey(LEGACY_SINGLE_ROOM_SESSION_KEY, conversationId),
        resolvedSessionKey,
      );
    }
  } catch {
    // Ignore restricted storage failures.
  }
}

function cacheRecentSearchesSnapshot(rawValue: string | null, nextValues: string[]): string[] {
  const normalized = normalizeRecentSearches(nextValues);
  recentSearchesSnapshotRaw = rawValue ?? "__null__";
  recentSearchesSnapshot = normalized.length > 0 ? normalized : EMPTY_RECENT_SEARCHES;
  return recentSearchesSnapshot;
}

function readStoredRecentSearches(): string[] {
  if (typeof window === "undefined") return EMPTY_RECENT_SEARCHES;

  try {
    const stored = window.localStorage.getItem(RECENT_SEARCHES_STORAGE_KEY);
    const cacheKey = stored ?? "__null__";
    if (cacheKey === recentSearchesSnapshotRaw) {
      return recentSearchesSnapshot;
    }
    if (!stored) return cacheRecentSearchesSnapshot(null, []);

    const parsed = JSON.parse(stored) as unknown;
    if (!Array.isArray(parsed)) return cacheRecentSearchesSnapshot(stored, []);

    return cacheRecentSearchesSnapshot(
      stored,
      parsed.filter((value): value is string => typeof value === "string"),
    );
  } catch {
    return cacheRecentSearchesSnapshot(null, []);
  }
}

function writeStoredRecentSearches(nextRecentSearches: string[]): void {
  if (typeof window === "undefined") return;

  try {
    const normalized = normalizeRecentSearches(nextRecentSearches);
    const serialized = JSON.stringify(normalized);
    cacheRecentSearchesSnapshot(serialized, normalized);
    window.localStorage.setItem(RECENT_SEARCHES_STORAGE_KEY, serialized);
    window.dispatchEvent(new Event(RECENT_SEARCHES_SYNC_EVENT));
  } catch {
    // Ignore storage write failures in restricted environments.
  }
}

function subscribeRecentSearches(onStoreChange: () => void): () => void {
  if (typeof window === "undefined") {
    return () => {};
  }

  const handleChange = (event: Event) => {
    if (
      event instanceof StorageEvent
      && event.key
      && event.key !== RECENT_SEARCHES_STORAGE_KEY
    ) {
      return;
    }
    onStoreChange();
  };

  window.addEventListener("storage", handleChange);
  window.addEventListener(RECENT_SEARCHES_SYNC_EVENT, handleChange);

  return () => {
    window.removeEventListener("storage", handleChange);
    window.removeEventListener(RECENT_SEARCHES_SYNC_EVENT, handleChange);
  };
}

function readConversationIdFromLocation(): string | null {
  if (typeof window === "undefined") return null;

  try {
    const value = (new URL(window.location.href).searchParams.get(CONVERSATION_QUERY_KEY) || "").trim();
    return value || null;
  } catch {
    return null;
  }
}

function readConversationIdFromWindow(): string | null {
  if (typeof window === "undefined") return null;
  return readConversationIdFromLocation();
}

function buildConversationOverlayUrl(conversationId: string): string | null {
  if (typeof window === "undefined") return null;

  try {
    const nextUrl = new URL(window.location.href);
    nextUrl.searchParams.set(CONVERSATION_QUERY_KEY, conversationId);
    // A tab-root marker disables native cross-tab gestures. Remove it as soon
    // as the user explicitly enters a conversation so room back/forward
    // gestures remain available within the conversations tab.
    nextUrl.searchParams.delete(NATIVE_TAB_ROOT_QUERY_KEY);
    nextUrl.searchParams.delete(NATIVE_SKIP_CONVERSATION_RESTORE_QUERY_KEY);
    return nextUrl.toString();
  } catch {
    return null;
  }
}

function clearNativeTabRootFromCurrentHistoryEntry(): void {
  if (typeof window === "undefined") return;

  try {
    const currentUrl = new URL(window.location.href);
    if (currentUrl.searchParams.get(NATIVE_TAB_ROOT_QUERY_KEY) !== "1") return;

    // The tab-root marker is only a boundary for the tab switch itself. Once
    // the user explicitly opens a room, convert the current list entry back
    // into an ordinary in-tab entry so room -> list -> room forward navigation
    // remains available.
    currentUrl.searchParams.delete(NATIVE_TAB_ROOT_QUERY_KEY);
    currentUrl.searchParams.delete(NATIVE_SKIP_CONVERSATION_RESTORE_QUERY_KEY);
    window.history.replaceState(window.history.state, "", currentUrl.toString());
    notifyLocationSearchSync();
  } catch {
    // Ignore history synchronization failures in restricted environments.
  }
}

function buildConversationApiPath(suffix = ""): string {
  return buildClientApiPath(`/conversations${suffix}` as `/${string}`);
}

// Browsers fire `popstate` only for back/forward navigation. `pushState` and
// `replaceState` mutate the URL silently, which means anything subscribed to
// the location store via `subscribeToLocationSearch` does not re-read until
// the next user-triggered popstate. We dispatch this event right after every
// programmatic history mutation so the location store stays in sync. Without
// it, `routeConversationId` lags behind `activeConversation` after a close
// and the route-sync effect re-opens the room (auto-reentry loop).
const LOCATION_SEARCH_SYNC_EVENT = "mingle:conversation-location-sync";

function notifyLocationSearchSync(): void {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(new Event(LOCATION_SEARCH_SYNC_EVENT));
  } catch {
    // CustomEvent may not be available in restricted environments.
  }
}

function summarizeConversationHistoryDebugState(state: unknown): Record<string, unknown> {
  if (state === null) return { kind: "null" };
  if (typeof state === "undefined") return { kind: "undefined" };
  if (typeof state !== "object" || Array.isArray(state)) {
    return { kind: typeof state };
  }

  const record = state as Record<string, unknown>;
  const nativeNavigationIndex = record.__MINGLE_NATIVE_NAV_INDEX__;
  return {
    kind: "object",
    conversationId: typeof record.conversationId === "string" ? record.conversationId : null,
    conversationRoute: readConversationHistoryRouteFromState(state),
    nativeNavigationIndex:
      typeof nativeNavigationIndex === "number" && Number.isFinite(nativeNavigationIndex)
        ? nativeNavigationIndex
        : null,
    searchOverlayOpen: record.__mingleConversationSearchOpen === true,
  };
}

function postConversationHistoryDebug(
  event: string,
  details: Record<string, unknown> = {},
): void {
  if (typeof window === "undefined") return;
  if (!readNativeQaBridgeAuthority(window)) return;

  const payload = {
    event,
    timestamp: Date.now(),
    url: window.location.href,
    historyLength: window.history.length,
    historyState: summarizeConversationHistoryDebugState(window.history.state),
    ...details,
  };

  try {
    console.warn("[MingleHistoryDebug]", payload);
    window.ReactNativeWebView?.postMessage(JSON.stringify({
      type: "native_history_debug",
      payload,
    }));
  } catch {
    // Diagnostic logging must never affect navigation.
  }
}

function replaceConversationOverlayUrl(
  conversationId: string | null,
  reason = "unspecified",
): void {
  if (typeof window === "undefined") return;

  try {
    const previousUrl = window.location.href;
    const previousState = window.history.state;
    const nextUrl = new URL(window.location.href);
    if (conversationId) {
      nextUrl.searchParams.set(CONVERSATION_QUERY_KEY, conversationId);
    } else {
      nextUrl.searchParams.delete(CONVERSATION_QUERY_KEY);
    }
    window.history.replaceState(
      buildConversationHistoryState(conversationId, window.history.state),
      "",
      nextUrl.toString(),
    );
    postConversationHistoryDebug("replace-conversation-overlay-url", {
      reason,
      requestedConversationId: conversationId,
      previousUrl,
      previousState: summarizeConversationHistoryDebugState(previousState),
    });
    notifyLocationSearchSync();
  } catch {
    // Ignore history synchronization failures in restricted environments.
  }
}

function pushSearchOverlayHistoryState(): void {
  if (typeof window === "undefined") return;

  try {
    window.history.pushState(
      mergeSearchOverlayHistoryState(window.history.state, true),
      "",
      window.location.href,
    );
  } catch {
    // Ignore history synchronization failures in restricted environments.
  }
}

function replaceSearchOverlayHistoryState(open: boolean): void {
  if (typeof window === "undefined") return;

  try {
    window.history.replaceState(
      mergeSearchOverlayHistoryState(window.history.state, open),
      "",
      window.location.href,
    );
  } catch {
    // Ignore history synchronization failures in restricted environments.
  }
}

function consumeSearchOverlayHistoryCloseAnimationFlag(): boolean {
  if (typeof window === "undefined") return false;

  const conversationWindow = window as ConversationListWindow;
  const shouldAnimate = conversationWindow[SEARCH_OVERLAY_HISTORY_CLOSE_ANIMATE_FLAG] === true;
  conversationWindow[SEARCH_OVERLAY_HISTORY_CLOSE_ANIMATE_FLAG] = false;
  return shouldAnimate;
}

function consumeNativeHistoryCloseAnimationFlag(): boolean {
  if (typeof window === "undefined") return false;

  const conversationWindow = window as ConversationListWindow;
  const shouldAnimate = conversationWindow[NATIVE_HISTORY_BACK_ANIMATE_FLAG] === true;
  conversationWindow[NATIVE_HISTORY_BACK_ANIMATE_FLAG] = false;
  return shouldAnimate;
}

function formatConversationTime(isoTimestamp: string, locale: string): string {
  const timestamp = new Date(isoTimestamp);
  if (Number.isNaN(timestamp.getTime())) return "";

  const now = new Date();
  const isSameDay = timestamp.toDateString() === now.toDateString();

  try {
    if (isSameDay) {
      return new Intl.DateTimeFormat(locale, {
        hour: "numeric",
        minute: "2-digit",
      }).format(timestamp);
    }

    return new Intl.DateTimeFormat(locale, {
      month: "numeric",
      day: "numeric",
    }).format(timestamp);
  } catch {
    return isSameDay
      ? timestamp.toLocaleTimeString()
      : `${timestamp.getMonth() + 1}/${timestamp.getDate()}`;
  }
}

function mapConversationSummaryToItem(
  conversation: ConversationChannelSummary,
  locale: string,
  timeLabelsReady: boolean,
  labels: {
    activeStatusLabel: string;
    pausedStatusLabel: string;
  },
  localStats: ConversationLocalStats = EMPTY_CONVERSATION_LOCAL_STATS,
  interimPreview?: LatestUtterancePayload,
): ConversationItem {
  const title = conversation.title;
  const normalizedInterimPreview = interimPreview?.preview.trim() || "";
  const latestMessagePreview = normalizedInterimPreview || conversation.latestMessagePreview || "";
  const latestMessageAt = interimPreview?.createdAt.trim() || conversation.latestMessageAt || conversation.createdAt;
  const latestSpeaker = interimPreview?.speaker?.trim() || conversation.latestSpeaker || null;
  const latestSpeakerAvatarSeed = interimPreview?.speakerAvatarSeed?.trim()
    || conversation.latestSpeakerAvatarSeed
    || null;
  const latestSpeakerAvatarIndex = typeof interimPreview?.speakerAvatarIndex === "number"
    && Number.isInteger(interimPreview.speakerAvatarIndex)
    ? interimPreview.speakerAvatarIndex
    : conversation.latestSpeakerAvatarIndex ?? null;
  const statusLabel = conversation.status === "active"
    ? labels.activeStatusLabel
    : "";
  const usageDurationLabel = formatLivePhoneDemoUsageDuration(localStats.usageSec);
  const messageCountLabel = formatLivePhoneDemoMessageCount(
    resolveConversationDisplayMessageCount(conversation, localStats.messageCount),
  );
  const selectedLanguages = sanitizeSttLanguageSelection(
    conversation.selectedLanguages,
    deriveDefaultSttLanguagesForLocale(locale),
  );
  const speechLanguages = sanitizeSttLanguageSelection(
    conversation.speechLanguages,
    selectedLanguages,
  );
  const translationLanguagesLinked = conversation.translationLanguagesLinked !== false;
  const effectiveSelectedLanguages = translationLanguagesLinked ? speechLanguages : selectedLanguages;
  const languageCodes = effectiveSelectedLanguages;
  const avatar = getSpeakerAvatar(
    latestSpeaker || conversation.sessionKey,
    latestSpeakerAvatarSeed || conversation.id,
    latestSpeakerAvatarIndex ?? undefined,
  );

  return {
    id: conversation.id,
    title,
    preview: truncateConversationPreview(latestMessagePreview),
    previewFullText: latestMessagePreview,
    timeLabel: timeLabelsReady
      ? formatConversationTime(latestMessageAt, locale)
      : "",
    statsLabel: `${usageDurationLabel} · ${messageCountLabel}`,
    statsFullLabel: `STT ${usageDurationLabel}, ${messageCountLabel}`,
    status: conversation.status,
    statusLabel,
    avatarSrc: avatar.src,
    avatarAlt: `${title} ${avatar.name} avatar`,
    sequenceNumber: conversation.sequenceNumber,
    sessionKey: conversation.sessionKey,
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt,
    pausedAt: conversation.pausedAt,
    selectedLanguages: effectiveSelectedLanguages,
    speechLanguages,
    translationLanguagesLinked,
    languageCodes,
    isInterimPreview: Boolean(normalizedInterimPreview),
  };
}

async function readConversationResponse(response: Response): Promise<ConversationChannelSummary> {
  const body = await response.json() as {
    conversation?: ConversationChannelSummary;
    error?: string;
  };
  if (!response.ok || !body.conversation) {
    throw new Error(body.error || "conversation_request_failed");
  }
  return body.conversation;
}

async function readConversationListResponse(response: Response): Promise<ConversationChannelSummary[]> {
  const body = await response.json() as {
    conversations?: ConversationChannelSummary[];
    error?: string;
  };
  if (!response.ok || !Array.isArray(body.conversations)) {
    throw new Error(body.error || "conversation_request_failed");
  }
  return body.conversations;
}

function buildConversationRequestHeaders(identity?: {
  externalUserId?: string;
  sessionKey?: string;
}): Record<string, string> {
  return buildConversationRequestIdentityHeaders({
    initialExternalUserId: identity?.externalUserId,
    initialSessionKey: identity?.sessionKey,
    fallbackExternalUserId: getOrCreateTrackingUserId(),
    clientApiNamespace,
  });
}

function parseNativeInsetPxFromSearch(search: string, queryKey: string): number {
  try {
    const params = new URLSearchParams(search);
    const raw = (params.get(queryKey) || "").trim();
    if (!raw) return 0;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) return 0;
    return Math.max(0, Math.min(NATIVE_INSET_QUERY_MAX_PX, Math.round(parsed)));
  } catch {
    return 0;
  }
}

function subscribeToLocationSearch(onStoreChange: () => void): () => void {
  if (typeof window === "undefined") return () => {};

  window.addEventListener("popstate", onStoreChange);
  window.addEventListener("hashchange", onStoreChange);
  // Also listen to programmatic history mutations dispatched by
  // notifyLocationSearchSync so subscribers see pushState/replaceState
  // changes on the same render cycle as the call site.
  window.addEventListener(LOCATION_SEARCH_SYNC_EVENT, onStoreChange);
  return () => {
    window.removeEventListener("popstate", onStoreChange);
    window.removeEventListener("hashchange", onStoreChange);
    window.removeEventListener(LOCATION_SEARCH_SYNC_EVENT, onStoreChange);
  };
}

function subscribeToViewportWidth(onStoreChange: () => void): () => void {
  if (typeof window === "undefined") return () => {};

  window.addEventListener("resize", onStoreChange);
  return () => {
    window.removeEventListener("resize", onStoreChange);
  };
}

function readViewportWidthPx(): number {
  if (typeof window === "undefined") return WEB_CANVAS_BASE_WIDTH_PX;
  const width = Number(window.innerWidth);
  if (!Number.isFinite(width) || width <= 0) return WEB_CANVAS_BASE_WIDTH_PX;
  return Math.round(width);
}

function useViewportWidthPx(): number {
  return useSyncExternalStore(
    subscribeToViewportWidth,
    readViewportWidthPx,
    () => WEB_CANVAS_BASE_WIDTH_PX,
  );
}

function resolveEstimatedNativeBannerInsetPx(viewportWidthPx: number): number {
  const canvasScale = viewportWidthPx > 0
    ? Math.min(1, viewportWidthPx / WEB_CANVAS_BASE_WIDTH_PX)
    : 1;
  const safeCanvasScale = canvasScale > 0 ? canvasScale : 1;
  return Math.max(0, Math.round(NATIVE_AD_BANNER_DEFAULT_HEIGHT_PX / safeCanvasScale));
}

function resolveEffectiveNativeBannerInsetPx(
  explicitInsetPx: number,
  estimatedInsetPx: number,
): number {
  return explicitInsetPx > 0 ? explicitInsetPx : estimatedInsetPx;
}

function readNativeInsetPxFromWindow(queryKey: string): number {
  if (typeof window === "undefined") return 0;
  return parseNativeInsetPxFromSearch(window.location.search || "", queryKey);
}

function useNativeInsetPx(queryKey: string, initialValue = 0): number {
  return useSyncExternalStore(
    subscribeToLocationSearch,
    () => readNativeInsetPxFromWindow(queryKey),
    () => initialValue,
  );
}

function parseNativeBannerPositionFromSearch(
  search: string,
  queryKey: string,
): LivePhoneDemoAdBannerPosition | null {
  try {
    const params = new URLSearchParams(search);
    return normalizeLivePhoneDemoAdBannerPosition(params.get(queryKey));
  } catch {
    return null;
  }
}

function readNativeBannerPositionFromWindow(queryKey: string): LivePhoneDemoAdBannerPosition | null {
  if (typeof window === "undefined") return null;
  return parseNativeBannerPositionFromSearch(window.location.search || "", queryKey);
}

function useNativeBannerPositionFromSearch(
  queryKey: string,
  initialValue: LivePhoneDemoAdBannerPosition | null = null,
): LivePhoneDemoAdBannerPosition | null {
  return useSyncExternalStore(
    subscribeToLocationSearch,
    () => readNativeBannerPositionFromWindow(queryKey),
    () => initialValue,
  );
}

function useConversationIdFromSearch(): string | null {
  return useSyncExternalStore(
    subscribeToLocationSearch,
    readConversationIdFromWindow,
    () => null,
  );
}

function readCachedNativeSttStatus(): string | null {
  if (typeof window === "undefined") return null;
  const cached = (window as Window & {
    __MINGLE_LAST_NATIVE_STT_STATUS?: unknown;
  }).__MINGLE_LAST_NATIVE_STT_STATUS;
  return typeof cached === "string" ? cached.trim().toLowerCase() : null;
}

function isNativeSttStatusLive(status: string | null): boolean {
  return status === "running"
    || status === "ready"
    || status === "silenced"
    || status === "starting"
    || status === "connecting"
    || status === "recovering";
}

function readNativeSttStatusEventStatus(event: Event): string | null {
  const detail = (event as CustomEvent<unknown>).detail;
  if (!detail || typeof detail !== "object" || Array.isArray(detail)) return null;
  if ((detail as { type?: unknown }).type !== "status") return null;

  const status = (detail as { status?: unknown }).status;
  return typeof status === "string" ? status.trim().toLowerCase() || null : null;
}

function calculateConversationRowTooltipPos(element: HTMLElement): TooltipPos {
  const rect = element.getBoundingClientRect();
  return calculateConversationRowTooltipPosForRect({
    top: rect.top,
    bottom: rect.bottom,
    left: rect.left,
    width: rect.width,
  }, window.innerHeight);
}

function ConversationRow({
  item,
  disabled = false,
  onSelect,
  onOpenActions,
  className = "",
}: {
  item: ConversationItem;
  disabled?: boolean;
  onSelect?: (item: ConversationItem) => void;
  onOpenActions?: (item: ConversationItem, position: TooltipPos) => void;
  className?: string;
}) {
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const longPressTimerRef = useRef<number | null>(null);
  const touchOriginRef = useRef<{ x: number; y: number } | null>(null);
  const suppressNextClickRef = useRef(false);

  const clearLongPressTimer = useCallback(() => {
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    touchOriginRef.current = null;
  }, []);

  useEffect(() => () => clearLongPressTimer(), [clearLongPressTimer]);

  const openActions = useCallback(() => {
    if (disabled) return;
    const element = buttonRef.current;
    if (!element) return;
    suppressNextClickRef.current = true;
    onOpenActions?.(item, calculateConversationRowTooltipPos(element));
  }, [disabled, item, onOpenActions]);

  return (
    <button
      ref={buttonRef}
      type="button"
      onClick={() => {
        if (suppressNextClickRef.current) {
          suppressNextClickRef.current = false;
          return;
        }
        onSelect?.(item);
      }}
      onContextMenu={(event) => {
        event.preventDefault();
        openActions();
      }}
      onTouchStart={(event) => {
        if (disabled) return;
        const touch = event.touches[0];
        if (!touch) return;
        touchOriginRef.current = { x: touch.clientX, y: touch.clientY };
        longPressTimerRef.current = window.setTimeout(() => {
          longPressTimerRef.current = null;
          openActions();
        }, ROW_ACTION_LONG_PRESS_DELAY_MS);
      }}
      onTouchMove={(event) => {
        const touch = event.touches[0];
        const origin = touchOriginRef.current;
        if (!touch || !origin) return;
        const dx = touch.clientX - origin.x;
        const dy = touch.clientY - origin.y;
        if (Math.hypot(dx, dy) > ROW_ACTION_CANCEL_DISTANCE_PX) {
          clearLongPressTimer();
        }
      }}
      onTouchEnd={() => {
        if (longPressTimerRef.current !== null) {
          clearLongPressTimer();
        }
      }}
      onTouchCancel={() => {
        clearLongPressTimer();
      }}
      disabled={disabled}
      className={`flex w-full select-none items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-gray-50 active:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-60 ${className}`}
      style={CONVERSATION_ROW_TOUCH_SAFE_STYLE}
    >
      <div className="rounded-full bg-gradient-to-br from-rose-50 via-white to-amber-50 p-0.5 shadow-sm ring-1 ring-black/5">
        <Image
          src={item.avatarSrc}
          alt={item.avatarAlt}
          className="h-14 w-14 rounded-full bg-white object-cover"
          width={56}
          height={56}
          draggable={false}
          style={CONVERSATION_AVATAR_IMAGE_STYLE}
          unoptimized
        />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <span className="truncate text-[15px] font-semibold text-slate-900">{item.title}</span>
            {item.languageCodes.length > 0 ? (
              <span className="inline-flex shrink-0 items-center gap-0.5 text-[1rem] leading-none" aria-hidden>
                {item.languageCodes.map((language, index) => (
                  <LanguageFlag
                    key={`${language}-${index}`}
                    language={language}
                    className="text-[1rem] leading-none"
                  />
                ))}
              </span>
            ) : null}
          </div>
          <div className="flex shrink-0 flex-col items-end leading-none">
            <span className={`text-[12px] ${item.isInterimPreview ? "text-gray-300" : "text-gray-400"}`}>
              {item.timeLabel}
            </span>
            <span
              className="mt-1 max-w-[118px] truncate text-[10px] tabular-nums text-gray-400"
              title={item.statsFullLabel}
            >
              {item.statsLabel}
            </span>
          </div>
        </div>
        <div className="mt-1 flex items-center justify-between gap-3">
          <p
            className={`truncate text-[13px] ${item.isInterimPreview ? "italic text-gray-400" : "text-gray-500"}`}
            title={item.previewFullText || undefined}
          >
            {item.preview || "\u00A0"}
            {item.isInterimPreview && item.preview ? "…" : null}
          </p>
          {item.status === "active" ? (
            <span className="shrink-0 rounded-full bg-emerald-100 px-2.5 py-1 text-[10px] font-semibold tracking-[0.08em] text-emerald-700">
              {item.statusLabel}
            </span>
          ) : null}
        </div>
      </div>
    </button>
  );
}

type SearchOverlayHandle = {
  focusInput: () => void;
};

type SearchOverlayProps = {
  open: boolean;
  transitionMode: SearchOverlayTransitionMode;
  onClose: () => void;
  conversations: ConversationItem[];
  copy: ReturnType<typeof getConversationDictionary>;
  onSelectConversation: (item: ConversationItem) => void;
  actionDisabled?: boolean;
};

const SearchOverlay = forwardRef<SearchOverlayHandle, SearchOverlayProps>(function SearchOverlay({
  open,
  transitionMode,
  onClose,
  conversations,
  copy,
  onSelectConversation,
  actionDisabled = false,
}, ref) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const touchStartXRef = useRef<number | null>(null);
  const recentSearches = useSyncExternalStore(
    subscribeRecentSearches,
    readStoredRecentSearches,
    () => EMPTY_RECENT_SEARCHES,
  );

  const blurInput = useCallback(() => {
    inputRef.current?.blur();

    if (typeof document === "undefined") return;
    const activeElement = document.activeElement;
    if (activeElement instanceof HTMLElement) {
      activeElement.blur();
    }
  }, []);

  const focusInput = useCallback(() => {
    const input = inputRef.current;
    if (!input) return;

    input.focus({ preventScroll: true });
    const cursorPosition = input.value.length;
    try {
      input.setSelectionRange(cursorPosition, cursorPosition);
    } catch {
      // Ignore selection failures on unsupported inputs.
    }
  }, []);

  useImperativeHandle(ref, () => ({ focusInput }), [focusInput]);

  useEffect(() => {
    if (!open) {
      blurInput();
      return;
    }

    focusInput();
    const animationFrameId = window.requestAnimationFrame(() => {
      focusInput();
    });
    const timeoutId = window.setTimeout(() => {
      focusInput();
    }, 220);

    return () => {
      window.cancelAnimationFrame(animationFrameId);
      window.clearTimeout(timeoutId);
    };
  }, [blurInput, focusInput, open]);

  const persistRecentSearch = useCallback((rawValue: string) => {
    const normalized = normalizeSearchTerm(rawValue);
    if (!normalized) return;

    writeStoredRecentSearches([
      normalized,
      ...recentSearches.filter(
        (item) => item.toLocaleLowerCase() !== normalized.toLocaleLowerCase(),
      ),
    ].slice(0, MAX_RECENT_SEARCHES));
  }, [recentSearches]);

  const dismissSearch = useCallback(() => {
    persistRecentSearch(query);
    blurInput();
    setQuery("");
    onClose();
  }, [blurInput, onClose, persistRecentSearch, query]);

  const filtered = useMemo(() => {
    const normalizedQuery = normalizeSearchTerm(query).toLocaleLowerCase();
    if (!normalizedQuery) return [];

    return conversations.filter(
      (conversation) =>
        conversation.title.toLocaleLowerCase().includes(normalizedQuery)
        || conversation.preview.toLocaleLowerCase().includes(normalizedQuery),
    );
  }, [conversations, query]);

  const handleSubmit = useCallback((event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    persistRecentSearch(query);
    focusInput();
  }, [focusInput, persistRecentSearch, query]);

  const handleRecentSearchSelect = useCallback((recentSearch: string) => {
    setQuery(recentSearch);
    persistRecentSearch(recentSearch);
    focusInput();
  }, [focusInput, persistRecentSearch]);

  const handleResultSelect = useCallback((item: ConversationItem) => {
    persistRecentSearch(query || item.title);
    onSelectConversation(item);
  }, [onSelectConversation, persistRecentSearch, query]);

  const handleClearRecentSearches = useCallback(() => {
    writeStoredRecentSearches([]);
    focusInput();
  }, [focusInput]);

  const hasQuery = normalizeSearchTerm(query).length > 0;

  return (
    <div
      className="absolute inset-0 z-40 flex flex-col bg-white transition-transform duration-300 ease-in-out"
      style={{
        transform: open ? "translateX(0)" : "translateX(100%)",
        pointerEvents: open ? "auto" : "none",
        transitionDuration: transitionMode === "animate" ? undefined : "0ms",
      }}
      aria-hidden={!open}
      onTouchStart={(event) => {
        touchStartXRef.current = event.touches[0]?.clientX ?? null;
      }}
      onTouchEnd={(event) => {
        const startX = touchStartXRef.current;
        const endX = event.changedTouches[0]?.clientX ?? startX ?? 0;
        touchStartXRef.current = null;

        if (startX !== null && endX - startX > 60) {
          dismissSearch();
        }
      }}
    >
      <form
        onSubmit={handleSubmit}
        className="flex shrink-0 items-center gap-2 border-b border-gray-100 px-4 pb-3"
        style={{
          paddingTop: "calc(env(safe-area-inset-top, 0px) + 10px)",
        }}
      >
        <div className="flex flex-1 items-center gap-2 rounded-xl bg-gray-100 px-3 py-2">
          <Search size={16} className="shrink-0 text-gray-400" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={copy.searchPlaceholder}
            className="flex-1 bg-transparent text-[15px] outline-none placeholder:text-gray-400"
            enterKeyHint="search"
            autoCapitalize="none"
            autoCorrect="off"
          />
        </div>
        <button
          type="button"
          onClick={dismissSearch}
          className="shrink-0 text-[15px] font-medium text-[#7c3aed]"
        >
          {copy.cancelAction}
        </button>
      </form>

      <div className="flex-1 overflow-y-auto pb-[calc(1rem+env(safe-area-inset-bottom,0px))]">
        {hasQuery ? (
          filtered.length === 0 ? (
            <div className="flex flex-col items-center py-16 text-gray-400">
              <p className="text-[14px]">{copy.noSearchResults}</p>
            </div>
          ) : (
            <div className="pt-2">
              {filtered.map((item, index) => (
                <div key={item.id}>
                  <ConversationRow
                    item={item}
                    disabled={actionDisabled}
                    onSelect={handleResultSelect}
                  />
                  {index < filtered.length - 1 && (
                    <div className="mx-4 h-px bg-gray-100" />
                  )}
                </div>
              ))}
            </div>
          )
        ) : (
          <section className="px-4 pb-4 pt-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="text-[13px] font-semibold tracking-[0.08em] text-slate-500">
                {copy.recentSearchesTitle}
              </h2>
              {recentSearches.length > 0 ? (
                <button
                  type="button"
                  onClick={handleClearRecentSearches}
                  className="shrink-0 text-[13px] font-medium text-[#7c3aed]"
                >
                  {copy.clearRecentSearchesAction}
                </button>
              ) : null}
            </div>
            {recentSearches.length === 0 ? (
              <p className="px-1 py-3 text-[14px] text-gray-400">
                {copy.noRecentSearches}
              </p>
            ) : (
              <div className="space-y-1">
                {recentSearches.map((recentSearch) => (
                  <button
                    key={recentSearch}
                    type="button"
                    onClick={() => handleRecentSearchSelect(recentSearch)}
                    className="flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left transition hover:bg-gray-50 active:bg-gray-100"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gray-100">
                      <Search size={16} className="text-gray-400" />
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[15px] text-slate-800">
                      {recentSearch}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
});

type ConversationListProps = {
  locale: AppLocale;
  dictionary: AppDictionary;
  initialConversations: ConversationChannelSummary[];
  initialConversationsRequireRefresh?: boolean;
  initialConversationIdToOpen?: string | null;
  initialPrimaryLanguage?: string | null;
  initialPrimaryLanguages?: string[];
  initialDefaultConversationLanguages?: string[];
  initialNativeUi?: boolean;
  initialNativeBannerPosition?: string;
  initialNativeTopInsetPx?: number;
  initialNativeBottomInsetPx?: number;
  initialNativeListTopInsetPx?: number;
  initialNativeConversationBannerPosition?: string;
  initialNativeConversationBottomInsetPx?: number;
  initialTrackingExternalUserId?: string;
  initialTrackingSessionKey?: string;
  appleOAuthEnabled: boolean;
  googleOAuthEnabled: boolean;
};

export default function ConversationList({
  locale,
  dictionary,
  initialConversations,
  initialConversationsRequireRefresh = false,
  initialConversationIdToOpen = null,
  initialPrimaryLanguage = null,
  initialPrimaryLanguages = [],
  initialDefaultConversationLanguages = [],
  initialNativeUi = false,
  initialNativeBannerPosition,
  initialNativeTopInsetPx = 0,
  initialNativeBottomInsetPx = 0,
  initialNativeListTopInsetPx = 0,
  initialNativeConversationBannerPosition,
  initialNativeConversationBottomInsetPx = 0,
  initialTrackingExternalUserId = "",
  initialTrackingSessionKey = "",
  appleOAuthEnabled,
  googleOAuthEnabled,
}: ConversationListProps) {
  const { data: session, status: sessionStatus } = useSession();
  const authenticatedUserId = typeof session?.user?.id === "string"
    ? session.user.id.trim()
    : "";
  const conversationCacheIdentity = useMemo<ConversationListCacheIdentity>(() => ({
    apiNamespace: clientApiNamespace,
    authenticatedUserId,
    externalUserId: initialTrackingExternalUserId,
  }), [authenticatedUserId, initialTrackingExternalUserId]);
  const [initialWarmSnapshot] = useState(() => {
    if (
      !initialNativeUi
      || initialConversations.length > 0
      || sessionStatus !== "authenticated"
    ) {
      return null;
    }
    return readConversationListMemoryCache(conversationCacheIdentity);
  });
  const initialListState = resolveConversationListInitialState({
    initialConversations,
    initialConversationsRequireRefresh,
    warmSnapshot: initialWarmSnapshot,
  });
  const initialConversationToOpen = initialConversationIdToOpen
    ? initialListState.conversations.find(
        (conversation) => conversation.id === initialConversationIdToOpen,
      ) ?? null
    : null;
  const copy = useMemo(
    () => getConversationDictionary(locale, dictionary),
    [dictionary, locale],
  );
  const roomManagementCopy = useMemo(
    () => resolveLivePhoneDemoRoomManagementCopy(locale),
    [locale],
  );
  const deleteConversationCopy = useMemo(
    () => resolveLivePhoneDemoConversationDeleteCopy(locale),
    [locale],
  );
  const [showSearch, setShowSearch] = useState(false);
  const [searchTransitionMode, setSearchTransitionMode] = useState<SearchOverlayTransitionMode>("animate");
  const [showNotifications, setShowNotifications] = useState(false);
  const [notificationProfileId, setNotificationProfileId] = useState<string | null>(null);
  const [unreadNotificationCount, setUnreadNotificationCount] = useState(0);
  const [isCreatingConversation, setIsCreatingConversation] = useState(false);
  const [mutatingConversationId, setMutatingConversationId] = useState<string | null>(null);
  const [isHydratingConversations, setIsHydratingConversations] = useState(
    !initialListState.hasSnapshot,
  );
  const [isImportingLegacyConversation, setIsImportingLegacyConversation] = useState(false);
  const [isRefreshingConversations, setIsRefreshingConversations] = useState(false);
  const [conversations, setConversations] = useState<ConversationChannelSummary[]>(
    [...initialListState.conversations].sort(compareConversationRecency),
  );
  const normalizedInitialPrimaryLanguage = initialPrimaryLanguage?.trim() || null;
  const normalizedInitialPrimaryLanguages = sanitizeSttLanguageSelection(
    initialPrimaryLanguages,
    normalizedInitialPrimaryLanguage ? [normalizedInitialPrimaryLanguage] : [],
  );
  const normalizedInitialDefaultConversationLanguages = sanitizeSttLanguageSelection(
    initialDefaultConversationLanguages,
  );
  const [defaultSelectedLanguages, setDefaultSelectedLanguages] = useState<string[]>(() => (
    normalizedInitialDefaultConversationLanguages.length > 0
      ? normalizedInitialDefaultConversationLanguages
      : deriveDefaultConversationLanguages(normalizedInitialPrimaryLanguage, locale)
  ));
  const defaultConversationLanguagesSyncVersionRef = useRef(0);
  const [preferredDisplayLanguages, setPreferredDisplayLanguages] = useState<string[]>(
    normalizedInitialPrimaryLanguages,
  );
  const preferredDisplayLanguage = preferredDisplayLanguages[0] ?? null;
  useEffect(() => {
    const needsProfileHydration = (
      normalizedInitialPrimaryLanguages.length === 0
      || normalizedInitialDefaultConversationLanguages.length === 0
    );
    if (!needsProfileHydration || sessionStatus !== "authenticated") return;

    const controller = new AbortController();
    const hydrationVersion = defaultConversationLanguagesSyncVersionRef.current;
    void fetch(buildClientApiPath("/profile"), {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) return null;
        return await response.json() as {
          nationality?: unknown;
          primaryLanguages?: unknown;
          defaultConversationLanguages?: unknown;
        };
      })
      .then((profile) => {
        if (!profile || hydrationVersion !== defaultConversationLanguagesSyncVersionRef.current) return;
        const profileLanguages = Array.isArray(profile.primaryLanguages)
          ? profile.primaryLanguages
          : profile.nationality;
        const normalizedProfileLanguages = sanitizeSttLanguageSelection(profileLanguages);
        setPreferredDisplayLanguages(normalizedProfileLanguages);

        const storedDefaultLanguages = sanitizeSttLanguageSelection(profile.defaultConversationLanguages);
        const pendingDefaultLanguages = readPendingDefaultConversationLanguages();
        setDefaultSelectedLanguages(
          storedDefaultLanguages.length > 0
            ? storedDefaultLanguages
            : pendingDefaultLanguages.length > 0
              ? pendingDefaultLanguages
              : deriveDefaultConversationLanguages(normalizedProfileLanguages, locale),
        );
      })
      .catch(() => {
        // The conversation UI can fall back to the utterance source language.
      });

    return () => controller.abort();
  }, [locale, normalizedInitialDefaultConversationLanguages.length, normalizedInitialPrimaryLanguages.length, sessionStatus]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleDefaultConversationLanguagesSync = (event: Event) => {
      const detail = (event as CustomEvent<unknown>).detail;
      const nextLanguages = sanitizeSttLanguageSelection(
        Array.isArray(detail)
          ? detail
          : detail && typeof detail === "object" && Array.isArray((detail as { languages?: unknown }).languages)
            ? (detail as { languages: unknown[] }).languages
            : [],
      );
      if (nextLanguages.length > 0) {
        defaultConversationLanguagesSyncVersionRef.current += 1;
        setDefaultSelectedLanguages(nextLanguages);
      }
    };

    window.addEventListener(
      DEFAULT_CONVERSATION_LANGUAGES_SYNC_EVENT,
      handleDefaultConversationLanguagesSync as EventListener,
    );
    return () => window.removeEventListener(
      DEFAULT_CONVERSATION_LANGUAGES_SYNC_EVENT,
      handleDefaultConversationLanguagesSync as EventListener,
    );
  }, []);
  const [conversationInterimPreviews, setConversationInterimPreviews] = useState<
    Record<string, LatestUtterancePayload>
  >({});
  const [conversationLocalStats, setConversationLocalStats] = useState<Record<string, ConversationLocalStats>>(
    initialListState.localStats,
  );
  const [nativeBannerLayout, setNativeBannerLayout] = useState<NativeUiBannerLayoutEventDetail | null>(null);
  const [activeConversation, setActiveConversation] = useState<ConversationChannelSummary | null>(initialConversationToOpen);
  const [liveConversationId, setLiveConversationId] = useState<string | null>(null);
  const [autoStartConversationId, setAutoStartConversationId] = useState<string | null>(null);
  const [isClientReady, setIsClientReady] = useState(false);
  const [isNativeRuntime, setIsNativeRuntime] = useState(false);
  const [languageOnboardingPhase, setLanguageOnboardingPhase] = useState<LanguageOnboardingPhase>("resolving");
  const languageOnboardingModalOpen = languageOnboardingPhase === "selection";
  const [nativeSttStatus, setNativeSttStatus] = useState<string | null>(null);
  const [overlayEnterMode, setOverlayEnterMode] = useState<ConversationOverlayEnterMode>("animate");
  const [overlayExitMode, setOverlayExitMode] = useState<ConversationOverlayExitMode>("animate");
  const [timeLabelsReady, setTimeLabelsReady] = useState(initialListState.timeLabelsReady);
  const [rowActionMenu, setRowActionMenu] = useState<ConversationRowActionMenuState | null>(null);
  const [renameDialogConversationId, setRenameDialogConversationId] = useState<string | null>(null);
  const [renameConversationValue, setRenameConversationValue] = useState("");
  const [isRenamingConversation, setIsRenamingConversation] = useState(false);
  const [deleteDialogConversationId, setDeleteDialogConversationId] = useState<string | null>(null);
  const [isDeletingConversation, setIsDeletingConversation] = useState(false);
  const searchOverlayRef = useRef<SearchOverlayHandle>(null);
  const notificationProfileIdRef = useRef<string | null>(null);
  const conversationListScrollRef = useRef<HTMLDivElement | null>(null);
  const rowActionMenuRef = useRef<HTMLDivElement | null>(null);
  const conversationRoomRefs = useRef(new Map<string, MingleHomeRef | null>());
  // Speech, translation, and link PATCHes all mutate one language setting surface.
  // Share a version counter so stale responses from any one kind cannot clobber another.
  const languageSettingsSyncVersionRef = useRef(new Map<string, number>());
  // Status PATCH (active/paused) is much slower on devbox (3-5s) than App Store; without
  // a per-conversation guard, an in-flight active response can land after a paused
  // response and re-flip local state. Track the latest mutation version + abort the
  // previous controller so stale responses are dropped instead of overwriting state.
  const statusMutationVersionRef = useRef<MutationVersionTracker<string>>(createMutationVersionTracker<string>());
  const statusMutationAbortRef = useRef(new Map<string, AbortController>());
  const liveConversationIdRef = useRef<string | null>(null);
  const conversationRunningStateRef = useRef(new Map<string, boolean>());
  const deletingConversationIdsRef = useRef(new Set<string>());
  const nativeSttRestoreAttemptedRef = useRef(false);
  const nativeTabRootRestoreHandledRef = useRef<string | null>(null);
  // Track the last conversation ID manually closed by the user (conversationId-scoped).
  // Native STT restore must not re-open it automatically, but an explicit browser
  // history forward to the room must still restore it.
  const suppressNativeSttRestoreConversationIdRef = useRef<string | null>(null);
  // A popstate event is the browser's explicit back/forward signal. Keep its
  // latest room/list target separate from the STT suppression flag so a forward
  // gesture is never mistaken for an automatic native restore.
  const conversationHistoryPopStateTargetRef = useRef<ConversationHistoryPopStateTarget | null>(null);
  // Capture the transition before the location store's bubble-phase listener
  // can synchronously re-render and run route-sync. This is the authoritative
  // ownership record for an iOS back/forward gesture.
  const conversationHistoryPopStateTransitionRef = useRef<ConversationHistoryPopStateTransition | null>(null);
  // The app-driven back button closes the overlay before calling history.back().
  // Keep route-sync from rewriting that still-current room entry into a list
  // entry before the browser finishes the history navigation.
  const pendingConversationHistoryBackRef = useRef(false);
  const suppressRowActionMenuUntilRef = useRef(0);
  const activeConversationRef = useRef<ConversationChannelSummary | null>(null);
  const conversationsRef = useRef<ConversationChannelSummary[]>(conversations);
  const hasConversationListSnapshotRef = useRef(initialListState.hasSnapshot);
  const initialTrackingIdentityRef = useRef({
    externalUserId: initialTrackingExternalUserId.trim(),
    sessionKey: initialTrackingSessionKey.trim(),
  });
  const isCreatingConversationRef = useRef(isCreatingConversation);
  const mutatingConversationIdRef = useRef<string | null>(mutatingConversationId);
  const isImportingLegacyConversationRef = useRef(false);
  const pendingHistoryCloseAnimationRef = useRef<ConversationOverlayExitMode>("instant");
  const routeSyncConversationIdRef = useRef<string | null>(null);
  const pullRefreshStartYRef = useRef<number | null>(null);
  const pullRefreshTrackingRef = useRef(false);
  const viewportWidthPx = useViewportWidthPx();
  const legacyNativeBannerPositionFromQuery = useNativeBannerPositionFromSearch(
    "nativeBannerPosition",
    normalizeLivePhoneDemoAdBannerPosition(initialNativeBannerPosition),
  );
  const nativeConversationBannerPositionFromQuery = useNativeBannerPositionFromSearch(
    "nativeConversationBannerPosition",
    normalizeLivePhoneDemoAdBannerPosition(initialNativeConversationBannerPosition),
  );
  const legacyNativeTopInsetPx = useNativeInsetPx("nativeTopInsetPx", initialNativeTopInsetPx);
  const legacyNativeBottomInsetPx = useNativeInsetPx("nativeBottomInsetPx", initialNativeBottomInsetPx);
  const nativeListTopInsetPx = useNativeInsetPx("nativeListTopInsetPx", initialNativeListTopInsetPx);
  const nativeConversationBottomInsetPx = useNativeInsetPx("nativeConversationBottomInsetPx", initialNativeConversationBottomInsetPx);
  const routeConversationId = useConversationIdFromSearch();
  const hasNativeBannerLayout = nativeBannerLayout !== null;
  const hasNativeRuntimeInsets = initialNativeUi || isNativeRuntime;
  const runtimeNativeListTopInsetPx = nativeBannerLayout?.position === "top" && (nativeBannerLayout.topInsetPx ?? 0) > 0
    ? (nativeBannerLayout!.topInsetPx)
    : (nativeListTopInsetPx > 0
        ? nativeListTopInsetPx
        : (legacyNativeBannerPositionFromQuery === "top" ? legacyNativeTopInsetPx : 0));
  const runtimeNativeConversationBannerPosition =
    nativeBannerLayout?.position === "bottom" || nativeBannerLayout?.position === "top"
      ? nativeBannerLayout.position
      : nativeConversationBannerPositionFromQuery ?? legacyNativeBannerPositionFromQuery;
  const runtimeNativeConversationBottomInsetPx = nativeBannerLayout?.position === "bottom" && (nativeBannerLayout.bottomInsetPx ?? 0) > 0
    ? (nativeBannerLayout!.bottomInsetPx)
    : (nativeConversationBottomInsetPx > 0
        ? nativeConversationBottomInsetPx
        : (legacyNativeBannerPositionFromQuery === "bottom" ? legacyNativeBottomInsetPx : 0));
  const estimatedNativeBannerInsetPx = resolveEstimatedNativeBannerInsetPx(viewportWidthPx);
  const effectiveNativeTopInsetPx = hasNativeRuntimeInsets
    ? resolveEffectiveNativeBannerInsetPx(runtimeNativeListTopInsetPx, estimatedNativeBannerInsetPx)
    : runtimeNativeListTopInsetPx;
  const effectiveNativeBottomInsetPx = activeConversation && hasNativeRuntimeInsets && runtimeNativeConversationBannerPosition === "bottom"
    ? (hasNativeBannerLayout && runtimeNativeConversationBottomInsetPx > 0
        ? runtimeNativeConversationBottomInsetPx
        : resolveEffectiveNativeBannerInsetPx(runtimeNativeConversationBottomInsetPx, estimatedNativeBannerInsetPx))
    : 0;
  const conversationListScrollPaddingBottomPx = CONVERSATION_CREATE_BUTTON_HEIGHT_PX + 20;

  useEffect(() => {
    if (languageOnboardingPhase !== "ready") return;
    if (sessionStatus !== "authenticated" || !authenticatedUserId) return;

    const pendingDefaultLanguages = readPendingDefaultConversationLanguages();
    if (pendingDefaultLanguages.length === 0) return;
    const pendingPrimaryLanguages = readPendingPrimaryLanguages();
    const onboardingPrimaryLanguages = pendingPrimaryLanguages.length > 0
      ? pendingPrimaryLanguages
      : pendingDefaultLanguages.slice(0, 1);

    let cancelled = false;

    const syncPendingLanguagePreferences = async () => {
      try {
        const profileResponse = await fetch(buildClientApiPath("/profile"), {
          cache: "no-store",
        });
        if (!profileResponse.ok) return;

        const profile = await profileResponse.json() as ProfileLanguagePreferencesPayload;
        if (cancelled) return;

        const resolvedPreferences = resolveOnboardingLanguagePreferences(
          profile,
          onboardingPrimaryLanguages,
          pendingDefaultLanguages,
        );

        if (Object.keys(resolvedPreferences.patch).length === 0) {
          defaultConversationLanguagesSyncVersionRef.current += 1;
          setPreferredDisplayLanguages(resolvedPreferences.primaryLanguages);
          setDefaultSelectedLanguages(resolvedPreferences.defaultConversationLanguages);
          clearPendingLanguagePreferences();
          return;
        }

        const saveResponse = await fetch(buildClientApiPath("/profile"), {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(resolvedPreferences.patch),
        });
        if (!saveResponse.ok || cancelled) return;

        const savedProfile = await saveResponse.json() as ProfileLanguagePreferencesPayload;
        if (cancelled) return;

        const savedPreferences = resolveOnboardingLanguagePreferences(
          savedProfile,
          resolvedPreferences.primaryLanguages,
          resolvedPreferences.defaultConversationLanguages,
        );
        defaultConversationLanguagesSyncVersionRef.current += 1;
        setPreferredDisplayLanguages(savedPreferences.primaryLanguages);
        setDefaultSelectedLanguages(savedPreferences.defaultConversationLanguages);
        clearPendingLanguagePreferences();
      } catch {
        // Keep the pending marker so a later authenticated launch can retry the claim.
      }
    };

    void syncPendingLanguagePreferences();

    return () => {
      cancelled = true;
    };
  }, [authenticatedUserId, languageOnboardingPhase, sessionStatus]);

  const conversationItems = useMemo(
    () => conversations.map((conversation) => (
      mapConversationSummaryToItem(
        conversation,
        locale,
        timeLabelsReady,
        copy,
        conversationLocalStats[conversation.id],
        conversationInterimPreviews[conversation.id],
      )
    )),
    [conversationInterimPreviews, conversationLocalStats, conversations, copy, locale, timeLabelsReady],
  );
  const mountedConversationIds = useMemo(() => {
    const ids = new Set<string>();
    if (activeConversation?.id) {
      ids.add(activeConversation.id);
    }
    if (liveConversationId) {
      ids.add(liveConversationId);
    }
    return [...ids];
  }, [activeConversation?.id, liveConversationId]);
  const mountedConversations = useMemo(() => (
    mountedConversationIds
      .map((conversationId) => conversations.find((conversation) => conversation.id === conversationId) || null)
      .filter((conversation): conversation is ConversationChannelSummary => conversation !== null)
  ), [conversations, mountedConversationIds]);
  const actionDisabled = isCreatingConversation || isImportingLegacyConversation || mutatingConversationId !== null;
  const conversationSelectionDisabled = isCreatingConversation || isImportingLegacyConversation;
  const [pullRefreshDistance, setPullRefreshDistance] = useState(0);
  const effectivePullRefreshOffsetPx = isRefreshingConversations
    ? LIST_PULL_REFRESH_TRIGGER_PX
    : pullRefreshDistance;
  const pullRefreshProgress = Math.min(
    1,
    effectivePullRefreshOffsetPx / LIST_PULL_REFRESH_TRIGGER_PX,
  );

  const refreshConversationLocalStats = useCallback((sourceConversations: ConversationChannelSummary[]) => {
    if (typeof window === "undefined") return;
    const nextSnapshot = buildConversationLocalStatsSnapshot(sourceConversations);
    setConversationLocalStats((current) => (
      areConversationLocalStatsSnapshotsEqual(current, nextSnapshot)
        ? current
        : nextSnapshot
    ));
  }, []);

  const handleConversationStatsChange = useCallback((
    conversationId: string,
    payload: ConversationLocalStats,
  ) => {
    const nextStats: ConversationLocalStats = {
      usageSec: normalizeConversationStatsValue(payload.usageSec),
      messageCount: normalizeConversationStatsValue(payload.messageCount),
    };

    setConversationLocalStats((current) => (
      areConversationLocalStatsEqual(current[conversationId], nextStats)
        ? current
        : {
            ...current,
            [conversationId]: nextStats,
          }
    ));
  }, []);

  const resetPullRefresh = useCallback(() => {
    pullRefreshStartYRef.current = null;
    pullRefreshTrackingRef.current = false;
    setPullRefreshDistance(0);
  }, []);

  const setSearchOverlayVisible = useCallback((
    nextVisible: boolean,
    transitionMode: SearchOverlayTransitionMode,
  ) => {
    setSearchTransitionMode(transitionMode);
    setShowSearch(nextVisible);
  }, []);

  const closeSearchOverlay = useCallback((options?: {
    transitionMode?: SearchOverlayTransitionMode;
    syncHistory?: "back" | "replace" | "none";
  }) => {
    const transitionMode = options?.transitionMode ?? "animate";
    const syncHistory = options?.syncHistory ?? "none";

    if (syncHistory === "back" && isSearchOverlayHistoryOpen(window.history.state)) {
      const conversationWindow = window as ConversationListWindow;
      conversationWindow[SEARCH_OVERLAY_HISTORY_CLOSE_ANIMATE_FLAG] = transitionMode === "animate";
      window.history.back();
      return;
    }

    if (syncHistory === "replace") {
      replaceSearchOverlayHistoryState(false);
    }

    setSearchOverlayVisible(false, transitionMode);
  }, [setSearchOverlayVisible]);

  const openSearchOverlay = useCallback((options?: {
    transitionMode?: SearchOverlayTransitionMode;
    syncHistory?: "push" | "none";
  }) => {
    const transitionMode = options?.transitionMode ?? "animate";
    const syncHistory = options?.syncHistory ?? "none";

    if (syncHistory === "push" && !isSearchOverlayHistoryOpen(window.history.state)) {
      pushSearchOverlayHistoryState();
    }

    setSearchOverlayVisible(true, transitionMode);
    window.requestAnimationFrame(() => {
      searchOverlayRef.current?.focusInput();
    });
    window.setTimeout(() => {
      searchOverlayRef.current?.focusInput();
    }, 180);
  }, [setSearchOverlayVisible]);

  const refreshConversationList = useCallback(async (options?: { replaceCurrent?: boolean }) => {
    const response = await fetch(
      initialNativeUi
        ? buildConversationApiPath("?view=native-list")
        : buildConversationApiPath(),
      {
        cache: "no-store",
        headers: buildConversationRequestHeaders(initialTrackingIdentityRef.current),
      },
    );
    const nextConversations = await readConversationListResponse(response);
    const nextLocalStats = buildConversationLocalStatsSnapshot(nextConversations);
    hasConversationListSnapshotRef.current = true;
    writeConversationListCache(
      conversationCacheIdentity,
      nextConversations,
      nextLocalStats,
    );
    setConversationLocalStats((current) => (
      areConversationLocalStatsSnapshotsEqual(current, nextLocalStats)
        ? current
        : nextLocalStats
    ));
    setConversations((current) => (
      options?.replaceCurrent
        ? replaceConversationLists(current, nextConversations)
        : mergeConversationLists(current, nextConversations)
    ));
    return nextConversations;
  }, [conversationCacheIdentity, initialNativeUi]);

  const triggerPullToRefresh = useCallback(async () => {
    if (isRefreshingConversations || isHydratingConversations || activeConversation || showSearch) {
      return;
    }

    setIsRefreshingConversations(true);
    try {
      await refreshConversationList({ replaceCurrent: true });
    } catch {
      // Keep the current list when the refresh request fails.
    } finally {
      setIsRefreshingConversations(false);
      setPullRefreshDistance(0);
    }
  }, [
    activeConversation,
    isHydratingConversations,
    isRefreshingConversations,
    refreshConversationList,
    showSearch,
  ]);

  const updateConversationStatus = useCallback(async (
    conversationId: string,
    status: "active" | "paused",
    options?: { signal?: AbortSignal },
  ) => {
    setMutatingConversationId(conversationId);
    try {
      // Retry transient read-after-write/5xx failures once. On devbox a brand
      // new conversation can return 404 on its first status PATCH because the
      // create write has not yet propagated to read replicas; without this
      // retry the user sees a misleading "failed to open" alert after pressing
      // "start new conversation" even though the conversation exists.
      let response: Response | undefined;
      for (let attempt = 0; attempt < 2; attempt += 1) {
        response = await fetch(buildConversationApiPath(`/${conversationId}`), {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            ...buildConversationRequestHeaders(initialTrackingIdentityRef.current),
          },
          body: JSON.stringify({ status }),
          signal: options?.signal,
        });
        const transient = response.status === 404 || response.status >= 500;
        if (!transient || attempt === 1) break;
        if (response.status === 404 && deletingConversationIdsRef.current.has(conversationId)) {
          // Conversation is being deleted; do not retry. Caller treats this as a no-op.
          break;
        }
        await new Promise<void>((resolve) => {
          const handle = window.setTimeout(resolve, 500);
          options?.signal?.addEventListener(
            "abort",
            () => {
              window.clearTimeout(handle);
              resolve();
            },
            { once: true },
          );
        });
        if (options?.signal?.aborted) break;
      }
      if (!response) return null;
      if (response.status === 404 && deletingConversationIdsRef.current.has(conversationId)) {
        return null;
      }
      // Caller is responsible for the version-guarded state write so that a stale
      // response cannot overwrite local state set by a newer mutation.
      return await readConversationResponse(response);
    } finally {
      setMutatingConversationId((current) => (
        current === conversationId ? null : current
      ));
    }
  }, []);

  const handleConversationDeleted = useCallback((conversationId: string) => {
    deletingConversationIdsRef.current.add(conversationId);
    replaceConversationOverlayUrl(null, "conversation-deleted");
    postNativeBannerZone("hidden");
    setOverlayExitMode("instant");
    setAutoStartConversationId((current) => (
      current === conversationId ? null : current
    ));
    setLiveConversationId((current) => (
      current === conversationId ? null : current
    ));
    languageSettingsSyncVersionRef.current.delete(conversationId);
    conversationRunningStateRef.current.delete(conversationId);
    conversationRoomRefs.current.delete(conversationId);
    setActiveConversation((current) => (
      current?.id === conversationId ? null : current
    ));
    setConversations((current) => current.filter((conversation) => conversation.id !== conversationId));
  }, []);

  const handleRenameConversationFromList = useCallback(async () => {
    if (isRenamingConversation || !renameDialogConversationId) return;

    const normalizedTitle = renameConversationValue.trim();
    if (!normalizedTitle) {
      window.alert(roomManagementCopy.renameEmptyMessage);
      return;
    }

    setIsRenamingConversation(true);
    try {
      const response = await fetch(buildConversationApiPath(`/${renameDialogConversationId}`), {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...buildConversationRequestHeaders(initialTrackingIdentityRef.current),
        },
        body: JSON.stringify({ title: normalizedTitle }),
      });
      const nextConversation = await readConversationResponse(response);
      setConversations((current) => upsertConversation(current, nextConversation));
      setRenameDialogConversationId(null);
      setRenameConversationValue("");
    } catch {
      window.alert(roomManagementCopy.renameErrorToastLabel);
    } finally {
      setIsRenamingConversation(false);
    }
  }, [
    isRenamingConversation,
    renameConversationValue,
    renameDialogConversationId,
    roomManagementCopy.renameEmptyMessage,
    roomManagementCopy.renameErrorToastLabel,
  ]);

  const handleDeleteConversationFromList = useCallback(async () => {
    if (isDeletingConversation || !deleteDialogConversationId) return;

    setIsDeletingConversation(true);
    try {
      deletingConversationIdsRef.current.add(deleteDialogConversationId);
      const roomRef = conversationRoomRefs.current.get(deleteDialogConversationId);
      if (roomRef?.isSttSessionRunning()) {
        try {
          roomRef.prepareForDeletion?.();
          await roomRef.stopRecording({ deferRunningStateChange: true, discardPendingFinalization: true });
        } catch {
          // Ignore stop races and continue deleting the room.
        }
      }

      const response = await fetch(buildConversationApiPath(`/${deleteDialogConversationId}`), {
        method: "DELETE",
        headers: buildConversationRequestHeaders(initialTrackingIdentityRef.current),
      });
      const body = await response.json().catch(() => ({})) as { deletedConversationId?: string; error?: string };
      if (response.status === 404) {
        handleConversationDeleted(deleteDialogConversationId);
        setDeleteDialogConversationId(null);
        return;
      }
      if (!response.ok || !body.deletedConversationId) {
        throw new Error(body.error || "conversation_delete_failed");
      }

      handleConversationDeleted(body.deletedConversationId);
      setDeleteDialogConversationId(null);
    } catch {
      deletingConversationIdsRef.current.delete(deleteDialogConversationId);
      window.alert(deleteConversationCopy.errorToastLabel);
    } finally {
      setIsDeletingConversation(false);
    }
  }, [
    deleteConversationCopy.errorToastLabel,
    deleteDialogConversationId,
    handleConversationDeleted,
    isDeletingConversation,
  ]);

  const setConversationRoomRef = useCallback((conversationId: string, nextRef: MingleHomeRef | null) => {
    if (nextRef) {
      conversationRoomRefs.current.set(conversationId, nextRef);
    } else {
      conversationRoomRefs.current.delete(conversationId);
    }
  }, []);

  const applyRunningConversationState = useCallback((
    conversationId: string,
    isRunning: boolean,
  ) => {
    const nowIso = new Date().toISOString();
    setConversations((current) => current.map((conversation) => {
      if (conversation.id === conversationId) {
        return updateConversationSummaryStatus(
          conversation,
          isRunning ? "active" : "paused",
          nowIso,
        );
      }
      if (!isRunning) {
        return conversation;
      }
      if (conversation.status !== "active") {
        return conversation;
      }
      return updateConversationSummaryStatus(conversation, "paused", nowIso);
    }).sort(compareConversationRecency));
  }, []);

  const getDerivedConversationRunningState = useCallback((conversationId: string): boolean => {
    const storedRunningState = conversationRunningStateRef.current.get(conversationId);
    if (typeof storedRunningState === "boolean") {
      return storedRunningState;
    }
    const conversation = conversationsRef.current.find((item) => item.id === conversationId);
    return conversation?.status === "active";
  }, []);

  const handleConversationStartRequested = useCallback(async (conversationId: string) => {
    const currentLiveConversationId = liveConversationIdRef.current;
    if (!currentLiveConversationId || currentLiveConversationId === conversationId) {
      return { switchedFromLiveConversation: false };
    }

    const currentLiveRoom = conversationRoomRefs.current.get(currentLiveConversationId);
    await currentLiveRoom?.stopRecording({ deferRunningStateChange: true });
    return { switchedFromLiveConversation: true };
  }, []);

  const handleConversationRunningChange = useCallback((conversationId: string, isRunning: boolean) => {
    if (deletingConversationIdsRef.current.has(conversationId)) {
      conversationRunningStateRef.current.set(conversationId, isRunning);
      if (!isRunning) {
        setLiveConversationId((current) => (
          current === conversationId ? null : current
        ));
        setAutoStartConversationId((current) => (
          current === conversationId ? null : current
        ));
      }
      return;
    }

    const previousRunning = getDerivedConversationRunningState(conversationId);
    if (previousRunning === isRunning) {
      return;
    }
    conversationRunningStateRef.current.set(conversationId, isRunning);

    applyRunningConversationState(conversationId, isRunning);
    setLiveConversationId((current) => {
      if (isRunning) return conversationId;
      return current === conversationId ? null : current;
    });
    if (isRunning) {
      setAutoStartConversationId((current) => (
        current === conversationId ? null : current
      ));
    }

    const nextStatus = isRunning ? "active" : "paused";
    const previousController = statusMutationAbortRef.current.get(conversationId);
    if (previousController) {
      previousController.abort();
    }
    const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    if (controller) {
      statusMutationAbortRef.current.set(conversationId, controller);
    }
    const version = statusMutationVersionRef.current.next(conversationId);
    const apiPath = buildConversationApiPath(`/${conversationId}`);
    const releaseAbort = () => {
      if (controller && statusMutationAbortRef.current.get(conversationId) === controller) {
        statusMutationAbortRef.current.delete(conversationId);
      }
    };

    void updateConversationStatus(conversationId, nextStatus, controller ? { signal: controller.signal } : undefined)
      .then((nextConversation) => {
        releaseAbort();
        if (!nextConversation) return;
        if (!statusMutationVersionRef.current.isLatest(conversationId, version)) {
          // Stale success: a newer status mutation has been issued; do not let this
          // older response clobber local state set by the newer mutation.
          return;
        }
        setConversations((current) => upsertConversation(current, nextConversation));
      })
      .catch((error: unknown) => {
        releaseAbort();
        const aborted = isAbortLikeMutationError(error);
        const stale = !statusMutationVersionRef.current.isLatest(conversationId, version);
        if (aborted) {
          // A newer status mutation already replaced this one — silent on purpose.
          return;
        }
        if (stale) {
          logConversationMutationFailure({
            label: "status-change",
            conversationId,
            method: "PATCH",
            path: apiPath,
            error,
            stale: true,
          });
          return;
        }
        if (deletingConversationIdsRef.current.has(conversationId)) {
          return;
        }

        // Native runtime principle: "actual native STT state takes priority over PATCH responses".
        // Rolling back UI/STT state on a PATCH failure causes a mismatch with the native layer,
        // which triggers the restore-loop / re-entry bug. In native runtime, do not flip
        // status or clear liveConversationId — only log the failure.
        const isNativeRuntime = isNativeAppRuntime();
        if (isNativeRuntime) {
          logConversationMutationFailure({
            label: "status-change",
            conversationId,
            method: "PATCH",
            path: apiPath,
            error,
            stale: false,
          });
          // Silent — no alert. Server sync will naturally converge on the next status change.
          return;
        }

        // Non-native (direct browser) environments keep the original rollback behaviour.
        setConversations((current) => {
          const conversation = current.find((item) => item.id === conversationId);
          if (!conversation) return current;
          return upsertConversation(
            current,
            updateConversationSummaryStatus(
              conversation,
              isRunning ? "paused" : "active",
            ),
          );
        });
        if (isRunning) {
          setLiveConversationId((current) => (
            current === conversationId ? null : current
          ));
        }
        logConversationMutationFailure({
          label: "status-change",
          conversationId,
          method: "PATCH",
          path: apiPath,
          error,
          stale: false,
        });
        window.alert(
          isRunning ? copy.openErrorMessage : copy.pauseErrorMessage,
        );
      });
  }, [applyRunningConversationState, copy.openErrorMessage, copy.pauseErrorMessage, getDerivedConversationRunningState, updateConversationStatus]);

  const handleConversationSelectedLanguagesChange = useCallback((
    conversationId: string,
    nextSelectedLanguages: string[],
  ) => {
    const normalizedSelectedLanguages = sanitizeSttLanguageSelection(
      nextSelectedLanguages,
      defaultSelectedLanguages,
    );
    if (normalizedSelectedLanguages.length === 0) {
      return;
    }

    const previousConversation = conversationsRef.current.find(
      (conversation) => conversation.id === conversationId,
    );
    if (!previousConversation) return;

    const previousSelectedLanguages = sanitizeSttLanguageSelection(
      previousConversation.selectedLanguages,
      defaultSelectedLanguages,
    );
    const previousTranslationLanguagesLinked = previousConversation.translationLanguagesLinked !== false;

    const nextVersion = (languageSettingsSyncVersionRef.current.get(conversationId) ?? 0) + 1;
    languageSettingsSyncVersionRef.current.set(conversationId, nextVersion);

    setConversations((current) => current.map((conversation) => (
      conversation.id === conversationId
        ? {
            ...conversation,
            selectedLanguages: [...normalizedSelectedLanguages],
            translationLanguagesLinked: false,
          }
        : conversation
    )));

    void fetch(buildConversationApiPath(`/${conversationId}`), {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        ...buildConversationRequestHeaders(initialTrackingIdentityRef.current),
      },
      body: JSON.stringify({ selectedLanguages: normalizedSelectedLanguages }),
    })
      .then(readConversationResponse)
      .then((nextConversation) => {
        if (languageSettingsSyncVersionRef.current.get(conversationId) !== nextVersion) return;
        setConversations((current) => upsertConversation(current, nextConversation));
      })
      .catch((error: unknown) => {
        const stale = languageSettingsSyncVersionRef.current.get(conversationId) !== nextVersion;
        logConversationMutationFailure({
          label: "selected-languages",
          conversationId,
          method: "PATCH",
          path: buildConversationApiPath(`/${conversationId}`),
          error,
          stale,
        });
        if (stale) return;
        setConversations((current) => current.map((conversation) => (
          conversation.id === conversationId
            ? {
                ...conversation,
                selectedLanguages: [...previousSelectedLanguages],
                translationLanguagesLinked: previousTranslationLanguagesLinked,
              }
            : conversation
        )));
        // Language sync failures inside an already-open room must not surface as
        // "failed to open" — the optimistic rollback above is the visible signal.
      });
  }, [defaultSelectedLanguages]);

  const handleConversationSpeechLanguagesChange = useCallback((
    conversationId: string,
    nextSpeechLanguages: string[],
  ) => {
    const normalizedSpeechLanguages = sanitizeSttLanguageSelection(
      nextSpeechLanguages,
      defaultSelectedLanguages,
    );
    if (normalizedSpeechLanguages.length === 0) {
      return;
    }

    const previousConversation = conversationsRef.current.find(
      (conversation) => conversation.id === conversationId,
    );
    if (!previousConversation) return;

    const previousSpeechLanguages = sanitizeSttLanguageSelection(
      previousConversation.speechLanguages,
      previousConversation.selectedLanguages,
    );
    const previousSelectedLanguages = sanitizeSttLanguageSelection(
      previousConversation.selectedLanguages,
      defaultSelectedLanguages,
    );
    const previousTranslationLanguagesLinked = previousConversation.translationLanguagesLinked !== false;

    const nextVersion = (languageSettingsSyncVersionRef.current.get(conversationId) ?? 0) + 1;
    languageSettingsSyncVersionRef.current.set(conversationId, nextVersion);

    setConversations((current) => current.map((conversation) => (
      conversation.id === conversationId
        ? {
            ...conversation,
            speechLanguages: [...normalizedSpeechLanguages],
            ...(previousTranslationLanguagesLinked
              ? { selectedLanguages: [...normalizedSpeechLanguages] }
              : {}),
          }
        : conversation
    )));

    void fetch(buildConversationApiPath(`/${conversationId}`), {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        ...buildConversationRequestHeaders(initialTrackingIdentityRef.current),
      },
      body: JSON.stringify({ speechLanguages: normalizedSpeechLanguages }),
    })
      .then(readConversationResponse)
      .then((nextConversation) => {
        if (languageSettingsSyncVersionRef.current.get(conversationId) !== nextVersion) return;
        setConversations((current) => upsertConversation(current, nextConversation));
      })
      .catch((error: unknown) => {
        const stale = languageSettingsSyncVersionRef.current.get(conversationId) !== nextVersion;
        logConversationMutationFailure({
          label: "speech-languages",
          conversationId,
          method: "PATCH",
          path: buildConversationApiPath(`/${conversationId}`),
          error,
          stale,
        });
        if (stale) return;
        setConversations((current) => current.map((conversation) => (
          conversation.id === conversationId
            ? {
                ...conversation,
                speechLanguages: [...previousSpeechLanguages],
                ...(previousTranslationLanguagesLinked
                  ? { selectedLanguages: [...previousSelectedLanguages] }
                  : {}),
              }
            : conversation
        )));
        // Language sync failures inside an already-open room must not surface as
        // "failed to open" — the optimistic rollback above is the visible signal.
      });
  }, [defaultSelectedLanguages]);

  const handleConversationTranslationLanguagesLinkedChange = useCallback((
    conversationId: string,
    nextTranslationLanguagesLinked: boolean,
  ) => {
    const previousConversation = conversationsRef.current.find(
      (conversation) => conversation.id === conversationId,
    );
    if (!previousConversation) return;

    const previousSelectedLanguages = sanitizeSttLanguageSelection(
      previousConversation.selectedLanguages,
      defaultSelectedLanguages,
    );
    const previousTranslationLanguagesLinked = previousConversation.translationLanguagesLinked !== false;
    const speechLanguages = sanitizeSttLanguageSelection(
      previousConversation.speechLanguages,
      previousSelectedLanguages,
    );
    const nextSelectedLanguages =
      nextTranslationLanguagesLinked || previousTranslationLanguagesLinked
        ? speechLanguages
        : previousSelectedLanguages;

    const nextVersion = (languageSettingsSyncVersionRef.current.get(conversationId) ?? 0) + 1;
    languageSettingsSyncVersionRef.current.set(conversationId, nextVersion);

    setConversations((current) => current.map((conversation) => (
      conversation.id === conversationId
        ? {
            ...conversation,
            selectedLanguages: [...nextSelectedLanguages],
            translationLanguagesLinked: nextTranslationLanguagesLinked,
          }
        : conversation
    )));

    void fetch(buildConversationApiPath(`/${conversationId}`), {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        ...buildConversationRequestHeaders(initialTrackingIdentityRef.current),
      },
      body: JSON.stringify({ translationLanguagesLinked: nextTranslationLanguagesLinked }),
    })
      .then(readConversationResponse)
      .then((nextConversation) => {
        if (languageSettingsSyncVersionRef.current.get(conversationId) !== nextVersion) return;
        setConversations((current) => upsertConversation(current, nextConversation));
      })
      .catch((error: unknown) => {
        const stale = languageSettingsSyncVersionRef.current.get(conversationId) !== nextVersion;
        logConversationMutationFailure({
          label: "translation-linked",
          conversationId,
          method: "PATCH",
          path: buildConversationApiPath(`/${conversationId}`),
          error,
          stale,
        });
        if (stale) return;
        setConversations((current) => current.map((conversation) => (
          conversation.id === conversationId
            ? {
                ...conversation,
                selectedLanguages: [...previousSelectedLanguages],
                translationLanguagesLinked: previousTranslationLanguagesLinked,
              }
            : conversation
        )));
        // Language sync failures inside an already-open room must not surface as
        // "failed to open" — the optimistic rollback above is the visible signal.
      });
  }, [defaultSelectedLanguages]);

  const handleConversationDefaultDisplayLanguageChange = useCallback((
    conversationId: string,
    nextDefaultDisplayLanguage: string | null,
  ) => {
    const previousConversation = conversationsRef.current.find(
      (conversation) => conversation.id === conversationId,
    );
    if (!previousConversation) return;

    const normalizedDefaultDisplayLanguage = nextDefaultDisplayLanguage
      ? sanitizeSttLanguageSelection([nextDefaultDisplayLanguage])[0] ?? null
      : null;
    if (nextDefaultDisplayLanguage && !normalizedDefaultDisplayLanguage) return;

    const previousDefaultDisplayLanguage = previousConversation.defaultDisplayLanguage ?? null;
    const nextVersion = (languageSettingsSyncVersionRef.current.get(conversationId) ?? 0) + 1;
    languageSettingsSyncVersionRef.current.set(conversationId, nextVersion);

    setConversations((current) => current.map((conversation) => (
      conversation.id === conversationId
        ? {
            ...conversation,
            defaultDisplayLanguage: normalizedDefaultDisplayLanguage,
          }
        : conversation
    )));

    void fetch(buildConversationApiPath(`/${conversationId}`), {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        ...buildConversationRequestHeaders(initialTrackingIdentityRef.current),
      },
      body: JSON.stringify({ defaultDisplayLanguage: normalizedDefaultDisplayLanguage }),
    })
      .then(readConversationResponse)
      .then((nextConversation) => {
        if (languageSettingsSyncVersionRef.current.get(conversationId) !== nextVersion) return;
        setConversations((current) => upsertConversation(current, nextConversation));
      })
      .catch((error: unknown) => {
        const stale = languageSettingsSyncVersionRef.current.get(conversationId) !== nextVersion;
        logConversationMutationFailure({
          label: "default-display-language",
          conversationId,
          method: "PATCH",
          path: buildConversationApiPath(`/${conversationId}`),
          error,
          stale,
        });
        if (stale) return;
        setConversations((current) => current.map((conversation) => (
          conversation.id === conversationId
            ? {
                ...conversation,
                defaultDisplayLanguage: previousDefaultDisplayLanguage,
              }
            : conversation
        )));
      });
  }, []);

  const clearConversationInterimPreview = useCallback((conversationId: string) => {
    setConversationInterimPreviews((current) => {
      if (!Object.prototype.hasOwnProperty.call(current, conversationId)) {
        return current;
      }
      const next = { ...current };
      delete next[conversationId];
      return next;
    });
  }, []);

  const handleConversationLatestUtterancePreviewChange = useCallback((
    conversationId: string,
    payload: LatestUtterancePayload | null,
  ) => {
    if (!payload) {
      clearConversationInterimPreview(conversationId);
      return;
    }

    const normalizedPreview = payload.preview.trim();
    if (!normalizedPreview) return;
    const normalizedCreatedAt = payload.createdAt.trim();
    if (!normalizedCreatedAt) return;
    const normalizedSpeaker = payload.speaker?.trim() || undefined;
    const normalizedSpeakerAvatarSeed = payload.speakerAvatarSeed?.trim() || undefined;
    const normalizedSpeakerAvatarIndex = typeof payload.speakerAvatarIndex === "number"
      && Number.isInteger(payload.speakerAvatarIndex)
      ? payload.speakerAvatarIndex
      : undefined;
    const nextPreview: LatestUtterancePayload = {
      preview: normalizedPreview,
      createdAt: normalizedCreatedAt,
      ...(normalizedSpeaker ? { speaker: normalizedSpeaker } : {}),
      ...(normalizedSpeakerAvatarSeed ? { speakerAvatarSeed: normalizedSpeakerAvatarSeed } : {}),
      ...(typeof normalizedSpeakerAvatarIndex === "number"
        ? { speakerAvatarIndex: normalizedSpeakerAvatarIndex }
        : {}),
    };

    setConversationInterimPreviews((current) => {
      const previous = current[conversationId];
      if (
        previous?.preview === nextPreview.preview
        && previous.createdAt === nextPreview.createdAt
        && previous.speaker === nextPreview.speaker
        && previous.speakerAvatarSeed === nextPreview.speakerAvatarSeed
        && previous.speakerAvatarIndex === nextPreview.speakerAvatarIndex
      ) {
        return current;
      }
      return {
        ...current,
        [conversationId]: nextPreview,
      };
    });
  }, [clearConversationInterimPreview]);

  const handleConversationLatestUtteranceChange = useCallback((
    conversationId: string,
    payload: LatestUtterancePayload,
  ) => {
    const normalizedPreview = payload.preview.trim();
    if (!normalizedPreview) return;
    const normalizedCreatedAt = payload.createdAt.trim();
    if (!normalizedCreatedAt) return;

    clearConversationInterimPreview(conversationId);

    setConversations((current) => current.map((conversation) => {
      if (conversation.id !== conversationId) {
        return conversation;
      }
      return {
        ...conversation,
        latestMessagePreview: normalizedPreview,
        latestMessageAt: normalizedCreatedAt,
        latestSpeaker: payload.speaker?.trim() || conversation.latestSpeaker || null,
        latestSpeakerAvatarSeed:
          payload.speakerAvatarSeed?.trim() || conversation.latestSpeakerAvatarSeed || null,
        latestSpeakerAvatarIndex:
          typeof payload.speakerAvatarIndex === "number" && Number.isInteger(payload.speakerAvatarIndex)
            ? payload.speakerAvatarIndex
            : conversation.latestSpeakerAvatarIndex ?? null,
      };
    }).sort(compareConversationRecency));
  }, [clearConversationInterimPreview]);

  const handleOpenSearch = useCallback(() => {
    openSearchOverlay({ transitionMode: "animate", syncHistory: "push" });
  }, [openSearchOverlay]);

  const closeNotifications = useCallback(() => {
    setShowNotifications(false);
  }, []);

  const openNotificationProfile = useCallback((userId: string) => {
    notificationProfileIdRef.current = userId;
    if (typeof window !== "undefined") {
      const currentState = window.history.state;
      const nextState = currentState && typeof currentState === "object"
        ? { ...currentState, [NOTIFICATION_PROFILE_HISTORY_KEY]: userId }
        : { [NOTIFICATION_PROFILE_HISTORY_KEY]: userId };
      window.history.pushState(nextState, "", window.location.href);
    }
    setShowNotifications(true);
    setNotificationProfileId(userId);
  }, []);

  const closeNotificationProfile = useCallback(() => {
    if (
      typeof window !== "undefined"
      && window.history.state
      && typeof window.history.state === "object"
      && NOTIFICATION_PROFILE_HISTORY_KEY in window.history.state
    ) {
      window.history.back();
      return;
    }
    notificationProfileIdRef.current = null;
    setNotificationProfileId(null);
  }, []);

  useEffect(() => {
    notificationProfileIdRef.current = notificationProfileId;
  }, [notificationProfileId]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleNotificationProfilePopState = () => {
      if (!notificationProfileIdRef.current) return;
      setNotificationProfileId(null);
    };

    window.addEventListener("popstate", handleNotificationProfilePopState);
    return () => window.removeEventListener("popstate", handleNotificationProfilePopState);
  }, []);

  useEffect(() => {
    setIsClientReady(true);
    setIsNativeRuntime(isNativeAppRuntime());
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    // Give every conversation-list history entry an explicit screen marker.
    // iOS can deliver a delayed popstate while the visible WebView snapshot is
    // already on the next entry; the marker lets the handlers use the entry
    // that caused the gesture instead of guessing from the transient URL.
    if (readConversationHistoryRouteFromState(window.history.state) === undefined) {
      replaceConversationOverlayUrl(readConversationIdFromLocation(), "initial-route-marker");
    }

    let hasConfirmedLanguageOnboarding = false;
    try {
      hasConfirmedLanguageOnboarding = readPersistedBooleanPreference(
        window.localStorage.getItem(LS_KEY_LANGUAGE_ONBOARDING_CONFIRMED),
        false,
      );
    } catch {
      hasConfirmedLanguageOnboarding = false;
    }

    setLanguageOnboardingPhase(
      shouldAutoOpenLanguageOnboarding(hasConfirmedLanguageOnboarding)
        ? "selection"
        : "ready",
    );
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!isNativeRuntime && !isNativeAppRuntime()) return;

    setNativeSttStatus(readCachedNativeSttStatus());

    const handleNativeSttEvent = (event: Event) => {
      const nextStatus = readNativeSttStatusEventStatus(event);
      if (!nextStatus) return;
      setNativeSttStatus(nextStatus);
    };

    window.addEventListener(NATIVE_STT_EVENT, handleNativeSttEvent);
    return () => {
      window.removeEventListener(NATIVE_STT_EVENT, handleNativeSttEvent);
    };
  }, [isNativeRuntime]);

  useEffect(() => {
    activeConversationRef.current = activeConversation;
  }, [activeConversation]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    if (activeConversation) {
      if (showSearch) {
        setSearchOverlayVisible(false, "instant");
      }
      return;
    }

    const shouldShowSearchFromHistory = isSearchOverlayHistoryOpen(window.history.state);
    if (shouldShowSearchFromHistory === showSearch) return;
    setSearchOverlayVisible(shouldShowSearchFromHistory, "instant");
  }, [activeConversation, setSearchOverlayVisible, showSearch]);

  useEffect(() => {
    if (!activeConversation) return;
    setRowActionMenu(null);
  }, [activeConversation]);

  useEffect(() => {
    liveConversationIdRef.current = liveConversationId;
  }, [liveConversationId]);

  useEffect(() => {
    conversationsRef.current = conversations;
  }, [conversations]);

  useEffect(() => {
    if (sessionStatus !== "unauthenticated") return;

    // Do not leave the previous account's rows available underneath the
    // authentication gate or merge them into the next authenticated refresh.
    setConversations([]);
    setConversationInterimPreviews({});
    setConversationLocalStats({});
    setShowNotifications(false);
    setUnreadNotificationCount(0);
  }, [sessionStatus]);

  useEffect(() => {
    refreshConversationLocalStats(conversations);
  }, [conversations, refreshConversationLocalStats]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const refreshCurrentConversationLocalStats = () => {
      refreshConversationLocalStats(conversationsRef.current);
    };

    window.addEventListener("focus", refreshCurrentConversationLocalStats);
    window.addEventListener("storage", refreshCurrentConversationLocalStats);
    document.addEventListener("visibilitychange", refreshCurrentConversationLocalStats);

    return () => {
      window.removeEventListener("focus", refreshCurrentConversationLocalStats);
      window.removeEventListener("storage", refreshCurrentConversationLocalStats);
      document.removeEventListener("visibilitychange", refreshCurrentConversationLocalStats);
    };
  }, [refreshConversationLocalStats]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!initialConversationIdToOpen) return;
    if (activeConversation || isHydratingConversations) return;
    if (conversations.some((conversation) => conversation.id === initialConversationIdToOpen)) return;
    if (readConversationIdFromLocation() !== initialConversationIdToOpen) return;
    replaceConversationOverlayUrl(null, "initial-conversation-missing");
  }, [
    activeConversation,
    conversations,
    initialConversationIdToOpen,
    isHydratingConversations,
  ]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!isNativeAppRuntime()) return;
    const cachedNativeSttStatus = nativeSttStatus ?? readCachedNativeSttStatus();
    if (activeConversation || liveConversationId) {
      if (isNativeSttStatusLive(cachedNativeSttStatus)) {
        nativeSttRestoreAttemptedRef.current = true;
      }
      return;
    }
    if (isHydratingConversations) return;
    if (conversations.length === 0) return;

    const hiddenNativeSttConversation = isNativeSttStatusLive(cachedNativeSttStatus)
      ? findNativeSttRestoreConversation(
          conversations,
          deletingConversationIdsRef.current,
        )
      : null;

    const shouldStayOnConversationList = (() => {
      const currentUrl = new URL(window.location.href);
      const isExplicitTabRoot = currentUrl.searchParams.get(NATIVE_TAB_ROOT_QUERY_KEY) === "1";
      const shouldSkipConversationRestore = currentUrl.searchParams.get(
        NATIVE_SKIP_CONVERSATION_RESTORE_QUERY_KEY,
      ) === "1";
      if (!shouldSkipConversationRestore && !isExplicitTabRoot) {
        return false;
      }

      const currentHref = currentUrl.toString();
      if (
        isExplicitTabRoot
        && !shouldSkipConversationRestore
        && nativeTabRootRestoreHandledRef.current === currentHref
      ) {
        return true;
      }

      if (shouldSkipConversationRestore) {
        currentUrl.searchParams.delete(NATIVE_SKIP_CONVERSATION_RESTORE_QUERY_KEY);
      }
      const nextHref = currentUrl.toString();
      if (nextHref !== window.location.href) {
        window.history.replaceState(window.history.state, "", nextHref);
        notifyLocationSearchSync();
      }
      if (isExplicitTabRoot) {
        nativeTabRootRestoreHandledRef.current = nextHref;
      }
      return true;
    })();
    if (shouldStayOnConversationList) {
      // Consume any stale remount hint as well. The user explicitly selected
      // the list tab, so reopening the live room would violate that action.
      takeNativeRemountRestoreConversation();
      nativeSttRestoreAttemptedRef.current = true;
      if (
        hiddenNativeSttConversation
        && suppressNativeSttRestoreConversationIdRef.current !== hiddenNativeSttConversation.id
      ) {
        // The hidden room mounts with an idle React state before its cached
        // native status is applied. Keep a false sentinel so that its initial
        // callback cannot PATCH the live conversation to paused; the first
        // native running callback will promote it back to active.
        conversationRunningStateRef.current.set(hiddenNativeSttConversation.id, false);
        setLiveConversationId(hiddenNativeSttConversation.id);
      }
      return;
    }

    const restoreConversationId = takeNativeRemountRestoreConversation();
    const explicitRestoreConversation = restoreConversationId
      ? conversations.find((conversation) => (
          conversation.id === restoreConversationId
          && !deletingConversationIdsRef.current.has(conversation.id)
        )) ?? null
      : null;
    if (explicitRestoreConversation) {
      // User manually closed this conversation — skip explicit restore.
      if (suppressNativeSttRestoreConversationIdRef.current === explicitRestoreConversation.id) {
        return;
      }
      nativeSttRestoreAttemptedRef.current = true;
      conversationRunningStateRef.current.set(
        explicitRestoreConversation.id,
        explicitRestoreConversation.status === "active",
      );
      postNativeBannerZone("hidden");
      closeSearchOverlay({ transitionMode: "instant", syncHistory: "replace" });
      setOverlayEnterMode("instant");
      setOverlayExitMode("animate");
      setAutoStartConversationId(null);
      setLiveConversationId(
        explicitRestoreConversation.status === "active" ? explicitRestoreConversation.id : null,
      );
      setActiveConversation(explicitRestoreConversation);
      return;
    }

    if (isNativeSttStatusLive(cachedNativeSttStatus)) {
      // Check manual-close suppression BEFORE the "already attempted" guard.
      // If the user manually closed the room, suppress re-entry even when native
      // STT status is still reporting "running" (e.g. stop ACK not yet received).
      const restoreConversation = findNativeSttRestoreConversation(
        conversations,
        deletingConversationIdsRef.current,
      );
      if (
        restoreConversation
        && suppressNativeSttRestoreConversationIdRef.current === restoreConversation.id
      ) {
        // Mark as attempted so subsequent effect runs skip immediately.
        nativeSttRestoreAttemptedRef.current = true;
        return;
      }

      if (nativeSttRestoreAttemptedRef.current) return;
      if (!restoreConversation) return;

      nativeSttRestoreAttemptedRef.current = true;
      conversationRunningStateRef.current.set(restoreConversation.id, true);
      postNativeBannerZone("hidden");
      closeSearchOverlay({ transitionMode: "instant", syncHistory: "replace" });
      setOverlayEnterMode("instant");
      setOverlayExitMode("animate");
      setAutoStartConversationId(null);
      setLiveConversationId(restoreConversation.id);
      setActiveConversation(restoreConversation);
      return;
    }

    // Wait for RN's first native STT status before reconciling stale active
    // summaries. A missing status is not proof that STT is still live.
    if (cachedNativeSttStatus === null) return;

    const staleActiveConversationIds = conversations
      .filter((conversation) => (
        conversation.status === "active"
        && !deletingConversationIdsRef.current.has(conversation.id)
      ))
      .map((conversation) => conversation.id);
    if (staleActiveConversationIds.length === 0) return;

    for (const conversationId of staleActiveConversationIds) {
      conversationRunningStateRef.current.set(conversationId, false);
    }
    setConversations((current) => current.map((conversation) => (
      conversation.status === "active"
        ? updateConversationSummaryStatus(conversation, "paused")
        : conversation
    )).sort(compareConversationRecency));

    for (const conversationId of staleActiveConversationIds) {
      void fetch(buildConversationApiPath(`/${conversationId}`), {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...buildConversationRequestHeaders(initialTrackingIdentityRef.current),
        },
        body: JSON.stringify({ status: "paused" }),
      }).catch(() => {
        // Keep the local fallback paused state even when the reconciliation request fails.
      });
    }
  }, [
    activeConversation,
    closeSearchOverlay,
    conversations,
    isHydratingConversations,
    liveConversationId,
    nativeSttStatus,
  ]);

  useEffect(() => {
    const knownConversationIds = new Set(conversations.map((conversation) => conversation.id));
    for (const conversation of conversations) {
      if (!conversationRunningStateRef.current.has(conversation.id)) {
        conversationRunningStateRef.current.set(conversation.id, conversation.status === "active");
      }
    }
    for (const conversationId of [...conversationRunningStateRef.current.keys()]) {
      if (!knownConversationIds.has(conversationId)) {
        conversationRunningStateRef.current.delete(conversationId);
      }
    }
  }, [conversations]);

  useEffect(() => {
    if (isCreatingConversation) {
      isCreatingConversationRef.current = true;
    }
  }, [isCreatingConversation]);

  useEffect(() => {
    mutatingConversationIdRef.current = mutatingConversationId;
  }, [mutatingConversationId]);

  useEffect(() => {
    isImportingLegacyConversationRef.current = isImportingLegacyConversation;
  }, [isImportingLegacyConversation]);

  useEffect(() => {
    if (!isNativeAppRuntime()) return;
    postNativeBannerZone(resolveConversationListNativeBannerZone({
      isAuthenticated: sessionStatus === "authenticated",
      hasActiveConversation: Boolean(activeConversation),
      isSearchOpen: showSearch,
    }));
  }, [activeConversation, sessionStatus, showSearch]);

  useEffect(() => {
    if (!isNativeAppRuntime() || sessionStatus === "authenticated") return;
    const nativeClientBuild = new URLSearchParams(window.location.search).get("nativeClientBuild");
    if (!shouldReassertNativeAuthBannerZone(nativeClientBuild)) return;

    // Builds before 68 can restore the list banner after the authentication
    // gate has already hidden it. Reassert the server-known auth state until
    // login succeeds so deployed web code also protects existing TestFlight builds.
    postNativeBannerZone("hidden");
    const intervalId = window.setInterval(() => {
      postNativeBannerZone("hidden");
    }, 250);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [sessionStatus]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleNativeUiEvent = (event: Event) => {
      const detail = (event as CustomEvent<unknown>).detail;
      const bannerLayout = parseNativeUiBannerLayoutDetail(detail);
      if (!bannerLayout) return;
      setNativeBannerLayout(bannerLayout);
    };

    window.addEventListener(NATIVE_UI_EVENT, handleNativeUiEvent as EventListener);
    return () => {
      window.removeEventListener(NATIVE_UI_EVENT, handleNativeUiEvent as EventListener);
    };
  }, []);

  useEffect(() => {
    if (
      !initialNativeUi
      || initialConversations.length > 0
      || initialWarmSnapshot !== null
      || sessionStatus !== "authenticated"
    ) {
      return;
    }

    const cached = readConversationListCache(conversationCacheIdentity);
    if (!cached) return;

    conversationsRef.current = cached.conversations;
    hasConversationListSnapshotRef.current = true;
    setConversations(cached.conversations);
    setConversationLocalStats(cached.localStats);
    refreshConversationLocalStats(cached.conversations);
    setTimeLabelsReady(true);
    setIsHydratingConversations(false);
  }, [
    conversationCacheIdentity,
    initialConversations.length,
    initialNativeUi,
    initialWarmSnapshot,
    refreshConversationLocalStats,
    sessionStatus,
  ]);

  useEffect(() => {
    let cancelled = false;
    let timeoutId: number | null = null;

    const shouldRefreshInitialConversations = initialConversationsRequireRefresh
      || initialConversations.length === 0
      || sessionStatus === "authenticated";
    if (!shouldRefreshInitialConversations) {
      hasConversationListSnapshotRef.current = true;
      refreshConversationLocalStats(conversationsRef.current);
      setIsHydratingConversations(false);
      return () => {
        cancelled = true;
      };
    }

    const runRefresh = () => {
      void refreshConversationList()
        .then((nextConversations) => {
          if (cancelled) return;
          return nextConversations;
        })
        .catch(() => {
          // Keep the server-rendered or in-memory state when hydration fails.
        })
        .finally(() => {
          if (cancelled) return;
          setIsHydratingConversations(false);
        });
    };

    if (sessionStatus === "authenticated" && !hasConversationListSnapshotRef.current) {
      setIsHydratingConversations(true);
    }

    if (initialConversationsRequireRefresh && initialConversations.length > 0) {
      timeoutId = window.setTimeout(runRefresh, 250);
    } else {
      runRefresh();
    }

    return () => {
      cancelled = true;
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [
    initialConversations.length,
    initialConversationsRequireRefresh,
    refreshConversationList,
    refreshConversationLocalStats,
    sessionStatus,
  ]);

  useEffect(() => {
    if (
      !initialNativeUi
      || isHydratingConversations
      || sessionStatus !== "authenticated"
    ) {
      return;
    }

    writeConversationListCache(
      conversationCacheIdentity,
      conversations,
      conversationLocalStats,
    );
  }, [
    conversationCacheIdentity,
    conversationLocalStats,
    conversations,
    initialNativeUi,
    isHydratingConversations,
    sessionStatus,
  ]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (isHydratingConversations) return;
    if (activeConversation) return;
    if (conversations.length > 0) return;
    if (isCreatingConversation || mutatingConversationId || isImportingLegacyConversationRef.current) return;
    if (hasLegacySingleRoomMigrationCompleted()) return;

    const legacySnapshot = readLegacySingleRoomSnapshot();
    if (!legacySnapshot) return;

    isImportingLegacyConversationRef.current = true;
    setIsImportingLegacyConversation(true);

    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(buildConversationApiPath(), {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...buildConversationRequestHeaders(initialTrackingIdentityRef.current),
          },
          body: JSON.stringify({
            locale,
            legacySessionKey: legacySnapshot.sessionKey || undefined,
            selectedLanguages: legacySnapshot.selectedLanguages,
            speechLanguages: legacySnapshot.speechLanguages,
            translationLanguagesLinked: legacySnapshot.translationLanguagesLinked,
          }),
        });
        const importedConversation = await readConversationResponse(response);
        if (cancelled) return;

        copyLegacySingleRoomSnapshotToConversation(
          importedConversation.id,
          importedConversation.sessionKey,
          legacySnapshot,
        );
        markLegacySingleRoomMigrationCompleted();
        setConversations((current) => upsertConversation(current, importedConversation));
      } catch {
        // Keep the list empty and leave legacy storage intact for a later retry.
      } finally {
        if (cancelled) return;
        isImportingLegacyConversationRef.current = false;
        setIsImportingLegacyConversation(false);
      }
    })();

    return () => {
      cancelled = true;
      isImportingLegacyConversationRef.current = false;
      setIsImportingLegacyConversation(false);
    };
  }, [
    activeConversation,
    conversations.length,
    isCreatingConversation,
    isHydratingConversations,
    locale,
    mutatingConversationId,
  ]);

  useEffect(() => {
    setTimeLabelsReady(true);
  }, []);

  useEffect(() => {
    if (!rowActionMenu) return;

    const dismissMenu = () => {
      setRowActionMenu(null);
    };

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) {
        dismissMenu();
        return;
      }
      if (rowActionMenuRef.current?.contains(target)) return;
      dismissMenu();
    };

    document.addEventListener("pointerdown", handlePointerDown, true);
    window.addEventListener("scroll", dismissMenu, true);
    window.addEventListener("resize", dismissMenu);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
      window.removeEventListener("scroll", dismissMenu, true);
      window.removeEventListener("resize", dismissMenu);
    };
  }, [rowActionMenu]);

  useEffect(() => {
    if (!activeConversation) return;
    const nextConversation = conversations.find((conversation) => conversation.id === activeConversation.id);
    if (!nextConversation) return;
    if (nextConversation === activeConversation) return;
    setActiveConversation(nextConversation);
  }, [activeConversation, conversations]);

  const closeConversationOverlay = useCallback((
    conversation: ConversationChannelSummary,
    options?: {
      animateExit?: boolean;
      replaceUrl?: boolean;
    },
  ) => {
    const exitMode: ConversationOverlayExitMode = options?.animateExit ? "animate" : "instant";
    const shouldReplaceUrl = options?.replaceUrl ?? false;
    const previousConversation = conversation;

    // Mark this conversation as closed so native STT restore and non-history
    // route-sync cannot re-open it automatically. An explicit history-forward
    // popstate consumes this guard and restores the room.
    postConversationHistoryDebug("close-conversation-overlay", {
      conversationId: conversation.id,
      animateExit: options?.animateExit === true,
      replaceUrl: shouldReplaceUrl,
      activeConversationId: activeConversationRef.current?.id ?? null,
      suppressionBefore: suppressNativeSttRestoreConversationIdRef.current,
    });
    suppressNativeSttRestoreConversationIdRef.current = conversation.id;
    if (activeConversationRef.current?.id === conversation.id) {
      activeConversationRef.current = null;
    }

    postNativeBannerZone("hidden");

    if (shouldReplaceUrl) {
      replaceConversationOverlayUrl(null, "close-conversation-overlay");
    }

    setOverlayExitMode(exitMode);
    setAutoStartConversationId(null);
    setActiveConversation((current) => (
      current?.id === previousConversation.id ? null : current
    ));
  }, []);

  // Declared before handleCreateConversation to avoid TDZ ReferenceError.
  const openConversationSummary = useCallback(async (
    conversation: ConversationChannelSummary,
    options?: {
      enterMode?: ConversationOverlayEnterMode;
      // push  : push a new history entry (user tapping a room from the list)
      // replace: replace the current history entry (restore / QA paths)
      // none  : do not touch history (popstate already changed the URL)
      syncHistory?: "push" | "replace" | "none";
      // When true, clear the manual-close suppression flag for this conversation.
      // Defaults to true when syncHistory is "push" (intentional user re-open).
      clearManualCloseSuppression?: boolean;
    },
  ) => {
    const enterMode = options?.enterMode ?? "animate";
    const syncHistory = options?.syncHistory ?? "push";
    const clearSuppression = options?.clearManualCloseSuppression ?? (syncHistory === "push");
    const suppressionBefore = suppressNativeSttRestoreConversationIdRef.current;

    if (syncHistory === "push") {
      conversationHistoryPopStateTargetRef.current = null;
      conversationHistoryPopStateTransitionRef.current = null;
      pendingConversationHistoryBackRef.current = false;
    }

    if (clearSuppression) {
      suppressNativeSttRestoreConversationIdRef.current = null;
    }

    postConversationHistoryDebug("open-conversation-summary", {
      conversationId: conversation.id,
      syncHistory,
      enterMode,
      clearManualCloseSuppression: clearSuppression,
      suppressionBefore,
      activeConversationId: activeConversationRef.current?.id ?? null,
    });

    postNativeBannerZone("hidden");
    closeSearchOverlay({ transitionMode: "instant", syncHistory: "replace" });
    setOverlayEnterMode(enterMode);
    setOverlayExitMode("animate");
    // NOTE: intentionally not calling setAutoStartConversationId(null) here.
    // The create-conversation flow sets autoStart before calling openConversationSummary;
    // clearing it here would immediately cancel the auto-start.
    // autoStart is cleared by closeConversationOverlay and explicit call sites only.
    activeConversationRef.current = conversation;
    setActiveConversation(conversation);

    // Perform history sync here (not in an effect) so that restore / popstate-open
    // paths do not redundantly push duplicate ?conversation= entries.
    if (typeof window !== "undefined" && syncHistory !== "none") {
      const currentConversationId = readConversationIdFromLocation();
      const nextUrl = buildConversationOverlayUrl(conversation.id);
      if (nextUrl && currentConversationId !== conversation.id) {
        if (syncHistory === "push") {
          clearNativeTabRootFromCurrentHistoryEntry();
          window.history.pushState(
            buildConversationHistoryState(conversation.id, window.history.state),
            "",
            nextUrl,
          );
        } else {
          window.history.replaceState(
            buildConversationHistoryState(conversation.id, window.history.state),
            "",
            nextUrl,
          );
        }
        notifyLocationSearchSync();
      } else if (nextUrl && currentConversationId === conversation.id) {
        const currentHistoryRoute = readConversationHistoryRouteFromState(window.history.state);
        if (currentHistoryRoute !== conversation.id) {
          window.history.replaceState(
            buildConversationHistoryState(conversation.id, window.history.state),
            "",
            nextUrl,
          );
          notifyLocationSearchSync();
        }
      }
    }

    return conversation;
  }, [closeSearchOverlay]);


  const handleCreateConversation = useCallback(async () => {
    if (
      isCreatingConversationRef.current
      || isCreatingConversation
      || isImportingLegacyConversationRef.current
      || isImportingLegacyConversation
    ) {
      return;
    }
    if (!tryAcquireConversationCreateLock(isCreatingConversationRef)) return;
    setIsCreatingConversation(true);
    let shouldAutoStartNewConversation = true;

    if (shouldSkipCreateConversationMicWarmup()) {
      shouldAutoStartNewConversation = false;
    }

    // In native apps, the native STT bridge owns microphone permission.
    // Avoid getUserMedia warm-ups here so the WebView never triggers an
    // extra origin-level mic permission dialog on top of the app-level flow.
    if (!isNativeAppRuntime() && shouldAutoStartNewConversation && navigator.mediaDevices?.getUserMedia) {
      try {
        const warmStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        warmStream.getTracks().forEach((t) => t.stop());
      } catch {
        // If mic access is denied up-front, open the room but skip auto-start.
        rememberDeniedCreateConversationMicWarmup();
        shouldAutoStartNewConversation = false;
      }
    }

    try {
      const response = await fetch(buildConversationApiPath(), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...buildConversationRequestHeaders(initialTrackingIdentityRef.current),
        },
        body: JSON.stringify({
          locale,
          selectedLanguages: defaultSelectedLanguages,
          speechLanguages: defaultSelectedLanguages,
          translationLanguagesLinked: true,
        }),
      });
      const nextConversation = await readConversationResponse(response);
      closeSearchOverlay({ transitionMode: "instant", syncHistory: "replace" });
      setConversations((current) => upsertConversation(current, nextConversation));
      // Set autoStart BEFORE calling openConversationSummary so that
      // openConversationSummary does not clear it (it intentionally skips
      // setAutoStartConversationId to preserve create-flow auto-start).
      setAutoStartConversationId(shouldAutoStartNewConversation ? nextConversation.id : null);
      await openConversationSummary(nextConversation, {
        enterMode: "animate",
        syncHistory: "push",
      });
    } catch {
      window.alert(copy.createErrorMessage);
    } finally {
      releaseConversationCreateLock(isCreatingConversationRef);
      setIsCreatingConversation(false);
    }
  }, [
    closeSearchOverlay,
    copy.createErrorMessage,
    defaultSelectedLanguages,
    isCreatingConversation,
    isImportingLegacyConversation,
    locale,
    openConversationSummary,
  ]);

  const ensureConversationRoomForQa = useCallback(async (): Promise<ConversationListQaEnsureRoomResult> => {
    const currentActiveConversation = activeConversationRef.current;
    if (currentActiveConversation?.id) {
      return {
        conversationId: currentActiveConversation.id,
        action: "active",
      };
    }

    const mostRecentConversation = conversationsRef.current[0] ?? null;
    if (mostRecentConversation) {
      await openConversationSummary(mostRecentConversation, {
        enterMode: "instant",
        syncHistory: "replace", // QA automation path: avoid unnecessary history pushes
      });
      return {
        conversationId: mostRecentConversation.id,
        action: "opened-existing",
      };
    }

    if (!tryAcquireConversationCreateLock(isCreatingConversationRef)) {
      const activeAfterLockAttempt = activeConversationRef.current;
      if (activeAfterLockAttempt?.id) {
        return {
          conversationId: activeAfterLockAttempt.id,
          action: "active",
        };
      }
      throw new Error("conversation_create_in_progress");
    }

    setIsCreatingConversation(true);
    try {
      const response = await fetch(buildConversationApiPath(), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...buildConversationRequestHeaders(initialTrackingIdentityRef.current),
        },
        body: JSON.stringify({
          locale,
          selectedLanguages: defaultSelectedLanguages,
        }),
      });
      const nextConversation = await readConversationResponse(response);
      closeSearchOverlay({ transitionMode: "instant", syncHistory: "replace" });
      setConversations((current) => upsertConversation(current, nextConversation));
      setAutoStartConversationId(null);
      await openConversationSummary(nextConversation, {
        enterMode: "instant",
        syncHistory: "replace",
      });

      return {
        conversationId: nextConversation.id,
        action: "created",
      };
    } finally {
      releaseConversationCreateLock(isCreatingConversationRef);
      setIsCreatingConversation(false);
    }
  }, [closeSearchOverlay, defaultSelectedLanguages, locale, openConversationSummary]);


  const handleOpenConversation = useCallback(async (item: ConversationItem) => {
    if (isCreatingConversation || isImportingLegacyConversation) return;

    const matchedConversation = conversations.find((conversation) => conversation.id === item.id);
    if (!matchedConversation) return;

    setRowActionMenu(null);
    suppressRowActionMenuUntilRef.current = Date.now() + ROW_ACTION_LONG_PRESS_DELAY_MS + 120;

    try {
      await openConversationSummary(matchedConversation);
    } catch (error) {
      const aborted = isAbortLikeMutationError(error);
      logConversationMutationFailure({
        label: "route-open",
        conversationId: matchedConversation.id,
        error,
        aborted,
      });
      if (aborted) return;
      window.alert(copy.openErrorMessage);
    }
  }, [
    conversations,
    copy.openErrorMessage,
    isCreatingConversation,
    isImportingLegacyConversation,
    openConversationSummary,
  ]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    if (!shouldExposeNativeQaBridge({
      search: window.location.search,
      isNativeAppRuntime: isNativeRuntime,
      runtimeQaBridgeAuthorized: readNativeQaBridgeAuthority(window),
    })) {
      delete window.__MINGLE_CONVERSATION_LIST_QA__;
      return;
    }

    window.__MINGLE_CONVERSATION_LIST_QA__ = {
      getConversationListSnapshot: () => ({
        routePathname: window.location.pathname,
        documentLanguage: document.documentElement.lang || "",
        uiLocale: locale,
        isNativeAppRuntime: isNativeRuntime,
        isHydratingConversations,
        conversationCount: conversationsRef.current.length,
        activeConversationId: activeConversationRef.current?.id ?? null,
        nativeSttStatus: nativeSttStatus ?? readCachedNativeSttStatus(),
        showSearch,
        effectiveNativeTopInsetPx,
        effectiveNativeBottomInsetPx,
        nativeBannerLayoutPosition: nativeBannerLayout?.position ?? null,
        createButtonLabel: copy.newConversationButtonLabel,
      }),
      ensureConversationRoom: async () => await ensureConversationRoomForQa(),
    };

    return () => {
      delete window.__MINGLE_CONVERSATION_LIST_QA__;
    };
  }, [
    copy.newConversationButtonLabel,
    effectiveNativeBottomInsetPx,
    effectiveNativeTopInsetPx,
    ensureConversationRoomForQa,
    isHydratingConversations,
    isNativeRuntime,
    locale,
    nativeBannerLayout?.position,
    nativeSttStatus,
    showSearch,
  ]);

  const handleCloseActiveConversation = useCallback(async () => {
    if (!activeConversation || isCreatingConversation) return;

    const currentConversationId = readConversationIdFromLocation();
    if (
      typeof window !== "undefined"
      && currentConversationId === activeConversation.id
      && window.history.length > 1
    ) {
      postNativeBannerZone("hidden");
      pendingHistoryCloseAnimationRef.current = "animate";
      pendingConversationHistoryBackRef.current = true;
      closeConversationOverlay(activeConversation, { animateExit: true });
      window.history.back();
      return;
    }

    closeConversationOverlay(activeConversation, { animateExit: true, replaceUrl: true });
  }, [activeConversation, closeConversationOverlay, isCreatingConversation]);

  useEffect(() => registerNativeBackHandler(() => {
    if (notificationProfileId) {
      closeNotificationProfile();
      return true;
    }
    if (showNotifications) {
      closeNotifications();
      return true;
    }
    if (showSearch && !activeConversation) {
      closeSearchOverlay({ transitionMode: "animate", syncHistory: "back" });
      return true;
    }
    if (!activeConversation || isCreatingConversation) return false;
    closeConversationOverlay(activeConversation, { animateExit: true, replaceUrl: true });
    return true;
  }, 5), [
    activeConversation,
    closeConversationOverlay,
    closeNotifications,
    closeNotificationProfile,
    closeSearchOverlay,
    isCreatingConversation,
    notificationProfileId,
    showNotifications,
    showSearch,
  ]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    // This listener must run in the capture phase. The location store also
    // listens to popstate and can synchronously flush a React render before
    // the normal bubble-phase handlers run. Recording the destination here
    // prevents route-sync from mistaking an explicit forward gesture for a
    // native-STT restore and replacing the room entry with a list entry.
    const handlePopStateCapture = (event: PopStateEvent) => {
      const activeConversationId = activeConversationRef.current?.id ?? null;
      const currentRouteConversationId = readConversationIdFromLocation();
      const historyTargetConversationId = resolveConversationHistoryRoute(
        event.state,
        window.history.state,
        currentRouteConversationId,
      );
      const direction = resolveConversationHistoryNavigationDirection(
        activeConversationId,
        historyTargetConversationId,
      );

      conversationHistoryPopStateTransitionRef.current = {
        conversationId: historyTargetConversationId,
        direction,
      };
      conversationHistoryPopStateTargetRef.current = {
        conversationId: historyTargetConversationId,
      };
      postConversationHistoryDebug("popstate-capture", {
        eventState: summarizeConversationHistoryDebugState(event.state),
        currentRouteConversationId,
        resolvedTargetConversationId: historyTargetConversationId,
        activeConversationId,
        direction,
      });
    };

    window.addEventListener("popstate", handlePopStateCapture, true);
    return () => {
      window.removeEventListener("popstate", handlePopStateCapture, true);
    };
  }, []);

  useEffect(() => {
    const capturedHistoryTransition = conversationHistoryPopStateTransitionRef.current;
    if (activeConversation) {
      const pendingHistoryTarget = conversationHistoryPopStateTargetRef.current;
      if (
        pendingHistoryTarget?.conversationId === activeConversation.id
        && routeConversationId === activeConversation.id
      ) {
        conversationHistoryPopStateTargetRef.current = null;
        conversationHistoryPopStateTransitionRef.current = null;
      }
      routeSyncConversationIdRef.current = null;
      return;
    }

    const pendingHistoryTarget = conversationHistoryPopStateTargetRef.current;
    if (!routeConversationId) {
      // A native gesture can deliver the popstate target before the URL store
      // catches up. Keep the explicit target alive so a stale room URL cannot
      // trigger the native-STT suppression cleanup path and rewrite that room
      // history entry into another list entry.
      if (
        pendingHistoryTarget?.conversationId
        || (
          capturedHistoryTransition?.direction === "forward"
          && capturedHistoryTransition.conversationId
        )
      ) return;
      routeSyncConversationIdRef.current = null;
      conversationHistoryPopStateTargetRef.current = null;
      conversationHistoryPopStateTransitionRef.current = null;
      pendingConversationHistoryBackRef.current = false;
      return;
    }
    // If the URL still describes the previous screen, wait for the browser's
    // history commit instead of treating the room query as an automatic/native
    // restore. The popstate handler has already recorded the intended target.
    if (pendingHistoryTarget && pendingHistoryTarget.conversationId !== routeConversationId) {
      return;
    }
    // During a native edge swipe the URL can temporarily still describe the
    // source entry. Wait for the destination rather than running automatic
    // restore/suppression logic against that stale room URL.
    if (
      capturedHistoryTransition
      && capturedHistoryTransition.direction !== "unknown"
      && capturedHistoryTransition.conversationId !== routeConversationId
    ) {
      return;
    }
    const isHistoryRestore = pendingHistoryTarget?.conversationId
      === routeConversationId
      || (
        capturedHistoryTransition?.direction === "forward"
        && capturedHistoryTransition.conversationId === routeConversationId
      );
    if (routeSyncConversationIdRef.current === routeConversationId && !isHistoryRestore) return;
    if (isCreatingConversation || isImportingLegacyConversation) return;

    const matchedConversation = conversations.find((conversation) => conversation.id === routeConversationId);
    if (!matchedConversation) return;

    if (isHistoryRestore) {
      conversationHistoryPopStateTargetRef.current = null;
      conversationHistoryPopStateTransitionRef.current = null;
    }

    // A room URL that appears without a popstate is still an automatic/native
    // restore. Keep the manual-close guard for that path, while allowing an
    // explicit browser forward gesture to restore the room below.
    if (
      !isHistoryRestore
      && suppressNativeSttRestoreConversationIdRef.current === routeConversationId
    ) {
      if (pendingConversationHistoryBackRef.current) return;
      postConversationHistoryDebug("route-sync-suppression-branch", {
        routeConversationId,
        pendingHistoryTarget: pendingHistoryTarget?.conversationId ?? null,
        capturedHistoryTransition,
        activeConversationId: activeConversationRef.current?.id ?? null,
        suppressionConversationId: suppressNativeSttRestoreConversationIdRef.current,
        routeSyncConversationId: routeSyncConversationIdRef.current,
      });
      routeSyncConversationIdRef.current = routeConversationId;
      replaceConversationOverlayUrl(null, "route-sync-native-stt-suppression");
      return;
    }

    routeSyncConversationIdRef.current = routeConversationId;
    void openConversationSummary(matchedConversation, {
      enterMode: "instant",
      syncHistory: "none", // URL already reflects the route-sync target; no push needed
      clearManualCloseSuppression: isHistoryRestore,
    }).catch((error: unknown) => {
      routeSyncConversationIdRef.current = null;
      if (readConversationIdFromLocation() === routeConversationId) {
        replaceConversationOverlayUrl(null, "route-sync-open-failed");
      }
      const aborted = isAbortLikeMutationError(error);
      logConversationMutationFailure({
        label: "route-open",
        conversationId: routeConversationId,
        error,
        aborted,
      });
      if (aborted) return;
      window.alert(copy.openErrorMessage);
    });
  }, [
    activeConversation,
    conversations,
    copy.openErrorMessage,
    isCreatingConversation,
    isImportingLegacyConversation,
    mutatingConversationId,
    openConversationSummary,
    routeConversationId,
  ]);

  // The effect-based pushState has been moved into openConversationSummary (syncHistory option).
  // Removing this effect prevents restore/popstate-open paths from stacking duplicate entries.

  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleSearchPopState = () => {
      if (activeConversationRef.current) return;

      const nextSearchOpen = isSearchOverlayHistoryOpen(window.history.state);
      const transitionMode = nextSearchOpen
        ? "instant"
        : (consumeSearchOverlayHistoryCloseAnimationFlag() ? "animate" : "instant");
      setSearchOverlayVisible(nextSearchOpen, transitionMode);
    };

    window.addEventListener("popstate", handleSearchPopState);
    return () => {
      window.removeEventListener("popstate", handleSearchPopState);
    };
  }, [setSearchOverlayVisible]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const handlePopState = (event: PopStateEvent) => {
      const currentActiveConversation = activeConversationRef.current;
      const currentRouteConversationId = readConversationIdFromLocation();
      const historyTargetConversationId = resolveConversationHistoryRoute(
        event.state,
        window.history.state,
        currentRouteConversationId,
      );
      postConversationHistoryDebug("popstate-close-handler", {
        handler: "close",
        eventState: summarizeConversationHistoryDebugState(event.state),
        currentRouteConversationId,
        resolvedTargetConversationId: historyTargetConversationId,
        activeConversationId: currentActiveConversation?.id ?? null,
        suppressionConversationId: suppressNativeSttRestoreConversationIdRef.current,
        pendingHistoryTarget: conversationHistoryPopStateTargetRef.current?.conversationId ?? null,
      });
      pendingConversationHistoryBackRef.current = false;

      // Use the current history entry's explicit route marker when available.
      // During an iOS edge-swipe, the WebView URL and a delayed popstate event
      // can briefly describe an older entry; recording the settled entry keeps
      // that stale list event from closing a room that was just restored.
      const isRoomHistoryTransition = (
        currentActiveConversation
          && historyTargetConversationId !== currentActiveConversation.id
      ) || (
        !currentActiveConversation
          && historyTargetConversationId !== null
      );
      conversationHistoryPopStateTargetRef.current = isRoomHistoryTransition
        ? { conversationId: historyTargetConversationId }
        : null;

      if (!currentActiveConversation) return;
      if (historyTargetConversationId === currentActiveConversation.id) return;

      const animateExit = pendingHistoryCloseAnimationRef.current === "animate"
        || consumeNativeHistoryCloseAnimationFlag();
      pendingHistoryCloseAnimationRef.current = "instant";
      closeConversationOverlay(currentActiveConversation, { animateExit });
    };

    window.addEventListener("popstate", handlePopState);
    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, [closeConversationOverlay]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const handlePopState = (event: PopStateEvent) => {
      if (activeConversationRef.current) return;

      const currentRouteConversationId = readConversationIdFromLocation();
      const historyTargetConversationId = resolveConversationHistoryRoute(
        event.state,
        window.history.state,
        currentRouteConversationId,
      );
      postConversationHistoryDebug("popstate-open-handler", {
        handler: "open",
        eventState: summarizeConversationHistoryDebugState(event.state),
        currentRouteConversationId,
        resolvedTargetConversationId: historyTargetConversationId,
        activeConversationId: null,
        suppressionConversationId: suppressNativeSttRestoreConversationIdRef.current,
        pendingHistoryTarget: conversationHistoryPopStateTargetRef.current?.conversationId ?? null,
      });
      if (!historyTargetConversationId) return;
      if (isCreatingConversationRef.current || isImportingLegacyConversationRef.current) return;

      const matchedConversation = conversationsRef.current.find(
        (conversation) => conversation.id === historyTargetConversationId,
      );
      if (!matchedConversation) return;

      const isHistoryRestore = conversationHistoryPopStateTargetRef.current?.conversationId
        === historyTargetConversationId;
      if (isHistoryRestore && currentRouteConversationId === historyTargetConversationId) {
        conversationHistoryPopStateTargetRef.current = null;
        conversationHistoryPopStateTransitionRef.current = null;
      }

      const isExplicitSuppressedRestore = (
        !isHistoryRestore
        && suppressNativeSttRestoreConversationIdRef.current === historyTargetConversationId
      );

      postConversationHistoryDebug("popstate-open-decision", {
        handler: "open",
        currentRouteConversationId,
        historyTargetConversationId,
        isHistoryRestore,
        isExplicitSuppressedRestore,
        suppressionConversationId: suppressNativeSttRestoreConversationIdRef.current,
        activeConversationId: null,
      });

      // A forward popstate is an explicit request to restore the room. If the
      // capture-phase target was unavailable for any reason, clear the close
      // guard and continue opening the room. Never replace the current room
      // entry with a list URL here; that mutates the native history stack.
      if (isExplicitSuppressedRestore) {
        conversationHistoryPopStateTargetRef.current = null;
        conversationHistoryPopStateTransitionRef.current = null;
      }

      routeSyncConversationIdRef.current = historyTargetConversationId;
      void openConversationSummary(matchedConversation, {
        enterMode: "instant",
        syncHistory: "none", // popstate already updated the URL; no push needed
        clearManualCloseSuppression: isHistoryRestore || isExplicitSuppressedRestore,
      }).catch((error: unknown) => {
        routeSyncConversationIdRef.current = null;
        if (readConversationIdFromLocation() === historyTargetConversationId) {
          replaceConversationOverlayUrl(null, "popstate-open-failed");
        }
        const aborted = isAbortLikeMutationError(error);
        logConversationMutationFailure({
          label: "popstate-open",
          conversationId: historyTargetConversationId,
          error,
          aborted,
        });
        if (aborted) return;
        window.alert(copy.openErrorMessage);
      });
    };

    window.addEventListener("popstate", handlePopState);
    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, [copy.openErrorMessage, openConversationSummary]);

  useEffect(() => {
    if (!activeConversation) return;
    resetPullRefresh();
  }, [activeConversation, resetPullRefresh]);

  const handleLanguageOnboardingConfirm = useCallback(async (languageCode: string) => {
    // Seed the room's default output languages from the chosen app language the
    // same way a brand-new conversation would (chosen language + en/ko/ja, deduped),
    // not just the single picked language -- see deriveDefaultSttLanguagesForLocale.
    const normalizedTargets = deriveDefaultSttLanguagesForLocale(languageCode);
    const normalizedPrimaryLanguages = sanitizeSttLanguageSelection(
      [languageCode],
      normalizedTargets.slice(0, 1),
    );

    try {
      window.localStorage.setItem(LS_KEY_LANGUAGES, JSON.stringify(normalizedTargets));
      window.localStorage.setItem(LS_KEY_TRANSLATION_LANGUAGES_LINKED, "0");
      window.localStorage.setItem(
        LS_KEY_PENDING_DEFAULT_CONVERSATION_LANGUAGES,
        JSON.stringify(normalizedTargets),
      );
      window.localStorage.setItem(
        LS_KEY_PENDING_PRIMARY_LANGUAGES,
        JSON.stringify(normalizedPrimaryLanguages),
      );
    } catch {
      // Ignore storage failures; the onboarding modal will simply reopen next launch.
    }

    let savedPrimaryLanguages = normalizedPrimaryLanguages;
    let savedDefaultLanguages = normalizedTargets;
    if (sessionStatus === "authenticated") {
      try {
        const profileResponse = await fetch(buildClientApiPath("/profile"), {
          cache: "no-store",
        });
        if (!profileResponse.ok) return;

        const profile = await profileResponse.json() as ProfileLanguagePreferencesPayload;
        let resolvedPreferences = resolveOnboardingLanguagePreferences(
          profile,
          normalizedPrimaryLanguages,
          normalizedTargets,
        );
        if (Object.keys(resolvedPreferences.patch).length > 0) {
          const saveResponse = await fetch(buildClientApiPath("/profile"), {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(resolvedPreferences.patch),
          });
          if (!saveResponse.ok) return;

          const savedProfile = await saveResponse.json() as ProfileLanguagePreferencesPayload;
          resolvedPreferences = resolveOnboardingLanguagePreferences(
            savedProfile,
            resolvedPreferences.primaryLanguages,
            resolvedPreferences.defaultConversationLanguages,
          );
        }

        savedPrimaryLanguages = resolvedPreferences.primaryLanguages;
        savedDefaultLanguages = resolvedPreferences.defaultConversationLanguages;
        clearPendingLanguagePreferences();
      } catch {
        return;
      }
    }

    try {
      window.localStorage.setItem(LS_KEY_LANGUAGE_ONBOARDING_CONFIRMED, "1");
    } catch {
      // Ignore storage failures; the onboarding modal will simply reopen next launch.
    }

    defaultConversationLanguagesSyncVersionRef.current += 1;
    setPreferredDisplayLanguages(savedPrimaryLanguages);
    setDefaultSelectedLanguages(savedDefaultLanguages);
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent(DEFAULT_CONVERSATION_LANGUAGES_SYNC_EVENT, {
        detail: savedDefaultLanguages,
      }));
    }

    const nextUiLocale = resolveUiLocaleForLanguage(savedDefaultLanguages[0] ?? languageCode);
    storeAppLocale(nextUiLocale);
    if (nextUiLocale !== locale) {
      setLanguageOnboardingPhase("locale-switching");
      window.location.assign(buildPathWithCurrentSearchParams(`/${nextUiLocale}/conversations`));
      return;
    }

    setLanguageOnboardingPhase("ready");
  }, [locale, sessionStatus]);

  const languageOnboardingDefaultLanguage = useMemo(() => {
    const fallbackLanguages = deriveDefaultSttLanguagesForLocale(locale);
    const persisted = readPersistedLivePhoneDemoPreferences(fallbackLanguages);
    return resolveOnboardingDefaultLanguage(persisted.selectedLanguages, locale);
    // Recompute from localStorage each time the modal opens, so a reopen after an
    // earlier confirm (without a full page reload) reflects the latest saved choice.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locale, languageOnboardingModalOpen]);
  const shouldShowLanguageBootstrapShell = languageOnboardingPhase === "resolving"
    || languageOnboardingPhase === "locale-switching"
    || (languageOnboardingPhase === "ready" && sessionStatus === "loading");

  return (
    <main className="relative flex h-full min-h-0 w-full flex-col overflow-hidden bg-white text-slate-900">

      <NativePushRegistration />

      {shouldShowLanguageBootstrapShell ? (
        <div
          className="absolute inset-0 z-[300] flex min-h-0 w-full items-center justify-center bg-[#fcfbf8]"
          role="status"
          aria-live="polite"
          aria-label={locale === "ko" ? "Mingle 준비 중" : "Preparing Mingle"}
        >
          <div className="flex flex-col items-center gap-5">
            <MingleWordmark />
            <Loader2 size={22} className="animate-spin text-amber-500" aria-hidden />
          </div>
        </div>
      ) : null}

      {sessionStatus === "unauthenticated" && languageOnboardingPhase === "ready" ? (
        <div
          className="absolute inset-0 z-[200] flex min-h-0 w-full overflow-hidden bg-white"
          role="dialog"
          aria-modal="true"
          aria-label={dictionary.profile.authTitle}
        >
          <Suspense
            fallback={(
              <div className="flex h-full min-h-0 w-full items-center justify-center bg-white text-slate-400">
                <Loader2 size={24} className="animate-spin" aria-hidden />
              </div>
            )}
          >
            <MingleHome
              authOnly
              dictionary={dictionary}
              appleOAuthEnabled={appleOAuthEnabled}
              googleOAuthEnabled={googleOAuthEnabled}
              locale={locale}
            />
          </Suspense>
        </div>
      ) : null}

      {isClientReady ? (
        <SearchOverlay
          ref={searchOverlayRef}
          open={showSearch}
          transitionMode={searchTransitionMode}
          onClose={() => closeSearchOverlay({ transitionMode: "animate", syncHistory: "back" })}
          conversations={conversationItems}
          copy={copy}
          onSelectConversation={handleOpenConversation}
          actionDisabled={conversationSelectionDisabled}
        />
      ) : null}

      <NotificationPanel
        open={showNotifications}
        enabled={sessionStatus === "authenticated"}
        locale={locale}
        dictionary={dictionary}
        nativeTopInsetPx={effectiveNativeTopInsetPx}
        onClose={closeNotifications}
        onOpenProfile={openNotificationProfile}
        onUnreadCountChange={setUnreadNotificationCount}
      />

      {notificationProfileId ? (
        <PublicUserProfileScreen
          dictionary={dictionary}
          locale={locale}
          userId={notificationProfileId}
          onClose={closeNotificationProfile}
        />
      ) : null}

      <header
        className="flex shrink-0 items-center justify-between border-b border-gray-100 px-4"
        style={{
          paddingTop: "env(safe-area-inset-top, 44px)",
          height: "calc(56px + env(safe-area-inset-top, 44px))",
        }}
      >
        <MingleWordmark />

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={handleOpenSearch}
            className="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-full p-3 transition active:bg-gray-100"
            aria-label={copy.searchButtonLabel}
          >
            <Search size={22} strokeWidth={2} />
          </button>
          <button
            type="button"
            onClick={() => setShowNotifications(true)}
            className="relative flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-full p-3 transition active:bg-gray-100"
            aria-label={copy.notificationsButtonLabel ?? (locale === "ko" ? "알림" : "Notifications")}
          >
            <Bell size={22} strokeWidth={2} />
            {unreadNotificationCount > 0 ? (
              <span
                className="absolute right-1.5 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold leading-none text-white"
                aria-label={`${unreadNotificationCount} ${locale === "ko" ? "개 읽지 않은 알림" : "unread notifications"}`}
              >
                {unreadNotificationCount > 99 ? "99+" : unreadNotificationCount}
              </span>
            ) : null}
          </button>
        </div>
      </header>

      <div
        ref={conversationListScrollRef}
        className="min-h-0 flex-1 overflow-y-auto"
        style={{
          paddingTop: effectiveNativeTopInsetPx > 0 ? `${effectiveNativeTopInsetPx}px` : "0px",
          paddingBottom: `${conversationListScrollPaddingBottomPx}px`,
        }}
        onTouchStart={(event) => {
          if (showSearch || activeConversation || isRefreshingConversations) return;
          const container = conversationListScrollRef.current;
          const touch = event.touches[0];
          if (!container || !touch || container.scrollTop > 0) {
            pullRefreshTrackingRef.current = false;
            pullRefreshStartYRef.current = null;
            return;
          }
          pullRefreshTrackingRef.current = true;
          pullRefreshStartYRef.current = touch.clientY;
        }}
        onTouchMove={(event) => {
          if (!pullRefreshTrackingRef.current) return;
          const container = conversationListScrollRef.current;
          const touch = event.touches[0];
          const startY = pullRefreshStartYRef.current;
          if (!container || !touch || startY === null) return;
          if (container.scrollTop > 0) {
            resetPullRefresh();
            return;
          }
          const dy = touch.clientY - startY;
          if (dy <= 0) {
            setPullRefreshDistance(0);
            return;
          }
          event.preventDefault();
          setPullRefreshDistance(
            Math.min(LIST_PULL_REFRESH_MAX_PX, Math.round(dy * LIST_PULL_REFRESH_RESISTANCE)),
          );
        }}
        onTouchEnd={() => {
          if (!pullRefreshTrackingRef.current) return;
          pullRefreshTrackingRef.current = false;
          pullRefreshStartYRef.current = null;
          if (pullRefreshDistance >= LIST_PULL_REFRESH_TRIGGER_PX) {
            void triggerPullToRefresh();
            return;
          }
          setPullRefreshDistance(0);
        }}
        onTouchCancel={resetPullRefresh}
      >
        <div
          className="pointer-events-none sticky top-0 z-10 h-0 overflow-visible"
          aria-hidden
        >
          <div
            className="absolute left-1/2 top-3 flex h-10 items-center justify-center rounded-full border border-slate-200/80 bg-white/95 px-3 shadow-[0_10px_30px_rgba(15,23,42,0.10)]"
            style={{
              opacity: pullRefreshProgress,
              transform: `translate(-50%, ${effectivePullRefreshOffsetPx - 56}px) scale(${0.92 + pullRefreshProgress * 0.08})`,
              transition: pullRefreshTrackingRef.current
                ? "none"
                : "transform 180ms ease, opacity 180ms ease",
            }}
          >
            <Loader2
              size={16}
              className={isRefreshingConversations ? "animate-spin text-slate-500" : "text-slate-400"}
              strokeWidth={2.25}
            />
          </div>
        </div>

        <div
          style={{
            transform: `translateY(${effectivePullRefreshOffsetPx}px)`,
            transition: pullRefreshTrackingRef.current
              ? "none"
              : "transform 220ms cubic-bezier(0.22, 1, 0.36, 1)",
          }}
        >
          {isHydratingConversations ? (
            <div className="flex flex-col items-center py-16 text-gray-400">
              <Loader2 size={28} className="animate-spin" />
            </div>
          ) : conversationItems.length === 0 ? (
            <div
              className="flex flex-col items-center px-6 py-16 text-center text-gray-400"
              style={{
                paddingTop: effectiveNativeTopInsetPx > 0 ? "84px" : undefined,
              }}
            >
              <span className="mb-3 text-5xl">💬</span>
              <p className="text-[15px] font-semibold text-slate-700">
                {copy.emptyTitle}
              </p>
              <p className="mt-1 text-[13px] text-gray-400">
                {copy.emptyDescription}
              </p>
            </div>
          ) : (
            <div className="border-t border-gray-100">
              {conversationItems.map((item) => (
                <div key={item.id}>
                  <ConversationRow
                    item={item}
                    disabled={conversationSelectionDisabled}
                    onSelect={handleOpenConversation}
                    onOpenActions={(selectedItem, position) => {
                      if (activeConversationRef.current) return;
                      if (Date.now() < suppressRowActionMenuUntilRef.current) return;
                      setRowActionMenu({
                        item: selectedItem,
                        position,
                      });
                    }}
                    className="border-b border-gray-100"
                  />
                </div>
              ))}
            </div>
          )}
          {isRefreshingConversations ? (
            <div className="flex items-center justify-center pb-5 pt-3 text-slate-400">
              <Loader2 size={18} className="animate-spin" strokeWidth={2.2} />
            </div>
          ) : null}
        </div>
      </div>

      <div
        className="absolute inset-x-0 z-20"
        style={{
          bottom: `calc(${BOTTOM_TAB_BAR_HEIGHT_PX}px + env(safe-area-inset-bottom, 0px))`,
        }}
      >
        <button
          type="button"
          onClick={handleCreateConversation}
          disabled={actionDisabled}
          className="relative flex w-full items-center justify-center px-5 pt-4 text-[1rem] font-semibold text-white transition active:scale-[0.995] disabled:cursor-not-allowed disabled:opacity-60"
          aria-label={copy.newConversationButtonLabel}
          style={{
            minHeight: `${CONVERSATION_CREATE_BUTTON_HEIGHT_PX}px`,
            paddingBottom: "16px",
            backgroundImage: "linear-gradient(90deg, #f59e0b 0%, #f97316 100%)",
          }}
        >
          <span
            className={`flex min-h-[24px] items-center justify-center gap-2 transition-opacity ${
              isCreatingConversation ? "opacity-0" : "opacity-100"
            }`}
          >
            <span>{copy.newConversationButtonLabel}</span>
            <ArrowRight size={18} strokeWidth={2.4} />
          </span>
          {isCreatingConversation ? (
            <span className="absolute inset-0 flex items-center justify-center">
              <Loader2 size={20} className="animate-spin" strokeWidth={2.25} />
            </span>
          ) : null}
        </button>
      </div>

      <BottomTabBar
        activeRoute="conversations"
        dictionary={dictionary}
        locale={locale}
      />

      {isClientReady && typeof document !== "undefined"
        ? createPortal(
          <>
            {rowActionMenu ? createPortal(
              <div
                ref={rowActionMenuRef}
                style={rowActionMenu.position.side === "above"
                  ? {
                      position: "fixed",
                      bottom: rowActionMenu.position.bottom,
                      left: rowActionMenu.position.left,
                      transform: "translateX(-50%)",
                      zIndex: 9999,
                    }
                  : {
                      position: "fixed",
                      top: rowActionMenu.position.top,
                      left: rowActionMenu.position.left,
                      transform: "translateX(-50%)",
                      zIndex: 9999,
                    }}
                onPointerDown={(event) => event.stopPropagation()}
                onTouchStart={(event) => event.stopPropagation()}
              >
                <div className="w-44 rounded-2xl border border-[#e5e7eb] bg-white shadow-[0_8px_32px_rgba(15,23,42,0.13),0_2px_10px_rgba(15,23,42,0.07)]">
                  <button
                    type="button"
                    onClick={() => {
                      setRenameDialogConversationId(rowActionMenu.item.id);
                      setRenameConversationValue(rowActionMenu.item.title);
                      setRowActionMenu(null);
                    }}
                    className="flex w-full items-center justify-between rounded-t-2xl px-4 py-3 text-[14px] font-medium text-slate-700 transition hover:bg-slate-50 active:bg-slate-100"
                  >
                    <span>{roomManagementCopy.renameButtonLabel}</span>
                    <PencilLine className="h-4 w-4 shrink-0 text-slate-400" />
                  </button>
                  <div className="h-px bg-gray-100" />
                  <button
                    type="button"
                    onClick={() => {
                      setDeleteDialogConversationId(rowActionMenu.item.id);
                      setRowActionMenu(null);
                    }}
                    className="flex w-full items-center justify-between rounded-b-2xl px-4 py-3 text-[14px] font-medium text-slate-700 transition hover:bg-slate-50 active:bg-slate-100"
                  >
                    <span>{deleteConversationCopy.menuItemLabel}</span>
                    <Trash2 className="h-4 w-4 shrink-0 text-slate-400" />
                  </button>
                </div>
              </div>,
              document.body,
            ) : null}
            <AnimatePresence custom={{ enterMode: overlayEnterMode, exitMode: overlayExitMode }}>
              {mountedConversations.map((conversation) => {
                const isVisible = activeConversation?.id === conversation.id;

                return (
                  <motion.div
                    key={conversation.id}
                    custom={{ enterMode: overlayEnterMode, exitMode: overlayExitMode }}
                    variants={conversationOverlayVariants}
                    initial="initial"
                    animate={isVisible ? "active" : "retained"}
                    exit="exit"
                    className={`fixed inset-0 z-[100] flex min-h-0 flex-col overflow-hidden bg-white ${
                      isVisible ? "" : "pointer-events-none"
                    }`}
                    aria-hidden={!isVisible}
                  >
                    <Suspense
                      fallback={(
                        <div className="flex h-full min-h-0 w-full items-center justify-center bg-white text-slate-400">
                          <Loader2 size={24} className="animate-spin" aria-hidden />
                        </div>
                      )}
                    >
                      <MingleHome
                        ref={(nextRef) => {
                          setConversationRoomRef(conversation.id, nextRef);
                        }}
                        key={conversation.id}
                        dictionary={dictionary}
                        appleOAuthEnabled={appleOAuthEnabled}
                        googleOAuthEnabled={googleOAuthEnabled}
                        locale={locale}
                        headerMode="conversation"
                        onBack={handleCloseActiveConversation}
                        onConversationDeleted={() => {
                          handleConversationDeleted(conversation.id);
                        }}
                        conversationTitle={conversation.title}
                        conversationId={conversation.id}
                        preferredDisplayLanguage={preferredDisplayLanguage}
                        preferredDisplayLanguages={preferredDisplayLanguages}
                        sessionKeyOverride={conversation.sessionKey}
                        storageNamespace={conversation.id}
                        initialSelectedLanguages={conversation.selectedLanguages}
                        initialSpeechLanguages={conversation.speechLanguages}
                        initialTranslationLanguagesLinked={conversation.translationLanguagesLinked !== false}
                        initialDefaultDisplayLanguage={conversation.defaultDisplayLanguage ?? null}
                        autoStartOnMount={conversation.id === autoStartConversationId}
                        onAutoStartHandled={() => {
                          setAutoStartConversationId((current) => (
                            current === conversation.id ? null : current
                          ));
                        }}
                        isVisible={isVisible}
                        enableNativeBannerBridge={isVisible}
                        onStartRecordingRequested={() => handleConversationStartRequested(conversation.id)}
                        onSttSessionRunningChange={(isRunning) => {
                          handleConversationRunningChange(conversation.id, isRunning);
                        }}
                        onLatestUtteranceChange={(payload) => {
                          handleConversationLatestUtteranceChange(conversation.id, payload);
                        }}
                        onLatestUtterancePreviewChange={(payload) => {
                          handleConversationLatestUtterancePreviewChange(conversation.id, payload);
                        }}
                        onConversationStatsChange={(payload) => {
                          handleConversationStatsChange(conversation.id, payload);
                        }}
                        onSelectedLanguagesChange={(selectedLanguages) => {
                          handleConversationSelectedLanguagesChange(conversation.id, selectedLanguages);
                        }}
                        onSpeechLanguagesChange={(speechLanguages) => {
                          handleConversationSpeechLanguagesChange(conversation.id, speechLanguages);
                        }}
                        onTranslationLanguagesLinkedChange={(translationLanguagesLinked) => {
                          handleConversationTranslationLanguagesLinkedChange(conversation.id, translationLanguagesLinked);
                        }}
                        onDefaultDisplayLanguageChange={(defaultDisplayLanguage) => {
                          handleConversationDefaultDisplayLanguageChange(conversation.id, defaultDisplayLanguage);
                        }}
                      />
                    </Suspense>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </>,
          document.body,
        )
        : null}

      <AnimatePresence>
        {renameDialogConversationId ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.16, ease: "easeOut" }}
            className="absolute inset-0 z-[120] flex items-start justify-center bg-black/40 px-5 pb-8"
            style={{
              paddingTop: "calc(env(safe-area-inset-top, 0px) + 56px)",
            }}
            onClick={() => {
              if (isRenamingConversation) return;
              setRenameDialogConversationId(null);
              setRenameConversationValue("");
            }}
          >
            <motion.div
              initial={{ opacity: 0, y: 12, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.98 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              role="dialog"
              aria-modal="true"
              aria-label={roomManagementCopy.renameDialogTitle}
              onClick={(event) => event.stopPropagation()}
              className="w-full max-w-[19rem] rounded-2xl border border-gray-200 bg-white p-4 shadow-xl"
            >
              <p className="text-sm font-semibold text-gray-900">
                {roomManagementCopy.renameDialogTitle}
              </p>
              <label className="mt-4 flex flex-col gap-2 text-sm text-gray-700">
                <span>{roomManagementCopy.renameFieldLabel}</span>
                <input
                  type="text"
                  value={renameConversationValue}
                  onChange={(event) => setRenameConversationValue(event.currentTarget.value)}
                  placeholder={roomManagementCopy.renameFieldPlaceholder}
                  disabled={isRenamingConversation}
                  maxLength={80}
                  autoFocus
                  className="h-11 rounded-xl border border-gray-300 px-3 text-sm text-gray-900 outline-none transition focus:border-gray-900"
                />
              </label>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    if (isRenamingConversation) return;
                    setRenameDialogConversationId(null);
                    setRenameConversationValue("");
                  }}
                  disabled={isRenamingConversation}
                  className="inline-flex h-10 items-center justify-center rounded-lg border border-gray-300 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {roomManagementCopy.renameCancelLabel}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    void handleRenameConversationFromList();
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
        ) : null}
        {deleteDialogConversationId ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.16, ease: "easeOut" }}
            className="absolute inset-0 z-[120] flex items-center justify-center bg-black/40 px-5"
            onClick={() => {
              if (isDeletingConversation) return;
              setDeleteDialogConversationId(null);
            }}
          >
            <motion.div
              initial={{ opacity: 0, y: 12, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.98 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              role="dialog"
              aria-modal="true"
              aria-label={deleteConversationCopy.dialogTitle}
              onClick={(event) => event.stopPropagation()}
              className="w-full max-w-[19rem] rounded-2xl border border-gray-200 bg-white p-4 shadow-xl"
            >
              <p className="text-sm font-semibold text-gray-900">
                {deleteConversationCopy.dialogTitle}
              </p>
              <p className="mt-2 text-sm leading-relaxed text-gray-600">
                {deleteConversationCopy.dialogMessage}
              </p>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    if (isDeletingConversation) return;
                    setDeleteDialogConversationId(null);
                  }}
                  disabled={isDeletingConversation}
                  className="inline-flex h-10 items-center justify-center rounded-lg border border-gray-300 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {deleteConversationCopy.cancelLabel}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    void handleDeleteConversationFromList();
                  }}
                  disabled={isDeletingConversation}
                  className="inline-flex h-10 items-center justify-center rounded-lg bg-rose-600 text-sm font-semibold text-white transition-colors hover:bg-rose-700 disabled:cursor-not-allowed disabled:bg-rose-400"
                >
                  {isDeletingConversation
                    ? deleteConversationCopy.deletingLabel
                    : deleteConversationCopy.confirmLabel}
                </button>
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {languageOnboardingModalOpen ? (
        <LanguageOnboardingModal
          dismissible={false}
          initialLanguage={languageOnboardingDefaultLanguage}
          uiLocale={locale}
          onConfirm={handleLanguageOnboardingConfirm}
        />
      ) : null}
    </main>
  );
}
