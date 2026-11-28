import { type NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { getAuthOptions } from "@/lib/auth-options";
import { actOnPostCall, isPostCallAction } from "@/server/post-calls";

export const runtime = "nodejs";

type CallRouteProps = { params: Promise<{ callId: string }> };

/** POST { action: "accept" | "hangup" }: answer a ring, or end the call from this side. */
export async function POST(request: NextRequest, { params }: CallRouteProps) {
  const session = await getServerSession(getAuthOptions());
  const viewerId = typeof session?.user?.id === "string" ? session.user.id.trim() : "";
  if (!viewerId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => null) as { action?: unknown } | null;
  if (!isPostCallAction(body?.action)) return NextResponse.json({ error: "invalid_action" }, { status: 400 });
  const { callId } = await params;
  const outcome = await actOnPostCall({ callId: callId.trim(), userId: viewerId, action: body.action });
  if (!outcome.ok) {
    return NextResponse.json({ error: outcome.error }, { status: outcome.error === "not_found" ? 404 : outcome.error === "forbidden" ? 403 : 409 });
  }
  return NextResponse.json({ call: outcome.call }, { headers: { "Cache-Control": "private, no-store" } });
}
