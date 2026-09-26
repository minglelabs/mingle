import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { ADMIN_SESSION_COOKIE_NAME, verifyAdminSessionToken } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";
import { isOwnedPostImageKey } from "@/server/posts/post-image-keys";
import { getPostImage } from "@/server/posts/post-image-storage";

export const runtime = "nodejs";

function json(payload: object, status: number): NextResponse {
  return NextResponse.json(payload, { status, headers: { "Cache-Control": "private, no-store" } });
}

/**
 * The reported post's image for the admin reports console. The public image
 * route only serves posts visible to the caller, so an operator could not see
 * the image of a post that is already moderation-hidden. This route is gated
 * by the admin session instead and serves only the image of the post a report
 * points at (never an arbitrary key).
 */
export async function GET(_request: Request, context: { params: Promise<{ reportId: string }> }) {
  const store = await cookies();
  if (!verifyAdminSessionToken(store.get(ADMIN_SESSION_COOKIE_NAME)?.value)) {
    return json({ error: "unauthorized" }, 401);
  }

  const { reportId } = await context.params;
  const report = await prisma.userReport.findUnique({
    where: { id: reportId.trim() },
    select: { targetPost: { select: { authorId: true, imageObjectKey: true } } },
  });
  const post = report?.targetPost;
  if (!post?.imageObjectKey || !isOwnedPostImageKey(post.imageObjectKey, post.authorId)) {
    return json({ error: "not_found" }, 404);
  }

  try {
    const bytes = await getPostImage(post.imageObjectKey);
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "Content-Type": "image/jpeg",
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return json({ error: "image_unavailable" }, 503);
  }
}
