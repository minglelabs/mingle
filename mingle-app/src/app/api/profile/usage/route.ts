import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { getAuthOptions } from "@/lib/auth-options";
import { getUserUsageSummary } from "@/server/user-usage";

export const runtime = "nodejs";

function getSessionUserId(session: { user?: { id?: unknown } } | null): string {
  return typeof session?.user?.id === "string" ? session.user.id.trim() : "";
}

export async function GET() {
  const userId = getSessionUserId(await getServerSession(getAuthOptions()));
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const usage = await getUserUsageSummary(userId);
  if (!usage) {
    return NextResponse.json({ error: "profile_not_found" }, { status: 404 });
  }

  return NextResponse.json(usage, {
    headers: { "Cache-Control": "private, no-store" },
  });
}
