import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { getAuthOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";
import { USER_IDENTITY_SELECT } from "@/server/identity/user-identity-select";
import { serializeListUserIdentity } from "@/server/identity/list-user-identity";

export const runtime = "nodejs";

function getSessionUserId(session: { user?: { id?: unknown } } | null): string {
  return typeof session?.user?.id === "string" ? session.user.id.trim() : "";
}

export async function GET() {
  const userId = getSessionUserId(await getServerSession(getAuthOptions()));
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const blocks = await prisma.userBlock.findMany({
    where: { blockerId: userId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      createdAt: true,
      // Identity + badge flags (official / operator) of the blocked user.
      blocked: { select: USER_IDENTITY_SELECT },
    },
  });

  return NextResponse.json({
    blocks: blocks.map((block) => ({
      id: block.id,
      createdAt: block.createdAt.toISOString(),
      user: serializeListUserIdentity(block.blocked),
    })),
  }, {
    headers: { "Cache-Control": "private, no-store" },
  });
}
