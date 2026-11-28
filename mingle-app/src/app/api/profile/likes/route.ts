import { NextResponse, type NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { getAuthOptions } from "@/lib/auth-options";
import { listProfileLikers } from "@/server/profile-likes";

export const runtime = "nodejs";

/** GET: the hearts the signed-in account got on its profile: how many, and from whom (My page), a page at a time (?cursor=). */
export async function GET(request?: NextRequest) {
  const session = await getServerSession(getAuthOptions());
  const userId = typeof session?.user?.id === "string" ? session.user.id.trim() : "";
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const cursor = request?.nextUrl.searchParams.get("cursor")?.trim().slice(0, 64) || null;
  return NextResponse.json(await listProfileLikers(userId, cursor), { headers: { "Cache-Control": "private, no-store" } });
}
