import { type NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { getAuthOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

type BlockRouteProps = {
  params: Promise<{
    userId: string;
  }>;
};

function getSessionUserId(session: { user?: { id?: unknown } } | null): string {
  return typeof session?.user?.id === "string" ? session.user.id.trim() : "";
}

function jsonResult(isBlocked: boolean): NextResponse {
  return NextResponse.json({ isBlocked }, {
    headers: { "Cache-Control": "private, no-store" },
  });
}

async function resolveBlockTarget(
  session: { user?: { id?: unknown } } | null,
  params: Promise<{ userId: string }>,
): Promise<
  | { response: NextResponse }
  | { blockerId: string; blockedId: string }
> {
  const blockerId = getSessionUserId(session);
  if (!blockerId) {
    return { response: NextResponse.json({ error: "unauthorized" }, { status: 401 }) };
  }

  const { userId } = await params;
  const blockedId = userId.trim();
  if (!blockedId) {
    return { response: NextResponse.json({ error: "invalid_user_id" }, { status: 400 }) };
  }
  if (blockerId === blockedId) {
    return { response: NextResponse.json({ error: "cannot_block_self" }, { status: 400 }) };
  }

  const target = await prisma.user.findUnique({
    where: { id: blockedId },
    select: { id: true },
  });
  if (!target) {
    return { response: NextResponse.json({ error: "user_not_found" }, { status: 404 }) };
  }

  return { blockerId, blockedId };
}

export async function POST(_request: NextRequest, { params }: BlockRouteProps) {
  const result = await resolveBlockTarget(await getServerSession(getAuthOptions()), params);
  if ("response" in result) return result.response;

  await prisma.$transaction([
    prisma.userBlock.upsert({
      where: {
        blockerId_blockedId: {
          blockerId: result.blockerId,
          blockedId: result.blockedId,
        },
      },
      create: {
        blockerId: result.blockerId,
        blockedId: result.blockedId,
      },
      update: {},
    }),
    prisma.userFollow.deleteMany({
      where: {
        OR: [
          { followerId: result.blockerId, followingId: result.blockedId },
          { followerId: result.blockedId, followingId: result.blockerId },
        ],
      },
    }),
  ]);

  return jsonResult(true);
}

export async function DELETE(_request: NextRequest, { params }: BlockRouteProps) {
  const result = await resolveBlockTarget(await getServerSession(getAuthOptions()), params);
  if ("response" in result) return result.response;

  await prisma.userBlock.deleteMany({
    where: {
      blockerId: result.blockerId,
      blockedId: result.blockedId,
    },
  });

  return jsonResult(false);
}
