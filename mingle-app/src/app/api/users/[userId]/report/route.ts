import { type NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { getAuthOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";
import {
  createReport,
  normalizeReportMessage,
  normalizeReportReason,
} from "@/server/reports/report-service";

export const runtime = "nodejs";

type ReportRouteProps = {
  params: Promise<{
    userId: string;
  }>;
};

type ReportBody = {
  reason?: unknown;
  message?: unknown;
};

function getSessionUserId(session: { user?: { id?: unknown } } | null): string {
  return typeof session?.user?.id === "string" ? session.user.id.trim() : "";
}

/**
 * Report a user.
 *
 * Extended in W3/R to run through the shared report service: the same fixed
 * reason list, an optional note capped at 500 characters, and per-reporter
 * dedup via `targetKey`. A repeat report of the same user is not an error — it
 * returns `{ status: 'already_reported' }` with 200 so the UI shows "already
 * reported". The 201 create response `{ reportId, status }` is unchanged, so
 * the existing profile-screen caller keeps working.
 */
export async function POST(request: NextRequest, { params }: ReportRouteProps) {
  const reporterId = getSessionUserId(await getServerSession(getAuthOptions()));
  if (!reporterId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { userId: rawUserId } = await params;
  const reportedUserId = rawUserId.trim();
  if (!reportedUserId) {
    return NextResponse.json({ error: "invalid_user_id" }, { status: 400 });
  }
  if (reporterId === reportedUserId) {
    return NextResponse.json({ error: "cannot_report_self" }, { status: 400 });
  }

  let body: ReportBody;
  try {
    body = (await request.json()) as ReportBody;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const reason = normalizeReportReason(body.reason);
  if (!reason) {
    return NextResponse.json({ error: "invalid_reason" }, { status: 400 });
  }

  const messageResult = normalizeReportMessage(body.message);
  if (!messageResult.ok) {
    return NextResponse.json({ error: "invalid_message" }, { status: 400 });
  }

  const target = await prisma.user.findUnique({
    where: { id: reportedUserId },
    select: { id: true },
  });
  if (!target) {
    return NextResponse.json({ error: "user_not_found" }, { status: 404 });
  }

  const result = await createReport(prisma, {
    reporterId,
    reportedUserId,
    targetType: "user",
    reason,
    message: messageResult.message,
  });

  if (result.status === "duplicate") {
    return NextResponse.json(
      { status: "already_reported", duplicate: true },
      { status: 200, headers: { "Cache-Control": "private, no-store" } },
    );
  }

  return NextResponse.json(
    { reportId: result.reportId, status: result.reportStatus },
    { status: 201, headers: { "Cache-Control": "private, no-store" } },
  );
}
