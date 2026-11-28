import { type NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { getAuthOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";
import { isSameFace } from "@/lib/selfie-liveness";
import { releaseDormancyIfReady } from "@/server/dormancy";

export const runtime = "nodejs";

function getSessionUserId(session: { user?: { id?: unknown } } | null): string {
  return typeof session?.user?.id === "string" ? session.user.id.trim() : "";
}

/**
 * The selfie check passed on the phone (head turns, and the same face as the
 * profile photo; see @/lib/selfie-liveness): the account gets the "verified"
 * badge. The phone sends only how similar the two faces were, never a frame
 * or a face description. Needs a profile photo the phone did not find
 * faceless.
 */
export async function POST(request: NextRequest) {
  const userId = getSessionUserId(await getServerSession(getAuthOptions()));
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  let body: { similarity?: unknown } | null = null;
  try {
    body = await request.json();
  } catch {
    body = null;
  }
  const similarity = typeof body?.similarity === "number" ? body.similarity : Number.NaN;
  if (!isSameFace(similarity)) return NextResponse.json({ error: "not_same_face" }, { status: 400 });
  const updated = await prisma.user.updateMany({
    where: { id: userId, image: { not: null }, NOT: { imageFaceCheck: "no_face" } },
    data: { faceVerifiedAt: new Date() },
  });
  if (updated.count === 0) return NextResponse.json({ error: "photo_required" }, { status: 409 });
  // A dormant account wakes up here (src/server/dormancy.ts).
  await releaseDormancyIfReady(userId).catch(() => false);
  return NextResponse.json({ ok: true, faceVerified: true }, { headers: { "Cache-Control": "private, no-store" } });
}
