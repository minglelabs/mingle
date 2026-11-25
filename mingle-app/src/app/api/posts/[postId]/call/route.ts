import { type NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { getAuthOptions } from "@/lib/auth-options";
import { startPostCall } from "@/server/post-calls";

export const runtime = "nodejs";

type CallRouteProps = { params: Promise<{ postId: string }> };

const STATUS: Record<string, number> = { not_found: 404, own_post: 400, blocked: 403, busy: 409, caller_busy: 409, too_soon: 429 };

/** POST: ring the author of this call post (owner, 2026-11-25; see @/server/post-calls). */
export async function POST(request: NextRequest, { params }: CallRouteProps) {
  const session = await getServerSession(getAuthOptions());
  const viewerId = typeof session?.user?.id === "string" ? session.user.id.trim() : "";
  if (!viewerId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { postId } = await params;
  const body = await request.json().catch(() => null) as { locale?: unknown } | null;
  const outcome = await startPostCall({
    postId: postId.trim(),
    callerId: viewerId,
    locale: typeof body?.locale === "string" ? body.locale : undefined,
  });
  if (!outcome.ok) return NextResponse.json({ error: outcome.error }, { status: STATUS[outcome.error] ?? 400 });
  return NextResponse.json({ call: outcome.call }, { headers: { "Cache-Control": "private, no-store" } });
}
