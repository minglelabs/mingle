import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { ADMIN_SESSION_COOKIE_NAME, verifyAdminSessionToken } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";

function first(value: string | null): string {
  return value?.trim() ?? "";
}

export async function GET(request: Request) {
  const store = await cookies();
  if (!verifyAdminSessionToken(store.get(ADMIN_SESSION_COOKIE_NAME)?.value)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const userId = first(url.searchParams.get("userId"));
  const channelId = first(url.searchParams.get("channelId"));
  if (!userId) return NextResponse.json({ error: "Missing userId" }, { status: 400 });

  const user = await prisma.user.findUnique({
    where: { externalUserId: userId },
    select: { id: true, externalUserId: true, email: true, name: true },
  });
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const channels = await prisma.appConversationChannel.findMany({
    where: { ownerUserId: user.id },
    orderBy: { updatedAt: "desc" },
    select: { id: true, title: true, sessionKey: true, isDeleted: true, createdAt: true, updatedAt: true },
  });
  const selectedChannel = channelId ? channels.find((channel) => channel.id === channelId) ?? null : null;
  if (channelId && !selectedChannel) return NextResponse.json({ error: "Conversation not found" }, { status: 404 });

  const messageCountRows = channels.length > 0
    ? await prisma.appMessage.groupBy({
      by: ["sessionKey", "isDeleted"],
      where: { userId: user.id, sessionKey: { in: channels.map((channel) => channel.sessionKey) } },
      _count: { _all: true },
      _max: { createdAt: true },
    })
    : [];
  const messageCounts = new Map<string, { total: number; active: number; deleted: number; latestMessageAt: Date | null }>();
  for (const row of messageCountRows) {
    const sessionKey = row.sessionKey ?? "";
    const counts = messageCounts.get(sessionKey) ?? { total: 0, active: 0, deleted: 0, latestMessageAt: null };
    counts.total += row._count._all;
    if (row.isDeleted === true) counts.deleted += row._count._all;
    else counts.active += row._count._all;
    if (row._max.createdAt && (!counts.latestMessageAt || row._max.createdAt > counts.latestMessageAt)) counts.latestMessageAt = row._max.createdAt;
    messageCounts.set(sessionKey, counts);
  }

  return NextResponse.json({
    user: { externalUserId: user.externalUserId, email: user.email, name: user.name },
    channelCount: channels.length,
    channels: channels.map((channel) => {
      const counts = messageCounts.get(channel.sessionKey) ?? { total: 0, active: 0, deleted: 0, latestMessageAt: null };
      return {
        id: channel.id,
        title: channel.title,
        sessionKey: channel.sessionKey,
        isDeleted: channel.isDeleted,
        createdAt: channel.createdAt.toISOString(),
        updatedAt: channel.updatedAt.toISOString(),
        messageCount: counts.total,
        activeMessageCount: counts.active,
        deletedMessageCount: counts.deleted,
        latestMessageAt: counts.latestMessageAt?.toISOString() ?? null,
      };
    }),
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
