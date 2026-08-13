import { type NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { getAuthOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

type AccountBlockRouteProps = {
  params: Promise<{
    userId: string;
  }>;
};

function getSessionUserId(session: { user?: { id?: unknown } } | null): string {
  return typeof session?.user?.id === "string" ? session.user.id.trim() : "";
}

export async function DELETE(_request: NextRequest, { params }: AccountBlockRouteProps) {
  const blockerId = getSessionUserId(await getServerSession(getAuthOptions()));
  if (!blockerId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { userId: rawUserId } = await params;
  const blockedId = rawUserId.trim();
  if (!blockedId) {
    return NextResponse.json({ error: "invalid_user_id" }, { status: 400 });
  }

  await prisma.userBlock.deleteMany({
    where: { blockerId, blockedId },
  });

  return NextResponse.json({ isBlocked: false }, {
    headers: { "Cache-Control": "private, no-store" },
  });
}
