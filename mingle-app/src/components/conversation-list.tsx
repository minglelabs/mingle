"use client";

import type { AppLocale } from "@/i18n/config";
import type { AppDictionary } from "@/i18n/types";
import type { ConversationChannelOtherMember, ConversationChannelSummary } from "@/lib/app-conversations";
import { getConversationDictionary } from "@/i18n/conversations";
import { resolveNotificationCopy } from "@/i18n/notification-copy";
import NotificationPanel from "@/components/notification-panel";
import PublicUserProfileScreen from "@/components/public-user-profile-screen";
import SlideSurface from "@/components/slide-surface";
import { storeAppLocale } from "@/components/app-locale-preference-sync";
import { buildClientApiPath, clientApiNamespace } from "@/lib/api-contract";
import { buildProfileImageTransform } from "@/lib/profile-image-crop";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  forwardRef,
  lazy,
  Suspense,
  type FormEvent,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, Bell, Loader2, LogOut, PencilLine, Search, Trash2, UserRound } from "lucide-react";
import { useSession } from "next-auth/react";
import { buildStorageKey, getOrCreateTrackingUserId } from "@/components/LivePhoneDemo/realtime-storage";
import { getConversationEventsWsUrl } from "@/components/LivePhoneDemo/use-realtime-stt";
import {
  formatLivePhoneDemoMessageCount,
  formatLivePhoneDemoUsageDuration,
} from "@/components/LivePhoneDemo/live-phone-demo.usage-format";
import { resolveLivePhoneDemoConversationDeleteCopy } from "@/components/LivePhoneDemo/live-phone-demo.delete-copy";
import { resolveLivePhoneDemoConversationLeaveCopy } from "@/components/LivePhoneDemo/live-phone-demo.leave-copy";
import {
  LS_KEY_LANGUAGE_ONBOARDING_CONFIRMED,
  LS_KEY_LANGUAGES,
  LS_KEY_PENDING_BIRTH_DATE,
  LS_KEY_PENDING_DEFAULT_CONVERSATION_LANGUAGES,
  LS_KEY_PENDING_DISCOVERY_SOURCE,
  LS_KEY_PENDING_PRIMARY_LANGUAGES,
  LS_KEY_SPEECH_LANGUAGES,
  LS_KEY_TRANSLATION_LANGUAGES_LINKED,
  DEFAULT_CONVERSATION_LANGUAGES_SYNC_EVENT,
  clearPendingBirthDate,
  clearPendingDiscoverySource,
  normalizeLivePhoneDemoAdBannerPosition,
  readPendingBirthDate,
  readPendingDiscoverySource,
  readPersistedBooleanPreference,
  readPersistedLivePhoneDemoPreferences,
  type LivePhoneDemoAdBannerPosition,
} from "@/components/LivePhoneDemo/live-phone-demo.preferences";
import { resolveLivePhoneDemoRoomManagementCopy } from "@/components/LivePhoneDemo/live-phone-demo.room-management-copy";
import LanguageOnboardingModal, {
  type LanguageOnboardingConfirmPayload,
} from "@/components/LivePhoneDemo/LanguageOnboardingModal";
import {
  resolveLanguageSelectorOwnSelectedLanguages,
  resolveLanguageSelectorUnionAfterOwnLanguagesChange,
} from "@/components/LivePhoneDemo/language-selector.logic";
import {
  formatBirthDate,
} from "@/lib/birth-date";
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
  sanitizeSttLanguageUnion,
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
  findNativeSttRestoreConversation,
  isConversationListRefreshCurrent,
  isSearchOverlayHistoryOpen,
  MAX_RECENT_SEARCHES,
  mergeConversationLists,
  mergeSearchOverlayHistoryState,
  normalizeRecentSearches,
  normalizeSearchTerm,
  replaceConversationLists,
  releaseConversationCreateLock,
  resolveMountedConversationIds,
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
import NativePushRegistration from "@/components/native-push-registration";
import {
  readConversationListCache,
  readConversationListMemoryCache,
  resolveConversationListInitialState,
  writeConversationListCache,
  type CachedConversationLocalStats,
  type ConversationListCacheIdentity,
} from "@/components/conversation-list-cache";
import {
  adoptConversationMutationRecords,
  applyPendingConversationMutations,
  enqueueConversationMutation,
  flushConversationMutationQueue,
  readConversationMutationRecords,
  type ConversationMutationKind,
  type ConversationMutationPatch,
  type ConversationMutationQueueIdentity,
  type ConversationMutationRecord,
} from "@/components/conversation-mutation-queue";
import {
  adoptDurableFinalizations,
  retainDurableFinalizationOwner,
  discardDurableFinalizations,
  flushDurableFinalizations,
} from "@/components/LivePhoneDemo/durable-message-finalization";
import {
  NATIVE_HISTORY_BACK_ANIMATE_FLAG,
  postNativeAndroidBackCapability,
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
import {
  consumeSlideSurfaceHistoryForScope,
  pushSlideSurfaceHistory,
  readSlideSurfaceHistory,
  readSlideSurfaceHistoryForScope,
  replaceSlideSurfaceHistory,
} from "@/lib/slide-surface-history";
import { DIRECT_CONVERSATION_NAVIGATION_GUARD_MS } from "@/lib/direct-conversation-navigation";
import {
  REALTIME_FALLBACK_POLL_INTERVAL_MS,
  shouldRunRealtimeFallbackRefresh,
} from "@/lib/realtime-fallback-poll";
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
const CONVERSATION_SURFACE_SCOPE = "conversation";
const CONVERSATION_NOTIFICATIONS_SURFACE_ID = "notifications";
const CONVERSATION_PROFILE_SURFACE_ID = "profile";
const LEGACY_SINGLE_ROOM_MIGRATION_MARKER_KEY_PREFIX = "mingle:legacy-single-room-migrated";
const EMPTY_RECENT_SEARCHES: string[] = [];
const CONVERSATION_QUERY_KEY = "conversation";
const LEGACY_SINGLE_ROOM_UTTERANCES_KEY = "mingle_demo_utterances";
const LEGACY_SINGLE_ROOM_USAGE_KEY = "mingle_demo_usage_sec";
const LEGACY_SINGLE_ROOM_MESSAGE_COUNT_KEY = "mingle_demo_message_count";
const LEGACY_SINGLE_ROOM_SESSION_KEY = "mingle_demo_session_key";
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
let resolvedLanguageOnboardingPhase: Exclude<LanguageOnboardingPhase, "resolving" | "locale-switching"> | null = null;
type ConversationHistoryPopStateTarget = {
  conversationId: string | null;
};
type ConversationHistoryPopStateTransition = ConversationHistoryPopStateTarget & {
  direction: ConversationHistoryNavigationDirection;
};
type PendingDirectConversationNavigation = {
  token: number;
  profileUserId: string;
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

interface ConversationItem {
  id: string;
  title: string;
  preview: string;
  previewFullText: string;
  timeLabel: string;
  statsLabel: string;
  statsFullLabel: string;
  unreadMessageCount: number;
  unreadMessageLabel: string;
  status: "active" | "paused";
  statusLabel: string;
  avatarSrc: string;
  avatarAlt: string;
  // Real counterpart photo(s) for the room, in join order. Empty for solo
  // rooms (no other real member yet), which keep using avatarSrc/avatarAlt
  // (the generated diarization avatar) instead.
  otherMembers: ConversationChannelOtherMember[];
  isBlockedCounterpart: boolean;
  // Whether the delete-vs-leave row menu action applies: a solo room keeps
  // "delete" (deletes for the owner, the only real member), a 2+-member
  // room switches to "leave" (removes just the caller's own membership, see
  // leaveConversationChannel).
  isMultiMember: boolean;
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
    unreadMessagesLabel?: string;
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
  const selectedLanguages = sanitizeSttLanguageUnion(
    conversation.selectedLanguages,
    deriveDefaultSttLanguagesForLocale(locale),
  );
  const speechLanguages = sanitizeSttLanguageSelection(
    conversation.speechLanguages,
    selectedLanguages,
  );
  const translationLanguagesLinked = conversation.translationLanguagesLinked !== false;
  // A room union may contain more than one member's five-language personal
  // limit. Keep the list-row preview compact; the room picker and translation
  // pipeline still receive the complete union.
  const languageCodes = selectedLanguages.slice(0, 5);
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
    unreadMessageCount: Math.max(0, Math.floor(conversation.unreadMessageCount ?? 0)),
    unreadMessageLabel: labels.unreadMessagesLabel || "Unread messages",
    status: conversation.status,
    statusLabel,
    avatarSrc: avatar.src,
    avatarAlt: `${title} ${avatar.name} avatar`,
    otherMembers: conversation.otherMembers,
    isBlockedCounterpart: conversation.isBlockedCounterpart,
    isMultiMember: conversation.isMultiMember,
    sequenceNumber: conversation.sequenceNumber,
    sessionKey: conversation.sessionKey,
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt,
    pausedAt: conversation.pausedAt,
    selectedLanguages,
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

function readCachedNativeSttConversationId(): string | null {
  if (typeof window === "undefined") return null;
  const cached = (window as Window & {
    __MINGLE_LAST_NATIVE_STT_CONVERSATION_ID?: unknown;
  }).__MINGLE_LAST_NATIVE_STT_CONVERSATION_ID;
  return typeof cached === "string" && cached.trim() ? cached.trim() : null;
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

// Corner-anchored overlap positions for a multi-member room's collage,
// capped at 4 visible photos — same "up to 4, overlapping" idea as
// LanguageRowAvatarStack (LivePhoneDemo/language-row-avatar-stack.tsx), but
// arranged in a fixed square so the room avatar keeps the exact footprint a
// solo room's generated avatar already occupies in the row, instead of
// growing wider the more members a room has.
const CONVERSATION_AVATAR_CLUSTER_LAYOUT: Record<number, Array<{ top: string; left: string }>> = {
  2: [
    { top: "0%", left: "0%" },
    { top: "38%", left: "38%" },
  ],
  3: [
    { top: "0%", left: "0%" },
    { top: "0%", left: "38%" },
    { top: "38%", left: "19%" },
  ],
  4: [
    { top: "0%", left: "0%" },
    { top: "0%", left: "38%" },
    { top: "38%", left: "0%" },
    { top: "38%", left: "38%" },
  ],
};
const CONVERSATION_AVATAR_CLUSTER_ITEM_SIZE_PX = 34;

function ConversationRoomAvatar({ item }: { item: ConversationItem }) {
  const otherMembers = item.otherMembers;

  // Solo room (no other real member yet, or a legacy/demo session): keep the
  // existing generated per-speaker-turn avatar.
  if (otherMembers.length === 0) {
    return (
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
    );
  }

  // Exactly one other real member: show their real photo, same framing as
  // the generated-avatar case (and the same 56px photo pattern used for a
  // room member row in conversation-participants-panel.tsx).
  if (otherMembers.length === 1) {
    const member = otherMembers[0];
    return (
      <div className="rounded-full bg-gradient-to-br from-rose-50 via-white to-amber-50 p-0.5 shadow-sm ring-1 ring-black/5">
        <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-full bg-gray-100">
          {member.image && !item.isBlockedCounterpart ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={member.image}
              alt={item.title}
              width={56}
              height={56}
              className="h-full w-full object-cover"
              style={{
                transform: buildProfileImageTransform(56, {
                  scale: member.imageCropScale,
                  x: member.imageCropX,
                  y: member.imageCropY,
                }),
              }}
            />
          ) : (
            <UserRound size={28} className="text-gray-400" aria-hidden="true" />
          )}
        </div>
      </div>
    );
  }

  // 2+ other members: KakaoTalk-style overlapping photo cluster, capped at 4
  // slots. A 5th+ member simply isn't shown — matches the "up to 4" spec
  // without adding a separate overflow affordance the request didn't ask for.
  const clusterMembers = otherMembers.slice(0, 4);
  const layout = CONVERSATION_AVATAR_CLUSTER_LAYOUT[clusterMembers.length]
    ?? CONVERSATION_AVATAR_CLUSTER_LAYOUT[4];

  return (
    <div className="relative h-14 w-14 shrink-0" title={item.title}>
      {clusterMembers.map((member, index) => {
        const position = layout[index] ?? layout[layout.length - 1];
        return (
          <span
            key={member.userId}
            className="absolute flex items-center justify-center overflow-hidden rounded-full border-2 border-white bg-gray-100"
            style={{
              top: position.top,
              left: position.left,
              width: CONVERSATION_AVATAR_CLUSTER_ITEM_SIZE_PX,
              height: CONVERSATION_AVATAR_CLUSTER_ITEM_SIZE_PX,
              zIndex: index + 1,
            }}
          >
            {member.image && !item.isBlockedCounterpart ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={member.image}
                alt=""
                className="h-full w-full object-cover"
                style={{
                  transform: buildProfileImageTransform(CONVERSATION_AVATAR_CLUSTER_ITEM_SIZE_PX, {
                    scale: member.imageCropScale,
                    x: member.imageCropX,
                    y: member.imageCropY,
                  }),
                }}
              />
            ) : (
              <UserRound size={16} className="text-gray-400" aria-hidden="true" />
            )}
          </span>
        );
      })}
    </div>
  );
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
      <ConversationRoomAvatar item={item} />

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
          <div className="flex shrink-0 items-start gap-2">
            {item.unreadMessageCount > 0 ? (
              <span
                className="inline-flex min-h-5 min-w-5 items-center justify-center rounded-full bg-amber-500 px-1.5 text-[10px] font-bold leading-none text-white"
                aria-label={`${item.unreadMessageCount} ${item.unreadMessageLabel}`}
                title={`${item.unreadMessageCount} ${item.unreadMessageLabel}`}
              >
                {item.unreadMessageCount > 99 ? "99+" : item.unreadMessageCount}
              </span>
            ) : null}
            <div className="flex flex-col items-end leading-none">
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
  // The panel this input lives in slides in from the right via a CSS
  // transform (see SlideSurface's SURFACE_TRANSITION, 0.32s) — the
  // browser-drawn text caret tracks that transform in real time, so
  // focusing immediately on open makes the caret visibly travel from the
  // right edge to its resting position instead of just appearing there.
  // Keep the caret itself invisible (but the input still genuinely
  // focused, so iOS still treats this as gesture-triggered and opens the
  // keyboard) until the slide settles.
  const [caretHidden, setCaretHidden] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
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
    let cancelled = false;
    const scheduleCaretHidden = (nextCaretHidden: boolean) => {
      const apply = () => {
        if (!cancelled) setCaretHidden(nextCaretHidden);
      };
      if (typeof queueMicrotask === "function") {
        queueMicrotask(apply);
      } else {
        void Promise.resolve().then(apply);
      }
    };

    if (!open) {
      blurInput();
      scheduleCaretHidden(false);
      return () => {
        cancelled = true;
      };
    }

    // transitionMode "instant" means the panel is already in its resting
    // position (no slide to hide the caret from).
    const shouldHideCaret = transitionMode !== "instant";
    scheduleCaretHidden(shouldHideCaret);

    focusInput();
    const animationFrameId = window.requestAnimationFrame(() => {
      focusInput();
    });
    // 340ms: just past SlideSurface's SURFACE_TRANSITION.duration (0.32s),
    // so the caret reappears only once the slide has actually settled.
    const timeoutId = window.setTimeout(() => {
      focusInput();
      setCaretHidden(false);
    }, shouldHideCaret ? 340 : 220);

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(animationFrameId);
      window.clearTimeout(timeoutId);
    };
  }, [blurInput, focusInput, open, transitionMode]);

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
    <SlideSurface
      open={open}
      onClose={dismissSearch}
      ariaLabel={copy.searchButtonLabel}
      nativeBackPriority={20}
      transitionMode={transitionMode}
      className="absolute inset-0 z-40 flex h-full min-h-0 w-full flex-col overflow-hidden bg-white"
      style={{ touchAction: "pan-y" }}
      stopPropagation
    >
      <div className="flex h-full min-h-0 flex-col">
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
              className={`flex-1 bg-transparent text-[15px] outline-none placeholder:text-gray-400 ${
                caretHidden ? "caret-transparent" : ""
              }`}
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

        <div className="min-h-0 flex-1 overflow-y-auto pb-[calc(1rem+env(safe-area-inset-bottom,0px))]">
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
    </SlideSurface>
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
  const router = useRouter();
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
  // A client-side transition into this route (router.push/back from another
  // page) can serve a router-cached render of this server component whose
  // `initialConversationIdToOpen` prop reflects an earlier `?conversation=`
  // value rather than the one actually being navigated to. Prefer the URL
  // the browser is really on for this synchronous initial-state read, so the
  // correct room opens on the very first render instead of a stale/empty
  // list flashing before the routeConversationId effect further down
  // corrects it a frame later.
  const initialConversationIdToOpenResolved =
    readConversationIdFromWindow() || initialConversationIdToOpen;
  const initialConversationToOpen = initialConversationIdToOpenResolved
    ? initialListState.conversations.find(
        (conversation) => conversation.id === initialConversationIdToOpenResolved,
      ) ?? null
    : null;
  const copy = useMemo(
    () => getConversationDictionary(locale, dictionary),
    [dictionary, locale],
  );
  const notificationCopy = useMemo(() => resolveNotificationCopy(locale), [locale]);
  const roomManagementCopy = useMemo(
    () => resolveLivePhoneDemoRoomManagementCopy(locale),
    [locale],
  );
  const deleteConversationCopy = useMemo(
    () => resolveLivePhoneDemoConversationDeleteCopy(locale),
    [locale],
  );
  const leaveConversationCopy = useMemo(
    () => resolveLivePhoneDemoConversationLeaveCopy(locale),
    [locale],
  );
  const [showSearch, setShowSearch] = useState(false);
  const [searchTransitionMode, setSearchTransitionMode] = useState<SearchOverlayTransitionMode>("animate");
  const [conversationSurfaceHistory, setConversationSurfaceHistory] = useState(() => (
    typeof window === "undefined"
      ? []
      : readSlideSurfaceHistoryForScope(CONVERSATION_SURFACE_SCOPE)
  ));
  const [unreadNotificationCount, setUnreadNotificationCount] = useState(0);
  const [isCreatingConversation, setIsCreatingConversation] = useState(false);
  const [isCreateChoiceModalOpen, setIsCreateChoiceModalOpen] = useState(false);
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
  const defaultSelectedLanguagesRef = useRef<string[]>(defaultSelectedLanguages);
  useEffect(() => {
    defaultSelectedLanguagesRef.current = defaultSelectedLanguages;
  }, [defaultSelectedLanguages]);
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
        defaultSelectedLanguagesRef.current = nextLanguages;
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
  const conversationLocalStatsRef = useRef(conversationLocalStats);
  conversationLocalStatsRef.current = conversationLocalStats;
  const conversationCacheIdentityRef = useRef(conversationCacheIdentity);
  conversationCacheIdentityRef.current = conversationCacheIdentity;
  const [nativeBannerLayout, setNativeBannerLayout] = useState<NativeUiBannerLayoutEventDetail | null>(null);
  const [activeConversation, setActiveConversation] = useState<ConversationChannelSummary | null>(initialConversationToOpen);
  const [liveConversationId, setLiveConversationId] = useState<string | null>(null);
  const [autoStartConversationId, setAutoStartConversationId] = useState<string | null>(null);
  const [isClientReady, setIsClientReady] = useState(false);
  const [isNativeRuntime, setIsNativeRuntime] = useState(false);
  const [languageOnboardingPhase, setLanguageOnboardingPhase] = useState<LanguageOnboardingPhase>(() => (
    resolvedLanguageOnboardingPhase ?? "resolving"
  ));
  const languageOnboardingModalOpen = languageOnboardingPhase === "selection";
  const [nativeSttStatus, setNativeSttStatus] = useState<string | null>(null);
  // A mount that starts with a conversation already active (SSR props, a
  // deep link, or a client-side remount after a real route round trip like
  // returning from add-members) isn't the user "opening" a room — it's the
  // room already being there. Default to "instant" in that case so the
  // very first render doesn't play SlideSurface's slide-in-from-the-right
  // entrance, which otherwise exposes the list underneath for its duration.
  // openConversationSummary resets this to "animate" for every genuine
  // user-initiated open (see its `enterMode` param below).
  const [overlayEnterMode, setOverlayEnterMode] = useState<ConversationOverlayEnterMode>(() => (
    initialConversationToOpen ? "instant" : "animate"
  ));
  const [overlayExitMode, setOverlayExitMode] = useState<ConversationOverlayExitMode>("animate");
  const [timeLabelsReady, setTimeLabelsReady] = useState(initialListState.timeLabelsReady);
  const [rowActionMenu, setRowActionMenu] = useState<ConversationRowActionMenuState | null>(null);
  const [renameDialogConversationId, setRenameDialogConversationId] = useState<string | null>(null);
  const [renameConversationValue, setRenameConversationValue] = useState("");
  const [isRenamingConversation, setIsRenamingConversation] = useState(false);
  const [deleteDialogConversationId, setDeleteDialogConversationId] = useState<string | null>(null);
  const [isDeletingConversation, setIsDeletingConversation] = useState(false);
  // The row-removal confirm dialog covers both delete (solo room, deletes
  // for the owner) and leave (shared room, removes just the caller) — this
  // decides which copy/handler applies for whichever conversation is
  // currently targeted by deleteDialogConversationId.
  const deleteDialogTargetIsMultiMember = useMemo(
    () => conversations.some((conversation) => conversation.id === deleteDialogConversationId && conversation.isMultiMember),
    [conversations, deleteDialogConversationId],
  );
  const notificationSurfaceOpen = conversationSurfaceHistory.some(
    (entry) => entry.id === CONVERSATION_NOTIFICATIONS_SURFACE_ID,
  );
  const conversationProfileSurface = [...conversationSurfaceHistory]
    .reverse()
    .find((entry) => entry.id === CONVERSATION_PROFILE_SURFACE_ID);
  const conversationProfileId = conversationProfileSurface?.value ?? null;
  const searchOverlayRef = useRef<SearchOverlayHandle>(null);
  const conversationListScrollRef = useRef<HTMLDivElement | null>(null);
  const rowActionMenuRef = useRef<HTMLDivElement | null>(null);
  const conversationRoomRefs = useRef(new Map<string, MingleHomeRef | null>());
  // Speech, translation, and link PATCHes all mutate one language setting surface.
  // Share a version counter so stale responses from any one kind cannot clobber another.
  // User-controlled room metadata is durable locally before it is sent to the
  // server. The queue is intentionally separate from message delivery: these
  // mutations must be replayed in order and must also overlay stale list GETs.
  const conversationMutationIdentity = useMemo<ConversationMutationQueueIdentity>(() => ({
    apiNamespace: clientApiNamespace,
    authenticatedUserId: authenticatedUserId || null,
    // Do not mint a random browser identity during SSR. The client fills it
    // from localStorage once a WebView exists, while server-provided tracking
    // cookies remain available in either environment.
    externalUserId: initialTrackingExternalUserId.trim() || (
      typeof window === "undefined" ? "" : getOrCreateTrackingUserId()
    ),
  }), [authenticatedUserId, initialTrackingExternalUserId]);
  const pendingConversationMutationsRef = useRef<ConversationMutationRecord[]>([]);
  const conversationMutationFlushInFlightRef = useRef<Promise<unknown> | null>(null);
  const conversationListMutationRevisionRef = useRef(0);
  const liveConversationIdRef = useRef<string | null>(null);
  const conversationRunningStateRef = useRef(new Map<string, boolean>());
  const deletingConversationIdsRef = useRef(new Set<string>());
  const conversationRemovalRollbackRef = useRef(new Map<string, ConversationChannelSummary>());
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
  const pendingConversationOpenAfterHistoryBackRef = useRef<string | null>(null);
  // Direct-message navigation starts on a profile surface but must preserve
  // the participant/menu history underneath it. Keep this guard alive through
  // the iOS history-settle window so a delayed replay cannot reopen the profile.
  const pendingDirectConversationNavigationRef = useRef<PendingDirectConversationNavigation | null>(null);
  const directConversationNavigationTokenRef = useRef(0);
  const directConversationNavigationReleaseTimerRef = useRef<number | null>(null);
  const suppressRowActionMenuUntilRef = useRef(0);
  const activeConversationRef = useRef<ConversationChannelSummary | null>(null);
  const conversationsRef = useRef<ConversationChannelSummary[]>(conversations);
  const hasConversationListSnapshotRef = useRef(initialListState.hasSnapshot);
  const initialTrackingIdentityRef = useRef({
    externalUserId: initialTrackingExternalUserId.trim(),
    sessionKey: initialTrackingSessionKey.trim(),
  });
  const isCreatingConversationRef = useRef(isCreatingConversation);
  const isImportingLegacyConversationRef = useRef(false);
  const pendingHistoryCloseAnimationRef = useRef<ConversationOverlayExitMode>("instant");
  const routeSyncConversationIdRef = useRef<string | null>(null);
  const routeConversationHydrationRef = useRef<string | null>(null);
  const conversationListRefreshInFlightRef = useRef<Promise<ConversationChannelSummary[]> | null>(null);
  const queuedConversationListRefreshOptionsRef = useRef<{ replaceCurrent?: boolean } | null>(null);
  const conversationListCacheWriteTimerRef = useRef<number | null>(null);
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
    const pendingPrimaryLanguages = readPendingPrimaryLanguages();
    const pendingBirthDate = readPendingBirthDate();
    const pendingDiscoverySource = readPendingDiscoverySource();

    if (pendingDefaultLanguages.length === 0 && !pendingBirthDate && !pendingDiscoverySource) return;

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

        const patchPayload: Record<string, unknown> = {
          ...resolvedPreferences.patch,
        };
        if (pendingBirthDate) {
          patchPayload.birthDate = pendingBirthDate;
        }
        if (pendingDiscoverySource) {
          patchPayload.discoverySource = pendingDiscoverySource;
        }

        if (Object.keys(patchPayload).length === 0) {
          defaultConversationLanguagesSyncVersionRef.current += 1;
          setPreferredDisplayLanguages(resolvedPreferences.primaryLanguages);
          setDefaultSelectedLanguages(resolvedPreferences.defaultConversationLanguages);
          clearPendingLanguagePreferences();
          clearPendingBirthDate();
          clearPendingDiscoverySource();
          return;
        }

        const saveResponse = await fetch(buildClientApiPath("/profile"), {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patchPayload),
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
        clearPendingBirthDate();
        clearPendingDiscoverySource();
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
        {
          ...copy,
          unreadMessagesLabel: copy.notificationsUnreadSectionLabel,
        },
        conversationLocalStats[conversation.id],
        conversationInterimPreviews[conversation.id],
      )
    )),
    [conversationInterimPreviews, conversationLocalStats, conversations, copy, locale, timeLabelsReady],
  );
  const unreadConversationMessageCount = useMemo(
    () => conversations.reduce(
      (total, conversation) => total + Math.max(0, Math.floor(conversation.unreadMessageCount ?? 0)),
      0,
    ),
    [conversations],
  );
  const mountedConversationIds = useMemo(() => {
    return resolveMountedConversationIds(activeConversation?.id, liveConversationId);
  }, [activeConversation?.id, liveConversationId]);
  const mountedConversations = useMemo(() => (
    mountedConversationIds
      .map((conversationId) => conversations.find((conversation) => conversation.id === conversationId) || null)
      .filter((conversation): conversation is ConversationChannelSummary => conversation !== null)
  ), [conversations, mountedConversationIds]);
  const actionDisabled = isCreatingConversation || isImportingLegacyConversation;
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

  const readPendingConversationMutationSnapshot = useCallback(() => {
    const nextRecords = readConversationMutationRecords(conversationMutationIdentity);
    pendingConversationMutationsRef.current = nextRecords;
    return nextRecords;
  }, [conversationMutationIdentity]);

  const applyPendingConversationState = useCallback((
    sourceConversations: ConversationChannelSummary[],
    records = pendingConversationMutationsRef.current,
  ) => applyPendingConversationMutations(sourceConversations, records), []);

  const advanceConversationListMutationRevision = useCallback(() => {
    conversationListMutationRevisionRef.current += 1;
  }, []);

  const rollbackConversationMutation = useCallback((record: ConversationMutationRecord) => {
    if (!record.rollback || record.rollback.removed === true) return;
    const rollbackSnapshot = record.rollback;
    const nextRecords = readPendingConversationMutationSnapshot();
    setConversations((current) => {
      const target = current.find((conversation) => conversation.id === record.conversationId);
      if (!target) return current;
      const rollback = { ...rollbackSnapshot };
      delete rollback.removed;
      return applyPendingConversationState(
        current.map((conversation) => (
          conversation.id === record.conversationId
            ? { ...conversation, ...rollback }
            : conversation
        )),
        nextRecords,
      );
    });
  }, [applyPendingConversationState, readPendingConversationMutationSnapshot]);

  const flushPendingConversationMutations = useCallback(() => {
    if (typeof window === "undefined") return Promise.resolve();
    if (conversationMutationFlushInFlightRef.current) {
      return conversationMutationFlushInFlightRef.current;
    }

    const flushPromise = flushConversationMutationQueue({
      identity: conversationMutationIdentity,
      fetchImpl: (input, init) => {
        const headers = new Headers(buildConversationRequestHeaders(initialTrackingIdentityRef.current));
        new Headers(init?.headers).forEach((value, key) => headers.set(key, value));
        return window.fetch(input, { ...init, headers });
      },
      onSuccess: async (record, response, acknowledged) => {
        if (!acknowledged) return;
        advanceConversationListMutationRevision();
        if (record.kind === "remove") {
          discardDurableFinalizations(record.ownerIdentity, conversationMutationIdentity.apiNamespace, record.conversationId);
          conversationRemovalRollbackRef.current.delete(record.conversationId);
          return;
        }
        if (record.kind === "mark-read" && response.status === 204) return;
        if (record.kind === "profile-default-languages") {
          try {
            const profile = await response.json() as { defaultConversationLanguages?: unknown };
            const savedLanguages = sanitizeSttLanguageSelection(
              profile.defaultConversationLanguages,
              record.patch.defaultConversationLanguages ?? [],
            );
            defaultSelectedLanguagesRef.current = savedLanguages;
            setDefaultSelectedLanguages(savedLanguages);
          } catch {
            // Keep the optimistic local default when the profile response has
            // no parseable body; the queued mutation was acknowledged.
          }
          return;
        }
        try {
          const nextConversation = await readConversationResponse(response);
          const nextRecords = readPendingConversationMutationSnapshot();
          setConversations((current) => applyPendingConversationState(
            upsertConversation(current, nextConversation),
            nextRecords,
          ));
        } catch {
          // A successful mutation is still removed from the queue. The next
          // list refresh will provide the canonical summary if this response
          // did not contain one.
        }
      },
      onPermanentFailure: async (record, _response, acknowledged) => {
        if (!acknowledged) return;
        advanceConversationListMutationRevision();
        if (record.kind === "profile-default-languages") {
          const rollbackLanguages = record.rollback?.defaultConversationLanguages;
          if (rollbackLanguages) {
            defaultSelectedLanguagesRef.current = [...rollbackLanguages];
            setDefaultSelectedLanguages(rollbackLanguages);
          }
        }
        if (record.kind === "remove") {
          // The tombstone is gone after a permanent rejection. Allow a later
          // server refresh to put the room back in the list. Restore the last
          // visible summary immediately when this is still the same session.
          deletingConversationIdsRef.current.delete(record.conversationId);
          const rollbackConversation = conversationRemovalRollbackRef.current.get(record.conversationId);
          conversationRemovalRollbackRef.current.delete(record.conversationId);
          if (rollbackConversation) {
            const nextRecords = readPendingConversationMutationSnapshot();
            setConversations((current) => {
              if (current.some((conversation) => conversation.id === record.conversationId)) {
                return current;
              }
              return applyPendingConversationState(
                upsertConversation(current, rollbackConversation),
                nextRecords,
              );
            });
          }
        }
        rollbackConversationMutation(record);
        logConversationMutationFailure({
          label: "queued-mutation",
          conversationId: record.conversationId,
          method: record.method,
          path: record.endpoint,
          error: new Error("conversation_mutation_rejected"),
          stale: false,
        });
      },
    }).finally(() => {
      conversationMutationFlushInFlightRef.current = null;
      const nextRecords = readPendingConversationMutationSnapshot();
      setConversations((current) => applyPendingConversationState(current, nextRecords));
    });

    conversationMutationFlushInFlightRef.current = flushPromise;
    return flushPromise;
  }, [
    advanceConversationListMutationRevision,
    applyPendingConversationState,
    conversationMutationIdentity,
    readPendingConversationMutationSnapshot,
    rollbackConversationMutation,
  ]);

  const enqueueConversationMutationAndFlush = useCallback((input: {
    conversationId: string;
    kind: ConversationMutationKind;
    endpoint: string;
    method?: "PATCH" | "DELETE" | "POST";
    body: Record<string, unknown>;
    patch: ConversationMutationPatch;
    rollback?: ConversationMutationPatch | null;
  }) => {
    const record = enqueueConversationMutation(conversationMutationIdentity, input);
    advanceConversationListMutationRevision();
    const nextRecords = readPendingConversationMutationSnapshot();
    setConversations((current) => applyPendingConversationState(current, nextRecords));
    if (sessionStatus === "authenticated") {
      void flushPendingConversationMutations();
    }
    return record;
  }, [
    advanceConversationListMutationRevision,
    applyPendingConversationState,
    conversationMutationIdentity,
    flushPendingConversationMutations,
    readPendingConversationMutationSnapshot,
    sessionStatus,
  ]);

  useEffect(() => {
    if (sessionStatus === "unauthenticated") {
      pendingConversationMutationsRef.current = [];
      return;
    }

    // A native session can enqueue a room mutation before useSession exposes
    // the account id. Move that durable work to the canonical account queue
    // once authentication resolves, mirroring the message outbox adoption.
    if (authenticatedUserId) {
      adoptConversationMutationRecords({
        from: {
          apiNamespace: clientApiNamespace,
          authenticatedUserId: null,
          externalUserId: conversationMutationIdentity.externalUserId,
        },
        to: conversationMutationIdentity,
      });
    }

    const nextRecords = readPendingConversationMutationSnapshot();
    const pendingProfileDefaultLanguages = [...nextRecords]
      .filter((record) => (
        record.kind === "profile-default-languages"
        && Array.isArray(record.patch.defaultConversationLanguages)
      ))
      .sort((left, right) => left.updatedAt - right.updatedAt)
      .at(-1)
      ?.patch.defaultConversationLanguages;
    if (pendingProfileDefaultLanguages && pendingProfileDefaultLanguages.length > 0) {
      defaultConversationLanguagesSyncVersionRef.current += 1;
      defaultSelectedLanguagesRef.current = [...pendingProfileDefaultLanguages];
      setDefaultSelectedLanguages(pendingProfileDefaultLanguages);
    }
    setConversations((current) => applyPendingConversationState(current, nextRecords));
    if (sessionStatus === "authenticated") {
      void flushPendingConversationMutations();
    }
  }, [
    applyPendingConversationState,
    authenticatedUserId,
    conversationMutationIdentity,
    flushPendingConversationMutations,
    readPendingConversationMutationSnapshot,
    sessionStatus,
  ]);

  useEffect(() => {
    if (sessionStatus !== "authenticated") return;

    const flush = () => {
      void flushPendingConversationMutations();
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") flush();
    };
    const retryTimer = window.setInterval(flush, 15_000);
    window.addEventListener("online", flush);
    window.addEventListener("focus", flush);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.clearInterval(retryTimer);
      window.removeEventListener("online", flush);
      window.removeEventListener("focus", flush);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [flushPendingConversationMutations, sessionStatus]);

  // Recovery must also run on a cold start straight into the list, without
  // requiring the user to reopen the room containing the unfinished message.
  useEffect(() => {
    if (sessionStatus !== "authenticated" || !authenticatedUserId) return;
    const owner = `user:${authenticatedUserId}`;
    const namespace = conversationMutationIdentity.apiNamespace;
    const releaseOwner = retainDurableFinalizationOwner(owner, namespace);
    let cancelled = false;
    const retry = () => { void flushDurableFinalizations(owner, namespace); };
    const resume = () => { void flushDurableFinalizations(owner, namespace, true); };
    const visible = () => { if (document.visibilityState === "visible") resume(); };
    void adoptDurableFinalizations(`tracking:${conversationMutationIdentity.externalUserId}`, owner, namespace)
      .then(() => { if (!cancelled) resume(); });
    const timer = window.setInterval(retry, 15_000);
    window.addEventListener("online", resume);
    document.addEventListener("visibilitychange", visible);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.removeEventListener("online", resume);
      document.removeEventListener("visibilitychange", visible);
      releaseOwner();
    };
  }, [authenticatedUserId, conversationMutationIdentity, sessionStatus]);

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

  const performConversationListRefresh = useCallback(async (options?: { replaceCurrent?: boolean }) => {
    const refreshMutationRevision = conversationListMutationRevisionRef.current;
    const response = await fetch(
      initialNativeUi
        ? buildConversationApiPath("?view=native-list")
        : buildConversationApiPath(),
      {
        cache: "no-store",
        headers: buildConversationRequestHeaders(initialTrackingIdentityRef.current),
      },
    );
    const serverConversations = await readConversationListResponse(response);
    if (!isConversationListRefreshCurrent({
      startedMutationRevision: refreshMutationRevision,
      currentMutationRevision: conversationListMutationRevisionRef.current,
    })) {
      // The response started before a local room mutation was acknowledged.
      // Do not cache or render that stale snapshot after the queue has already
      // removed its optimistic overlay; ask the existing refresh loop to retry.
      queuedConversationListRefreshOptionsRef.current = {
        replaceCurrent:
          queuedConversationListRefreshOptionsRef.current?.replaceCurrent === true
          || options?.replaceCurrent === true,
      };
      return conversationsRef.current;
    }
    // A list GET may have started before a local edit reached the server.
    // Overlay pending mutations before caching or rendering so stale server
    // snapshots cannot make a just-edited room visibly jump backwards.
    const nextConversations = applyPendingConversationState(serverConversations);
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
  }, [applyPendingConversationState, conversationCacheIdentity, initialNativeUi]);

  const refreshConversationList = useCallback((options?: { replaceCurrent?: boolean }) => {
    const inFlight = conversationListRefreshInFlightRef.current;
    if (inFlight) {
      queuedConversationListRefreshOptionsRef.current = {
        replaceCurrent:
          queuedConversationListRefreshOptionsRef.current?.replaceCurrent === true
          || options?.replaceCurrent === true,
      };
      return inFlight;
    }

    const refreshPromise = (async () => {
      let nextOptions: { replaceCurrent?: boolean } | null = options ?? {};
      let latestResult: ConversationChannelSummary[] = conversationsRef.current;
      let latestError: unknown = null;

      while (nextOptions) {
        queuedConversationListRefreshOptionsRef.current = null;
        try {
          latestResult = await performConversationListRefresh(nextOptions);
          latestError = null;
        } catch (error) {
          latestError = error;
        }
        nextOptions = queuedConversationListRefreshOptionsRef.current;
      }

      if (latestError) throw latestError;
      return latestResult;
    })().finally(() => {
      conversationListRefreshInFlightRef.current = null;
    });

    conversationListRefreshInFlightRef.current = refreshPromise;
    return refreshPromise;
  }, [performConversationListRefresh]);

  const hydrateConversationSummary = useCallback(async (conversationId: string) => {
    const normalizedConversationId = conversationId.trim();
    if (!normalizedConversationId) {
      throw new Error("conversation_id_required");
    }

    const response = await fetch(
      buildConversationApiPath(`/${encodeURIComponent(normalizedConversationId)}`),
      {
        cache: "no-store",
        headers: buildConversationRequestHeaders(initialTrackingIdentityRef.current),
      },
    );
    return readConversationResponse(response);
  }, []);

  const markConversationAsRead = useCallback((conversationId: string) => {
    const normalizedConversationId = conversationId.trim();
    if (!normalizedConversationId) return;
    const previousConversation = conversationsRef.current.find(
      (conversation) => conversation.id === normalizedConversationId,
    );
    enqueueConversationMutationAndFlush({
      conversationId: normalizedConversationId,
      kind: "mark-read",
      endpoint: buildConversationApiPath(`/${normalizedConversationId}`),
      body: { markRead: true },
      patch: { unreadMessageCount: 0 },
      rollback: previousConversation
        ? { unreadMessageCount: previousConversation.unreadMessageCount ?? 0 }
        : null,
    });
  }, [enqueueConversationMutationAndFlush]);

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
    conversationRunningStateRef.current.delete(conversationId);
    conversationRoomRefs.current.delete(conversationId);
    setActiveConversation((current) => (
      current?.id === conversationId ? null : current
    ));
    setConversations((current) => current.filter((conversation) => conversation.id !== conversationId));
  }, []);

  const enqueueConversationTitleMutation = useCallback((conversationId: string, normalizedTitle: string) => {
    const previousConversation = conversationsRef.current.find(
      (conversation) => conversation.id === conversationId,
    );
    if (!previousConversation) return false;

    enqueueConversationMutationAndFlush({
      conversationId,
      kind: "title",
      endpoint: buildConversationApiPath(`/${conversationId}`),
      body: { title: normalizedTitle },
      patch: { title: normalizedTitle },
      rollback: { title: previousConversation.title },
    });
    return true;
  }, [enqueueConversationMutationAndFlush]);

  const enqueueConversationRemoval = useCallback((conversationId: string, isLeavingSharedConversation: boolean) => {
    const previousConversation = conversationsRef.current.find(
      (conversation) => conversation.id === conversationId,
    );
    if (!previousConversation) return false;

    conversationRemovalRollbackRef.current.set(conversationId, previousConversation);
    handleConversationDeleted(conversationId);
    enqueueConversationMutationAndFlush({
      conversationId,
      kind: "remove",
      endpoint: buildConversationApiPath(`/${conversationId}${isLeavingSharedConversation ? "/leave" : ""}`),
      method: isLeavingSharedConversation ? "POST" : "DELETE",
      body: {},
      patch: { removed: true },
    });
    return true;
  }, [enqueueConversationMutationAndFlush, handleConversationDeleted]);

  const handleRenameConversationFromList = useCallback(() => {
    if (isRenamingConversation || !renameDialogConversationId) return;

    const normalizedTitle = renameConversationValue.trim();
    if (!normalizedTitle) {
      window.alert(roomManagementCopy.renameEmptyMessage);
      return;
    }

    if (!enqueueConversationTitleMutation(renameDialogConversationId, normalizedTitle)) return;
    setRenameDialogConversationId(null);
    setRenameConversationValue("");
    setIsRenamingConversation(false);
  }, [
    enqueueConversationTitleMutation,
    isRenamingConversation,
    renameConversationValue,
    renameDialogConversationId,
    roomManagementCopy.renameEmptyMessage,
  ]);

  // Solo room -> DELETE (deletes for the owner, the only real member).
  // Shared room -> POST .../leave (removes just the caller's own
  // membership, see leaveConversationChannel). Branches internally rather
  // than duplicating the function, same as handleDeleteConversationConfirm
  // in LivePhoneDemo.tsx: the STT-stop guard, in-flight tracking
  // (deletingConversationIdsRef — every race-protection check keyed off it
  // elsewhere applies equally either way), and local-state eviction
  // (handleConversationDeleted) are identical regardless of which action
  // removed the room.
  const handleRemoveConversationFromList = useCallback(async () => {
    if (isDeletingConversation || !deleteDialogConversationId) return;

    const conversationId = deleteDialogConversationId;
    const isLeavingSharedConversation = deleteDialogTargetIsMultiMember;
    setIsDeletingConversation(true);
    try {
      deletingConversationIdsRef.current.add(conversationId);
      const roomRef = conversationRoomRefs.current.get(conversationId);
      if (roomRef?.isSttSessionRunning()) {
        try {
          roomRef.prepareForDeletion?.();
          await roomRef.stopRecording({ deferRunningStateChange: true, discardPendingFinalization: true });
        } catch {
          // Ignore stop races and continue removing the room.
        }
      }

      // Hide the room immediately and persist the destructive intent. A
      // transient network failure keeps this tombstone in the queue so a
      // later launch cannot resurrect a room the user already removed.
      if (!enqueueConversationRemoval(conversationId, isLeavingSharedConversation)) {
        throw new Error("conversation_not_found");
      }
      setDeleteDialogConversationId(null);
    } catch {
      deletingConversationIdsRef.current.delete(conversationId);
      window.alert(isLeavingSharedConversation ? leaveConversationCopy.errorToastLabel : deleteConversationCopy.errorToastLabel);
    } finally {
      setIsDeletingConversation(false);
    }
  }, [
    deleteConversationCopy.errorToastLabel,
    deleteDialogConversationId,
    deleteDialogTargetIsMultiMember,
    enqueueConversationRemoval,
    isDeletingConversation,
    leaveConversationCopy.errorToastLabel,
  ]);

  const setConversationRoomRef = useCallback((conversationId: string, nextRef: MingleHomeRef | null) => {
    if (nextRef) {
      conversationRoomRefs.current.set(conversationId, nextRef);
    } else {
      conversationRoomRefs.current.delete(conversationId);
    }
  }, []);

  const handleConversationSurfaceRequestClose = useCallback((conversationId: string) => {
    const roomRef = conversationRoomRefs.current.get(conversationId);
    if (roomRef?.requestCloseTopmostOverlay()) {
      return false;
    }
    return true;
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
    await currentLiveRoom?.stopRecording({
      deferRunningStateChange: true,
      forceNativeStop: isNativeAppRuntime(),
    });
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
      conversationRunningStateRef.current.set(conversationId, isRunning);
      if (isRunning) {
        setLiveConversationId(conversationId);
      } else {
        setLiveConversationId((current) => (
          current === conversationId ? null : current
        ));
      }
      return;
    }
    conversationRunningStateRef.current.set(conversationId, isRunning);

    const nextStatus = isRunning ? "active" : "paused";
    const previousConversation = conversationsRef.current.find(
      (conversation) => conversation.id === conversationId,
    );
    if (!previousConversation) return;

    const nowIso = new Date().toISOString();
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

    enqueueConversationMutationAndFlush({
      conversationId,
      kind: "status",
      endpoint: buildConversationApiPath(`/${conversationId}`),
      body: { status: nextStatus },
      patch: {
        status: nextStatus,
        pausedAt: isRunning ? null : (previousConversation.pausedAt ?? nowIso),
      },
      rollback: {
        status: previousConversation.status,
        pausedAt: previousConversation.pausedAt,
      },
    });

    // Activating a room also pauses the caller's other active rooms on the
    // server. Queue those implicit local changes as well so a stale list GET
    // cannot briefly resurrect another active room.
    if (isRunning) {
      for (const conversation of conversationsRef.current) {
        if (
          conversation.id === conversationId
          || conversation.status !== "active"
          || deletingConversationIdsRef.current.has(conversation.id)
        ) {
          continue;
        }
        enqueueConversationMutationAndFlush({
          conversationId: conversation.id,
          kind: "status",
          endpoint: buildConversationApiPath(`/${conversation.id}`),
          body: { status: "paused" },
          patch: { status: "paused", pausedAt: conversation.pausedAt ?? nowIso },
          rollback: { status: conversation.status, pausedAt: conversation.pausedAt },
        });
      }
    }
  }, [applyRunningConversationState, enqueueConversationMutationAndFlush, getDerivedConversationRunningState]);

  const persistUserDefaultConversationLanguages = useCallback((
    nextLanguages: string[],
    previousLanguages: string[],
    expectedVersion: number,
  ) => {
    if (sessionStatus !== "authenticated" || !authenticatedUserId) return;
    if (defaultConversationLanguagesSyncVersionRef.current !== expectedVersion) return;

    enqueueConversationMutationAndFlush({
      // Profile preferences do not belong to a room. A stable sentinel keeps
      // them in the same ordered, durable queue while applyPending... ignores
      // them for conversation-list rendering.
      conversationId: "__profile__",
      kind: "profile-default-languages",
      endpoint: buildClientApiPath("/profile"),
      body: { defaultConversationLanguages: nextLanguages },
      patch: { defaultConversationLanguages: nextLanguages },
      rollback: { defaultConversationLanguages: previousLanguages },
    });
  }, [authenticatedUserId, enqueueConversationMutationAndFlush, sessionStatus]);

  const handleConversationSelectedLanguagesChange = useCallback((
    conversationId: string,
    nextSelectedLanguages: string[],
  ) => {
    const currentDefaultLanguages = defaultSelectedLanguagesRef.current;
    const normalizedSelectedLanguages = sanitizeSttLanguageSelection(
      nextSelectedLanguages,
      currentDefaultLanguages,
    );
    if (normalizedSelectedLanguages.length === 0) {
      return;
    }

    const previousConversation = conversationsRef.current.find(
      (conversation) => conversation.id === conversationId,
    );
    if (!previousConversation) return;

    const previousSelectedLanguages = sanitizeSttLanguageUnion(
      previousConversation.selectedLanguages,
      currentDefaultLanguages,
    );
    const previousViewerSelectedLanguages = resolveLanguageSelectorOwnSelectedLanguages(
      previousSelectedLanguages,
      previousConversation.viewerSelectedLanguages,
    );
    const previousTranslationLanguagesLinked =
      previousConversation.translationLanguagesLinked !== false;
    const currentUnion = sanitizeSttLanguageUnion(
      previousConversation.selectedLanguages,
      previousSelectedLanguages,
    );
    const hasLanguageAttribution = previousConversation.selectedLanguagesAttribution !== undefined;
    const nextUnion = previousConversation.isMultiMember
      ? sanitizeSttLanguageUnion(
          resolveLanguageSelectorUnionAfterOwnLanguagesChange({
            previousUnion: currentUnion,
            previousAttribution: previousConversation.selectedLanguagesAttribution,
            viewerUserId: authenticatedUserId,
            previousOwnSelectedLanguages: previousViewerSelectedLanguages,
            nextOwnSelectedLanguages: normalizedSelectedLanguages,
          }),
          normalizedSelectedLanguages,
        )
      : [...normalizedSelectedLanguages];
    const nextAttribution = previousConversation.isMultiMember
      && authenticatedUserId
      && hasLanguageAttribution
      ? Object.entries(previousConversation.selectedLanguagesAttribution ?? {}).reduce<Record<string, string[]>>(
          (result, [language, memberIds]) => {
            const remainingMemberIds = memberIds.filter((memberId) => memberId !== authenticatedUserId);
            if (remainingMemberIds.length > 0) result[language] = remainingMemberIds;
            return result;
          },
          {},
        )
      : undefined;
    if (nextAttribution) {
      for (const language of normalizedSelectedLanguages) {
        nextAttribution[language] = [
          ...(nextAttribution[language] ?? []),
          authenticatedUserId,
        ];
      }
    }
    const previousDefaultLanguages = [...currentDefaultLanguages];
    const nextDefaultLanguagesVersion = defaultConversationLanguagesSyncVersionRef.current + 1;
    defaultConversationLanguagesSyncVersionRef.current = nextDefaultLanguagesVersion;
    defaultSelectedLanguagesRef.current = [...normalizedSelectedLanguages];
    setDefaultSelectedLanguages(normalizedSelectedLanguages);

    const optimisticPatch: ConversationMutationPatch = {
      // Update both the caller's own picks and the visible room union. For a
      // shared room the union keeps languages held by another member while
      // immediately dropping a language nobody owns anymore.
      selectedLanguages: nextUnion,
      viewerSelectedLanguages: [...normalizedSelectedLanguages],
      translationLanguagesLinked: false,
      ...(nextAttribution ? { selectedLanguagesAttribution: nextAttribution } : {}),
    };
    enqueueConversationMutationAndFlush({
      conversationId,
      kind: "selected-languages",
      endpoint: buildConversationApiPath(`/${conversationId}`),
      body: { selectedLanguages: normalizedSelectedLanguages },
      patch: optimisticPatch,
      rollback: {
        selectedLanguages: previousSelectedLanguages,
        viewerSelectedLanguages: previousViewerSelectedLanguages,
        translationLanguagesLinked: previousTranslationLanguagesLinked,
        ...(previousConversation.selectedLanguagesAttribution
          ? { selectedLanguagesAttribution: previousConversation.selectedLanguagesAttribution }
          : {}),
      },
    });
    persistUserDefaultConversationLanguages(
      normalizedSelectedLanguages,
      previousDefaultLanguages,
      nextDefaultLanguagesVersion,
    );
  }, [authenticatedUserId, enqueueConversationMutationAndFlush, persistUserDefaultConversationLanguages]);

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
    enqueueConversationMutationAndFlush({
      conversationId,
      kind: "speech-languages",
      endpoint: buildConversationApiPath(`/${conversationId}`),
      body: { speechLanguages: normalizedSpeechLanguages },
      patch: { speechLanguages: [...normalizedSpeechLanguages] },
      rollback: { speechLanguages: previousSpeechLanguages },
    });
  }, [defaultSelectedLanguages, enqueueConversationMutationAndFlush]);

  const handleConversationTranslationLanguagesLinkedChange = useCallback((
    conversationId: string,
    nextTranslationLanguagesLinked: boolean,
  ) => {
    const previousConversation = conversationsRef.current.find(
      (conversation) => conversation.id === conversationId,
    );
    if (!previousConversation) return;

    const previousTranslationLanguagesLinked = previousConversation.translationLanguagesLinked !== false;

    enqueueConversationMutationAndFlush({
      conversationId,
      kind: "translation-languages-linked",
      endpoint: buildConversationApiPath(`/${conversationId}`),
      body: { translationLanguagesLinked: nextTranslationLanguagesLinked },
      patch: { translationLanguagesLinked: nextTranslationLanguagesLinked },
      rollback: { translationLanguagesLinked: previousTranslationLanguagesLinked },
    });
  }, [enqueueConversationMutationAndFlush]);

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
    enqueueConversationMutationAndFlush({
      conversationId,
      kind: "default-display-language",
      endpoint: buildConversationApiPath(`/${conversationId}`),
      body: { defaultDisplayLanguage: normalizedDefaultDisplayLanguage },
      patch: { defaultDisplayLanguage: normalizedDefaultDisplayLanguage },
      rollback: { defaultDisplayLanguage: previousDefaultDisplayLanguage },
    });
  }, [enqueueConversationMutationAndFlush]);

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

    const isActiveConversation = activeConversationRef.current?.id === conversationId;
    if (isActiveConversation) {
      markConversationAsRead(conversationId);
    }

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
        ...(isActiveConversation ? { unreadMessageCount: 0 } : {}),
      };
    }).sort(compareConversationRecency));
  }, [clearConversationInterimPreview, markConversationAsRead]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const syncConversationSurfaceHistory = () => {
      const nextHistory = readSlideSurfaceHistoryForScope(CONVERSATION_SURFACE_SCOPE);
      const pendingNavigation = pendingDirectConversationNavigationRef.current;
      if (pendingNavigation) {
        const filteredHistory = nextHistory.filter((entry) => (
          entry.id !== CONVERSATION_PROFILE_SURFACE_ID
          || entry.value !== pendingNavigation.profileUserId
        ));
        if (filteredHistory.length !== nextHistory.length) {
          setConversationSurfaceHistory(filteredHistory);
          return;
        }
      }
      setConversationSurfaceHistory(nextHistory);
    };

    window.addEventListener("popstate", syncConversationSurfaceHistory);
    return () => window.removeEventListener("popstate", syncConversationSurfaceHistory);
  }, []);

  const openConversationSurface = useCallback((entry: {
    id: string;
    value?: string;
  }) => {
    pushSlideSurfaceHistory({
      scope: CONVERSATION_SURFACE_SCOPE,
      ...entry,
    });
    setConversationSurfaceHistory(readSlideSurfaceHistoryForScope(CONVERSATION_SURFACE_SCOPE));
  }, []);

  const closeConversationSurface = useCallback((entry: {
    id: string;
    value?: string;
  }) => {
    if (typeof window !== "undefined") {
      const currentEntries = readSlideSurfaceHistoryForScope(
        CONVERSATION_SURFACE_SCOPE,
        window.history.state,
      );
      const currentEntry = currentEntries[currentEntries.length - 1];
      if (
        currentEntry?.id === entry.id
        && (entry.value === undefined || currentEntry.value === entry.value)
      ) {
        window.history.back();
        return;
      }
    }

    setConversationSurfaceHistory((current) => {
      const entryIndex = [...current].reverse().findIndex((candidate) => (
        candidate.id === entry.id
        && (entry.value === undefined || candidate.value === entry.value)
      ));
      if (entryIndex < 0) return current;
      const actualIndex = current.length - 1 - entryIndex;
      return current.filter((_candidate, index) => index !== actualIndex);
    });
  }, []);

  const clearConversationSurfaceHistory = useCallback(() => {
    if (typeof window !== "undefined") {
      replaceSlideSurfaceHistory(readSlideSurfaceHistory(window.history.state).filter((entry) => (
        entry.scope !== CONVERSATION_SURFACE_SCOPE
      )));
    }
    setConversationSurfaceHistory([]);
  }, []);

  const handleOpenSearch = useCallback(() => {
    openSearchOverlay({ transitionMode: "animate", syncHistory: "push" });
  }, [openSearchOverlay]);

  const openConversationProfile = useCallback((userId: string) => {
    if (pendingDirectConversationNavigationRef.current) return;
    const normalizedUserId = userId.trim();
    if (!normalizedUserId) return;

    postNativeBannerZone("hidden");
    openConversationSurface({
      id: CONVERSATION_PROFILE_SURFACE_ID,
      value: normalizedUserId,
    });
  }, [openConversationSurface]);

  const openNotifications = useCallback(() => {
    postNativeBannerZone("hidden");
    openConversationSurface({ id: CONVERSATION_NOTIFICATIONS_SURFACE_ID });
  }, [openConversationSurface]);

  useEffect(() => {
    setIsClientReady(true);
    setIsNativeRuntime(isNativeAppRuntime());
  }, []);

  useLayoutEffect(() => {
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

    const nextLanguageOnboardingPhase = shouldAutoOpenLanguageOnboarding(hasConfirmedLanguageOnboarding)
      ? "selection"
      : "ready";
    resolvedLanguageOnboardingPhase = nextLanguageOnboardingPhase;
    setLanguageOnboardingPhase(nextLanguageOnboardingPhase);
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
    if (sessionStatus !== "authenticated") {
      setUnreadNotificationCount(0);
      return;
    }

    let cancelled = false;
    void fetch(buildClientApiPath("/notifications?limit=1"), { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("notification_count_load_failed");
        return response.json() as Promise<{ unreadCount?: unknown }>;
      })
      .then((payload) => {
        if (cancelled) return;
        const nextUnreadCount = typeof payload.unreadCount === "number" ? payload.unreadCount : 0;
        setUnreadNotificationCount(Math.max(0, Math.floor(nextUnreadCount)));
      })
      .catch(() => {
        if (!cancelled) setUnreadNotificationCount(0);
      });

    return () => {
      cancelled = true;
    };
  }, [sessionStatus]);

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

    const cachedNativeSttConversationId = readCachedNativeSttConversationId();
    const hiddenNativeSttConversation = isNativeSttStatusLive(cachedNativeSttStatus)
      ? findNativeSttRestoreConversation(
          conversations,
          deletingConversationIdsRef.current,
          cachedNativeSttConversationId,
        )
      : null;

    // A live native session is authoritative for one specific room. The list
    // can briefly render without that room while hydration is catching up;
    // never infer that every other active room is stale in that window.
    if (
      isNativeSttStatusLive(cachedNativeSttStatus)
      && cachedNativeSttConversationId
      && !hiddenNativeSttConversation
    ) {
      return;
    }

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
        // callback cannot enqueue a paused mutation; the first native running
        // callback will promote it back to active.
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
        cachedNativeSttConversationId,
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
      const previousConversation = conversations.find((conversation) => conversation.id === conversationId);
      enqueueConversationMutationAndFlush({
        conversationId,
        kind: "status",
        endpoint: buildConversationApiPath(`/${conversationId}`),
        body: { status: "paused" },
        patch: { status: "paused", pausedAt: previousConversation?.pausedAt ?? new Date().toISOString() },
        rollback: previousConversation
          ? { status: previousConversation.status, pausedAt: previousConversation.pausedAt }
          : null,
      });
    }
  }, [
    activeConversation,
    closeSearchOverlay,
    conversations,
    enqueueConversationMutationAndFlush,
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
    isImportingLegacyConversationRef.current = isImportingLegacyConversation;
  }, [isImportingLegacyConversation]);

  useEffect(() => {
    if (!isNativeAppRuntime()) return;
    postNativeBannerZone(resolveConversationListNativeBannerZone({
      isAuthenticated: sessionStatus === "authenticated",
      hasActiveConversation: Boolean(activeConversation),
      isSearchOpen: showSearch,
      isListOverlayOpen: Boolean(
        isCreateChoiceModalOpen
        || rowActionMenu
        || renameDialogConversationId
        || deleteDialogConversationId
        || languageOnboardingModalOpen
        || notificationSurfaceOpen
        || conversationProfileId
      ),
    }));
  }, [
    activeConversation,
    conversationProfileId,
    deleteDialogConversationId,
    isCreateChoiceModalOpen,
    languageOnboardingModalOpen,
    notificationSurfaceOpen,
    renameDialogConversationId,
    rowActionMenu,
    sessionStatus,
    showSearch,
  ]);

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

    const cachedConversations = applyPendingConversationState(cached.conversations);
    conversationsRef.current = cachedConversations;
    hasConversationListSnapshotRef.current = true;
    setConversations(cachedConversations);
    setConversationLocalStats(cached.localStats);
    refreshConversationLocalStats(cachedConversations);
    setTimeLabelsReady(true);
    setIsHydratingConversations(false);
  }, [
    conversationCacheIdentity,
    applyPendingConversationState,
    initialConversations.length,
    initialNativeUi,
    initialWarmSnapshot,
    refreshConversationLocalStats,
    sessionStatus,
  ]);

  useEffect(() => {
    if (sessionStatus !== "authenticated") return;

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

  // Live sync for the LIST screen itself: a new message landing in ANY room
  // this user belongs to should update its preview/ordering here without a
  // manual refresh, not just inside an already-open room — mirrors
  // use-realtime-stt.ts's per-room version of the same pattern, just scoped
  // to this user's own list:<userId> topic on mingle-stt's event bus
  // instead of one room's sessionKey. A fallback poll covers unavailable push,
  // and a watchdog covers iOS sockets that remain OPEN after losing traffic.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (sessionStatus !== "authenticated") return;

    let cancelled = false;
    let socket: WebSocket | null = null;
    let reconnectTimer: number | null = null;
    let lastRealtimeActivityAt = Date.now();

    const clearReconnectTimer = () => {
      if (reconnectTimer !== null) {
        window.clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
    };
    const scheduleReconnect = () => {
      if (cancelled) return;
      clearReconnectTimer();
      reconnectTimer = window.setTimeout(() => {
        void openSocket();
      }, 5_000);
    };

    const openSocket = async () => {
      if (cancelled) return;
      try {
        const response = await fetch(buildConversationApiPath("/list-realtime-token"), {
          cache: "no-store",
          headers: buildConversationRequestHeaders(initialTrackingIdentityRef.current),
        });
        if (!response.ok || cancelled) {
          if (response.status >= 500) scheduleReconnect();
          return;
        }
        const payload = await response.json() as { token?: string | null };
        const token = payload.token;
        const wsBase = getConversationEventsWsUrl();
        if (!token || !wsBase || cancelled) {
          // A missing token/URL means realtime is intentionally unavailable in
          // this deployment. The 20-second poll below is the fallback; retrying
          // token setup every five seconds would add more load than the poll.
          return;
        }

        socket = new WebSocket(`${wsBase}?token=${encodeURIComponent(token)}`);
        socket.onopen = () => {
          lastRealtimeActivityAt = Date.now();
        };
        socket.onmessage = () => {
          lastRealtimeActivityAt = Date.now();
          void refreshConversationList().catch(() => {
            // Keep the current local snapshot; a later push or fallback poll retries.
          });
        };
        socket.onclose = () => {
          if (cancelled) return;
          socket = null;
          scheduleReconnect();
        };
      } catch {
        // Realtime push failed to set up — the poll fallback below still runs.
        scheduleReconnect();
      }
    };

    void openSocket();

    const pollTimer = window.setInterval(() => {
      if (!shouldRunRealtimeFallbackRefresh({
        isDocumentVisible: document.visibilityState === "visible",
        socketReadyState: socket?.readyState,
        lastRealtimeActivityAt,
        now: Date.now(),
      })) return;
      void refreshConversationList().catch(() => {
        // Keep the current local snapshot while realtime recovery is unavailable.
      });
    }, REALTIME_FALLBACK_POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearReconnectTimer();
      window.clearInterval(pollTimer);
      if (socket) {
        socket.onclose = null;
        socket.close();
      }
    };
  }, [refreshConversationList, sessionStatus]);

  useEffect(() => {
    if (
      !initialNativeUi
      || isHydratingConversations
      || sessionStatus !== "authenticated"
    ) {
      return;
    }

    if (conversationListCacheWriteTimerRef.current !== null) return;
    conversationListCacheWriteTimerRef.current = window.setTimeout(() => {
      conversationListCacheWriteTimerRef.current = null;
      writeConversationListCache(
        conversationCacheIdentityRef.current,
        conversationsRef.current,
        conversationLocalStatsRef.current,
      );
    }, 1_000);
  }, [
    conversationCacheIdentity,
    conversationLocalStats,
    conversations,
    initialNativeUi,
    isHydratingConversations,
    sessionStatus,
  ]);

  useEffect(() => () => {
    if (conversationListCacheWriteTimerRef.current === null) return;
    window.clearTimeout(conversationListCacheWriteTimerRef.current);
    conversationListCacheWriteTimerRef.current = null;
    writeConversationListCache(
      conversationCacheIdentityRef.current,
      conversationsRef.current,
      conversationLocalStatsRef.current,
    );
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (isHydratingConversations) return;
    if (activeConversation) return;
    if (conversations.length > 0) return;
    if (isCreatingConversation || isImportingLegacyConversationRef.current) return;
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
    const openedConversation = conversation.unreadMessageCount
      ? { ...conversation, unreadMessageCount: 0 }
      : conversation;
    activeConversationRef.current = openedConversation;
    setActiveConversation(openedConversation);
    setConversations((current) => current.map((currentConversation) => (
      currentConversation.id === conversation.id
        ? { ...currentConversation, unreadMessageCount: 0 }
        : currentConversation
    )));
    markConversationAsRead(conversation.id);

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

    return openedConversation;
  }, [closeSearchOverlay, markConversationAsRead]);

  const startDirectConversationFromProfile = useCallback(async (
    conversation: ConversationChannelSummary,
  ) => {
    if (!conversation.id || pendingDirectConversationNavigationRef.current) return;

    const surfaceEntries = readSlideSurfaceHistoryForScope(CONVERSATION_SURFACE_SCOPE);
    const profileEntry = [...surfaceEntries]
      .reverse()
      .find((entry) => entry.id === CONVERSATION_PROFILE_SURFACE_ID);
    const profileUserId = profileEntry
      ? profileEntry.value ?? conversationProfileId ?? ""
      : conversationProfileId ?? "";
    const currentConversation = activeConversationRef.current;
    const currentConversationId = currentConversation?.id ?? readConversationIdFromLocation();
    const isCurrentConversation = currentConversationId === conversation.id;
    const token = directConversationNavigationTokenRef.current + 1;
    directConversationNavigationTokenRef.current = token;
    pendingDirectConversationNavigationRef.current = {
      token,
      profileUserId,
    };

    if (directConversationNavigationReleaseTimerRef.current !== null) {
      window.clearTimeout(directConversationNavigationReleaseTimerRef.current);
      directConversationNavigationReleaseTimerRef.current = null;
    }

    try {
      // Consume the profile and every conversation-owned parent surface. This
      // removes notification/profile entries before the menu depth is reset.
      await consumeSlideSurfaceHistoryForScope(CONVERSATION_SURFACE_SCOPE);
      clearConversationSurfaceHistory();

      const currentRoomRef = currentConversationId
        ? conversationRoomRefs.current.get(currentConversationId)
        : null;
      await currentRoomRef?.resetNavigationOverlays();

      if (isCurrentConversation) {
        // Continuing the room that is already visible does not need a route
        // entry. Close only the profile/menu surfaces and reveal that room.
        setConversations((current) => upsertConversation(current, conversation));
        return;
      }

      if (currentRoomRef?.isSttSessionRunning()) {
        await currentRoomRef.stopRecording({ deferRunningStateChange: true });
      }

      if (currentConversation) {
        // The current room entry is now the canonical list entry. The next
        // openConversationSummary call will push exactly one room entry above
        // it, producing [conversation list] -> [conversation room].
        closeConversationOverlay(currentConversation, {
          animateExit: false,
          replaceUrl: true,
        });
      } else if (currentConversationId) {
        activeConversationRef.current = null;
        replaceConversationOverlayUrl(null, "direct-conversation-stack-reset");
        setActiveConversation((current) => (
          current?.id === currentConversationId ? null : current
        ));
      }

      setConversations((current) => upsertConversation(current, conversation));
      await openConversationSummary(conversation, {
        enterMode: "instant",
        syncHistory: "push",
      });
    } finally {
      if (directConversationNavigationReleaseTimerRef.current !== null) {
        window.clearTimeout(directConversationNavigationReleaseTimerRef.current);
      }
      directConversationNavigationReleaseTimerRef.current = window.setTimeout(() => {
        if (pendingDirectConversationNavigationRef.current?.token === token) {
          pendingDirectConversationNavigationRef.current = null;
        }
        directConversationNavigationReleaseTimerRef.current = null;
      }, DIRECT_CONVERSATION_NAVIGATION_GUARD_MS);
    }
  }, [clearConversationSurfaceHistory, closeConversationOverlay, conversationProfileId, openConversationSummary]);


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

    // The overlay is hidden before history.back() settles. Android WebView can
    // therefore deliver a row tap while the old room entry is still current;
    // the delayed popstate would immediately close that newly opened room and
    // make the first tap look ignored. Preserve the tap and replay it after
    // the history transition commits.
    if (pendingConversationHistoryBackRef.current) {
      pendingConversationOpenAfterHistoryBackRef.current = matchedConversation.id;
      postConversationHistoryDebug("queue-conversation-open-after-back", {
        conversationId: matchedConversation.id,
      });
      return;
    }

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

    const closingConversation = activeConversation;

    // Closing the room is only a visual navigation action. A running room is
    // retained in mountedConversations through liveConversationId, so its STT
    // hook, native owner, message queue, and translations continue while the
    // conversation list is visible. Explicit Stop, room deletion/leave, room
    // switching, sign-out, and app teardown remain the session boundaries.

    const currentConversationId = readConversationIdFromLocation();
    if (
      typeof window !== "undefined"
      && currentConversationId === closingConversation.id
      && window.history.length > 1
    ) {
      postNativeBannerZone("hidden");
      pendingHistoryCloseAnimationRef.current = "animate";
      pendingConversationHistoryBackRef.current = true;
      closeConversationOverlay(closingConversation, { animateExit: true });
      window.history.back();
      return;
    }

    closeConversationOverlay(closingConversation, { animateExit: true, replaceUrl: true });
  }, [activeConversation, closeConversationOverlay, isCreatingConversation]);

  useEffect(() => {
    const canHandleAndroidBack = Boolean(
      (activeConversation && !isCreatingConversation)
      || showSearch
      || notificationSurfaceOpen
      || conversationProfileId
      || rowActionMenu
      || renameDialogConversationId
      || deleteDialogConversationId
      || languageOnboardingModalOpen
    );
    postNativeAndroidBackCapability(canHandleAndroidBack);
    return () => {
      postNativeAndroidBackCapability(false);
    };
  }, [
    activeConversation,
    conversationProfileId,
    deleteDialogConversationId,
    isCreatingConversation,
    languageOnboardingModalOpen,
    notificationSurfaceOpen,
    renameDialogConversationId,
    rowActionMenu,
    showSearch,
  ]);

  useEffect(() => registerNativeBackHandler(() => {
    if (conversationProfileId) {
      closeConversationSurface({
        id: CONVERSATION_PROFILE_SURFACE_ID,
        value: conversationProfileId,
      });
      return true;
    }
    if (notificationSurfaceOpen) {
      closeConversationSurface({ id: CONVERSATION_NOTIFICATIONS_SURFACE_ID });
      return true;
    }
    if (showSearch && !activeConversation) {
      closeSearchOverlay({ transitionMode: "animate", syncHistory: "back" });
      return true;
    }
    if (rowActionMenu) {
      setRowActionMenu(null);
      return true;
    }
    if (renameDialogConversationId) {
      if (!isRenamingConversation) {
        setRenameDialogConversationId(null);
        setRenameConversationValue("");
      }
      return true;
    }
    if (deleteDialogConversationId) {
      if (!isDeletingConversation) {
        setDeleteDialogConversationId(null);
      }
      return true;
    }
    if (languageOnboardingModalOpen) {
      return true;
    }
    if (!activeConversation || isCreatingConversation) return false;
    closeConversationOverlay(activeConversation, { animateExit: true, replaceUrl: true });
    return true;
  }, 5), [
    activeConversation,
    closeConversationOverlay,
    closeConversationSurface,
    closeSearchOverlay,
    conversationProfileId,
    deleteDialogConversationId,
    isDeletingConversation,
    isRenamingConversation,
    isCreatingConversation,
    languageOnboardingModalOpen,
    notificationSurfaceOpen,
    renameDialogConversationId,
    rowActionMenu,
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

    // The room was just deleted/left by this client (see handleConversationDeleted)
    // — the URL racing back to it (e.g. the leave flow's requestCloseMenuPanel
    // doing a multi-step history.go() that lands on an older history entry
    // which still has this room's ?conversation= id) is stale history, not a
    // real "failed to open." Clear it instead of hydrating/alerting.
    if (routeConversationId && deletingConversationIdsRef.current.has(routeConversationId)) {
      if (readConversationIdFromLocation() === routeConversationId) {
        replaceConversationOverlayUrl(null, "route-sync-deleting-conversation");
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

      const queuedConversationId = pendingConversationOpenAfterHistoryBackRef.current;
      pendingConversationOpenAfterHistoryBackRef.current = null;
      if (queuedConversationId) {
        const queuedConversation = conversationsRef.current.find(
          (conversation) => conversation.id === queuedConversationId,
        );
        if (queuedConversation) {
          window.setTimeout(() => {
            void openConversationSummary(queuedConversation, {
              enterMode: "animate",
              syncHistory: "push",
            }).catch((error: unknown) => {
              const aborted = isAbortLikeMutationError(error);
              logConversationMutationFailure({
                label: "route-open",
                conversationId: queuedConversation.id,
                error,
                aborted,
              });
              if (!aborted) window.alert(copy.openErrorMessage);
            });
          }, 0);
        }
      }
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
    // A freshly-created room can be present in the URL before the list refresh
    // has returned it. Do not treat that normal hydration window as a missing
    // room, and do not open another surface against a stale list snapshot.
    if (isHydratingConversations) return;

    const matchedConversation = conversations.find((conversation) => conversation.id === routeConversationId);
    if (!matchedConversation) {
      if (routeConversationHydrationRef.current === routeConversationId) return;

      routeConversationHydrationRef.current = routeConversationId;
      void hydrateConversationSummary(routeConversationId)
        .then((hydratedConversation) => {
          if (readConversationIdFromLocation() !== routeConversationId) return;

          setConversations((current) => upsertConversation(current, hydratedConversation));
          routeSyncConversationIdRef.current = routeConversationId;
          return openConversationSummary(hydratedConversation, {
            enterMode: "instant",
            syncHistory: "none",
            clearManualCloseSuppression: isHistoryRestore,
          });
        })
        .catch((error: unknown) => {
          routeSyncConversationIdRef.current = null;
          if (readConversationIdFromLocation() === routeConversationId) {
            replaceConversationOverlayUrl(null, "route-conversation-hydration-failed");
          }
          const aborted = isAbortLikeMutationError(error);
          logConversationMutationFailure({
            label: "route-hydrate",
            conversationId: routeConversationId,
            error,
            aborted,
          });
          if (aborted) return;
          window.alert(copy.openErrorMessage);
        })
        .finally(() => {
          if (routeConversationHydrationRef.current === routeConversationId) {
            routeConversationHydrationRef.current = null;
          }
        });
      return;
    }

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
    hydrateConversationSummary,
    isCreatingConversation,
    isHydratingConversations,
    isImportingLegacyConversation,
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
  }, [closeConversationOverlay, copy.openErrorMessage, openConversationSummary]);

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

  const handleLanguageOnboardingConfirm = useCallback(async (
    payload: LanguageOnboardingConfirmPayload | string,
  ) => {
    const languageCode = typeof payload === "string" ? payload : payload.language;
    const birthDateParts = typeof payload === "object" && payload ? payload.birthDate : null;
    const discoverySource = typeof payload === "object" && payload ? payload.discoverySource : null;
    const formattedBirthDate = birthDateParts ? formatBirthDate(birthDateParts) : null;

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
      if (formattedBirthDate) {
        window.localStorage.setItem(LS_KEY_PENDING_BIRTH_DATE, formattedBirthDate);
      }
      if (discoverySource) {
        window.localStorage.setItem(LS_KEY_PENDING_DISCOVERY_SOURCE, discoverySource);
      }
    } catch {
      // Ignore storage failures; the onboarding modal will simply reopen next launch.
    }

    let savedPrimaryLanguages: string[] = normalizedPrimaryLanguages;
    let savedDefaultLanguages: string[] = normalizedTargets;
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

        const patchPayload: Record<string, unknown> = {
          ...resolvedPreferences.patch,
        };
        if (formattedBirthDate) {
          patchPayload.birthDate = formattedBirthDate;
        }
        if (discoverySource) {
          patchPayload.discoverySource = discoverySource;
        }

        if (Object.keys(patchPayload).length > 0) {
          const saveResponse = await fetch(buildClientApiPath("/profile"), {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(patchPayload),
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
        clearPendingBirthDate();
        clearPendingDiscoverySource();
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

    resolvedLanguageOnboardingPhase = "ready";
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
  const shouldShowLanguageBootstrapShell = languageOnboardingPhase === "locale-switching";
  // The server-rendered list remains natively scrollable while React hydrates.
  // Only an actual client-side session check blocks actions; the pre-hydration
  // language marker is resolved in a layout effect and must not capture touches.
  const shouldBlockBootstrapInteraction = languageOnboardingPhase === "ready"
    && sessionStatus === "loading";

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

      {shouldBlockBootstrapInteraction ? (
        <div
          className="absolute inset-0 z-[199] bg-transparent"
          role="status"
          aria-live="polite"
          aria-label={locale === "ko" ? "계정 확인 중" : "Checking account"}
        />
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
            onClick={openNotifications}
            className="relative flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-full p-3 transition active:bg-gray-100"
            aria-label={notificationCopy.buttonLabel}
          >
            <Bell size={22} strokeWidth={2} />
            {unreadNotificationCount > 0 ? (
              <span
                className="absolute right-1.5 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold leading-none text-white"
                aria-label={`${unreadNotificationCount} ${notificationCopy.unreadSectionLabel}`}
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
          onClick={() => setIsCreateChoiceModalOpen(true)}
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
        unreadConversationMessageCount={unreadConversationMessageCount}
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
                    {rowActionMenu.item.isMultiMember ? (
                      <>
                        <span>{leaveConversationCopy.menuItemLabel}</span>
                        <LogOut className="h-4 w-4 shrink-0 text-slate-400" />
                      </>
                    ) : (
                      <>
                        <span>{deleteConversationCopy.menuItemLabel}</span>
                        <Trash2 className="h-4 w-4 shrink-0 text-slate-400" />
                      </>
                    )}
                  </button>
                </div>
              </div>,
              document.body,
            ) : null}
            <AnimatePresence custom={{ enterMode: overlayEnterMode, exitMode: overlayExitMode }}>
              {mountedConversations.map((conversation) => {
                const isVisible = activeConversation?.id === conversation.id;

                return (
                  <SlideSurface
                    key={conversation.id}
                    open={isVisible}
                    onClose={() => void handleCloseActiveConversation()}
                    onRequestClose={() => handleConversationSurfaceRequestClose(conversation.id)}
                    ariaLabel={conversation.title}
                    role="main"
                    nativeBackPriority={4}
                    transitionMode={isVisible
                      ? overlayEnterMode
                      : activeConversation
                        ? "instant"
                        : overlayExitMode}
                    zIndex={isVisible ? 101 : 100}
                    className={`fixed inset-0 z-[100] flex min-h-0 flex-col overflow-hidden bg-white ${
                      isVisible ? "" : "pointer-events-none"
                    }`}
                    style={{ touchAction: "pan-y" }}
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
                        onOpenProfile={openConversationProfile}
                        onConversationDeleted={() => {
                          handleConversationDeleted(conversation.id);
                        }}
                        onConversationTitleChange={(title) => {
                          enqueueConversationTitleMutation(conversation.id, title);
                        }}
                        onConversationRemoveRequested={() => {
                          return enqueueConversationRemoval(conversation.id, conversation.isMultiMember);
                        }}
                        conversationTitle={conversation.title}
                        isBlockedCounterpart={conversation.isBlockedCounterpart}
                        isMultiMember={conversation.isMultiMember}
                        conversationId={conversation.id}
                        preferredDisplayLanguage={preferredDisplayLanguage}
                        preferredDisplayLanguages={preferredDisplayLanguages}
                        sessionKeyOverride={conversation.sessionKey}
                        storageNamespace={conversation.id}
                        initialOtherMembers={conversation.otherMembers}
                        initialSelectedLanguages={conversation.selectedLanguages}
                        initialOwnSelectedLanguages={conversation.viewerSelectedLanguages}
                        selectedLanguagesAttribution={conversation.selectedLanguagesAttribution}
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
                  </SlideSurface>
                );
              })}
            </AnimatePresence>
            <NotificationPanel
              open={notificationSurfaceOpen}
              enabled={sessionStatus === "authenticated"}
              locale={locale}
              dictionary={dictionary}
              onClose={() => closeConversationSurface({ id: CONVERSATION_NOTIFICATIONS_SURFACE_ID })}
              onOpenProfile={openConversationProfile}
              onUnreadCountChange={setUnreadNotificationCount}
            />
            <PublicUserProfileScreen
              dictionary={dictionary}
              locale={locale}
              userId={conversationProfileId ?? ""}
              open={Boolean(conversationProfileId)}
              onStartDirectConversation={startDirectConversationFromProfile}
              onClose={() => {
                if (!conversationProfileId) return;
                closeConversationSurface({
                  id: CONVERSATION_PROFILE_SURFACE_ID,
                  value: conversationProfileId,
                });
              }}
            />
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
              aria-label={deleteDialogTargetIsMultiMember ? leaveConversationCopy.dialogTitle : deleteConversationCopy.dialogTitle}
              onClick={(event) => event.stopPropagation()}
              className="w-full max-w-[19rem] rounded-2xl border border-gray-200 bg-white p-4 shadow-xl"
            >
              <p className="text-sm font-semibold text-gray-900">
                {deleteDialogTargetIsMultiMember ? leaveConversationCopy.dialogTitle : deleteConversationCopy.dialogTitle}
              </p>
              <p className="mt-2 text-sm leading-relaxed text-gray-600">
                {deleteDialogTargetIsMultiMember ? leaveConversationCopy.dialogMessage : deleteConversationCopy.dialogMessage}
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
                  {deleteDialogTargetIsMultiMember ? leaveConversationCopy.cancelLabel : deleteConversationCopy.cancelLabel}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    void handleRemoveConversationFromList();
                  }}
                  disabled={isDeletingConversation}
                  className="inline-flex h-10 items-center justify-center rounded-lg bg-rose-600 text-sm font-semibold text-white transition-colors hover:bg-rose-700 disabled:cursor-not-allowed disabled:bg-rose-400"
                >
                  {deleteDialogTargetIsMultiMember
                    ? (isDeletingConversation ? leaveConversationCopy.leavingLabel : leaveConversationCopy.confirmLabel)
                    : (isDeletingConversation ? deleteConversationCopy.deletingLabel : deleteConversationCopy.confirmLabel)}
                </button>
              </div>
            </motion.div>
          </motion.div>
        ) : null}
        {isCreateChoiceModalOpen ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.16, ease: "easeOut" }}
            className="absolute inset-0 z-[120] flex items-center justify-center bg-black/40 px-5"
            onClick={() => setIsCreateChoiceModalOpen(false)}
          >
            <motion.div
              initial={{ opacity: 0, y: 12, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.98 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              role="dialog"
              aria-modal="true"
              aria-label={copy.newConversationButtonLabel}
              onClick={(event) => event.stopPropagation()}
              className="w-full max-w-[19rem] rounded-2xl border border-gray-200 bg-white p-4 shadow-xl"
            >
              <div className="grid gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsCreateChoiceModalOpen(false);
                    void handleCreateConversation();
                  }}
                  className="inline-flex h-12 items-center justify-center rounded-xl border border-gray-300 text-[15px] font-semibold text-gray-800 transition-colors hover:bg-gray-100"
                >
                  {copy.startAloneOptionLabel}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsCreateChoiceModalOpen(false);
                    router.push(buildPathWithCurrentSearchParams(`/${locale}/conversations/new-group`));
                  }}
                  className="inline-flex h-12 items-center justify-center rounded-xl text-[15px] font-semibold text-white transition-colors"
                  style={{ backgroundImage: "linear-gradient(90deg, #f59e0b 0%, #f97316 100%)" }}
                >
                  {copy.inviteFriendsOptionLabel}
                </button>
                <button
                  type="button"
                  onClick={() => setIsCreateChoiceModalOpen(false)}
                  className="mt-1 inline-flex h-10 items-center justify-center rounded-lg text-[14px] font-medium text-gray-500 transition-colors hover:bg-gray-100"
                >
                  {copy.cancelAction}
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
