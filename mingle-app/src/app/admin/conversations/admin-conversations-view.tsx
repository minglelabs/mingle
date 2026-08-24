"use client";

import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { getSttLanguageFlag } from "@/lib/stt-languages";
import { getTranslationLanguageName } from "@/lib/translation-languages";

const CONVERSATION_CACHE_VERSION = "v3";

function readSessionCache<T>(key: string): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(`${CONVERSATION_CACHE_VERSION}:${key}`);
    return raw ? JSON.parse(raw) as T : null;
  } catch {
    return null;
  }
}

function writeSessionCache(key: string, value: unknown): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(`${CONVERSATION_CACHE_VERSION}:${key}`, JSON.stringify(value));
  } catch {
    // Storage can be unavailable or full; the page still works without the cache.
  }
}

export type AdminConversationContent = {
  contentType: string;
  language: string;
  text: string;
  isDeleted: boolean | null;
};

export type AdminConversationMessage = {
  id: string;
  createdAt: string;
  sourceLanguage: string;
  isDeleted: boolean | null;
  contents: AdminConversationContent[];
};

export type AdminConversationSummary = {
  id: string;
  title: string;
  sessionKey: string;
  isDeleted: boolean | null;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  activeMessageCount: number;
  deletedMessageCount: number;
  latestMessageAt: string | null;
  href: string;
};

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Seoul" }).format(new Date(value));
}

function StatusBadge({ deleted }: { deleted: boolean | null }) {
  return deleted ? (
    <span className="rounded bg-[#fbe5e1] px-2 py-1 text-[10px] font-semibold text-[#9b3c2f]">삭제됨</span>
  ) : (
    <span className="rounded bg-[#e3f3e9] px-2 py-1 text-[10px] font-semibold text-[#28734b]">삭제되지 않음</span>
  );
}

function LanguageBadge({ content }: { content: AdminConversationContent }) {
  const languageName = getTranslationLanguageName(content.language) ?? content.language;
  const isSource = content.contentType === "SOURCE";
  return (
    <span className="mr-2 inline-flex items-center gap-1 rounded bg-white px-1.5 py-0.5 text-[10px] font-semibold text-[#5f5d58]" title={`${isSource ? "Source" : "Translation"}: ${languageName}`}>
      <span aria-hidden="true">{getSttLanguageFlag(content.language)}</span>
      <span>{isSource ? "Source" : "Translation"}</span>
      <span className="font-normal">· {languageName}</span>
    </span>
  );
}

function CacheUpdateButton({ visible, onClick }: { visible: boolean; onClick: () => void }) {
  if (!visible) return null;
  return <button className="rounded-md bg-[#b45309] px-3 py-2 text-xs font-semibold text-white shadow-sm hover:bg-[#92400e]" type="button" onClick={onClick}>새 데이터 적용</button>;
}

export function AdminConversationList({ channels }: { channels: AdminConversationSummary[] }) {
  const [search, setSearch] = useState("");
  const normalizedSearch = search.trim().toLocaleLowerCase();
  const visibleChannels = useMemo(() => channels.filter((channel) => {
    if (!normalizedSearch) return true;
    return `${channel.title} ${channel.sessionKey}`.toLocaleLowerCase().includes(normalizedSearch);
  }), [channels, normalizedSearch]);

  return (
    <section className="rounded-xl border border-[#e5e3dc] bg-white p-4 shadow-sm">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div><h2 className="font-semibold">대화방 목록</h2><p className="mt-1 text-xs text-[#898781]">최신 대화방이 위에 표시됩니다. 대화방을 선택하면 메시지를 확인할 수 있습니다. 이 탭에서 한 번 불러온 목록은 브라우저 캐시를 재사용합니다.</p></div>
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="대화방 제목·ID 검색" className="w-full rounded-md border border-[#d9d6ce] px-3 py-2 text-sm md:w-72" aria-label="대화방 목록 검색" />
      </div>
      <div className="space-y-2">
        {visibleChannels.map((channel) => (
          <Link className="block rounded-lg border border-[#eeeae2] p-4 transition hover:border-[#b45309] hover:bg-[#fffaf0]" href={channel.href} key={channel.id} replace={false}>
            <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold">{channel.title || "제목 없음"} <StatusBadge deleted={channel.isDeleted} /></h3><span className="text-xs text-[#898781]">{formatDate(channel.updatedAt)}</span></div>
            <p className="mt-1 break-all text-xs text-[#898781]">{channel.sessionKey}</p>
            <p className="mt-2 text-xs text-[#6f6d68]">현재 필터 메시지 {channel.messageCount}개 · 삭제되지 않음 {channel.activeMessageCount}개 · 삭제됨 {channel.deletedMessageCount}개 · 최근 메시지 {channel.latestMessageAt ? formatDate(channel.latestMessageAt) : "없음"} · 생성 {formatDate(channel.createdAt)}</p>
          </Link>
        ))}
        {visibleChannels.length === 0 ? <p className="rounded-lg bg-[#f7f6f2] p-4 text-sm text-[#6f6d68]">현재 페이지에 일치하는 대화방이 없습니다.</p> : null}
      </div>
    </section>
  );
}

type ConversationDataChannel = Omit<AdminConversationSummary, "href">;
type ConversationDataRoom = Pick<ConversationDataChannel, "id" | "title" | "sessionKey" | "isDeleted" | "createdAt" | "updatedAt">;
type ConversationData = {
  user: { externalUserId: string | null; email: string | null; name: string | null };
  channelCount: number;
  channels: ConversationDataChannel[];
  selectedChannel: ConversationDataRoom | null;
};

export type AdminConversationBrowserProps = {
  userId: string;
  channelDeleted: "all" | "active" | "deleted";
  messageDeleted: "all" | "active" | "deleted";
  sort: string;
  page: number;
  channelId: string;
};

type DeletedFilter = "all" | "active" | "deleted";
type ChannelSort = "updated-desc" | "updated-asc" | "created-desc" | "created-asc" | "latest-message-desc" | "title-asc" | "title-desc";

function messageCountForFilter(channel: ConversationDataChannel, filter: DeletedFilter): number {
  if (filter === "deleted") return channel.deletedMessageCount;
  if (filter === "active") return channel.activeMessageCount;
  return channel.messageCount;
}

function sortChannels(channels: ConversationDataChannel[], sort: ChannelSort): ConversationDataChannel[] {
  return [...channels].sort((left, right) => {
    if (sort === "title-asc" || sort === "title-desc") {
      const result = left.title.localeCompare(right.title, "ko");
      return sort === "title-desc" ? -result : result;
    }
    const leftTime = Date.parse(sort.startsWith("created") ? left.createdAt : sort === "latest-message-desc" ? left.latestMessageAt ?? "" : left.updatedAt);
    const rightTime = Date.parse(sort.startsWith("created") ? right.createdAt : sort === "latest-message-desc" ? right.latestMessageAt ?? "" : right.updatedAt);
    if (Number.isNaN(leftTime) || Number.isNaN(rightTime)) {
      if (Number.isNaN(leftTime) && Number.isNaN(rightTime)) return 0;
      return Number.isNaN(leftTime) ? 1 : -1;
    }
    const result = rightTime - leftTime;
    return sort.endsWith("-asc") ? -result : result;
  });
}

function buildBrowserHref(props: AdminConversationBrowserProps, overrides: { page?: number; channelId?: string } = {}): string {
  const query = new URLSearchParams({
    userId: props.userId,
    channelDeleted: props.channelDeleted,
    messageDeleted: props.messageDeleted,
    sort: props.sort,
    page: String(overrides.page ?? props.page),
  });
  const channelId = overrides.channelId ?? props.channelId;
  if (channelId) query.set("channelId", channelId);
  return `/admin/conversations?${query.toString()}`;
}

export function AdminConversationBrowser(props: AdminConversationBrowserProps) {
  const cacheKey = props.channelId ? `data:${props.userId}:room:${props.channelId}` : `data:${props.userId}:list`;
  const [data, setData] = useState<ConversationData | null>(null);
  const [isLoading, setIsLoading] = useState(Boolean(props.userId));
  const [error, setError] = useState("");
  const [hasUpdate, setHasUpdate] = useState(false);
  const [resolvedKey, setResolvedKey] = useState("");
  const [channelDeleted, setChannelDeleted] = useState<DeletedFilter>(props.channelDeleted);
  const [messageDeleted, setMessageDeleted] = useState<DeletedFilter>(props.messageDeleted);
  const [sort, setSort] = useState<ChannelSort>(props.sort as ChannelSort);
  const [listPage, setListPage] = useState(props.page);

  useEffect(() => {
    startTransition(() => {
      setChannelDeleted(props.channelDeleted);
      setMessageDeleted(props.messageDeleted);
      setSort(props.sort as ChannelSort);
      setListPage(props.page);
    });
  }, [props.channelDeleted, props.messageDeleted, props.page, props.sort, props.userId, props.channelId]);

  useEffect(() => {
    if (!props.userId) return;
    let active = true;
    const query = new URLSearchParams({
      userId: props.userId,
    });
    if (props.channelId) query.set("channelId", props.channelId);

    const load = async () => {
      const cached = readSessionCache<ConversationData>(cacheKey);
      const usableCached = Boolean(cached && (!props.channelId || cached.selectedChannel));
      if (usableCached && cached && active) {
        setData(cached);
        setIsLoading(false);
        setResolvedKey(cacheKey);
        setError("");
        setHasUpdate(false);
      }
      try {
        const response = await fetch(`/admin/conversations/data?${query.toString()}`, { cache: "no-store" });
        if (!response.ok) {
          const errorPayload = await response.json().catch(() => null) as { error?: string } | null;
          throw new Error(errorPayload?.error === "Conversation not found" ? "conversation_not_found" : response.status === 404 ? "not_found" : "load_failed");
        }
        const fresh = await response.json() as ConversationData;
        writeSessionCache(cacheKey, fresh);
        if (!active) return;
        startTransition(() => {
          if (usableCached) {
            if (JSON.stringify(cached) !== JSON.stringify(fresh)) setHasUpdate(true);
          } else {
            setData(fresh);
            setIsLoading(false);
            setResolvedKey(cacheKey);
          }
          setError("");
        });
      } catch (loadError) {
        if (!active) return;
        startTransition(() => {
          if (!usableCached) {
            setIsLoading(false);
            setResolvedKey(cacheKey);
          }
          setError(loadError instanceof Error && loadError.message === "conversation_not_found" ? "해당 대화방을 찾을 수 없습니다." : loadError instanceof Error && loadError.message === "not_found" ? "해당 사용자를 찾을 수 없습니다." : "데이터를 새로 불러오지 못했습니다. 캐시된 데이터가 있으면 계속 표시합니다.");
        });
      }
    };
    void load();
    return () => { active = false; };
  }, [cacheKey, props.channelId, props.userId]);

  const visibleData = resolvedKey === cacheKey ? data : null;
  const visibleError = resolvedKey === cacheKey ? error : "";
  const filteredChannels = useMemo(() => sortChannels(
    (visibleData?.channels ?? []).filter((channel) => channelDeleted === "all" || (channelDeleted === "deleted" ? channel.isDeleted === true : channel.isDeleted !== true)),
    sort,
  ), [channelDeleted, sort, visibleData?.channels]);
  if (!props.userId) return <p className="text-sm text-[#6f6d68]">사용자 ID를 입력해 주세요.</p>;
  if (!visibleData && (isLoading || !visibleError)) return <p className="rounded-xl border border-[#e5e3dc] bg-white p-5 text-sm text-[#6f6d68]">캐시된 대화록을 확인하고 서버 데이터를 불러오는 중...</p>;
  if (!visibleData) return <p className="rounded-xl border border-[#ead7d2] bg-white p-5 text-sm text-[#9b3c2f]">{visibleError}</p>;

  const totalListPages = Math.max(1, Math.ceil(filteredChannels.length / 20));
  const displayedPage = Math.min(listPage, totalListPages);
  const pageChannels = filteredChannels.slice((displayedPage - 1) * 20, displayedPage * 20);
  const currentProps = { ...props, channelDeleted, messageDeleted, sort, page: displayedPage };
  const summaries = pageChannels.map((channel) => ({
    ...channel,
    messageCount: messageCountForFilter(channel, messageDeleted),
    href: buildBrowserHref(currentProps, { channelId: channel.id }),
  }));
  const previousHref = displayedPage > 1 ? buildBrowserHref(currentProps, { page: displayedPage - 1, channelId: "" }) : undefined;
  const nextHref = displayedPage < totalListPages ? buildBrowserHref(currentProps, { page: displayedPage + 1, channelId: "" }) : undefined;
  const backHref = buildBrowserHref(currentProps, { channelId: "" });
  const applyUpdate = () => {
    const latest = readSessionCache<ConversationData>(cacheKey);
    if (!latest) return;
    startTransition(() => {
      setData(latest);
      setHasUpdate(false);
    });
  };

  return (
    <>
      <section className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#e5e3dc] bg-white p-5 shadow-sm"><div><h2 className="font-semibold">{visibleData.user.name || visibleData.user.email || "사용자"}</h2><p className="mt-1 break-all text-xs text-[#6f6d68]">{visibleData.user.externalUserId}</p><p className="mt-1 text-xs text-[#6f6d68]">대화방 {visibleData.channelCount}개 · 브라우저 캐시를 먼저 표시한 뒤 백그라운드에서 갱신합니다.</p></div><CacheUpdateButton visible={hasUpdate} onClick={applyUpdate} /></section>
      {visibleError ? <p className="mb-4 rounded-lg bg-[#fff4dc] p-3 text-xs text-[#8a5a00]">{visibleError}</p> : null}
      <section className="mb-5 grid gap-2 rounded-xl border border-[#e5e3dc] bg-white p-4 shadow-sm md:grid-cols-3"><label className="text-xs font-semibold text-[#6f6d68]">대화방 삭제 여부<select value={channelDeleted} onChange={(event) => { setChannelDeleted(event.target.value as DeletedFilter); setListPage(1); }} className="mt-1 block w-full rounded-md border border-[#d9d6ce] px-3 py-2 text-sm"><option value="all">전체</option><option value="active">삭제되지 않음</option><option value="deleted">삭제됨</option></select></label><label className="text-xs font-semibold text-[#6f6d68]">메시지 삭제 여부<select value={messageDeleted} onChange={(event) => setMessageDeleted(event.target.value as DeletedFilter)} className="mt-1 block w-full rounded-md border border-[#d9d6ce] px-3 py-2 text-sm"><option value="all">전체</option><option value="active">삭제되지 않음</option><option value="deleted">삭제됨</option></select></label><label className="text-xs font-semibold text-[#6f6d68]">대화방 정렬<select value={sort} onChange={(event) => { setSort(event.target.value as ChannelSort); setListPage(1); }} className="mt-1 block w-full rounded-md border border-[#d9d6ce] px-3 py-2 text-sm"><option value="updated-desc">최근 수정순</option><option value="updated-asc">오래된 수정순</option><option value="created-desc">최근 생성순</option><option value="created-asc">오래된 생성순</option><option value="latest-message-desc">최근 메시지 최신순</option><option value="title-asc">제목 가나다순</option><option value="title-desc">제목 가나다 역순</option></select></label></section>
      {!props.channelId ? (
        <>
          <nav className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#e5e3dc] bg-white p-3 text-sm" aria-label="대화방 페이지네이션"><span className="text-[#6f6d68]">대화방 {displayedPage} / {totalListPages}페이지 (페이지당 20개 · 현재 필터 {filteredChannels.length}개)</span><span className="flex gap-2">{previousHref ? <Link className="rounded border border-[#e5e3dc] px-3 py-1.5 font-semibold hover:bg-[#f4f3ee]" href={previousHref}>이전 대화방</Link> : null}{nextHref ? <Link className="rounded border border-[#e5e3dc] px-3 py-1.5 font-semibold hover:bg-[#f4f3ee]" href={nextHref}>다음 대화방</Link> : null}</span></nav>
          <AdminConversationList channels={summaries} />
        </>
      ) : visibleData.selectedChannel ? (
        <AdminConversationRoom channel={visibleData.selectedChannel} messageDeleted={messageDeleted} initialMessages={[]} initialPage={0} totalPages={0} initialMessageCount={0} apiUrl={`/admin/conversations/${encodeURIComponent(visibleData.selectedChannel.id)}/messages?${new URLSearchParams({ userId: props.userId })}`} backHref={backHref} cacheKey={`room:${props.userId}:${visibleData.selectedChannel.id}`} />
      ) : <p className="rounded-xl border border-[#ead7d2] bg-white p-5 text-sm text-[#9b3c2f]">해당 대화방을 찾을 수 없습니다.</p>}
    </>
  );
}

type AdminConversationRoomProps = {
  channel: {
    id: string;
    title: string;
    sessionKey: string;
    isDeleted: boolean | null;
    createdAt: string;
    updatedAt: string;
  };
  messageDeleted: DeletedFilter;
  initialMessages: AdminConversationMessage[];
  initialPage: number;
  totalPages: number;
  initialMessageCount: number;
  apiUrl: string;
  backHref: string;
  cacheKey: string;
};

type MessagesResponse = {
  messages: AdminConversationMessage[];
  messageCount: number;
  page: number;
  totalPages: number;
  hasNext: boolean;
};

function mergeMessages(latestMessages: AdminConversationMessage[], existingMessages: AdminConversationMessage[]): AdminConversationMessage[] {
  const byId = new Map<string, AdminConversationMessage>();
  for (const message of [...latestMessages, ...existingMessages]) byId.set(message.id, message);
  return [...byId.values()].sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt));
}

export function AdminConversationRoom({
  channel,
  messageDeleted,
  initialMessages,
  initialPage,
  totalPages,
  initialMessageCount,
  apiUrl,
  backHref,
  cacheKey,
}: AdminConversationRoomProps) {
  const [messages, setMessages] = useState(initialMessages);
  const [page, setPage] = useState(initialPage);
  const [messageCount, setMessageCount] = useState(initialMessageCount);
  const [hasNext, setHasNext] = useState(initialPage > 0 && initialPage < totalPages);
  const [hasLoadedInitial, setHasLoadedInitial] = useState(initialPage > 0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [hasUpdate, setHasUpdate] = useState(false);
  const [search, setSearch] = useState("");
  const loadingRef = useRef(false);
  const messagesRef = useRef(initialMessages);
  const pageRef = useRef(initialPage);
  const totalPagesRef = useRef(totalPages);
  const messageCountRef = useRef(initialMessageCount);
  const normalizedSearch = search.trim().toLocaleLowerCase();

  const loadMessagesPage = useCallback(async (nextPage: number, replace: boolean, background = false) => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    if (!background) {
      setIsLoading(true);
      setError("");
    }
    try {
      const response = await fetch(`${apiUrl}&page=${nextPage}`, { cache: "no-store" });
      if (!response.ok) throw new Error("message_load_failed");
      const payload = await response.json() as MessagesResponse;
      const nextMessages = replace ? mergeMessages(payload.messages, messagesRef.current) : [...messagesRef.current, ...payload.messages];
      const nextPageValue = background ? Math.max(pageRef.current, payload.page) : payload.page;
      const nextTotalPages = payload.totalPages;
      writeSessionCache(cacheKey, {
        messages: nextMessages,
        page: nextPageValue,
        totalPages: nextTotalPages,
        messageCount: payload.messageCount,
      });
      if (background) {
        if (JSON.stringify(nextMessages) !== JSON.stringify(messagesRef.current) || nextPageValue !== pageRef.current || nextTotalPages !== totalPagesRef.current || payload.messageCount !== messageCountRef.current) setHasUpdate(true);
        return;
      }
      messagesRef.current = nextMessages;
      pageRef.current = nextPageValue;
      totalPagesRef.current = nextTotalPages;
      messageCountRef.current = payload.messageCount;
      setMessages(nextMessages);
      setPage(nextPageValue);
      setMessageCount(payload.messageCount);
      setHasNext(nextPageValue < nextTotalPages);
      setHasLoadedInitial(true);
    } catch {
      setError("이전 메시지를 불러오지 못했습니다. 다시 아래로 스크롤해 주세요.");
    } finally {
      loadingRef.current = false;
      if (!background) setIsLoading(false);
    }
  }, [apiUrl, cacheKey]);

  const loadOlderMessages = useCallback(async () => {
    if (!hasLoadedInitial || !hasNext) return;
    await loadMessagesPage(page + 1, false);
  }, [hasLoadedInitial, hasNext, loadMessagesPage, page]);

  useEffect(() => {
    const cached = readSessionCache<{
      messages: AdminConversationMessage[];
      page: number;
      totalPages: number;
      messageCount: number;
    }>(cacheKey);
    if (cached) {
      messagesRef.current = cached.messages;
      pageRef.current = cached.page;
      totalPagesRef.current = cached.totalPages;
      messageCountRef.current = cached.messageCount;
      setMessages(cached.messages);
      setPage(cached.page);
      setMessageCount(cached.messageCount);
      setHasNext(cached.page < cached.totalPages);
      setHasLoadedInitial(true);
    }
    void loadMessagesPage(1, true, Boolean(cached));
  }, [cacheKey, loadMessagesPage]);

  useEffect(() => {
    const scrollContainer = document.getElementById("admin-conversations-scroll");
    if (!scrollContainer || !hasLoadedInitial || !hasNext) return;
    const loadIfNearBottom = () => {
      if (scrollContainer.scrollHeight - scrollContainer.scrollTop - scrollContainer.clientHeight < 640) void loadOlderMessages();
    };
    scrollContainer.addEventListener("scroll", loadIfNearBottom, { passive: true });
    loadIfNearBottom();
    return () => scrollContainer.removeEventListener("scroll", loadIfNearBottom);
  }, [hasLoadedInitial, hasNext, loadOlderMessages, isLoading, messages.length]);

  const visibleMessages = useMemo(() => {
    const deletionFiltered = messageDeleted === "all"
      ? messages
      : messages.filter((message) => messageDeleted === "deleted" ? message.isDeleted === true : message.isDeleted !== true);
    if (!normalizedSearch) return deletionFiltered;
    return deletionFiltered.filter((message) => [message.sourceLanguage, ...message.contents.map((content) => `${content.language} ${content.text}`)].join(" ").toLocaleLowerCase().includes(normalizedSearch));
  }, [messageDeleted, messages, normalizedSearch]);

  const applyUpdate = () => {
    const latest = readSessionCache<{
      messages: AdminConversationMessage[];
      page: number;
      totalPages: number;
      messageCount: number;
    }>(cacheKey);
    if (!latest) return;
    messagesRef.current = latest.messages;
    pageRef.current = latest.page;
    totalPagesRef.current = latest.totalPages;
    messageCountRef.current = latest.messageCount;
    startTransition(() => {
      setMessages(latest.messages);
      setPage(latest.page);
      setMessageCount(latest.messageCount);
      setHasNext(latest.page < latest.totalPages);
      setHasLoadedInitial(true);
      setHasUpdate(false);
    });
  };

  return (
    <section className="rounded-xl border border-[#e5e3dc] bg-white shadow-sm">
      <div className="border-b border-[#eeeae2] p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><Link className="text-sm font-semibold text-[#9b3c2f] hover:underline" href={backHref} replace>← 대화방 목록</Link><h2 className="mt-2 text-xl font-semibold">{channel.title || "제목 없음"} <StatusBadge deleted={channel.isDeleted} /></h2><p className="mt-1 break-all text-xs text-[#898781]">{channel.sessionKey}</p><p className="mt-1 text-xs text-[#6f6d68]">메시지 {hasLoadedInitial ? `${messageCount}개` : "불러오는 중"} · 위가 최신, 아래가 오래된 메시지 · 200개씩 자동 로드</p></div>
          <div className="flex w-full flex-col items-end gap-2 md:w-80"><CacheUpdateButton visible={hasUpdate} onClick={applyUpdate} /><label className="block w-full text-xs font-semibold text-[#6f6d68]" htmlFor="room-message-search">현재 불러온 메시지 검색</label><input id="room-message-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="메시지 내용·언어 검색" className="w-full rounded-md border border-[#d9d6ce] px-3 py-2 text-sm" /><p className="w-full text-right text-[11px] text-[#898781]">{visibleMessages.length} / {messages.length}개 표시</p></div>
        </div>
      </div>
      <div className="p-4">
        <div className="space-y-3">
          {!hasLoadedInitial && isLoading ? <p className="py-10 text-center text-sm text-[#898781]">메시지를 불러오는 중...</p> : null}
          {visibleMessages.map((message) => (
            <article className="rounded-lg bg-[#f7f6f2] p-3" key={message.id}>
              <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-[#898781]"><span>{formatDate(message.createdAt)}</span><span>감지 언어: {getSttLanguageFlag(message.sourceLanguage)} {getTranslationLanguageName(message.sourceLanguage) ?? message.sourceLanguage}</span><StatusBadge deleted={message.isDeleted} /></div>
              {message.contents.map((content) => <p className="mb-2 whitespace-pre-wrap text-sm last:mb-0" key={`${content.contentType}-${content.language}`}><LanguageBadge content={content} />{content.isDeleted ? <span className="mr-1 text-xs font-semibold text-[#9b3c2f]">[삭제됨]</span> : null}{content.text}</p>)}
            </article>
          ))}
          {visibleMessages.length === 0 ? <p className="rounded-lg bg-[#f7f6f2] p-4 text-sm text-[#6f6d68]">현재 검색어와 일치하는 메시지가 없습니다.</p> : null}
          {isLoading ? <p className="py-3 text-center text-xs text-[#898781]">이전 메시지를 불러오는 중...</p> : null}
          {error ? <p className="rounded-lg bg-[#fbe5e1] p-3 text-xs text-[#9b3c2f]">{error}</p> : null}
          {!hasNext && messages.length > 0 ? <p className="py-3 text-center text-xs text-[#898781]">이 대화방의 모든 메시지를 확인했습니다.</p> : null}
        </div>
      </div>
    </section>
  );
}
