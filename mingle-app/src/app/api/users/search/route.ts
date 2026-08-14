import { type NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { getAuthOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const MAX_SEARCH_LENGTH = 80;
const MAX_RESULTS = 20;

const userSearchSelect = {
  id: true,
  handle: true,
  name: true,
  image: true,
} as const;

function getSessionUserId(session: { user?: { id?: unknown } } | null): string {
  return typeof session?.user?.id === "string" ? session.user.id.trim() : "";
}

export async function GET(request: NextRequest) {
  const session = await getServerSession(getAuthOptions());
  const userId = getSessionUserId(session);
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const query = (request.nextUrl.searchParams.get("q") || "")
    .trim()
    .slice(0, MAX_SEARCH_LENGTH);

  if (!query) {
    return NextResponse.json({ users: [] }, {
      headers: { "Cache-Control": "private, no-store" },
    });
  }

  const handleQuery = query.startsWith("@") ? query.slice(1) : query;
  if (!handleQuery) {
    return NextResponse.json({ users: [] }, {
      headers: { "Cache-Control": "private, no-store" },
    });
  }

  const users = await prisma.user.findMany({
    where: {
      AND: [
        { id: { not: userId } },
        {
          blockingRelations: {
            none: { blockedId: userId },
          },
        },
        {
          blockedByRelations: {
            none: { blockerId: userId },
          },
        },
        {
          OR: [
            { handle: { contains: handleQuery, mode: "insensitive" } },
            { name: { contains: query, mode: "insensitive" } },
          ],
        },
      ],
    },
    orderBy: { updatedAt: "desc" },
    take: MAX_RESULTS,
    select: {
      ...userSearchSelect,
      followerRelations: {
        where: { followerId: userId },
        select: { followerId: true },
        take: 1,
      },
    },
  });

  return NextResponse.json({
    users: users.map(({ followerRelations, ...user }) => ({
      ...user,
      isFollowing: followerRelations.length > 0,
    })),
  }, {
    headers: { "Cache-Control": "private, no-store" },
  });
}
