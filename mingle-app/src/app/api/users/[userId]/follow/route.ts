import { type NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { getAuthOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";
import { sendPushNotificationForUserNotification } from "@/server/push-notifications";

export const runtime = "nodejs";

type FollowRouteProps = {
  params: Promise<{
    userId: string;
  }>;
};

function getSessionUserId(session: { user?: { id?: unknown } } | null): string {
  return typeof session?.user?.id === "string" ? session.user.id.trim() : "";
}

function jsonResult(isFollowing: boolean): NextResponse {
  return NextResponse.json({ isFollowing }, {
    headers: { "Cache-Control": "private, no-store" },
  });
}

function isUniqueConstraintViolation(error: unknown): boolean {
  return typeof error === "object"
    && error !== null
    && "code" in error
    && (error as { code?: unknown }).code === "P2002";
}

async function resolveFollowTarget(
  session: { user?: { id?: unknown } } | null,
  params: Promise<{ userId: string }>,
): Promise<
  | { response: NextResponse }
  | { followerId: string; followingId: string }
> {
  const followerId = getSessionUserId(session);
  if (!followerId) {
    return { response: NextResponse.json({ error: "unauthorized" }, { status: 401 }) };
  }

  const { userId } = await params;
  const followingId = userId.trim();
  if (!followingId) {
    return { response: NextResponse.json({ error: "invalid_user_id" }, { status: 400 }) };
  }
  if (followerId === followingId) {
    return { response: NextResponse.json({ error: "cannot_follow_self" }, { status: 400 }) };
  }

  const target = await prisma.user.findUnique({
    where: { id: followingId },
    select: { id: true },
  });
  if (!target) {
    return { response: NextResponse.json({ error: "user_not_found" }, { status: 404 }) };
  }

  const block = await prisma.userBlock.findFirst({
    where: {
      OR: [
        { blockerId: followerId, blockedId: followingId },
        { blockerId: followingId, blockedId: followerId },
      ],
    },
    select: { id: true },
  });
  if (block) {
    return { response: NextResponse.json({ error: "user_blocked" }, { status: 409 }) };
  }

  return { followerId, followingId };
}

export async function POST(_request: NextRequest, { params }: FollowRouteProps) {
  const result = await resolveFollowTarget(await getServerSession(getAuthOptions()), params);
  if ("response" in result) return result.response;

  let created = false;
  try {
    await prisma.userFollow.create({
      data: {
        followerId: result.followerId,
        followingId: result.followingId,
      },
    });
    created = true;
  } catch (error) {
    if (!isUniqueConstraintViolation(error)) throw error;
  }

  if (created) {
    const notification = await prisma.userNotification.create({
      data: {
        recipientId: result.followingId,
        actorId: result.followerId,
        type: "follow",
      },
    });

    try {
      await sendPushNotificationForUserNotification(notification.id);
    } catch (error) {
      console.error("[PushNotifications] follow notification delivery failed", error);
    }
  }

  return jsonResult(true);
}

export async function DELETE(_request: NextRequest, { params }: FollowRouteProps) {
  const result = await resolveFollowTarget(await getServerSession(getAuthOptions()), params);
  if ("response" in result) return result.response;

  await prisma.userFollow.deleteMany({
    where: {
      followerId: result.followerId,
      followingId: result.followingId,
    },
  });

  return jsonResult(false);
}
