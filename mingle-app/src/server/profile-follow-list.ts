import { type NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { getAuthOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";

const MAX_SEARCH_LENGTH = 80;
const MAX_RESULTS = 100;

const userSelect = {
  id: true,
  handle: true,
  name: true,
  image: true,
} as const;

type FollowListDirection = "followers" | "following";

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

function buildUserWhere(viewerId: string, query: string) {
  const normalizedQuery = query.trim().slice(0, MAX_SEARCH_LENGTH);

  return {
    AND: [
      { blockingRelations: { none: { blockedId: viewerId } } },
      { blockedByRelations: { none: { blockerId: viewerId } } },
      ...(normalizedQuery
        ? [{
            OR: [
              { handle: { contains: normalizedQuery.startsWith("@") ? normalizedQuery.slice(1) : normalizedQuery, mode: "insensitive" as const } },
              { name: { contains: normalizedQuery, mode: "insensitive" as const } },
            ],
          }]
        : []),
    ],
  };
}

export async function getProfileFollowList(
  request: NextRequest,
  direction: FollowListDirection,
): Promise<NextResponse> {
  const userId = getSessionUserId(await getServerSession(getAuthOptions()));
  if (!userId) return responseJson({ error: "unauthorized" }, { status: 401 });

  const query = request.nextUrl.searchParams.get("q") || "";
  const normalizedQuery = query.trim().slice(0, MAX_SEARCH_LENGTH);
  if (normalizedQuery.startsWith("@") && !normalizedQuery.slice(1).trim()) {
    return responseJson({ users: [] });
  }
  const userWhere = buildUserWhere(userId, query);

  if (direction === "followers") {
    const relations = await prisma.userFollow.findMany({
      where: {
        followingId: userId,
        follower: userWhere,
      },
      orderBy: { createdAt: "desc" },
      take: MAX_RESULTS,
      select: { follower: { select: userSelect } },
    });

    return responseJson({ users: relations.map((relation) => relation.follower) });
  }

  const relations = await prisma.userFollow.findMany({
    where: {
      followerId: userId,
      following: userWhere,
    },
    orderBy: { createdAt: "desc" },
    take: MAX_RESULTS,
    select: { following: { select: userSelect } },
  });

  return responseJson({ users: relations.map((relation) => relation.following) });
}
