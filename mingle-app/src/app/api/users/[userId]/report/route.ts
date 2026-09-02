import { type NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { getAuthOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const REPORT_REASONS = new Set([
  "spam",
  "harassment",
  "inappropriate",
  "impersonation",
  "other",
]);
const MIN_REPORT_MESSAGE_LENGTH = 2;

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

function normalizeReason(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const reason = value.trim().toLowerCase();
  return REPORT_REASONS.has(reason) ? reason : null;
}

function normalizeMessage(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const message = value.trim();
  if (!message) return null;
  return message.slice(0, 4000);
}

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

  const reason = normalizeReason(body.reason);
  if (!reason) {
    return NextResponse.json({ error: "invalid_reason" }, { status: 400 });
  }

  if (body.message !== undefined && body.message !== null && typeof body.message !== "string") {
    return NextResponse.json({ error: "invalid_message" }, { status: 400 });
  }

  const message = normalizeMessage(body.message);
  if (message && message.length < MIN_REPORT_MESSAGE_LENGTH) {
    return NextResponse.json({ error: "message_too_short" }, { status: 400 });
  }

  const target = await prisma.user.findUnique({
    where: { id: reportedUserId },
    select: { id: true },
  });
  if (!target) {
    return NextResponse.json({ error: "user_not_found" }, { status: 404 });
  }

  const report = await prisma.userReport.create({
    data: {
      reporterId,
      reportedUserId,
      reason,
      message: message || undefined,
    },
    select: { id: true, status: true },
  });

  return NextResponse.json({
    reportId: report.id,
    status: report.status,
  }, {
    status: 201,
    headers: { "Cache-Control": "private, no-store" },
  });
}
