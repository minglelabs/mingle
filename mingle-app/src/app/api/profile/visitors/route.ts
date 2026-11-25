import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { getAuthOptions } from "@/lib/auth-options";
import { listProfileVisitors, VISITOR_UNLOCK_COINS } from "@/server/profile-visitors";

export const runtime = "nodejs";

/** GET: who viewed my profile; blurred entries carry no name or photo (see @/server/profile-visitors). */
export async function GET() {
  const session = await getServerSession(getAuthOptions());
  const userId = typeof session?.user?.id === "string" ? session.user.id.trim() : "";
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const visitors = await listProfileVisitors(userId);
  return NextResponse.json({ visitors, unlockCoins: VISITOR_UNLOCK_COINS }, { headers: { "Cache-Control": "private, no-store" } });
}
