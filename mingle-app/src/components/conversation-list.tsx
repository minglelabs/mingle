"use client";

import type { AppLocale } from "@/i18n/config";
import type { AppDictionary } from "@/i18n/types";
import type { ConversationChannelSummary } from "@/lib/app-conversations";
import { getConversationDictionary } from "@/i18n/conversations";
import { buildClientApiPath, clientApiNamespace } from "@/lib/api-contract";
import {
  forwardRef,
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
import { ArrowRight, Loader2, Search } from "lucide-react";
import {
  buildStorageKey,
  getOrCreateTrackingUserId,
} from "@/components/LivePhoneDemo/use-realtime-stt";
import {
  normalizeLivePhoneDemoAdBannerPosition,
  type LivePhoneDemoAdBannerPosition,
} from "@/components/LivePhoneDemo/live-phone-demo.preferences";
import {
  NATIVE_UI_EVENT,
  parseNativeUiBannerLayoutDetail,
  type NativeUiBannerLayoutEventDetail,
} from "@/components/LivePhoneDemo/live-phone-demo.native-ui.logic";
import {
  NATIVE_HISTORY_BACK_ANIMATE_FLAG,
  registerNativeBackHandler,
} from "@/lib/native-back-handler";
import { postNativeBannerZone } from "@/lib/native-banner-zone";
import MingleHome, { type MingleHomeRef } from "@/components/mingle-home";
import MingleWordmark from "@/components/mingle-wordmark";

const RECENT_SEARCHES_STORAGE_KEY = "mingle:conversation-searches";
const RECENT_SEARCHES_SYNC_EVENT = "mingle:conversation-searches-sync";
const LAST_VIEWED_SCREEN_STORAGE_KEY_PREFIX = "mingle:conversation-last-screen";
const LEGACY_SINGLE_ROOM_MIGRATION_MARKER_KEY_PREFIX = "mingle:legacy-single-room-migrated";
const MAX_RECENT_SEARCHES = 6;
const EMPTY_RECENT_SEARCHES: string[] = [];
const CONVERSATION_QUERY_KEY = "conversation";
const LEGACY_SINGLE_ROOM_UTTERANCES_KEY = "mingle_demo_utterances";
const LEGACY_SINGLE_ROOM_USAGE_KEY = "mingle_demo_usage_sec";
const LEGACY_SINGLE_ROOM_SESSION_KEY = "mingle_demo_session_key";
const CONVERSATION_AVATAR_COLORS = [
  "#fb7185",
  "#38bdf8",
  "#34d399",
  "#f59e0b",
  "#a78bfa",
  "#f97316",
] as const;
const CONVERSATION_OVERLAY_TRANSITION = {
  duration: 0.28,
  ease: [0.22, 1, 0.36, 1] as const,
};
const WEB_CANVAS_BASE_WIDTH_PX = 400;
const NATIVE_AD_BANNER_DEFAULT_HEIGHT_PX = 50;
const NATIVE_INSET_QUERY_MAX_PX = 240;

let recentSearchesSnapshot = EMPTY_RECENT_SEARCHES;
let recentSearchesSnapshotRaw = "__initial__";

type ConversationOverlayExitMode = "animate" | "instant";
type ConversationOverlayEnterMode = "animate" | "instant";
type ConversationOverlayTransitionState = {
  enterMode: ConversationOverlayEnterMode;
  exitMode: ConversationOverlayExitMode;
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
  timeLabel: string;
  status: "active" | "paused";
  statusLabel: string;
  avatarText: string;
  avatarColor: string;
  sequenceNumber: number;
  sessionKey: string;
  createdAt: string;
  updatedAt: string;
  pausedAt: string | null;
}

type ConversationListWindow = Window & {
  [NATIVE_HISTORY_BACK_ANIMATE_FLAG]?: boolean;
};

type StoredConversationScreen =
  | { kind: "list" }
  | { kind: "conversation"; conversationId: string };

type LegacySingleRoomSnapshot = {
  utterancesRaw: string | null;
  usageRaw: string | null;
  sessionKey: string;
};

function isNativeAppRuntime(): boolean {
  return typeof window !== "undefined"
    && typeof window.ReactNativeWebView?.postMessage === "function";
}

function normalizeSearchTerm(rawValue: string): string {
  return rawValue.trim().replace(/\s+/g, " ");
}

function buildLastViewedScreenStorageKey(locale: AppLocale): string {
  return `${LAST_VIEWED_SCREEN_STORAGE_KEY_PREFIX}:${locale}:${getOrCreateTrackingUserId()}`;
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
    const utterancesRaw = window.localStorage.getItem(LEGACY_SINGLE_ROOM_UTTERANCES_KEY);
    const usageRaw = window.localStorage.getItem(LEGACY_SINGLE_ROOM_USAGE_KEY);
    const sessionKey = (window.localStorage.getItem(LEGACY_SINGLE_ROOM_SESSION_KEY) || "").trim();

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

function readStoredLastViewedConversationScreen(locale: AppLocale): StoredConversationScreen | null {
  if (typeof window === "undefined") return null;

  try {
    const stored = window.localStorage.getItem(buildLastViewedScreenStorageKey(locale));
    if (!stored) return null;

    const parsed = JSON.parse(stored) as unknown;
    if (
      parsed
      && typeof parsed === "object"
      && (parsed as { kind?: unknown }).kind === "list"
    ) {
      return { kind: "list" };
    }

    const conversationId = typeof (parsed as { conversationId?: unknown })?.conversationId === "string"
      ? (parsed as { conversationId: string }).conversationId.trim()
      : "";
    if (
      parsed
      && typeof parsed === "object"
      && (parsed as { kind?: unknown }).kind === "conversation"
      && conversationId
    ) {
      return { kind: "conversation", conversationId };
    }
  } catch {
    // Ignore malformed persisted screen state.
  }

  return null;
}

function writeStoredLastViewedConversationScreen(
  locale: AppLocale,
  screen: StoredConversationScreen,
): void {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(
      buildLastViewedScreenStorageKey(locale),
      JSON.stringify(screen),
    );
  } catch {
    // Ignore storage write failures in restricted environments.
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

function consumeNativeHistoryCloseAnimationFlag(): boolean {
  if (typeof window === "undefined") return false;

  const conversationWindow = window as ConversationListWindow;
  const shouldAnimate = conversationWindow[NATIVE_HISTORY_BACK_ANIMATE_FLAG] === true;
  conversationWindow[NATIVE_HISTORY_BACK_ANIMATE_FLAG] = false;
  return shouldAnimate;
}

function compareConversationRecency(a: ConversationChannelSummary, b: ConversationChannelSummary): number {
  return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
}

function upsertConversation(
  conversations: ConversationChannelSummary[],
  nextConversation: ConversationChannelSummary,
): ConversationChannelSummary[] {
  return [
    nextConversation,
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
    updatedAt: nowIso,
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
  const statusLabel = conversation.status === "active"
    ? labels.activeStatusLabel
    : labels.pausedStatusLabel;

  return {
    id: conversation.id,
    title: conversation.title,
    preview: statusLabel,
    timeLabel: timeLabelsReady ? formatConversationTime(conversation.updatedAt, locale) : "",
    status: conversation.status,
    statusLabel,
    avatarText: String(conversation.sequenceNumber),
    avatarColor:
      CONVERSATION_AVATAR_COLORS[(conversation.sequenceNumber - 1) % CONVERSATION_AVATAR_COLORS.length],
    sequenceNumber: conversation.sequenceNumber,
    sessionKey: conversation.sessionKey,
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt,
    pausedAt: conversation.pausedAt,
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

function useNativeInsetPx(queryKey: string): number {
  return useSyncExternalStore(
    subscribeToLocationSearch,
    () => readNativeInsetPxFromWindow(queryKey),
    () => 0,
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

function useNativeBannerPositionFromSearch(): LivePhoneDemoAdBannerPosition | null {
  return useSyncExternalStore(
    subscribeToLocationSearch,
    readNativeBannerPositionFromWindow,
    () => null,
  );
}

function useConversationIdFromSearch(): string | null {
  return useSyncExternalStore(
    subscribeToLocationSearch,
    readConversationIdFromWindow,
    () => null,
  );
}

function ConversationRow({
  item,
  disabled = false,
  onSelect,
  className = "",
}: {
  item: ConversationItem;
  disabled?: boolean;
  onSelect?: (item: ConversationItem) => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect?.(item)}
      disabled={disabled}
      className={`flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-gray-50 active:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-60 ${className}`}
    >
      <div
        className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-lg font-bold text-white"
        style={{ backgroundColor: item.avatarColor }}
      >
        {item.avatarText}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-3">
          <span className="truncate text-[15px] font-semibold text-slate-900">{item.title}</span>
          <span className="shrink-0 text-[12px] text-gray-400">{item.timeLabel}</span>
        </div>
        <div className="mt-1 flex items-center justify-between gap-3">
          <p className="truncate text-[13px] text-gray-500">{item.preview}</p>
          <span
            className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold tracking-[0.08em] ${
              item.status === "active"
                ? "bg-emerald-100 text-emerald-700"
                : "bg-slate-100 text-slate-500"
            }`}
          >
            {item.statusLabel}
          </span>
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
  topInsetPx: number;
  onClose: () => void;
  conversations: ConversationItem[];
  copy: ReturnType<typeof getConversationDictionary>;
  onSelectConversation: (item: ConversationItem) => void;
  actionDisabled?: boolean;
};

const SearchOverlay = forwardRef<SearchOverlayHandle, SearchOverlayProps>(function SearchOverlay({
  open,
  topInsetPx,
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
          paddingTop: `calc(env(safe-area-inset-top, 0px) + ${topInsetPx + 12}px)`,
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
  appleOAuthEnabled: boolean;
  googleOAuthEnabled: boolean;
};

export default function ConversationList({
  locale,
  dictionary,
  initialConversations,
  appleOAuthEnabled,
  googleOAuthEnabled,
}: ConversationListProps) {
  const copy = useMemo(
    () => getConversationDictionary(locale, dictionary),
    [dictionary, locale],
  );
  const [showSearch, setShowSearch] = useState(false);
  const [isCreatingConversation, setIsCreatingConversation] = useState(false);
  const [mutatingConversationId, setMutatingConversationId] = useState<string | null>(null);
  const [isHydratingConversations, setIsHydratingConversations] = useState(
    initialConversations.length === 0,
  );
  const [isImportingLegacyConversation, setIsImportingLegacyConversation] = useState(false);
  const [conversations, setConversations] = useState<ConversationChannelSummary[]>(
    [...initialConversations].sort(compareConversationRecency),
  );
  const [nativeBannerLayout, setNativeBannerLayout] = useState<NativeUiBannerLayoutEventDetail | null>(null);
  const [activeConversation, setActiveConversation] = useState<ConversationChannelSummary | null>(null);
  const [liveConversationId, setLiveConversationId] = useState<string | null>(null);
  const [autoStartConversationId, setAutoStartConversationId] = useState<string | null>(null);
  const [isLastViewedScreenReady, setIsLastViewedScreenReady] = useState(false);
  const [overlayEnterMode, setOverlayEnterMode] = useState<ConversationOverlayEnterMode>("animate");
  const [overlayExitMode, setOverlayExitMode] = useState<ConversationOverlayExitMode>("animate");
  const [timeLabelsReady, setTimeLabelsReady] = useState(false);
  const searchOverlayRef = useRef<SearchOverlayHandle>(null);
  const conversationRoomRefs = useRef(new Map<string, MingleHomeRef | null>());
  const autoStartAttemptedConversationIdRef = useRef<string | null>(null);
  const autoStartTimerRef = useRef<number | null>(null);
  const liveConversationIdRef = useRef<string | null>(null);
  const conversationRunningStateRef = useRef(new Map<string, boolean>());
  const activeConversationRef = useRef<ConversationChannelSummary | null>(null);
  const conversationsRef = useRef<ConversationChannelSummary[]>(conversations);
  const isCreatingConversationRef = useRef(isCreatingConversation);
  const mutatingConversationIdRef = useRef<string | null>(mutatingConversationId);
  const isImportingLegacyConversationRef = useRef(false);
  const pendingHistoryCloseAnimationRef = useRef<ConversationOverlayExitMode>("instant");
  const routeSyncConversationIdRef = useRef<string | null>(null);
  const pendingRestoredConversationIdRef = useRef<string | null>(null);
  const viewportWidthPx = useViewportWidthPx();
  const nativeBannerPositionFromQuery = useNativeBannerPositionFromSearch();
  const nativeTopInsetPx = useNativeInsetPx("nativeTopInsetPx");
  const nativeBottomInsetPx = useNativeInsetPx("nativeBottomInsetPx");
  const routeConversationId = useConversationIdFromSearch();
  const hasNativeBannerLayout = nativeBannerLayout !== null;
  const runtimeNativeBannerPosition = nativeBannerLayout?.position ?? nativeBannerPositionFromQuery;
  const runtimeNativeTopInsetPx = nativeBannerLayout?.topInsetPx ?? nativeTopInsetPx;
  const runtimeNativeBottomInsetPx = nativeBannerLayout?.bottomInsetPx ?? nativeBottomInsetPx;
  const estimatedNativeBannerInsetPx = resolveEstimatedNativeBannerInsetPx(viewportWidthPx);
  const effectiveNativeTopInsetPx = isNativeAppRuntime() && runtimeNativeBannerPosition === "top"
    ? (hasNativeBannerLayout
        ? runtimeNativeTopInsetPx
        : resolveEffectiveNativeBannerInsetPx(runtimeNativeTopInsetPx, estimatedNativeBannerInsetPx))
    : runtimeNativeTopInsetPx;
  const effectiveNativeBottomInsetPx = isNativeAppRuntime() && runtimeNativeBannerPosition === "bottom"
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
      const nextConversation = await readConversationResponse(response);
      setConversations((current) => upsertConversation(current, nextConversation));
      return nextConversation;
    } finally {
      setMutatingConversationId((current) => (
        current === conversationId ? null : current
      ));
    }
  }, []);

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
    if (!currentLiveConversationId || currentLiveConversationId === conversationId) return;

    const currentLiveRoom = conversationRoomRefs.current.get(currentLiveConversationId);
    await currentLiveRoom?.stopRecording();
  }, []);

  const handleConversationRunningChange = useCallback((conversationId: string, isRunning: boolean) => {
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
      autoStartAttemptedConversationIdRef.current = null;
      if (autoStartTimerRef.current !== null) {
        window.clearTimeout(autoStartTimerRef.current);
        autoStartTimerRef.current = null;
      }
    }

    const nextStatus = isRunning ? "active" : "paused";
    void updateConversationStatus(conversationId, nextStatus).catch(() => {
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

  useEffect(() => {
    if (typeof window === "undefined") return;

    if (!autoStartConversationId) {
      autoStartAttemptedConversationIdRef.current = null;
      if (autoStartTimerRef.current !== null) {
        window.clearTimeout(autoStartTimerRef.current);
        autoStartTimerRef.current = null;
      }
      return;
    }

    if (activeConversation?.id !== autoStartConversationId) return;
    if (autoStartAttemptedConversationIdRef.current === autoStartConversationId) return;

    let cancelled = false;
    let remainingAttempts = 12;

    const runAutoStart = () => {
      if (cancelled) return;
      const targetConversationId = autoStartConversationId;
      if (activeConversationRef.current?.id !== targetConversationId) {
        return;
      }

      const targetRoom = conversationRoomRefs.current.get(targetConversationId);
      if (!targetRoom) {
        if (remainingAttempts <= 0) {
          return;
        }
        remainingAttempts -= 1;
        autoStartTimerRef.current = window.setTimeout(runAutoStart, 120);
        return;
      }

      autoStartAttemptedConversationIdRef.current = targetConversationId;
      void targetRoom.startRecording().catch(() => {
        if (autoStartAttemptedConversationIdRef.current === targetConversationId) {
          autoStartAttemptedConversationIdRef.current = null;
        }
      });
    };

    if (autoStartTimerRef.current !== null) {
      window.clearTimeout(autoStartTimerRef.current);
    }
    autoStartTimerRef.current = window.setTimeout(runAutoStart, 320);

    return () => {
      cancelled = true;
      if (autoStartTimerRef.current !== null) {
        window.clearTimeout(autoStartTimerRef.current);
        autoStartTimerRef.current = null;
      }
    };
  }, [activeConversation?.id, autoStartConversationId]);

  const handleOpenSearch = useCallback(() => {
    setShowSearch(true);
    window.requestAnimationFrame(() => {
      searchOverlayRef.current?.focusInput();
    });
    window.setTimeout(() => {
      searchOverlayRef.current?.focusInput();
    }, 180);
  }, []);

  useEffect(() => {
    activeConversationRef.current = activeConversation;
  }, [activeConversation]);

  useEffect(() => {
    liveConversationIdRef.current = liveConversationId;
  }, [liveConversationId]);

  useEffect(() => {
    conversationsRef.current = conversations;
  }, [conversations]);

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
    if (isLastViewedScreenReady) return;

    const routeConversationId = readConversationIdFromLocation();
    if (routeConversationId) {
      setIsLastViewedScreenReady(true);
      return;
    }

    const storedScreen = readStoredLastViewedConversationScreen(locale);
    if (!storedScreen || storedScreen.kind === "list") {
      setIsLastViewedScreenReady(true);
      return;
    }

    pendingRestoredConversationIdRef.current = storedScreen.conversationId;
  }, [isLastViewedScreenReady, locale]);

  useEffect(() => {
    if (!isNativeAppRuntime()) return;
    if (activeConversation) return;
    postNativeBannerZone("list");
  }, [activeConversation]);

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

    void fetch(buildConversationApiPath(), {
      cache: "no-store",
      headers: buildConversationRequestHeaders(),
    })
      .then(readConversationListResponse)
      .then((nextConversations) => {
        if (cancelled) return;
        setConversations((current) => mergeConversationLists(current, nextConversations));
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
  }, []);

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
            legacySessionKey: legacySnapshot.sessionKey || undefined,
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
    };
  }, [
    activeConversation,
    conversations.length,
    isCreatingConversation,
    isHydratingConversations,
    mutatingConversationId,
  ]);

  useEffect(() => {
    setTimeLabelsReady(true);
  }, []);

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
    if (isCreatingConversation || mutatingConversationId) return;
    setIsCreatingConversation(true);
    try {
      const response = await fetch(buildConversationApiPath(), {
        method: "POST",
        headers: buildConversationRequestHeaders(),
      });
      const nextConversation = await readConversationResponse(response);
      setShowSearch(false);
      setConversations((current) => upsertConversation(current, nextConversation));
      setOverlayEnterMode("animate");
      setOverlayExitMode("animate");
      setAutoStartConversationId(nextConversation.id);
      setActiveConversation(nextConversation);
    } catch {
      window.alert(copy.createErrorMessage);
    } finally {
      setIsCreatingConversation(false);
    }
  }, [copy.createErrorMessage, isCreatingConversation, mutatingConversationId]);

  const openConversationSummary = useCallback(async (
    conversation: ConversationChannelSummary,
    options?: {
      enterMode?: ConversationOverlayEnterMode;
    },
  ) => {
    const enterMode = options?.enterMode ?? "animate";
    postNativeBannerZone("hidden");
    setShowSearch(false);
    setOverlayEnterMode(enterMode);
    setOverlayExitMode("animate");
    setAutoStartConversationId(null);
    setActiveConversation(conversation);
    return conversation;
  }, []);

  const handleOpenConversation = useCallback(async (item: ConversationItem) => {
    if (isCreatingConversation || mutatingConversationId) return;

    const matchedConversation = conversations.find((conversation) => conversation.id === item.id);
    if (!matchedConversation) return;

    try {
      await openConversationSummary(matchedConversation);
    } catch {
      window.alert(copy.openErrorMessage);
    }
  }, [
    conversations,
    copy.openErrorMessage,
    isCreatingConversation,
    mutatingConversationId,
    openConversationSummary,
  ]);

  useEffect(() => {
    const pendingConversationId = pendingRestoredConversationIdRef.current;
    if (!pendingConversationId) return;
    if (activeConversation || isCreatingConversation || mutatingConversationId) return;

    const matchedConversation = conversations.find(
      (conversation) => conversation.id === pendingConversationId,
    );
    if (!matchedConversation) {
      if (isHydratingConversations) return;
      pendingRestoredConversationIdRef.current = null;
      writeStoredLastViewedConversationScreen(locale, { kind: "list" });
      setIsLastViewedScreenReady(true);
      return;
    }

    pendingRestoredConversationIdRef.current = null;
    void openConversationSummary(matchedConversation, {
      enterMode: "instant",
    }).catch(() => {
      window.alert(copy.openErrorMessage);
    }).finally(() => {
      setIsLastViewedScreenReady(true);
    });
  }, [
    activeConversation,
    conversations,
    copy.openErrorMessage,
    isCreatingConversation,
    isHydratingConversations,
    locale,
    mutatingConversationId,
    openConversationSummary,
  ]);

  useEffect(() => {
    if (!isLastViewedScreenReady) return;

    writeStoredLastViewedConversationScreen(
      locale,
      activeConversation
        ? { kind: "conversation", conversationId: activeConversation.id }
        : { kind: "list" },
    );
  }, [activeConversation, isLastViewedScreenReady, locale]);

  const handleCloseActiveConversation = useCallback(async () => {
    if (!activeConversation || isCreatingConversation || mutatingConversationId) return;

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
  }, [activeConversation, closeConversationOverlay, isCreatingConversation, mutatingConversationId]);

  useEffect(() => registerNativeBackHandler(() => {
    if (!activeConversation || isCreatingConversation || mutatingConversationId) return false;
    void handleCloseActiveConversation();
    return true;
  }, 0), [activeConversation, handleCloseActiveConversation, isCreatingConversation, mutatingConversationId]);

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
    if (isCreatingConversation || mutatingConversationId) return;

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
      if (isCreatingConversationRef.current || mutatingConversationIdRef.current) return;

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

  return (
    <main className="relative flex h-full min-h-0 w-full flex-col overflow-hidden bg-white text-slate-900">
      <SearchOverlay
        ref={searchOverlayRef}
        open={showSearch}
        topInsetPx={effectiveNativeTopInsetPx}
        onClose={() => setShowSearch(false)}
        conversations={conversationItems}
        copy={copy}
        onSelectConversation={handleOpenConversation}
        actionDisabled={actionDisabled}
      />

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
        className="min-h-0 flex-1 overflow-y-auto"
        style={{
          paddingTop: effectiveNativeTopInsetPx > 0 ? `${effectiveNativeTopInsetPx}px` : "0px",
          paddingBottom: "20px",
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
                  disabled={actionDisabled}
                  onSelect={handleOpenConversation}
                  className="border-b border-gray-100"
                />
              </div>
            ))}
          </div>
        )}
      </div>

      <footer className="shrink-0">
        <button
          type="button"
          onClick={handleCreateConversation}
          disabled={actionDisabled}
          className="flex w-full items-center justify-center gap-2 px-5 pt-4 text-[1rem] font-semibold text-white transition active:scale-[0.995] disabled:cursor-not-allowed disabled:opacity-60"
          aria-label={copy.newConversationButtonLabel}
          style={{
            minHeight: "72px",
            paddingBottom: effectiveNativeBottomInsetPx > 0
              ? `calc(env(safe-area-inset-bottom, 0px) + ${effectiveNativeBottomInsetPx + 16}px)`
              : "calc(env(safe-area-inset-bottom, 0px) + 16px)",
            backgroundImage: "linear-gradient(90deg, #f59e0b 0%, #f97316 100%)",
          }}
        >
          {isCreatingConversation ? (
            <Loader2 size={20} className="animate-spin" strokeWidth={2.25} />
          ) : (
            <>
              <span>{copy.newConversationButtonLabel}</span>
              <ArrowRight size={18} strokeWidth={2.4} />
            </>
          )}
        </button>
      </footer>

      {typeof document !== "undefined"
        ? createPortal(
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
                    conversationId={conversation.id}
                    sessionKeyOverride={conversation.sessionKey}
                    storageNamespace={conversation.id}
                    isVisible={isVisible}
                    enableNativeBannerBridge={isVisible}
                    onStartRecordingRequested={() => handleConversationStartRequested(conversation.id)}
                    onSttSessionRunningChange={(isRunning) => {
                      handleConversationRunningChange(conversation.id, isRunning);
                    }}
                  />
                </motion.div>
              );
            })}
          </AnimatePresence>,
          document.body,
        )
        : null}
    </main>
  );
}
