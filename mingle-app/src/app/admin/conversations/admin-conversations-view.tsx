"use client";

import { useMemo, useState } from "react";
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

export type AdminConversationChannel = {
  id: string;
  title: string;
  sessionKey: string;
  isDeleted: boolean | null;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  messagePage: number;
  messageTotalPages: number;
  messages: AdminConversationMessage[];
  previousMessagesHref?: string;
  nextMessagesHref?: string;
};

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Seoul" }).format(new Date(value));
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

function StatusBadge({ deleted }: { deleted: boolean | null }) {
  return deleted ? (
    <span className="rounded bg-[#fbe5e1] px-2 py-1 text-[10px] font-semibold text-[#9b3c2f]">삭제됨</span>
  ) : (
    <span className="rounded bg-[#e3f3e9] px-2 py-1 text-[10px] font-semibold text-[#28734b]">정상</span>
  );
}

export function AdminConversationsView({ channels }: { channels: AdminConversationChannel[] }) {
  const [search, setSearch] = useState("");
  const normalizedSearch = search.trim().toLocaleLowerCase();
  const filteredChannels = useMemo(() => channels.map((channel) => {
    if (!normalizedSearch) return channel;
    const matchingMessages = channel.messages.filter((message) =>
      [message.sourceLanguage, ...message.contents.map((content) => `${content.language} ${content.text}`)]
        .join(" ")
        .toLocaleLowerCase()
        .includes(normalizedSearch),
    );
    const channelMatches = `${channel.title} ${channel.sessionKey}`.toLocaleLowerCase().includes(normalizedSearch);
    return channelMatches ? channel : { ...channel, messages: matchingMessages };
  }).filter((channel) => !normalizedSearch || channel.title.toLocaleLowerCase().includes(normalizedSearch) || channel.sessionKey.toLocaleLowerCase().includes(normalizedSearch) || channel.messages.length > 0), [channels, normalizedSearch]);

  return (
    <>
      <section className="mb-5 rounded-xl border border-[#e5e3dc] bg-white p-4 shadow-sm">
        <label className="block text-sm font-semibold" htmlFor="conversation-search">현재 불러온 내용 검색</label>
        <input id="conversation-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="대화방 제목, 언어, 메시지 내용 검색" className="mt-2 w-full rounded-md border border-[#d9d6ce] px-3 py-2 text-sm outline-none focus:border-[#b45309]" />
        <p className="mt-2 text-xs text-[#898781]">검색 결과 {filteredChannels.length}개 대화방 · 서버에서 추가 데이터를 불러오지는 않습니다.</p>
      </section>

      <div className="space-y-5">
        {filteredChannels.map((channel) => (
          <section className="rounded-xl border border-[#e5e3dc] bg-white p-5 shadow-sm" key={channel.id}>
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3 border-b border-[#eeeae2] pb-3">
              <div>
                <h2 className="font-semibold">{channel.title || "제목 없음"} <StatusBadge deleted={channel.isDeleted} /></h2>
                <p className="mt-1 text-xs text-[#898781]">{formatDate(channel.createdAt)} · {channel.messageCount}개 메시지 · {channel.sessionKey}</p>
              </div>
              <div className="flex items-center gap-2 text-xs text-[#6f6d68]">
                <span>현재 {channel.messages.length}개 표시</span>
                {channel.previousMessagesHref ? <a className="rounded border border-[#e5e3dc] px-2 py-1 font-semibold hover:bg-[#f4f3ee]" href={channel.previousMessagesHref}>이전 200개</a> : null}
                {channel.nextMessagesHref ? <a className="rounded border border-[#e5e3dc] px-2 py-1 font-semibold hover:bg-[#f4f3ee]" href={channel.nextMessagesHref}>다음 200개</a> : null}
              </div>
            </div>
            <div className="space-y-3">
              {channel.messages.length === 0 ? <p className="rounded-lg bg-[#f7f6f2] p-4 text-sm text-[#898781]">현재 조건에 맞는 메시지가 없습니다.</p> : channel.messages.map((message) => (
                <article className="rounded-lg bg-[#f7f6f2] p-3" key={message.id}>
                  <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-[#898781]">
                    <span>{formatDate(message.createdAt)}</span>
                    <span>감지 언어: {getSttLanguageFlag(message.sourceLanguage)} {getTranslationLanguageName(message.sourceLanguage) ?? message.sourceLanguage}</span>
                    <StatusBadge deleted={message.isDeleted} />
                  </div>
                  {message.contents.map((content) => (
                    <p className="mb-2 whitespace-pre-wrap text-sm last:mb-0" key={`${content.contentType}-${content.language}`}>
                      <LanguageBadge content={content} />
                      {content.isDeleted ? <span className="mr-1 text-xs font-semibold text-[#9b3c2f]">[삭제됨]</span> : null}
                      {content.text}
                    </p>
                  ))}
                </article>
              ))}
            </div>
          </section>
        ))}
        {filteredChannels.length === 0 ? <p className="rounded-xl border border-[#e5e3dc] bg-white p-5 text-sm text-[#6f6d68]">현재 조건에 맞는 대화방이 없습니다.</p> : null}
      </div>
    </>
  );
}
