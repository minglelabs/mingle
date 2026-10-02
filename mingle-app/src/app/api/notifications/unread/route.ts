import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { getAuthOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";
import { visibleNotificationWhere } from "@/server/notifications/notification-visibility";

export const runtime = "nodejs";

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

/**
 * Does the viewer have ANY unread notification the list would show? Drives the
 * numberless red dot on the feed and conversation-list bell. A signed-out
 * caller gets 401 and the client treats that as "no dot".
 *
 * It uses the list's own visibility rule (`visibleNotificationWhere`): a
 * notification the list withholds (blocked actor, hidden/deleted post) must
 * never light a dot the viewer can never clear by looking. It is still an
 * at-most-one-row probe on the (recipientId, readAt, createdAt) index.
 */
export async function GET() {
  const viewerId = getSessionUserId(await getServerSession(getAuthOptions()));
  if (!viewerId) return responseJson({ error: "unauthorized" }, { status: 401 });

  const unread = await prisma.userNotification.findFirst({
    where: { ...visibleNotificationWhere(viewerId), readAt: null },
    select: { id: true },
  });

  return responseJson({ hasUnread: unread !== null });
}
