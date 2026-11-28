import { type NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { getAuthOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";
import { pronounceName } from "@/server/name-pronunciation";
import { rateLimitGuard } from "@/server/rate-limit/rate-limit";

export const runtime = "nodejs";

/** GET → { name, pronunciation }: the person's name spelled the way it sounds, in English letters (see @/server/name-pronunciation). */
export async function GET(request: NextRequest, context: { params: Promise<{ userId: string }> }) {
  const session = await getServerSession(getAuthOptions());
  const viewerId = typeof session?.user?.id === "string" ? session.user.id.trim() : "";
  if (!viewerId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const limited = rateLimitGuard("name_pronunciation", viewerId);
  if (limited) return limited;
  const { userId } = await context.params;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { name: true, primaryLanguages: true, isActive: true, isDeleted: true },
  });
  if (!user || !user.isActive || user.isDeleted || !user.name?.trim()) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  try {
    const pronunciation = await pronounceName(user.name, user.primaryLanguages, request.signal);
    return NextResponse.json(
      { name: user.name.trim(), pronunciation },
      { headers: { "Cache-Control": "private, max-age=86400" } },
    );
  } catch (error) {
    console.error("[users/name-pronunciation] failed", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "pronunciation_failed" }, { status: 502 });
  }
}
