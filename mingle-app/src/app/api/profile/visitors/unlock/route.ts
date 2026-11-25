import { type NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { getAuthOptions } from "@/lib/auth-options";
import { ProfileVisitorError, unlockProfileVisitor } from "@/server/profile-visitors";

export const runtime = "nodejs";

/** POST { token, idempotencyKey }: pays the Hash to see one visitor. */
export async function POST(request: NextRequest) {
  const session = await getServerSession(getAuthOptions());
  const userId = typeof session?.user?.id === "string" ? session.user.id.trim() : "";
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => null) as { token?: unknown; idempotencyKey?: unknown } | null;
  const token = typeof body?.token === "string" ? body.token.trim() : "";
  const idempotencyKey = typeof body?.idempotencyKey === "string" ? body.idempotencyKey.trim().slice(0, 100) : "";
  if (!token || !idempotencyKey) return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  try {
    const result = await unlockProfileVisitor({ userId, token, idempotencyKey });
    return NextResponse.json({ ok: true, charged: result.charged }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error instanceof ProfileVisitorError) {
      return NextResponse.json({ error: error.code }, { status: error.code === "insufficient_coins" ? 402 : 404 });
    }
    console.error("[profile/visitors/unlock] failed", error);
    return NextResponse.json({ error: "unlock_failed" }, { status: 500 });
  }
}
