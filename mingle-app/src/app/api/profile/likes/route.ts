import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { getAuthOptions } from "@/lib/auth-options";
import { listProfileLikers } from "@/server/profile-likes";

export const runtime = "nodejs";

/** GET: the hearts the signed-in account got on its profile: how many, and from whom (My page). */
export async function GET() {
  const session = await getServerSession(getAuthOptions());
  const userId = typeof session?.user?.id === "string" ? session.user.id.trim() : "";
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json(await listProfileLikers(userId), { headers: { "Cache-Control": "private, no-store" } });
}
