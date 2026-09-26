import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { getAuthOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";

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
 * The cheapest possible unread check: does the viewer have ANY unread
 * notification? Drives the numberless red dot on the feed and conversation-list
 * bell. A signed-out caller gets 401 and the client treats that as "no dot".
 *
 * This deliberately does not run the list's visibility filters (block / hidden
 * post): those are relation joins, and an at-most-one-row existence probe must
 * stay index-only. A notification the list would withhold is still cleared by
 * the mark-all-read on entry, so the dot self-corrects on the next open.
 */
export async function GET() {
  const viewerId = getSessionUserId(await getServerSession(getAuthOptions()));
  if (!viewerId) return responseJson({ error: "unauthorized" }, { status: 401 });

  const unread = await prisma.userNotification.findFirst({
    where: { recipientId: viewerId, readAt: null },
    select: { id: true },
  });

  return responseJson({ hasUnread: unread !== null });
}
