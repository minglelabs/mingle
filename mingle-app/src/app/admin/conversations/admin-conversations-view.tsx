"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { getSttLanguageFlag } from "@/lib/stt-languages";
import { getTranslationLanguageName } from "@/lib/translation-languages";

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
        <div><h2 className="font-semibold">대화방 목록</h2><p className="mt-1 text-xs text-[#898781]">최신 대화방이 위에 표시됩니다. 대화방을 선택하면 메시지를 확인할 수 있습니다.</p></div>
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="대화방 제목·ID 검색" className="w-full rounded-md border border-[#d9d6ce] px-3 py-2 text-sm md:w-72" aria-label="대화방 목록 검색" />
      </div>
      <div className="space-y-2">
        {visibleChannels.map((channel) => (
          <Link className="block rounded-lg border border-[#eeeae2] p-4 transition hover:border-[#b45309] hover:bg-[#fffaf0]" href={channel.href} key={channel.id}>
            <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold">{channel.title || "제목 없음"} <StatusBadge deleted={channel.isDeleted} /></h3><span className="text-xs text-[#898781]">{formatDate(channel.updatedAt)}</span></div>
            <p className="mt-1 break-all text-xs text-[#898781]">{channel.sessionKey}</p>
            <p className="mt-2 text-xs text-[#6f6d68]">메시지 {channel.messageCount}개 · 생성 {formatDate(channel.createdAt)}</p>
          </Link>
        ))}
        {visibleChannels.length === 0 ? <p className="rounded-lg bg-[#f7f6f2] p-4 text-sm text-[#6f6d68]">현재 페이지에 일치하는 대화방이 없습니다.</p> : null}
      </div>
    </section>
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
  messageCount: number;
  initialMessages: AdminConversationMessage[];
  initialPage: number;
  totalPages: number;
  apiUrl: string;
  backHref: string;
};

type MessagesResponse = {
  messages: AdminConversationMessage[];
  page: number;
  totalPages: number;
  hasNext: boolean;
};

export function AdminConversationRoom({
  channel,
  messageCount,
  initialMessages,
  initialPage,
  totalPages,
  apiUrl,
  backHref,
}: AdminConversationRoomProps) {
  const [messages, setMessages] = useState(initialMessages);
  const [page, setPage] = useState(initialPage);
  const [hasNext, setHasNext] = useState(initialPage < totalPages);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const loadingRef = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const normalizedSearch = search.trim().toLocaleLowerCase();

  const loadOlderMessages = useCallback(async () => {
    if (!hasNext || loadingRef.current) return;
    loadingRef.current = true;
    setIsLoading(true);
    setError("");
    try {
      const response = await fetch(`${apiUrl}&page=${page + 1}`, { cache: "no-store" });
      if (!response.ok) throw new Error("message_load_failed");
      const payload = await response.json() as MessagesResponse;
      setMessages((current) => [...current, ...payload.messages]);
      setPage(payload.page);
      setHasNext(payload.hasNext);
    } catch {
      setError("이전 메시지를 불러오지 못했습니다. 다시 아래로 스크롤해 주세요.");
    } finally {
      loadingRef.current = false;
      setIsLoading(false);
    }
  }, [apiUrl, hasNext, page]);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element || !hasNext || isLoading || element.scrollHeight > element.clientHeight + 80) return;
    void loadOlderMessages();
  }, [hasNext, isLoading, loadOlderMessages, messages.length]);

  const visibleMessages = useMemo(() => {
    if (!normalizedSearch) return messages;
    return messages.filter((message) => [message.sourceLanguage, ...message.contents.map((content) => `${content.language} ${content.text}`)].join(" ").toLocaleLowerCase().includes(normalizedSearch));
  }, [messages, normalizedSearch]);

  return (
    <section className="rounded-xl border border-[#e5e3dc] bg-white shadow-sm">
      <div className="border-b border-[#eeeae2] p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><Link className="text-sm font-semibold text-[#9b3c2f] hover:underline" href={backHref}>← 대화방 목록</Link><h2 className="mt-2 text-xl font-semibold">{channel.title || "제목 없음"} <StatusBadge deleted={channel.isDeleted} /></h2><p className="mt-1 break-all text-xs text-[#898781]">{channel.sessionKey}</p><p className="mt-1 text-xs text-[#6f6d68]">메시지 {messageCount}개 · 위가 최신, 아래가 오래된 메시지 · 200개씩 자동 로드</p></div>
          <div className="w-full md:w-80"><label className="block text-xs font-semibold text-[#6f6d68]" htmlFor="room-message-search">현재 불러온 메시지 검색</label><input id="room-message-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="메시지 내용·언어 검색" className="mt-1 w-full rounded-md border border-[#d9d6ce] px-3 py-2 text-sm" /><p className="mt-1 text-right text-[11px] text-[#898781]">{visibleMessages.length} / {messages.length}개 표시</p></div>
        </div>
      </div>
      <div ref={scrollRef} onScroll={(event) => { const element = event.currentTarget; if (element.scrollHeight - element.scrollTop - element.clientHeight < 640) void loadOlderMessages(); }} className="h-[calc(100svh-310px)] min-h-[360px] overflow-y-auto overscroll-contain p-4">
        <div className="space-y-3">
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
