"use client";

import type { AppLocale } from "@/i18n/config";
import type { AppDictionary } from "@/i18n/types";
import type { ConversationChannelSummary } from "@/lib/app-conversations";
import { getConversationDictionary } from "@/i18n/conversations";
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
import { getOrCreateTrackingUserId } from "@/components/LivePhoneDemo/use-realtime-stt";
import {
  normalizeLivePhoneDemoAdBannerPosition,
  type LivePhoneDemoAdBannerPosition,
} from "@/components/LivePhoneDemo/live-phone-demo.preferences";
import MingleHome from "@/components/mingle-home";
import MingleWordmark from "@/components/mingle-wordmark";

const CONVERSATIONS_API_PATH = "/api/conversations";
const RECENT_SEARCHES_STORAGE_KEY = "mingle:conversation-searches";
const RECENT_SEARCHES_SYNC_EVENT = "mingle:conversation-searches-sync";
const MAX_RECENT_SEARCHES = 6;
const EMPTY_RECENT_SEARCHES: string[] = [];
const CONVERSATION_QUERY_KEY = "conversation";
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

const conversationOverlayVariants: Variants = {
  initial: { x: "100%" },
  active: {
    x: "0%",
    transition: CONVERSATION_OVERLAY_TRANSITION,
  },
  exit: (exitMode: ConversationOverlayExitMode) => (
    exitMode === "animate"
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

function isNativeAppRuntime(): boolean {
  return typeof window !== "undefined"
    && typeof window.ReactNativeWebView?.postMessage === "function";
}

function normalizeSearchTerm(rawValue: string): string {
  return rawValue.trim().replace(/\s+/g, " ");
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
  return {
    "x-mingle-user-id": getOrCreateTrackingUserId(),
  };
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

function ConversationRow({
  item,
  disabled = false,
  onSelect,
}: {
  item: ConversationItem;
  disabled?: boolean;
  onSelect?: (item: ConversationItem) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect?.(item)}
      disabled={disabled}
      className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-gray-50 active:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-60"
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
  const [conversations, setConversations] = useState<ConversationChannelSummary[]>(
    [...initialConversations].sort(compareConversationRecency),
  );
  const [activeConversation, setActiveConversation] = useState<ConversationChannelSummary | null>(null);
  const [autoStartConversationId, setAutoStartConversationId] = useState<string | null>(null);
  const [overlayExitMode, setOverlayExitMode] = useState<ConversationOverlayExitMode>("animate");
  const [timeLabelsReady, setTimeLabelsReady] = useState(false);
  const searchOverlayRef = useRef<SearchOverlayHandle>(null);
  const activeConversationRef = useRef<ConversationChannelSummary | null>(null);
  const viewportWidthPx = useViewportWidthPx();
  const nativeBannerPositionFromQuery = useNativeBannerPositionFromSearch();
  const nativeTopInsetPx = useNativeInsetPx("nativeTopInsetPx");
  const nativeBottomInsetPx = useNativeInsetPx("nativeBottomInsetPx");
  const estimatedNativeBannerInsetPx = resolveEstimatedNativeBannerInsetPx(viewportWidthPx);
  const effectiveNativeTopInsetPx = isNativeAppRuntime() && nativeBannerPositionFromQuery === "top"
    ? Math.max(nativeTopInsetPx, estimatedNativeBannerInsetPx)
    : nativeTopInsetPx;
  const effectiveNativeBottomInsetPx = isNativeAppRuntime() && nativeBannerPositionFromQuery === "bottom"
    ? Math.max(nativeBottomInsetPx, estimatedNativeBannerInsetPx)
    : nativeBottomInsetPx;

  const conversationItems = useMemo(
    () => conversations.map((conversation) => (
      mapConversationSummaryToItem(conversation, locale, timeLabelsReady, copy)
    )),
    [conversations, copy, locale, timeLabelsReady],
  );
  const actionDisabled = isCreatingConversation || mutatingConversationId !== null;

  const updateConversationStatus = useCallback(async (
    conversationId: string,
    status: "active" | "paused",
  ) => {
    setMutatingConversationId(conversationId);
    try {
      const response = await fetch(`/api/conversations/${conversationId}`, {
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
    let cancelled = false;

    void fetch(CONVERSATIONS_API_PATH, {
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
    setTimeLabelsReady(true);
  }, []);

  useEffect(() => {
    if (activeConversation) return;
    const conversationId = readConversationIdFromLocation();
    if (!conversationId) return;
    const matchedConversation = conversations.find((conversation) => conversation.id === conversationId);
    if (matchedConversation) {
      setActiveConversation(matchedConversation);
    }
  }, [activeConversation, conversations]);

  useEffect(() => {
    if (!activeConversation) return;
    const nextConversation = conversations.find((conversation) => conversation.id === activeConversation.id);
    if (!nextConversation) return;
    if (nextConversation === activeConversation) return;
    setActiveConversation(nextConversation);
  }, [activeConversation, conversations]);

  useEffect(() => {
    if (!activeConversation || autoStartConversationId !== activeConversation.id) return;

    const timerId = window.setTimeout(() => {
      setAutoStartConversationId((current) => (
        current === activeConversation.id ? null : current
      ));
    }, 0);

    return () => {
      window.clearTimeout(timerId);
    };
  }, [activeConversation, autoStartConversationId]);

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

    if (shouldReplaceUrl) {
      replaceConversationOverlayUrl(null);
    }

    setOverlayExitMode(exitMode);
    setAutoStartConversationId(null);
    setActiveConversation((current) => (
      current?.id === previousConversation.id ? null : current
    ));
    setConversations((current) => current.map((item) => {
      if (item.id !== previousConversation.id) return item;
      return {
        ...item,
        status: "paused",
        pausedAt: item.pausedAt ?? new Date().toISOString(),
      };
    }));

    void (async () => {
      try {
        await updateConversationStatus(previousConversation.id, "paused");
      } catch {
        setConversations((current) => upsertConversation(current, previousConversation));
        window.alert(copy.pauseErrorMessage);
      }
    })();
  }, [copy.pauseErrorMessage, updateConversationStatus]);

  const handleCreateConversation = useCallback(async () => {
    if (isCreatingConversation || mutatingConversationId) return;
    setIsCreatingConversation(true);
    try {
      const response = await fetch(CONVERSATIONS_API_PATH, {
        method: "POST",
        headers: buildConversationRequestHeaders(),
      });
      const nextConversation = await readConversationResponse(response);
      setShowSearch(false);
      setConversations((current) => upsertConversation(current, nextConversation));
      setOverlayExitMode("animate");
      setAutoStartConversationId(nextConversation.id);
      setActiveConversation(nextConversation);
    } catch {
      window.alert(copy.createErrorMessage);
    } finally {
      setIsCreatingConversation(false);
    }
  }, [copy.createErrorMessage, isCreatingConversation, mutatingConversationId]);

  const handleOpenConversation = useCallback(async (item: ConversationItem) => {
    if (isCreatingConversation || mutatingConversationId) return;

    const matchedConversation = conversations.find((conversation) => conversation.id === item.id);
    if (!matchedConversation) return;

    if (matchedConversation.status === "active") {
      setShowSearch(false);
      setOverlayExitMode("animate");
      setAutoStartConversationId(null);
      setActiveConversation(matchedConversation);
      return;
    }

    try {
      const nextConversation = await updateConversationStatus(matchedConversation.id, "active");
      if (!nextConversation) return;
      setShowSearch(false);
      setOverlayExitMode("animate");
      setAutoStartConversationId(null);
      setActiveConversation(nextConversation);
    } catch {
      window.alert(copy.openErrorMessage);
    }
  }, [
    conversations,
    copy.openErrorMessage,
    isCreatingConversation,
    mutatingConversationId,
    updateConversationStatus,
  ]);

  const handleCloseActiveConversation = useCallback(async () => {
    if (!activeConversation || isCreatingConversation || mutatingConversationId) return;
    closeConversationOverlay(activeConversation, { animateExit: true, replaceUrl: true });
  }, [activeConversation, closeConversationOverlay, isCreatingConversation, mutatingConversationId]);

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
      if (!currentActiveConversation) return;
      if (readConversationIdFromLocation() === currentActiveConversation.id) return;
      closeConversationOverlay(currentActiveConversation);
    };

    window.addEventListener("popstate", handlePopState);
    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, [closeConversationOverlay]);

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
        className="flex shrink-0 items-center justify-between border-b border-gray-100 bg-white/95 px-4 backdrop-blur"
        style={{
          paddingTop: `calc(env(safe-area-inset-top, 0px) + ${effectiveNativeTopInsetPx}px)`,
          height: `calc(56px + env(safe-area-inset-top, 0px) + ${effectiveNativeTopInsetPx}px)`,
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
          <div>
            {conversationItems.map((item, index) => (
              <div key={item.id}>
                <ConversationRow
                  item={item}
                  disabled={actionDisabled}
                  onSelect={handleOpenConversation}
                />
                {index < conversationItems.length - 1 && (
                  <div className="mx-4 h-px bg-gray-100" />
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <footer
        className="shrink-0 border-t border-gray-100 bg-white/95 px-4 pt-3 shadow-[0_-18px_40px_-30px_rgba(15,23,42,0.28)] backdrop-blur"
        style={{
          paddingBottom: effectiveNativeBottomInsetPx > 0
            ? `calc(env(safe-area-inset-bottom, 0px) + ${effectiveNativeBottomInsetPx + 16}px)`
            : "calc(env(safe-area-inset-bottom, 0px) + 16px)",
        }}
      >
        <button
          type="button"
          onClick={handleCreateConversation}
          disabled={actionDisabled}
          className="flex h-14 w-full items-center justify-center gap-2 rounded-[1.4rem] bg-gradient-to-r from-amber-500 via-orange-500 to-amber-500 px-5 text-[1rem] font-semibold text-white shadow-[0_18px_36px_rgba(249,115,22,0.28)] transition active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
          aria-label={copy.newConversationButtonLabel}
        >
          {isCreatingConversation ? (
            <Loader2 size={20} className="animate-spin" strokeWidth={2.25} />
          ) : (
            <>
              <span>Start Conversation!</span>
              <ArrowRight size={18} strokeWidth={2.4} />
            </>
          )}
        </button>
      </footer>

      {typeof document !== "undefined"
        ? createPortal(
          <AnimatePresence custom={overlayExitMode}>
            {activeConversation ? (
              <motion.div
                key={activeConversation.id}
                custom={overlayExitMode}
                variants={conversationOverlayVariants}
                initial="initial"
                animate="active"
                exit="exit"
                className="fixed inset-0 z-[100] flex min-h-0 flex-col overflow-hidden bg-white"
              >
                <MingleHome
                  key={activeConversation.id}
                  dictionary={dictionary}
                  appleOAuthEnabled={appleOAuthEnabled}
                  googleOAuthEnabled={googleOAuthEnabled}
                  locale={locale}
                  headerMode="conversation"
                  onBack={handleCloseActiveConversation}
                  sessionKeyOverride={activeConversation.sessionKey}
                  storageNamespace={activeConversation.id}
                  autoStartOnMount={autoStartConversationId === activeConversation.id}
                />
              </motion.div>
            ) : null}
          </AnimatePresence>,
          document.body,
        )
        : null}
    </main>
  );
}
