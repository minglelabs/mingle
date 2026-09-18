import { type NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { getAuthOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

type NotificationRouteProps = {
  params: Promise<{
    notificationId: string;
  }>;
};

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

export async function PATCH(
  _request: NextRequest,
  { params }: NotificationRouteProps,
) {
  const viewerId = getSessionUserId(await getServerSession(getAuthOptions()));
  if (!viewerId) return responseJson({ error: "unauthorized" }, { status: 401 });

  const { notificationId: rawNotificationId } = await params;
  const notificationId = rawNotificationId.trim();
  if (!notificationId) {
    return responseJson({ error: "invalid_notification_id" }, { status: 400 });
  }

  await prisma.userNotification.updateMany({
    where: {
      id: notificationId,
      recipientId: viewerId,
      type: "follow",
      readAt: null,
    },
    data: { readAt: new Date() },
  });

  return responseJson({ isRead: true });
}
