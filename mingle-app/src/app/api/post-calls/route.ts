import { type NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { getAuthOptions } from "@/lib/auth-options";
import { getIncomingPostCall, getPostCallForRoom } from "@/server/post-calls";

export const runtime = "nodejs";

const NO_STORE = { headers: { "Cache-Control": "private, no-store" } };

/**
 * GET: with `conversationId`, the call of that hidden room (the call screen);
 * without, the call ringing this person now and whether to keep asking often
 * (owner, 2026-11-25; see @/server/post-calls).
 */
export async function GET(request: NextRequest) {
  const session = await getServerSession(getAuthOptions());
  const viewerId = typeof session?.user?.id === "string" ? session.user.id.trim() : "";
  if (!viewerId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const conversationId = request.nextUrl.searchParams.get("conversationId")?.trim();
  if (conversationId) {
    return NextResponse.json({ call: await getPostCallForRoom(conversationId, viewerId) }, NO_STORE);
  }
  return NextResponse.json(await getIncomingPostCall(viewerId), NO_STORE);
}
