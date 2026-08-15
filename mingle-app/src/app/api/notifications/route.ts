import { type NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { getAuthOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

function getSessionUserId(session: { user?: { id?: unknown } } | null): string {
  return typeof session?.user?.id === "string" ? session.user.id.trim() : "";
}

function responseJson(payload: object, init?: ResponseInit): NextResponse {
  return NextResponse.json(payload, {
    ...init,
    headers: {
      "Cache-Control": "private, no-store",
      ...init?.headers,
    },
  });
}

function resolveLimit(request: NextRequest): number {
  const rawLimit = Number(request.nextUrl.searchParams.get("limit"));
  if (!Number.isFinite(rawLimit) || rawLimit <= 0) return DEFAULT_LIMIT;
  return Math.min(MAX_LIMIT, Math.floor(rawLimit));
}

export async function GET(request: NextRequest) {
  const viewerId = getSessionUserId(await getServerSession(getAuthOptions()));
  if (!viewerId) return responseJson({ error: "unauthorized" }, { status: 401 });

  const limit = resolveLimit(request);
  const [notifications, unreadCount] = await Promise.all([
    prisma.userNotification.findMany({
      where: {
        recipientId: viewerId,
        type: "follow",
      },
      orderBy: [
        { readAt: "asc" },
        { createdAt: "desc" },
      ],
      take: limit,
      select: {
        id: true,
        type: true,
        readAt: true,
        createdAt: true,
        actor: {
          select: {
            id: true,
            handle: true,
            name: true,
            image: true,
          },
        },
      },
    }),
    prisma.userNotification.count({
      where: {
        recipientId: viewerId,
        type: "follow",
        readAt: null,
      },
    }),
  ]);

  const actorIds = notifications.map((notification) => notification.actor.id);
  const followingRelations = actorIds.length === 0
    ? []
    : await prisma.userFollow.findMany({
        where: {
          followerId: viewerId,
          followingId: { in: actorIds },
        },
        select: { followingId: true },
      });
  const followingIds = new Set(followingRelations.map((relation) => relation.followingId));

  return responseJson({
    notifications: notifications.map((notification) => ({
      id: notification.id,
      type: notification.type,
      isRead: notification.readAt !== null,
      createdAt: notification.createdAt,
      actor: notification.actor,
      isFollowing: followingIds.has(notification.actor.id),
    })),
    unreadCount,
  });
}
