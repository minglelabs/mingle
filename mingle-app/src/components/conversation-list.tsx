"use client";

import type { AppLocale } from "@/i18n/config";
import type { AppDictionary } from "@/i18n/types";
import type { ConversationChannelSummary } from "@/lib/app-conversations";
import { getConversationDictionary } from "@/i18n/conversations";
import { buildClientApiPath, clientApiNamespace } from "@/lib/api-contract";
import Image from "next/image";
import {
  forwardRef,
  type CSSProperties,
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
import { ArrowRight, Loader2, PencilLine, Search, Trash2 } from "lucide-react";
import { buildStorageKey, getOrCreateTrackingUserId } from "@/components/LivePhoneDemo/use-realtime-stt";
import { resolveLivePhoneDemoConversationDeleteCopy } from "@/components/LivePhoneDemo/live-phone-demo.delete-copy";
import {
  LS_KEY_LANGUAGES,
  LS_KEY_SPEECH_LANGUAGES,
  normalizeLivePhoneDemoAdBannerPosition,
  type LivePhoneDemoAdBannerPosition,
} from "@/components/LivePhoneDemo/live-phone-demo.preferences";
import { resolveLivePhoneDemoRoomManagementCopy } from "@/components/LivePhoneDemo/live-phone-demo.room-management-copy";
import {
  deriveDefaultSttLanguagesForLocale,
  getSttLanguageFlag,
  sanitizeSttLanguageSelection,
} from "@/lib/stt-languages";
import {
  NATIVE_UI_EVENT,
  parseNativeUiBannerLayoutDetail,
  type NativeUiBannerLayoutEventDetail,
} from "@/components/LivePhoneDemo/live-phone-demo.native-ui.logic";

const conversationAvatarImageStyle: CSSProperties & { WebkitUserDrag: string } = {
  WebkitUserDrag: "none",
  pointerEvents: "none",
};
import {
  NATIVE_HISTORY_BACK_ANIMATE_FLAG,
  registerNativeBackHandler,
} from "@/lib/native-back-handler";
import { postNativeBannerZone } from "@/lib/native-banner-zone";
import MingleHome, { type MingleHomeRef } from "@/components/mingle-home";
import MingleWordmark from "@/components/mingle-wordmark";
import { getSpeakerAvatar } from "@/components/LivePhoneDemo/speaker-avatar";

const RECENT_SEARCHES_STORAGE_KEY = "mingle:conversation-searches";
const RECENT_SEARCHES_SYNC_EVENT = "mingle:conversation-searches-sync";
const SEARCH_OVERLAY_HISTORY_STATE_KEY = "__mingleConversationSearchOpen";
const SEARCH_OVERLAY_HISTORY_CLOSE_ANIMATE_FLAG = "__MINGLE_SEARCH_HISTORY_CLOSE_ANIMATE__";
const LEGACY_SINGLE_ROOM_MIGRATION_MARKER_KEY_PREFIX = "mingle:legacy-single-room-migrated";
const MAX_RECENT_SEARCHES = 6;
const EMPTY_RECENT_SEARCHES: string[] = [];
const CONVERSATION_QUERY_KEY = "conversation";
const LEGACY_SINGLE_ROOM_UTTERANCES_KEY = "mingle_demo_utterances";
const LEGACY_SINGLE_ROOM_USAGE_KEY = "mingle_demo_usage_sec";
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
const ROW_ACTION_TOOLTIP_GAP_PX = 8;
const ROW_ACTION_TOOLTIP_ESTIMATED_MAX_HEIGHT_PX = 200;
const ROW_ACTION_TOOLTIP_FORCE_BELOW_VIEWPORT_RATIO = 0.4;
const LIST_PULL_REFRESH_TRIGGER_PX = 72;
const LIST_PULL_REFRESH_MAX_PX = 108;
const LIST_PULL_REFRESH_RESISTANCE = 0.45;

let recentSearchesSnapshot = EMPTY_RECENT_SEARCHES;
let recentSearchesSnapshotRaw = "__initial__";

type ConversationOverlayExitMode = "animate" | "instant";
type ConversationOverlayEnterMode = "animate" | "instant";
type SearchOverlayTransitionMode = "animate" | "instant";
type ConversationOverlayTransitionState = {
  enterMode: ConversationOverlayEnterMode;
  exitMode: ConversationOverlayExitMode;
};

type ConversationListWindow = Window & {
  [NATIVE_HISTORY_BACK_ANIMATE_FLAG]?: boolean;
  [SEARCH_OVERLAY_HISTORY_CLOSE_ANIMATE_FLAG]?: boolean;
  __MINGLE_LAST_NATIVE_MIC_PERMISSION?: "unknown" | "granted" | "denied" | "prompt";
};

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
  languageFlags: string;
}

type TooltipPos =
  | { side: "above"; bottom: number; left: number }
  | { side: "below"; top: number; left: number };

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
};

function isNativeAppRuntime(): boolean {
  return typeof window !== "undefined"
    && typeof window.ReactNativeWebView?.postMessage === "function";
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

function normalizeSearchTerm(rawValue: string): string {
  return rawValue.trim().replace(/\s+/g, " ");
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

function normalizeRecentSearches(values: string[]): string[] {
  const deduped: string[] = [];

  for (const value of values) {
    const normalized = normalizeSearchTerm(value);
    if (!normalized) continue;
    if (deduped.some((item) => item.toLocaleLowerCase() === normalized.toLocaleLowerCase())) {
      continue;
    }
    deduped.push(normalized);
    if (deduped.length >= MAX_RECENT_SEARCHES) break;
  }

  return deduped;
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
    return nextUrl.toString();
  } catch {
    return null;
  }
}

function buildConversationApiPath(suffix = ""): string {
  return buildClientApiPath(`/conversations${suffix}` as `/${string}`);
}

function replaceConversationOverlayUrl(conversationId: string | null): void {
  if (typeof window === "undefined") return;

  try {
    const nextUrl = new URL(window.location.href);
    if (conversationId) {
      nextUrl.searchParams.set(CONVERSATION_QUERY_KEY, conversationId);
    } else {
      nextUrl.searchParams.delete(CONVERSATION_QUERY_KEY);
    }
    window.history.replaceState(window.history.state, "", nextUrl.toString());
  } catch {
    // Ignore history synchronization failures in restricted environments.
  }
}

function mergeSearchOverlayHistoryState(state: unknown, open: boolean): Record<string, unknown> {
  const nextState = state && typeof state === "object" && !Array.isArray(state)
    ? { ...(state as Record<string, unknown>) }
    : {};

  if (open) {
    nextState[SEARCH_OVERLAY_HISTORY_STATE_KEY] = true;
  } else {
    delete nextState[SEARCH_OVERLAY_HISTORY_STATE_KEY];
  }

  return nextState;
}

function isSearchOverlayHistoryOpen(state: unknown): boolean {
  return Boolean(
    state
    && typeof state === "object"
    && !Array.isArray(state)
    && (state as Record<string, unknown>)[SEARCH_OVERLAY_HISTORY_STATE_KEY] === true,
  );
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

function compareConversationRecency(a: ConversationChannelSummary, b: ConversationChannelSummary): number {
  const leftTimestamp = Date.parse(a.latestMessageAt || a.createdAt) || 0;
  const rightTimestamp = Date.parse(b.latestMessageAt || b.createdAt) || 0;
  return rightTimestamp - leftTimestamp;
}

function upsertConversation(
  conversations: ConversationChannelSummary[],
  nextConversation: ConversationChannelSummary,
): ConversationChannelSummary[] {
  const previousConversation = conversations.find((conversation) => conversation.id === nextConversation.id);
  const mergedConversation = previousConversation
    ? {
        ...previousConversation,
        ...nextConversation,
        latestMessagePreview:
          nextConversation.latestMessagePreview ?? previousConversation.latestMessagePreview,
        latestMessageAt:
          nextConversation.latestMessageAt ?? previousConversation.latestMessageAt,
        latestSpeaker:
          nextConversation.latestSpeaker ?? previousConversation.latestSpeaker,
        latestSpeakerAvatarSeed:
          nextConversation.latestSpeakerAvatarSeed ?? previousConversation.latestSpeakerAvatarSeed,
        latestSpeakerAvatarIndex:
          nextConversation.latestSpeakerAvatarIndex ?? previousConversation.latestSpeakerAvatarIndex,
      }
    : nextConversation;

  return [
    mergedConversation,
    ...conversations.filter((conversation) => conversation.id !== nextConversation.id),
  ].sort(compareConversationRecency);
}

function updateConversationSummaryStatus(
  conversation: ConversationChannelSummary,
  status: "active" | "paused",
  nowIso = new Date().toISOString(),
): ConversationChannelSummary {
  return {
    ...conversation,
    status,
    pausedAt: status === "active" ? null : (conversation.pausedAt ?? nowIso),
    updatedAt: conversation.updatedAt,
  };
}

function mergeConversationLists(
  current: ConversationChannelSummary[],
  incoming: ConversationChannelSummary[],
): ConversationChannelSummary[] {
  const merged = new Map<string, ConversationChannelSummary>();
  for (const conversation of current) {
    merged.set(conversation.id, conversation);
  }
  for (const conversation of incoming) {
    merged.set(conversation.id, conversation);
  }
  return [...merged.values()].sort(compareConversationRecency);
}

function replaceConversationLists(
  current: ConversationChannelSummary[],
  incoming: ConversationChannelSummary[],
): ConversationChannelSummary[] {
  const currentById = new Map(current.map((conversation) => [conversation.id, conversation]));
  return incoming.map((conversation) => {
    const previousConversation = currentById.get(conversation.id);
    if (!previousConversation) {
      return conversation;
    }
    return {
      ...previousConversation,
      ...conversation,
      latestMessagePreview:
        conversation.latestMessagePreview ?? previousConversation.latestMessagePreview,
      latestMessageAt:
        conversation.latestMessageAt ?? previousConversation.latestMessageAt,
      latestSpeaker:
        conversation.latestSpeaker ?? previousConversation.latestSpeaker,
      latestSpeakerAvatarSeed:
        conversation.latestSpeakerAvatarSeed ?? previousConversation.latestSpeakerAvatarSeed,
      latestSpeakerAvatarIndex:
        conversation.latestSpeakerAvatarIndex ?? previousConversation.latestSpeakerAvatarIndex,
    };
  }).sort(compareConversationRecency);
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
): ConversationItem {
  const title = conversation.title;
  const statusLabel = conversation.status === "active"
    ? labels.activeStatusLabel
    : "";
  const selectedLanguages = sanitizeSttLanguageSelection(
    conversation.selectedLanguages,
    deriveDefaultSttLanguagesForLocale(locale),
  );
  const speechLanguages = sanitizeSttLanguageSelection(
    conversation.speechLanguages,
    selectedLanguages,
  );
  const languageFlags = selectedLanguages.map((language) => getSttLanguageFlag(language)).join(" ");
  const avatar = getSpeakerAvatar(
    conversation.latestSpeaker || conversation.sessionKey,
    conversation.latestSpeakerAvatarSeed || conversation.id,
    conversation.latestSpeakerAvatarIndex ?? undefined,
  );

  return {
    id: conversation.id,
    title,
    preview: truncateConversationPreview(conversation.latestMessagePreview || ""),
    previewFullText: conversation.latestMessagePreview || "",
    timeLabel: timeLabelsReady
      ? formatConversationTime(conversation.latestMessageAt || conversation.createdAt, locale)
      : "",
    status: conversation.status,
    statusLabel,
    avatarSrc: avatar.src,
    avatarAlt: `${title} ${avatar.name} avatar`,
    sequenceNumber: conversation.sequenceNumber,
    sessionKey: conversation.sessionKey,
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt,
    pausedAt: conversation.pausedAt,
    selectedLanguages,
    speechLanguages,
    languageFlags,
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

function buildConversationRequestHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    "x-mingle-user-id": getOrCreateTrackingUserId(),
  };
  if (clientApiNamespace) {
    headers["x-mingle-api-namespace"] = clientApiNamespace;
  }
  return headers;
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
  return () => {
    window.removeEventListener("popstate", onStoreChange);
    window.removeEventListener("hashchange", onStoreChange);
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

function parseNativeBannerPositionFromSearch(search: string): LivePhoneDemoAdBannerPosition | null {
  try {
    const params = new URLSearchParams(search);
    return normalizeLivePhoneDemoAdBannerPosition(params.get("nativeBannerPosition"));
  } catch {
    return null;
  }
}

function readNativeBannerPositionFromWindow(): LivePhoneDemoAdBannerPosition | null {
  if (typeof window === "undefined") return null;
  return parseNativeBannerPositionFromSearch(window.location.search || "");
}

function useNativeBannerPositionFromSearch(
  initialValue: LivePhoneDemoAdBannerPosition | null = null,
): LivePhoneDemoAdBannerPosition | null {
  return useSyncExternalStore(
    subscribeToLocationSearch,
    readNativeBannerPositionFromWindow,
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

function calculateConversationRowTooltipPos(element: HTMLElement): TooltipPos {
  const rect = element.getBoundingClientRect();
  const left = rect.left + rect.width / 2;
  const shouldForceBelow = rect.top <= window.innerHeight * ROW_ACTION_TOOLTIP_FORCE_BELOW_VIEWPORT_RATIO;
  if (
    !shouldForceBelow
    && rect.top - ROW_ACTION_TOOLTIP_GAP_PX >= ROW_ACTION_TOOLTIP_ESTIMATED_MAX_HEIGHT_PX
  ) {
    return {
      side: "above",
      bottom: window.innerHeight - rect.top + ROW_ACTION_TOOLTIP_GAP_PX,
      left,
    };
  }
  return {
    side: "below",
    top: rect.bottom + ROW_ACTION_TOOLTIP_GAP_PX,
    left,
  };
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
      style={{
        WebkitTouchCallout: "none",
        WebkitUserSelect: "none",
        userSelect: "none",
      }}
    >
      <div className="rounded-full bg-gradient-to-br from-rose-50 via-white to-amber-50 p-0.5 shadow-sm ring-1 ring-black/5">
        <Image
          src={item.avatarSrc}
          alt={item.avatarAlt}
          className="h-14 w-14 rounded-full bg-white object-cover"
          width={56}
          height={56}
          draggable={false}
          style={conversationAvatarImageStyle}
          unoptimized
        />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <span className="truncate text-[15px] font-semibold text-slate-900">{item.title}</span>
            {item.languageFlags ? (
              <span className="shrink-0 text-[1rem] leading-none" aria-hidden>
                {item.languageFlags}
              </span>
            ) : null}
          </div>
          <span className="shrink-0 text-[12px] text-gray-400">{item.timeLabel}</span>
        </div>
        <div className="mt-1 flex items-center justify-between gap-3">
          <p
            className="truncate text-[13px] text-gray-500"
            title={item.previewFullText || undefined}
          >
            {item.preview || "\u00A0"}
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
  initialConversationIdToOpen?: string | null;
  initialNativeUi?: boolean;
  initialNativeBannerPosition?: string;
  initialNativeTopInsetPx?: number;
  initialNativeBottomInsetPx?: number;
  appleOAuthEnabled: boolean;
  googleOAuthEnabled: boolean;
};

export default function ConversationList({
  locale,
  dictionary,
  initialConversations,
  initialConversationIdToOpen = null,
  initialNativeUi = false,
  initialNativeBannerPosition,
  initialNativeTopInsetPx = 0,
  initialNativeBottomInsetPx = 0,
  appleOAuthEnabled,
  googleOAuthEnabled,
}: ConversationListProps) {
  const initialConversationToOpen = initialConversationIdToOpen
    ? initialConversations.find((conversation) => conversation.id === initialConversationIdToOpen) ?? null
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
  const [isCreatingConversation, setIsCreatingConversation] = useState(false);
  const [mutatingConversationId, setMutatingConversationId] = useState<string | null>(null);
  const [isHydratingConversations, setIsHydratingConversations] = useState(
    initialConversations.length === 0,
  );
  const [isImportingLegacyConversation, setIsImportingLegacyConversation] = useState(false);
  const [isRefreshingConversations, setIsRefreshingConversations] = useState(false);
  const [conversations, setConversations] = useState<ConversationChannelSummary[]>(
    [...initialConversations].sort(compareConversationRecency),
  );
  const [nativeBannerLayout, setNativeBannerLayout] = useState<NativeUiBannerLayoutEventDetail | null>(null);
  const [activeConversation, setActiveConversation] = useState<ConversationChannelSummary | null>(initialConversationToOpen);
  const [liveConversationId, setLiveConversationId] = useState<string | null>(null);
  const [autoStartConversationId, setAutoStartConversationId] = useState<string | null>(null);
  const [isClientReady, setIsClientReady] = useState(false);
  const [isNativeRuntime, setIsNativeRuntime] = useState(false);
  const [overlayEnterMode, setOverlayEnterMode] = useState<ConversationOverlayEnterMode>("animate");
  const [overlayExitMode, setOverlayExitMode] = useState<ConversationOverlayExitMode>("animate");
  const [timeLabelsReady, setTimeLabelsReady] = useState(false);
  const [rowActionMenu, setRowActionMenu] = useState<ConversationRowActionMenuState | null>(null);
  const [renameDialogConversationId, setRenameDialogConversationId] = useState<string | null>(null);
  const [renameConversationValue, setRenameConversationValue] = useState("");
  const [isRenamingConversation, setIsRenamingConversation] = useState(false);
  const [deleteDialogConversationId, setDeleteDialogConversationId] = useState<string | null>(null);
  const [isDeletingConversation, setIsDeletingConversation] = useState(false);
  const searchOverlayRef = useRef<SearchOverlayHandle>(null);
  const conversationListScrollRef = useRef<HTMLDivElement | null>(null);
  const rowActionMenuRef = useRef<HTMLDivElement | null>(null);
  const conversationRoomRefs = useRef(new Map<string, MingleHomeRef | null>());
  const selectedLanguagesSyncVersionRef = useRef(new Map<string, number>());
  const speechLanguagesSyncVersionRef = useRef(new Map<string, number>());
  const liveConversationIdRef = useRef<string | null>(null);
  const conversationRunningStateRef = useRef(new Map<string, boolean>());
  const deletingConversationIdsRef = useRef(new Set<string>());
  const suppressRowActionMenuUntilRef = useRef(0);
  const activeConversationRef = useRef<ConversationChannelSummary | null>(null);
  const conversationsRef = useRef<ConversationChannelSummary[]>(conversations);
  const isCreatingConversationRef = useRef(isCreatingConversation);
  const mutatingConversationIdRef = useRef<string | null>(mutatingConversationId);
  const isImportingLegacyConversationRef = useRef(false);
  const pendingHistoryCloseAnimationRef = useRef<ConversationOverlayExitMode>("instant");
  const routeSyncConversationIdRef = useRef<string | null>(null);
  const pullRefreshStartYRef = useRef<number | null>(null);
  const pullRefreshTrackingRef = useRef(false);
  const viewportWidthPx = useViewportWidthPx();
  const nativeBannerPositionFromQuery = useNativeBannerPositionFromSearch(
    normalizeLivePhoneDemoAdBannerPosition(initialNativeBannerPosition),
  );
  const nativeTopInsetPx = useNativeInsetPx("nativeTopInsetPx", initialNativeTopInsetPx);
  const nativeBottomInsetPx = useNativeInsetPx("nativeBottomInsetPx", initialNativeBottomInsetPx);
  const routeConversationId = useConversationIdFromSearch();
  const hasNativeBannerLayout = nativeBannerLayout !== null;
  const hasNativeRuntimeInsets = initialNativeUi || isNativeRuntime;
  const runtimeNativeBannerPosition = nativeBannerLayout?.position ?? nativeBannerPositionFromQuery;
  const runtimeNativeTopInsetPx = nativeBannerLayout?.topInsetPx ?? nativeTopInsetPx;
  const runtimeNativeBottomInsetPx = nativeBannerLayout?.bottomInsetPx ?? nativeBottomInsetPx;
  const estimatedNativeBannerInsetPx = resolveEstimatedNativeBannerInsetPx(viewportWidthPx);
  const effectiveNativeTopInsetPx = hasNativeRuntimeInsets
    ? resolveEffectiveNativeBannerInsetPx(runtimeNativeTopInsetPx, estimatedNativeBannerInsetPx)
    : runtimeNativeTopInsetPx;
  const effectiveNativeBottomInsetPx = hasNativeRuntimeInsets && runtimeNativeBannerPosition === "bottom"
    ? (hasNativeBannerLayout
        ? runtimeNativeBottomInsetPx
        : resolveEffectiveNativeBannerInsetPx(runtimeNativeBottomInsetPx, estimatedNativeBannerInsetPx))
    : runtimeNativeBottomInsetPx;

  const conversationItems = useMemo(
    () => conversations.map((conversation) => (
      mapConversationSummaryToItem(conversation, locale, timeLabelsReady, copy)
    )),
    [conversations, copy, locale, timeLabelsReady],
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
  const defaultSelectedLanguages = useMemo(
    () => deriveDefaultSttLanguagesForLocale(locale),
    [locale],
  );
  const effectivePullRefreshOffsetPx = isRefreshingConversations
    ? LIST_PULL_REFRESH_TRIGGER_PX
    : pullRefreshDistance;
  const pullRefreshProgress = Math.min(
    1,
    effectivePullRefreshOffsetPx / LIST_PULL_REFRESH_TRIGGER_PX,
  );

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
    const response = await fetch(buildConversationApiPath(), {
      cache: "no-store",
      headers: buildConversationRequestHeaders(),
    });
    const nextConversations = await readConversationListResponse(response);
    setConversations((current) => (
      options?.replaceCurrent
        ? replaceConversationLists(current, nextConversations)
        : mergeConversationLists(current, nextConversations)
    ));
    return nextConversations;
  }, []);

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
  ) => {
    setMutatingConversationId(conversationId);
    try {
      const response = await fetch(buildConversationApiPath(`/${conversationId}`), {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...buildConversationRequestHeaders(),
        },
        body: JSON.stringify({ status }),
      });
      if (response.status === 404 && deletingConversationIdsRef.current.has(conversationId)) {
        return null;
      }
      const nextConversation = await readConversationResponse(response);
      setConversations((current) => upsertConversation(current, nextConversation));
      return nextConversation;
    } finally {
      setMutatingConversationId((current) => (
        current === conversationId ? null : current
      ));
    }
  }, []);

  const handleConversationDeleted = useCallback((conversationId: string) => {
    deletingConversationIdsRef.current.add(conversationId);
    replaceConversationOverlayUrl(null);
    postNativeBannerZone("hidden");
    setOverlayExitMode("instant");
    setAutoStartConversationId((current) => (
      current === conversationId ? null : current
    ));
    setLiveConversationId((current) => (
      current === conversationId ? null : current
    ));
    selectedLanguagesSyncVersionRef.current.delete(conversationId);
    speechLanguagesSyncVersionRef.current.delete(conversationId);
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
          ...buildConversationRequestHeaders(),
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
        headers: buildConversationRequestHeaders(),
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
    void updateConversationStatus(conversationId, nextStatus).catch(() => {
      if (deletingConversationIdsRef.current.has(conversationId)) {
        return;
      }
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

    const nextVersion = (selectedLanguagesSyncVersionRef.current.get(conversationId) ?? 0) + 1;
    selectedLanguagesSyncVersionRef.current.set(conversationId, nextVersion);

    setConversations((current) => current.map((conversation) => (
      conversation.id === conversationId
        ? { ...conversation, selectedLanguages: [...normalizedSelectedLanguages] }
        : conversation
    )));

    void fetch(buildConversationApiPath(`/${conversationId}`), {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        ...buildConversationRequestHeaders(),
      },
      body: JSON.stringify({ selectedLanguages: normalizedSelectedLanguages }),
    })
      .then(readConversationResponse)
      .then((nextConversation) => {
        if (selectedLanguagesSyncVersionRef.current.get(conversationId) !== nextVersion) return;
        setConversations((current) => upsertConversation(current, nextConversation));
      })
      .catch(() => {
        if (selectedLanguagesSyncVersionRef.current.get(conversationId) !== nextVersion) return;
        setConversations((current) => current.map((conversation) => (
          conversation.id === conversationId
            ? { ...conversation, selectedLanguages: [...previousSelectedLanguages] }
            : conversation
        )));
        window.alert(copy.openErrorMessage);
      });
  }, [copy.openErrorMessage, defaultSelectedLanguages]);

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

    const nextVersion = (speechLanguagesSyncVersionRef.current.get(conversationId) ?? 0) + 1;
    speechLanguagesSyncVersionRef.current.set(conversationId, nextVersion);

    setConversations((current) => current.map((conversation) => (
      conversation.id === conversationId
        ? { ...conversation, speechLanguages: [...normalizedSpeechLanguages] }
        : conversation
    )));

    void fetch(buildConversationApiPath(`/${conversationId}`), {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        ...buildConversationRequestHeaders(),
      },
      body: JSON.stringify({ speechLanguages: normalizedSpeechLanguages }),
    })
      .then(readConversationResponse)
      .then((nextConversation) => {
        if (speechLanguagesSyncVersionRef.current.get(conversationId) !== nextVersion) return;
        setConversations((current) => upsertConversation(current, nextConversation));
      })
      .catch(() => {
        if (speechLanguagesSyncVersionRef.current.get(conversationId) !== nextVersion) return;
        setConversations((current) => current.map((conversation) => (
          conversation.id === conversationId
            ? { ...conversation, speechLanguages: [...previousSpeechLanguages] }
            : conversation
        )));
        window.alert(copy.openErrorMessage);
      });
  }, [copy.openErrorMessage, defaultSelectedLanguages]);

  const handleConversationLatestUtteranceChange = useCallback((
    conversationId: string,
    payload: {
      preview: string;
      createdAt: string;
      speaker?: string;
      speakerAvatarSeed?: string;
      speakerAvatarIndex?: number;
    },
  ) => {
    const normalizedPreview = payload.preview.trim();
    if (!normalizedPreview) return;
    const normalizedCreatedAt = payload.createdAt.trim();
    if (!normalizedCreatedAt) return;

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
  }, []);

  const handleOpenSearch = useCallback(() => {
    openSearchOverlay({ transitionMode: "animate", syncHistory: "push" });
  }, [openSearchOverlay]);

  useEffect(() => {
    setIsClientReady(true);
    setIsNativeRuntime(isNativeAppRuntime());
  }, []);

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
    if (typeof window === "undefined") return;
    if (!isNativeAppRuntime()) return;
    if (activeConversation) return;
    if (liveConversationId) return;
    if (isHydratingConversations) return;

    const cachedNativeSttStatus = readCachedNativeSttStatus();
    if (isNativeSttStatusLive(cachedNativeSttStatus)) return;

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
          ...buildConversationRequestHeaders(),
        },
        body: JSON.stringify({ status: "paused" }),
      }).catch(() => {
        // Keep the local fallback paused state even when the reconciliation request fails.
      });
    }
  }, [activeConversation, conversations, isHydratingConversations, liveConversationId]);

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
    isCreatingConversationRef.current = isCreatingConversation;
  }, [isCreatingConversation]);

  useEffect(() => {
    mutatingConversationIdRef.current = mutatingConversationId;
  }, [mutatingConversationId]);

  useEffect(() => {
    isImportingLegacyConversationRef.current = isImportingLegacyConversation;
  }, [isImportingLegacyConversation]);

  useEffect(() => {
    if (!isNativeAppRuntime()) return;
    if (showSearch) {
      postNativeBannerZone("hidden");
      return;
    }
    if (activeConversation) return;
    postNativeBannerZone("list");
  }, [activeConversation, showSearch]);

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
    let cancelled = false;

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

    return () => {
      cancelled = true;
    };
  }, [refreshConversationList]);

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
            ...buildConversationRequestHeaders(),
          },
          body: JSON.stringify({
            locale,
            legacySessionKey: legacySnapshot.sessionKey || undefined,
            selectedLanguages: legacySnapshot.selectedLanguages,
            speechLanguages: legacySnapshot.speechLanguages,
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

    postNativeBannerZone("hidden");

    if (shouldReplaceUrl) {
      replaceConversationOverlayUrl(null);
    }

    setOverlayExitMode(exitMode);
    setAutoStartConversationId(null);
    setActiveConversation((current) => (
      current?.id === previousConversation.id ? null : current
    ));
  }, []);

  const handleCreateConversation = useCallback(async () => {
    if (isCreatingConversation || isImportingLegacyConversation) return;
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
          ...buildConversationRequestHeaders(),
        },
        body: JSON.stringify({
          locale,
          selectedLanguages: defaultSelectedLanguages,
          speechLanguages: defaultSelectedLanguages,
        }),
      });
      const nextConversation = await readConversationResponse(response);
      closeSearchOverlay({ transitionMode: "instant", syncHistory: "replace" });
      setConversations((current) => upsertConversation(current, nextConversation));
      setOverlayEnterMode("animate");
      setOverlayExitMode("animate");
      setAutoStartConversationId(shouldAutoStartNewConversation ? nextConversation.id : null);
      setActiveConversation(nextConversation);
    } catch {
      window.alert(copy.createErrorMessage);
    } finally {
      setIsCreatingConversation(false);
    }
  }, [
    closeSearchOverlay,
    copy.createErrorMessage,
    defaultSelectedLanguages,
    isCreatingConversation,
    isImportingLegacyConversation,
    locale,
  ]);

  const openConversationSummary = useCallback(async (
    conversation: ConversationChannelSummary,
    options?: {
      enterMode?: ConversationOverlayEnterMode;
    },
  ) => {
    const enterMode = options?.enterMode ?? "animate";
    postNativeBannerZone("hidden");
    closeSearchOverlay({ transitionMode: "instant", syncHistory: "replace" });
    setOverlayEnterMode(enterMode);
    setOverlayExitMode("animate");
    setAutoStartConversationId(null);
    setActiveConversation(conversation);
    return conversation;
  }, [closeSearchOverlay]);

  const handleOpenConversation = useCallback(async (item: ConversationItem) => {
    if (isCreatingConversation || isImportingLegacyConversation) return;

    const matchedConversation = conversations.find((conversation) => conversation.id === item.id);
    if (!matchedConversation) return;

    setRowActionMenu(null);
    suppressRowActionMenuUntilRef.current = Date.now() + ROW_ACTION_LONG_PRESS_DELAY_MS + 120;

    try {
      await openConversationSummary(matchedConversation);
    } catch {
      window.alert(copy.openErrorMessage);
    }
  }, [
    conversations,
    copy.openErrorMessage,
    isCreatingConversation,
    isImportingLegacyConversation,
    openConversationSummary,
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
      window.history.back();
      return;
    }

    closeConversationOverlay(activeConversation, { animateExit: true, replaceUrl: true });
  }, [activeConversation, closeConversationOverlay, isCreatingConversation]);

  useEffect(() => registerNativeBackHandler(() => {
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
    closeSearchOverlay,
    isCreatingConversation,
    showSearch,
  ]);

  useEffect(() => {
    if (activeConversation) {
      routeSyncConversationIdRef.current = null;
      return;
    }

    if (!routeConversationId) {
      routeSyncConversationIdRef.current = null;
      return;
    }
    if (routeSyncConversationIdRef.current === routeConversationId) return;
    if (isCreatingConversation || isImportingLegacyConversation) return;

    const matchedConversation = conversations.find((conversation) => conversation.id === routeConversationId);
    if (!matchedConversation) return;

    routeSyncConversationIdRef.current = routeConversationId;
    void openConversationSummary(matchedConversation, {
      enterMode: "instant",
    }).catch(() => {
      routeSyncConversationIdRef.current = null;
      if (readConversationIdFromLocation() === routeConversationId) {
        replaceConversationOverlayUrl(null);
      }
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

  useEffect(() => {
    if (typeof window === "undefined" || !activeConversation) return;

    const currentConversationId = readConversationIdFromLocation();
    if (currentConversationId === activeConversation.id) return;

    const nextUrl = buildConversationOverlayUrl(activeConversation.id);
    if (!nextUrl) return;
    window.history.pushState({ conversationId: activeConversation.id }, "", nextUrl);
  }, [activeConversation]);

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

    const handlePopState = () => {
      const currentActiveConversation = activeConversationRef.current;
      const currentRouteConversationId = readConversationIdFromLocation();

      if (!currentActiveConversation) return;
      if (currentRouteConversationId === currentActiveConversation.id) return;

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

    const handlePopState = () => {
      if (activeConversationRef.current) return;

      const currentRouteConversationId = readConversationIdFromLocation();
      if (!currentRouteConversationId) return;
      if (isCreatingConversationRef.current || isImportingLegacyConversationRef.current) return;

      const matchedConversation = conversationsRef.current.find(
        (conversation) => conversation.id === currentRouteConversationId,
      );
      if (!matchedConversation) return;

      routeSyncConversationIdRef.current = currentRouteConversationId;
      void openConversationSummary(matchedConversation, {
        enterMode: "instant",
      }).catch(() => {
        routeSyncConversationIdRef.current = null;
        if (readConversationIdFromLocation() === currentRouteConversationId) {
          replaceConversationOverlayUrl(null);
        }
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

  return (
    <main className="relative flex h-full min-h-0 w-full flex-col overflow-hidden bg-white text-slate-900">

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

        <button
          type="button"
          onClick={handleOpenSearch}
          className="flex h-10 w-10 items-center justify-center rounded-full transition active:bg-gray-100"
          aria-label={copy.searchButtonLabel}
        >
          <Search size={22} strokeWidth={2} />
        </button>
      </header>

      <div
        ref={conversationListScrollRef}
        className="min-h-0 flex-1 overflow-y-auto"
        style={{
          paddingTop: effectiveNativeTopInsetPx > 0 ? `${effectiveNativeTopInsetPx}px` : "0px",
          paddingBottom: "20px",
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
          className="pointer-events-none sticky top-0 z-10 flex h-0 justify-center overflow-visible"
          aria-hidden
        >
          <div
            className="mt-3 flex h-10 items-center justify-center rounded-full border border-slate-200/80 bg-white/95 px-3 shadow-[0_10px_30px_rgba(15,23,42,0.10)]"
            style={{
              opacity: pullRefreshProgress,
              transform: `translateY(${Math.max(0, effectivePullRefreshOffsetPx - 56)}px) scale(${0.92 + pullRefreshProgress * 0.08})`,
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
            <div className="flex flex-col items-center px-6 py-16 text-center text-gray-400">
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

      <footer className="shrink-0">
        <button
          type="button"
          onClick={handleCreateConversation}
          disabled={actionDisabled}
          className="relative flex w-full items-center justify-center px-5 pt-4 text-[1rem] font-semibold text-white transition active:scale-[0.995] disabled:cursor-not-allowed disabled:opacity-60"
          aria-label={copy.newConversationButtonLabel}
          style={{
            minHeight: "72px",
            paddingBottom: effectiveNativeBottomInsetPx > 0
              ? `calc(env(safe-area-inset-bottom, 0px) + ${effectiveNativeBottomInsetPx + 16}px)`
              : "calc(env(safe-area-inset-bottom, 0px) + 16px)",
            backgroundImage: "linear-gradient(90deg, #f59e0b 0%, #f97316 100%)",
          }}
        >
          <span
            className={`flex min-h-[24px] items-center justify-center gap-2 transition-opacity ${
              isCreatingConversation ? "opacity-0" : "opacity-100"
            }`}
          >
            <>
              <span>{copy.newConversationButtonLabel}</span>
              <ArrowRight size={18} strokeWidth={2.4} />
            </>
          </span>
          {isCreatingConversation ? (
            <span className="absolute inset-0 flex items-center justify-center">
              <Loader2 size={20} className="animate-spin" strokeWidth={2.25} />
            </span>
          ) : null}
        </button>
      </footer>

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
                      sessionKeyOverride={conversation.sessionKey}
                      storageNamespace={conversation.id}
                      initialSelectedLanguages={conversation.selectedLanguages}
                      initialSpeechLanguages={conversation.speechLanguages}
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
                      onSelectedLanguagesChange={(selectedLanguages) => {
                        handleConversationSelectedLanguagesChange(conversation.id, selectedLanguages);
                      }}
                      onSpeechLanguagesChange={(speechLanguages) => {
                        handleConversationSpeechLanguagesChange(conversation.id, speechLanguages);
                      }}
                    />
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
    </main>
  );
}
