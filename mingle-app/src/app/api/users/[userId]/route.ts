import { type NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { getAuthOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

type UserProfileRouteProps = {
  params: Promise<{
    userId: string;
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

export async function GET(_request: NextRequest, { params }: UserProfileRouteProps) {
  const viewerId = getSessionUserId(await getServerSession(getAuthOptions()));
  if (!viewerId) {
    return responseJson({ error: "unauthorized" }, { status: 401 });
  }

  const { userId: rawUserId } = await params;
  const userId = rawUserId.trim();
  if (!userId) {
    return responseJson({ error: "invalid_user_id" }, { status: 400 });
  }
  if (userId === viewerId) {
    return responseJson({ error: "use_profile_endpoint" }, { status: 400 });
  }

  const [user, block] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        image: true,
        displayName: true,
        bio: true,
        nationality: true,
        _count: {
          select: {
            followerRelations: true,
            followingRelations: true,
          },
        },
        followerRelations: {
          where: { followerId: viewerId },
          select: { followerId: true },
          take: 1,
        },
      },
    }),
    prisma.userBlock.findFirst({
      where: {
        OR: [
          { blockerId: viewerId, blockedId: userId },
          { blockerId: userId, blockedId: viewerId },
        ],
      },
      select: { blockerId: true, blockedId: true },
    }),
  ]);

  if (!user) {
    return responseJson({ error: "user_not_found" }, { status: 404 });
  }
  if (block?.blockerId === userId) {
    return responseJson({ error: "user_unavailable" }, { status: 403 });
  }

  return responseJson({
    id: user.id,
    name: user.name,
    image: user.image,
    displayName: user.displayName,
    bio: user.bio,
    nationality: user.nationality,
    followersCount: user._count.followerRelations,
    followingCount: user._count.followingRelations,
    isFollowing: user.followerRelations.length > 0,
    isBlocked: block?.blockerId === viewerId,
  });
}
