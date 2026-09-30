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
  const reporterId = getSessionUserId(await getServerSession(getAuthOptions()));
  if (!reporterId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const reports = await prisma.userReport.findMany({
    where: { reporterId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      reason: true,
      message: true,
      status: true,
      createdAt: true,
      updatedAt: true,
      // Identity + badge flags (official / operator) of the reported user.
      reportedUser: { select: USER_IDENTITY_SELECT },
      replies: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          authorType: true,
          message: true,
          createdAt: true,
        },
      },
    },
  });

  return NextResponse.json({
    reports: reports.map((report) => ({
      ...report,
      reportedUser: serializeListUserIdentity(report.reportedUser),
      createdAt: report.createdAt.toISOString(),
      updatedAt: report.updatedAt.toISOString(),
      replies: report.replies.map((reply) => ({
        ...reply,
        createdAt: reply.createdAt.toISOString(),
      })),
    })),
  }, {
    headers: { "Cache-Control": "private, no-store" },
  });
}
