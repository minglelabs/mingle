import { type NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { getAuthOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";
import { notMutuallyBlockedWhere } from "@/server/posts/block-visibility";
import { visiblePostWhere } from "@/server/posts/post-visibility";
import {
  buildNotificationListResponse,
  type RawNotificationRow,
} from "@/server/notifications/notification-list";

export const runtime = "nodejs";

const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 100;

// Types that reference a post; when that post is no longer visible to the
// viewer (deleted, hidden, author blocked, operator-hidden) the notification
// is withheld from the list but still counts as read on entry.
const POST_SCOPED_TYPES = ["post_like", "comment", "comment_reply", "comment_like"] as const;

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

function resolveCursor(request: NextRequest): string | null {
  const raw = request.nextUrl.searchParams.get("cursor");
  return raw && raw.trim() ? raw.trim() : null;
}

export async function GET(request: NextRequest) {
  const viewerId = getSessionUserId(await getServerSession(getAuthOptions()));
  if (!viewerId) return responseJson({ error: "unauthorized" }, { status: 401 });

  const limit = resolveLimit(request);
  const cursor = resolveCursor(request);

  // Withhold notifications whose actor is now mutually blocked, and — for
  // post-scoped types — whose post is no longer visible. Follow and
  // report_resolved are not post-scoped. The extra row (+1) drives the cursor.
  const rows = await prisma.userNotification.findMany({
    where: {
      recipientId: viewerId,
      actor: notMutuallyBlockedWhere(viewerId),
      OR: [
        { type: { notIn: [...POST_SCOPED_TYPES] } },
        {
          type: { in: [...POST_SCOPED_TYPES] },
          post: visiblePostWhere(viewerId),
        },
      ],
    },
    orderBy: { createdAt: "desc" },
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    take: limit + 1,
    select: {
      id: true,
      type: true,
      postId: true,
      commentId: true,
      readAt: true,
      createdAt: true,
      actor: {
        select: { id: true, handle: true, name: true, image: true },
      },
    },
  });

  const hasMore = rows.length > limit;
  const pageRows = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? pageRows[pageRows.length - 1]?.id ?? null : null;

  const { items, unreadCount } = buildNotificationListResponse(pageRows as RawNotificationRow[]);

  return responseJson({
    notifications: items,
    unreadCount,
    nextCursor,
    hasMore,
  });
}

/**
 * Mark every notification that had arrived by entry time as read. The panel
 * opens the list and calls this once — there is no per-item read and no
 * "mark all read" button. Read state is stored per account so the red dot
 * clears on every device, feed and conversation-list header.
 */
export async function PATCH() {
  const viewerId = getSessionUserId(await getServerSession(getAuthOptions()));
  if (!viewerId) return responseJson({ error: "unauthorized" }, { status: 401 });

  const result = await prisma.userNotification.updateMany({
    where: {
      recipientId: viewerId,
      readAt: null,
    },
    data: { readAt: new Date() },
  });

  return responseJson({ isRead: true, updatedCount: result.count });
}
