import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { getAuthOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";

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
      reportedUser: {
        select: {
          id: true,
          username: true,
          displayName: true,
          name: true,
          image: true,
        },
      },
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
