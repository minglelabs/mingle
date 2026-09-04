import { type NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { getAuthOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";
import { buildPostHogRequestContext } from "@/lib/posthog-request-context";
import { digestAnalyticsValue } from "@/lib/search-analytics";
import { captureMingleEvent } from "@/lib/posthog-server";
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

async function captureFollowApiAction(args: {
  request: NextRequest;
  followerId: string;
  followingId: string;
  action: "follow" | "unfollow";
  outcome: "created" | "already_following" | "removed" | "not_following";
}): Promise<void> {
  try {
    const [requestContext, targetIdDigest] = await Promise.all([
      buildPostHogRequestContext(args.request, args.followerId),
      digestAnalyticsValue(args.followingId),
    ]);
    captureMingleEvent({
      distinctId: requestContext.distinctId,
      event: "mingle_follow_api_action",
      properties: {
        action: args.action,
        outcome: args.outcome,
        account_id_digest: requestContext.accountIdDigest,
        target_id_digest: targetIdDigest,
        tracking_source: requestContext.trackingSource,
        client_platform: requestContext.clientPlatform,
        api_namespace: requestContext.apiNamespace,
        app_version: requestContext.appVersion,
      },
    });
  } catch (error) {
    console.warn("[posthog] follow analytics failed", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
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
    where: { id: followingId, isActive: true },
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

export async function POST(request: NextRequest, { params }: FollowRouteProps) {
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

  await captureFollowApiAction({
    request,
    followerId: result.followerId,
    followingId: result.followingId,
    action: "follow",
    outcome: created ? "created" : "already_following",
  });

  return jsonResult(true);
}

export async function DELETE(request: NextRequest, { params }: FollowRouteProps) {
  const result = await resolveFollowTarget(await getServerSession(getAuthOptions()), params);
  if ("response" in result) return result.response;

  const deleted = await prisma.userFollow.deleteMany({
    where: {
      followerId: result.followerId,
      followingId: result.followingId,
    },
  });

  await captureFollowApiAction({
    request,
    followerId: result.followerId,
    followingId: result.followingId,
    action: "unfollow",
    outcome: deleted.count > 0 ? "removed" : "not_following",
  });

  return jsonResult(false);
}
