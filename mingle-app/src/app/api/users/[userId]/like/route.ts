import { type NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { getAuthOptions } from "@/lib/auth-options";
import { hasLikedProfile, setProfileLike } from "@/server/profile-likes";

export const runtime = "nodejs";

type LikeRouteProps = { params: Promise<{ userId: string }> };

function getSessionUserId(session: { user?: { id?: unknown } } | null): string {
  return typeof session?.user?.id === "string" ? session.user.id.trim() : "";
}

function result(liked: boolean): NextResponse {
  return NextResponse.json({ liked }, { headers: { "Cache-Control": "private, no-store" } });
}

/** GET: whether the viewer sent this profile a heart. */
export async function GET(_request: NextRequest, { params }: LikeRouteProps) {
  const viewerId = getSessionUserId(await getServerSession(getAuthOptions()));
  if (!viewerId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { userId } = await params;
  return result(await hasLikedProfile(viewerId, userId.trim()));
}

async function change(params: LikeRouteProps["params"], liked: boolean) {
  const viewerId = getSessionUserId(await getServerSession(getAuthOptions()));
  if (!viewerId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { userId } = await params;
  const outcome = await setProfileLike(viewerId, userId.trim(), liked);
  if (!outcome.ok) {
    return NextResponse.json({ error: outcome.error }, { status: outcome.error === "not_found" ? 404 : outcome.error === "blocked" ? 403 : 400 });
  }
  return result(outcome.liked);
}

/** POST: send a heart to this profile (owner, 2026-11-25; see @/server/profile-likes). */
export async function POST(_request: NextRequest, { params }: LikeRouteProps) {
  return change(params, true);
}

/** DELETE: take the heart back. */
export async function DELETE(_request: NextRequest, { params }: LikeRouteProps) {
  return change(params, false);
}
