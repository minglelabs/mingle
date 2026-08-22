import type { Metadata } from "next";
import type { Prisma } from "@prisma/client";
import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ADMIN_SESSION_COOKIE_NAME, verifyAdminSessionToken } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";
import { AdminConversationsView, type AdminConversationChannel } from "./admin-conversations-view";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Mingle Admin Conversations" };

const CHANNEL_PAGE_SIZE = 10;
const MESSAGE_PAGE_SIZE = 200;

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

type DeletedFilter = "all" | "active" | "deleted";
type ChannelSort = "updated-desc" | "updated-asc" | "created-desc" | "created-asc" | "title-asc" | "title-desc";

function first(value: string | string[] | undefined): string {
  return typeof value === "string" ? value.trim() : Array.isArray(value) ? (value[0] ?? "").trim() : "";
}

function normalizePage(value: string): number {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 100_000) : 1;
}

function normalizeDeletedFilter(value: string, fallback: DeletedFilter = "all"): DeletedFilter {
  return value === "active" || value === "deleted" || value === "all" ? value : fallback;
}

function normalizeSort(value: string): ChannelSort {
  return value === "updated-asc" || value === "created-desc" || value === "created-asc" || value === "title-asc" || value === "title-desc" ? value : "updated-desc";
}

function deletedWhere(filter: DeletedFilter): Prisma.AppConversationChannelWhereInput {
  return filter === "deleted" ? { isDeleted: true } : filter === "active" ? { isDeleted: { not: true } } : {};
}

function messageDeletedWhere(filter: DeletedFilter): Prisma.AppMessageWhereInput {
  return filter === "deleted" ? { isDeleted: true } : filter === "active" ? { isDeleted: { not: true } } : {};
}

function channelOrderBy(sort: ChannelSort): Prisma.AppConversationChannelOrderByWithRelationInput {
  switch (sort) {
    case "updated-asc": return { updatedAt: "asc" };
    case "created-desc": return { createdAt: "desc" };
    case "created-asc": return { createdAt: "asc" };
    case "title-asc": return { title: "asc" };
    case "title-desc": return { title: "desc" };
    default: return { updatedAt: "desc" };
  }
}

function formatDate(value: Date): string {
  return value.toISOString();
}

async function authenticated(): Promise<boolean> {
  const store = await cookies();
  return verifyAdminSessionToken(store.get(ADMIN_SESSION_COOKIE_NAME)?.value);
}

function buildConversationHref(args: {
  userId: string;
  channelDeleted: DeletedFilter;
  messageDeleted: DeletedFilter;
  sort: ChannelSort;
  page?: number;
  messageSession?: string;
  messagePage?: number;
}): string {
  const query = new URLSearchParams({
    userId: args.userId,
    channelDeleted: args.channelDeleted,
    messageDeleted: args.messageDeleted,
    sort: args.sort,
    page: String(args.page ?? 1),
  });
  if (args.messageSession) query.set("messageSession", args.messageSession);
  if (args.messagePage && args.messagePage > 1) query.set("messagePage", String(args.messagePage));
  return `/admin/conversations?${query.toString()}`;
}

export default async function AdminConversationsPage({ searchParams }: PageProps) {
  if (!(await authenticated())) redirect("/admin");

  const params = await searchParams;
  const externalUserId = first(params.userId);
  const legacyDeleted = normalizeDeletedFilter(first(params.deleted), "all");
  const channelDeleted = normalizeDeletedFilter(first(params.channelDeleted), legacyDeleted);
  const messageDeleted = normalizeDeletedFilter(first(params.messageDeleted), "all");
  const sort = normalizeSort(first(params.sort));
  const page = normalizePage(first(params.page));
  const requestedMessagePage = normalizePage(first(params.messagePage));
  const requestedMessageSession = first(params.messageSession);

  const user = externalUserId
    ? await prisma.user.findUnique({
      where: { externalUserId },
      select: { id: true, externalUserId: true, email: true, name: true },
    })
    : null;

  const channelWhere: Prisma.AppConversationChannelWhereInput = user
    ? { ownerUserId: user.id, ...deletedWhere(channelDeleted) }
    : { id: "__missing_user__" };
  const [channelCount, channels] = user
    ? await prisma.$transaction([
      prisma.appConversationChannel.count({ where: channelWhere }),
      prisma.appConversationChannel.findMany({
        where: channelWhere,
        orderBy: channelOrderBy(sort),
        skip: (page - 1) * CHANNEL_PAGE_SIZE,
        take: CHANNEL_PAGE_SIZE,
        select: { id: true, title: true, sessionKey: true, isDeleted: true, createdAt: true, updatedAt: true },
      }),
    ])
    : [0, []] as const;

  const totalChannelPages = Math.max(1, Math.ceil(channelCount / CHANNEL_PAGE_SIZE));
  const safePage = Math.min(page, totalChannelPages);
  const visibleChannels = safePage === page ? channels : user
    ? await prisma.appConversationChannel.findMany({
      where: channelWhere,
      orderBy: channelOrderBy(sort),
      skip: (safePage - 1) * CHANNEL_PAGE_SIZE,
      take: CHANNEL_PAGE_SIZE,
      select: { id: true, title: true, sessionKey: true, isDeleted: true, createdAt: true, updatedAt: true },
    })
    : [];

  const channelViews: AdminConversationChannel[] = user
    ? await Promise.all(visibleChannels.map(async (channel) => {
      const messageWhere: Prisma.AppMessageWhereInput = {
        userId: user.id,
        sessionKey: channel.sessionKey,
        ...messageDeletedWhere(messageDeleted),
      };
      const messagePage = requestedMessageSession === channel.sessionKey ? requestedMessagePage : 1;
      const messageCount = await prisma.appMessage.count({ where: messageWhere });
      const totalPages = Math.max(1, Math.ceil(messageCount / MESSAGE_PAGE_SIZE));
      const safeMessagePage = Math.min(messagePage, totalPages);
      const messages = await prisma.appMessage.findMany({
        where: messageWhere,
        orderBy: { createdAt: "desc" },
        skip: (safeMessagePage - 1) * MESSAGE_PAGE_SIZE,
        take: MESSAGE_PAGE_SIZE,
        select: {
          id: true, sourceLanguage: true, isDeleted: true, createdAt: true,
          contents: {
            where: messageDeleted === "deleted" ? { isDeleted: true } : messageDeleted === "active" ? { isDeleted: { not: true } } : {},
            orderBy: { createdAt: "asc" },
            select: { contentType: true, language: true, text: true, isDeleted: true },
          },
        },
      });
      const orderedMessages = [...messages].reverse();
      const hrefArgs = { userId: externalUserId, channelDeleted, messageDeleted, sort, page: safePage, messageSession: channel.sessionKey };
      return {
        id: channel.id,
        title: channel.title,
        sessionKey: channel.sessionKey,
        isDeleted: channel.isDeleted,
        createdAt: formatDate(channel.createdAt),
        updatedAt: formatDate(channel.updatedAt),
        messageCount,
        messagePage: safeMessagePage,
        messageTotalPages: totalPages,
        messages: orderedMessages.map((message) => ({
          id: message.id,
          createdAt: formatDate(message.createdAt),
          sourceLanguage: message.sourceLanguage,
          isDeleted: message.isDeleted,
          contents: message.contents,
        })),
        previousMessagesHref: safeMessagePage > 1 ? buildConversationHref({ ...hrefArgs, messagePage: safeMessagePage - 1 }) : undefined,
        nextMessagesHref: safeMessagePage < totalPages ? buildConversationHref({ ...hrefArgs, messagePage: safeMessagePage + 1 }) : undefined,
      } satisfies AdminConversationChannel;
    }))
    : [];
  const totalLoadedMessages = channelViews.reduce((sum, channel) => sum + channel.messages.length, 0);

  const previousChannelsHref = safePage > 1 ? buildConversationHref({ userId: externalUserId, channelDeleted, messageDeleted, sort, page: safePage - 1 }) : undefined;
  const nextChannelsHref = safePage < totalChannelPages ? buildConversationHref({ userId: externalUserId, channelDeleted, messageDeleted, sort, page: safePage + 1 }) : undefined;

  return (
    <main className="h-svh w-full overflow-y-auto overscroll-contain bg-[#f9f9f7] px-4 py-6 text-[#0b0b0b]">
      <div className="mx-auto max-w-6xl pb-10">
        <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div><h1 className="text-2xl font-semibold">대화록 조회</h1><p className="mt-1 text-sm text-[#6f6d68]">외부 사용자 ID로 저장된 대화방과 메시지를 확인합니다.</p></div>
          <Link className="rounded-md border border-[#e5e3dc] bg-white px-4 py-2 text-sm font-semibold" href="/admin">피드백함으로</Link>
        </header>

        <form className="mb-4 grid gap-2 rounded-xl border border-[#e5e3dc] bg-white p-4 shadow-sm md:grid-cols-[minmax(0,1fr)_auto_auto_auto_auto]" method="get">
          <input name="userId" defaultValue={externalUserId} placeholder="external user ID" className="min-w-0 rounded-md border border-[#d9d6ce] px-3 py-2 text-sm" required />
          <select name="channelDeleted" defaultValue={channelDeleted} className="rounded-md border border-[#d9d6ce] px-3 py-2 text-sm" aria-label="대화방 삭제 여부">
            <option value="all">대화방: 전체</option><option value="active">대화방: 삭제되지 않음</option><option value="deleted">대화방: 삭제됨</option>
          </select>
          <select name="messageDeleted" defaultValue={messageDeleted} className="rounded-md border border-[#d9d6ce] px-3 py-2 text-sm" aria-label="메시지 삭제 여부">
            <option value="all">메시지: 전체</option><option value="active">메시지: 삭제되지 않음</option><option value="deleted">메시지: 삭제됨</option>
          </select>
          <select name="sort" defaultValue={sort} className="rounded-md border border-[#d9d6ce] px-3 py-2 text-sm" aria-label="대화방 정렬">
            <option value="updated-desc">최근 수정순</option><option value="updated-asc">오래된 수정순</option><option value="created-desc">최근 생성순</option><option value="created-asc">오래된 생성순</option><option value="title-asc">제목 가나다순</option><option value="title-desc">제목 가나다 역순</option>
          </select>
          <button className="rounded-md bg-[#0b0b0b] px-4 py-2 text-sm font-semibold text-white" type="submit">조회</button>
        </form>

        {!externalUserId ? <p className="text-sm text-[#6f6d68]">사용자 ID를 입력해 주세요.</p> : !user ? <p className="rounded-xl border border-[#ead7d2] bg-white p-5 text-sm text-[#9b3c2f]">해당 사용자를 찾을 수 없습니다.</p> : (
          <>
            <section className="mb-5 rounded-xl border border-[#e5e3dc] bg-white p-5 shadow-sm"><h2 className="font-semibold">{user.name || user.email || "사용자"}</h2><p className="mt-1 break-all text-xs text-[#6f6d68]">{user.externalUserId}</p><p className="mt-1 text-xs text-[#6f6d68]">대화방 {channelCount}개 · 현재 페이지 {channelViews.length}개 · 현재 로드 메시지 {totalLoadedMessages}개</p></section>
            <nav className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#e5e3dc] bg-white p-3 text-sm" aria-label="대화방 페이지네이션">
              <span className="text-[#6f6d68]">대화방 {safePage} / {totalChannelPages}페이지 (페이지당 {CHANNEL_PAGE_SIZE}개)</span>
              <span className="flex gap-2">{previousChannelsHref ? <Link className="rounded border border-[#e5e3dc] px-3 py-1.5 font-semibold hover:bg-[#f4f3ee]" href={previousChannelsHref}>이전 대화방</Link> : null}{nextChannelsHref ? <Link className="rounded border border-[#e5e3dc] px-3 py-1.5 font-semibold hover:bg-[#f4f3ee]" href={nextChannelsHref}>다음 대화방</Link> : null}</span>
            </nav>
            <AdminConversationsView channels={channelViews} />
          </>
        )}
      </div>
    </main>
  );
}
