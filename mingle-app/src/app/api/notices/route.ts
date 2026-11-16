import { type NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { getAuthOptions } from "@/lib/auth-options";
import { listNotices, readNoticeSummary } from "@/server/notices";

export const runtime = "nodejs";

const NO_STORE = { "Cache-Control": "private, no-store" };

/**
 * GET /api/notices?locale=ko            → { weekBanCount, unreadCount } for the home strip
 * GET /api/notices?view=list&locale=ko  → { notices } (and marks them seen)
 * Signed-out callers get the counts and the list too; nothing is marked.
 */
export async function GET(request: NextRequest) {
  const session = await getServerSession(getAuthOptions()) as { user?: { id?: unknown } } | null;
  const userId = typeof session?.user?.id === "string" && session.user.id.trim() ? session.user.id.trim() : null;
  const locale = (request.nextUrl.searchParams.get("locale") ?? "en").trim().slice(0, 16) || "en";
  if (request.nextUrl.searchParams.get("view") === "list") {
    return NextResponse.json({ notices: await listNotices(userId, locale) }, { headers: NO_STORE });
  }
  return NextResponse.json(await readNoticeSummary(userId), { headers: NO_STORE });
}
