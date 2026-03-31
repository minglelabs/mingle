"use client";

import type { AppLocale } from "@/i18n/config";
import type { AppDictionary } from "@/i18n/types";
import type { ConversationChannelSummary } from "@/lib/app-conversations";
import type { NativeRuntimePlatform } from "@/lib/native-runtime-platform";
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
import { AnimatePresence, motion } from "framer-motion";
import { Loader2, MessageCirclePlus, Search } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import BottomTabBar from "@/components/bottom-tab-bar";
import MingleHome from "@/components/mingle-home";
import MingleWordmark from "@/components/mingle-wordmark";
import NativeBottomTabBannerSlot from "@/components/native-bottom-tab-banner-slot";

const RECENT_SEARCHES_STORAGE_KEY = "mingle:conversation-searches";
const RECENT_SEARCHES_SYNC_EVENT = "mingle:conversation-searches-sync";
const MAX_RECENT_SEARCHES = 6;
const EMPTY_RECENT_SEARCHES: string[] = [];
const ACTIVE_STATUS_LABEL = "Live session";
const PAUSED_STATUS_LABEL = "Paused";
const PRESERVED_NATIVE_QUERY_KEYS = [
  "apiNamespace",
  "nativeAuth",
  "nativeBannerPosition",
  "nativeBottomInsetPx",
  "nativePlatform",
  "nativeStt",
  "nativeTopInsetPx",
  "nativeUi",
  "sttDebug",
  "ttsDebug",
] as const;
const CONVERSATION_AVATAR_COLORS = [
  "#fb7185",
  "#38bdf8",
  "#34d399",
  "#f59e0b",
  "#a78bfa",
  "#f97316",
] as const;

let recentSearchesSnapshot = EMPTY_RECENT_SEARCHES;
let recentSearchesSnapshotRaw = "__initial__";

type TranslatorConfig = {
  appleWebOAuthEnabled: boolean;
  appleNativeAuthEnabled: boolean;
  googleOAuthEnabled: boolean;
  initialNativePlatform?: NativeRuntimePlatform | null;
};

interface ConversationItem {
  id: string;
  title: string;
  preview: string;
  timeLabel: string;
  status: "active" | "paused";
  avatarText: string;
  avatarColor: string;
  sequenceNumber: number;
  sessionKey: string;
  createdAt: string;
  updatedAt: string;
  pausedAt: string | null;
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

function buildNativeAwarePath(
  pathname: string,
  searchParams: Pick<URLSearchParams, "getAll">,
): string {
  const nextSearchParams = new URLSearchParams();

  for (const key of PRESERVED_NATIVE_QUERY_KEYS) {
    for (const value of searchParams.getAll(key)) {
      nextSearchParams.append(key, value);
    }
  }

  const nextSearch = nextSearchParams.toString();
  return nextSearch ? `${pathname}?${nextSearch}` : pathname;
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
): ConversationItem {
  return {
    id: conversation.id,
    title: conversation.title,
    preview: conversation.status === "active" ? ACTIVE_STATUS_LABEL : PAUSED_STATUS_LABEL,
    timeLabel: formatConversationTime(conversation.updatedAt, locale),
    status: conversation.status,
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
            className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] ${
              item.status === "active"
                ? "bg-emerald-100 text-emerald-700"
                : "bg-slate-100 text-slate-500"
            }`}
          >
            {item.status}
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
  onClose: () => void;
  conversations: ConversationItem[];
  dictionary: AppDictionary;
  onSelectConversation: (item: ConversationItem) => void;
  actionDisabled?: boolean;
};

const SearchOverlay = forwardRef<SearchOverlayHandle, SearchOverlayProps>(function SearchOverlay({
  open,
  onClose,
  conversations,
  dictionary,
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
        style={{ paddingTop: "env(safe-area-inset-top, 44px)", marginTop: "12px" }}
      >
        <div className="flex flex-1 items-center gap-2 rounded-xl bg-gray-100 px-3 py-2">
          <Search size={16} className="shrink-0 text-gray-400" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={dictionary.conversations.searchPlaceholder}
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
          {dictionary.conversations.cancelAction}
        </button>
      </form>

      <div className="flex-1 overflow-y-auto pb-[calc(1rem+env(safe-area-inset-bottom,0px))]">
        {hasQuery ? (
          filtered.length === 0 ? (
            <div className="flex flex-col items-center py-16 text-gray-400">
              <p className="text-[14px]">{dictionary.conversations.noSearchResults}</p>
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
                {dictionary.conversations.recentSearchesTitle}
              </h2>
              {recentSearches.length > 0 ? (
                <button
                  type="button"
                  onClick={handleClearRecentSearches}
                  className="shrink-0 text-[13px] font-medium text-[#7c3aed]"
                >
                  {dictionary.conversations.clearRecentSearchesAction}
                </button>
              ) : null}
            </div>
            {recentSearches.length === 0 ? (
              <p className="px-1 py-3 text-[14px] text-gray-400">
                {dictionary.conversations.noRecentSearches}
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
  translatorConfig: TranslatorConfig;
};

export default function ConversationList({
  locale,
  dictionary,
  initialConversations,
  translatorConfig,
}: ConversationListProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [showSearch, setShowSearch] = useState(false);
  const [isCreatingConversation, setIsCreatingConversation] = useState(false);
  const [mutatingConversationId, setMutatingConversationId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<ConversationChannelSummary[]>(
    [...initialConversations].sort(compareConversationRecency),
  );
  const [activeConversation, setActiveConversation] = useState<ConversationChannelSummary | null>(null);
  const searchOverlayRef = useRef<SearchOverlayHandle>(null);
  const isConversationOverlayOpen = activeConversation !== null;

  const conversationItems = useMemo(
    () => conversations.map((conversation) => mapConversationSummaryToItem(conversation, locale)),
    [conversations, locale],
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
        headers: { "Content-Type": "application/json" },
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

  const handleCreateConversation = useCallback(async () => {
    if (isCreatingConversation || mutatingConversationId) return;
    setIsCreatingConversation(true);
    try {
      const response = await fetch("/api/conversations", {
        method: "POST",
      });
      const nextConversation = await readConversationResponse(response);
      setConversations((current) => upsertConversation(current, nextConversation));
      setActiveConversation(nextConversation);
    } catch {
      window.alert("Failed to create a conversation.");
    } finally {
      setIsCreatingConversation(false);
    }
  }, [isCreatingConversation, mutatingConversationId]);

  const handleOpenConversation = useCallback(async (item: ConversationItem) => {
    if (isCreatingConversation || mutatingConversationId) return;

    const matchedConversation = conversations.find((conversation) => conversation.id === item.id);
    if (!matchedConversation) return;

    if (matchedConversation.status === "active") {
      setShowSearch(false);
      setActiveConversation(matchedConversation);
      return;
    }

    try {
      const nextConversation = await updateConversationStatus(matchedConversation.id, "active");
      if (!nextConversation) return;
      setShowSearch(false);
      setActiveConversation(nextConversation);
    } catch {
      window.alert("Failed to open the conversation.");
    }
  }, [conversations, isCreatingConversation, mutatingConversationId, updateConversationStatus]);

  const handleCloseActiveConversation = useCallback(async () => {
    if (!activeConversation || isCreatingConversation || mutatingConversationId) return;

    try {
      const pausedConversation = await updateConversationStatus(activeConversation.id, "paused");
      if (!pausedConversation) return;
      setActiveConversation(null);
    } catch {
      window.alert("Failed to pause the conversation.");
    }
  }, [activeConversation, isCreatingConversation, mutatingConversationId, updateConversationStatus]);

  const handleNavigateToMypage = useCallback(async () => {
    if (activeConversation) {
      try {
        const pausedConversation = await updateConversationStatus(activeConversation.id, "paused");
        if (!pausedConversation) return;
      } catch {
        window.alert("Failed to pause the conversation.");
        return;
      }
    }

    const mypageHref = buildNativeAwarePath(`/${locale}/mypage`, searchParams);
    router.push(mypageHref);
  }, [activeConversation, locale, router, searchParams, updateConversationStatus]);

  return (
    <main className="relative flex h-full min-h-0 w-full flex-col overflow-hidden bg-white text-slate-900">
      <SearchOverlay
        ref={searchOverlayRef}
        open={showSearch}
        onClose={() => setShowSearch(false)}
        conversations={conversationItems}
        dictionary={dictionary}
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

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={handleOpenSearch}
            className="flex h-10 w-10 items-center justify-center rounded-full transition active:bg-gray-100"
            aria-label={dictionary.conversations.searchButtonLabel}
          >
            <Search size={22} strokeWidth={2} />
          </button>
          <button
            type="button"
            onClick={handleCreateConversation}
            disabled={actionDisabled}
            className="flex h-10 w-10 items-center justify-center rounded-full transition active:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-60"
            aria-label={dictionary.conversations.newConversationButtonLabel}
          >
            {isCreatingConversation ? (
              <Loader2 size={22} className="animate-spin" strokeWidth={2} />
            ) : (
              <MessageCirclePlus size={22} strokeWidth={2} />
            )}
          </button>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {conversationItems.length === 0 ? (
          <div className="flex flex-col items-center py-16 text-gray-400">
            <span className="mb-3 text-5xl">💬</span>
            <p className="text-[15px] font-semibold text-slate-700">
              {dictionary.conversations.emptyTitle}
            </p>
            <p className="mt-1 text-[13px] text-gray-400">
              {dictionary.conversations.emptyDescription}
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
        <NativeBottomTabBannerSlot hidden={showSearch || isConversationOverlayOpen} />
      </div>

      {!isConversationOverlayOpen ? (
        <BottomTabBar locale={locale} dictionary={dictionary} />
      ) : null}

      {typeof document !== "undefined"
        ? createPortal(
          <AnimatePresence>
            {activeConversation ? (
              <motion.div
                key={activeConversation.id}
                initial={{ x: "100%" }}
                animate={{ x: "0%" }}
                exit={{ x: "100%" }}
                transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                className="fixed inset-0 z-[100] flex min-h-0 flex-col overflow-hidden bg-white"
              >
                <MingleHome
                  key={activeConversation.id}
                  dictionary={dictionary}
                  locale={locale}
                  appleWebOAuthEnabled={translatorConfig.appleWebOAuthEnabled}
                  appleNativeAuthEnabled={translatorConfig.appleNativeAuthEnabled}
                  googleOAuthEnabled={translatorConfig.googleOAuthEnabled}
                  initialNativePlatform={translatorConfig.initialNativePlatform}
                  headerMode="conversation"
                  onBack={handleCloseActiveConversation}
                  sessionKeyOverride={activeConversation.sessionKey}
                  storageNamespace={activeConversation.id}
                  bottomTabActiveRoute={null}
                  onConversationsTabPress={handleCloseActiveConversation}
                  onMypageTabPress={handleNavigateToMypage}
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
