import type { Prisma } from "@prisma/client";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { ADMIN_SESSION_COOKIE_NAME, verifyAdminSessionToken } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";

const CHANNEL_PAGE_SIZE = 20;
type DeletedFilter = "all" | "active" | "deleted";
type ChannelSort = "updated-desc" | "updated-asc" | "created-desc" | "created-asc" | "title-asc" | "title-desc";

function first(value: string | null): string {
  return value?.trim() ?? "";
}

function normalizePage(value: string): number {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 100_000) : 1;
}

function normalizeDeletedFilter(value: string): DeletedFilter {
  return value === "active" || value === "deleted" ? value : "all";
}

function normalizeSort(value: string): ChannelSort {
  return value === "updated-asc" || value === "created-desc" || value === "created-asc" || value === "title-asc" || value === "title-desc" ? value : "updated-desc";
}

function channelDeletedWhere(filter: DeletedFilter): Prisma.AppConversationChannelWhereInput {
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

export async function GET(request: Request) {
  const store = await cookies();
  if (!verifyAdminSessionToken(store.get(ADMIN_SESSION_COOKIE_NAME)?.value)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const userId = first(url.searchParams.get("userId"));
  if (!userId) return NextResponse.json({ error: "Missing userId" }, { status: 400 });

  const channelDeleted = normalizeDeletedFilter(first(url.searchParams.get("channelDeleted")));
  const messageDeleted = normalizeDeletedFilter(first(url.searchParams.get("messageDeleted")));
  const sort = normalizeSort(first(url.searchParams.get("sort")));
  const page = normalizePage(first(url.searchParams.get("page")));
  const channelId = first(url.searchParams.get("channelId"));
  const user = await prisma.user.findUnique({
    where: { externalUserId: userId },
    select: { id: true, externalUserId: true, email: true, name: true },
  });
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const channelWhere: Prisma.AppConversationChannelWhereInput = { ownerUserId: user.id, ...channelDeletedWhere(channelDeleted) };
  const channelCount = await prisma.appConversationChannel.count({ where: channelWhere });
  const totalPages = Math.max(1, Math.ceil(channelCount / CHANNEL_PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const channels = !channelId
    ? await prisma.appConversationChannel.findMany({
      where: channelWhere,
      orderBy: channelOrderBy(sort),
      skip: (safePage - 1) * CHANNEL_PAGE_SIZE,
      take: CHANNEL_PAGE_SIZE,
      select: { id: true, title: true, sessionKey: true, isDeleted: true, createdAt: true, updatedAt: true },
    })
    : [];

  const messageCountRows = channels.length > 0
    ? await prisma.appMessage.groupBy({
      by: ["sessionKey"],
      where: { userId: user.id, sessionKey: { in: channels.map((channel) => channel.sessionKey) }, ...messageDeletedWhere(messageDeleted) },
      _count: { _all: true },
    })
    : [];
  const messageCounts = new Map(messageCountRows.map((row) => [row.sessionKey ?? "", row._count._all]));

  const selectedChannel = channelId
    ? await prisma.appConversationChannel.findFirst({
      where: { id: channelId, ...channelWhere },
      select: { id: true, title: true, sessionKey: true, isDeleted: true, createdAt: true, updatedAt: true },
    })
    : null;
  if (channelId && !selectedChannel) return NextResponse.json({ error: "Conversation not found" }, { status: 404 });

  return NextResponse.json({
    user: { externalUserId: user.externalUserId, email: user.email, name: user.name },
    channelCount,
    channels: channels.map((channel) => ({
      id: channel.id,
      title: channel.title,
      sessionKey: channel.sessionKey,
      isDeleted: channel.isDeleted,
      createdAt: channel.createdAt.toISOString(),
      updatedAt: channel.updatedAt.toISOString(),
      messageCount: messageCounts.get(channel.sessionKey) ?? 0,
    })),
    selectedChannel: selectedChannel ? {
      id: selectedChannel.id,
      title: selectedChannel.title,
      sessionKey: selectedChannel.sessionKey,
      isDeleted: selectedChannel.isDeleted,
      createdAt: selectedChannel.createdAt.toISOString(),
      updatedAt: selectedChannel.updatedAt.toISOString(),
    } : null,
  }, { headers: { "Cache-Control": "no-store" } });
}
