import { type NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { getAuthOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";
import {
  resolveReadBefore,
  visibleNotificationWhere,
} from "@/server/notifications/notification-visibility";
import {
  buildNotificationListResponse,
  type RawNotificationRow,
} from "@/server/notifications/notification-list";

export const runtime = "nodejs";

const DEFAULT_LIMIT = 30;
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

function resolveCursor(request: NextRequest): string | null {
  const raw = request.nextUrl.searchParams.get("cursor");
  return raw && raw.trim() ? raw.trim() : null;
}

export async function GET(request: NextRequest) {
  const viewerId = getSessionUserId(await getServerSession(getAuthOptions()));
  if (!viewerId) return responseJson({ error: "unauthorized" }, { status: 401 });

  const limit = resolveLimit(request);
  const cursor = resolveCursor(request);
  // The entry snapshot: the client sends it back with PATCH so only what had
  // arrived by this read is marked read.
  const readBefore = new Date();

  // Withhold notifications whose actor is now mutually blocked, and — for
  // post-scoped types — whose post is no longer visible (the same rule the
  // red-dot probe uses). The extra row (+1) drives the cursor.
  const rows = await prisma.userNotification.findMany({
    where: {
      ...visibleNotificationWhere(viewerId),
      ...(cursor ? {} : { createdAt: { lte: readBefore } }),
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
    readBefore: readBefore.toISOString(),
  });
}

async function readBeforeFromBody(request: Request | undefined): Promise<unknown> {
  if (!request) return undefined;
  try {
    const body = (await request.json()) as { before?: unknown } | null;
    return body && typeof body === "object" ? body.before : undefined;
  } catch {
    // Older clients send no body: mark up to now.
    return undefined;
  }
}

/**
 * Mark every notification that had arrived by entry time as read. The panel
 * opens the list and calls this once with `{ before: <readBefore of the list
 * read> }` — there is no per-item read and no "mark all read" button. All of
 * the viewer's unread rows up to `before` are marked, including ones the list
 * withholds, so nothing hidden can keep the red dot on. Read state is stored
 * per account so the dot clears on every device and header.
 */
export async function PATCH(request?: Request) {
  const viewerId = getSessionUserId(await getServerSession(getAuthOptions()));
  if (!viewerId) return responseJson({ error: "unauthorized" }, { status: 401 });

  const now = new Date();
  const before = resolveReadBefore(await readBeforeFromBody(request), now);
  const result = await prisma.userNotification.updateMany({
    where: {
      recipientId: viewerId,
      readAt: null,
      createdAt: { lte: before },
    },
    data: { readAt: now },
  });

  return responseJson({ isRead: true, updatedCount: result.count });
}
