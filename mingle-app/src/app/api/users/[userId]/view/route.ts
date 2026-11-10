import { type NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { getAuthOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";
import { readSourcePostIdFromBody, resolveSourcePostId } from "@/server/posts/source-post";
import { rateLimitGuard } from "@/server/rate-limit/rate-limit";

export const runtime = "nodejs";

type ProfileViewRouteProps = {
  params: Promise<{
    userId: string;
  }>;
};

function json(payload: object, init?: ResponseInit): NextResponse {
  return NextResponse.json(payload, {
    ...init,
    headers: { "Cache-Control": "private, no-store", ...init?.headers },
  });
}

/**
 * POST /users/{userId}/view — the signed-in viewer opened this user's profile
 * screen (one ProfileView row per visit). Optional JSON body
 * `{ sourcePostId }`: the profile owner's post the profile was opened from;
 * any other id is stored as null. A fire-and-forget beacon: a visit to the
 * viewer's own profile records nothing.
 */
export async function POST(request: NextRequest, { params }: ProfileViewRouteProps) {
  const session = await getServerSession(getAuthOptions());
  const viewerId = typeof session?.user?.id === "string" ? session.user.id.trim() : "";
  if (!viewerId) return json({ error: "unauthorized" }, { status: 401 });

  const profileUserId = (await params).userId?.trim() ?? "";
  if (!profileUserId) return json({ error: "invalid_user_id" }, { status: 400 });
  if (profileUserId === viewerId) return json({ ok: true });

  const limited = rateLimitGuard("record_profile_view", viewerId);
  if (limited) return limited;

  const profileUser = await prisma.user.findUnique({
    where: { id: profileUserId, isActive: true },
    select: { id: true },
  });
  if (!profileUser) return json({ error: "user_not_found" }, { status: 404 });

  const sourcePostId = await resolveSourcePostId(await readSourcePostIdFromBody(request), profileUser.id);
  await prisma.profileView.create({
    data: { viewerId, profileUserId: profileUser.id, sourcePostId },
  });
  return json({ ok: true });
}
