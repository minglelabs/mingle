import { type NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { getAuthOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";
import { parseImageFaceCheck } from "@/server/first-message-gate";

export const runtime = "nodejs";

const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
const PHOTO_FETCH_TIMEOUT_MS = 8000;

function getSessionUserId(session: { user?: { id?: unknown } } | null): string {
  return typeof session?.user?.id === "string" ? session.user.id.trim() : "";
}

/**
 * The signed-in account's own profile photo, so the app can check a photo
 * that was never checked on the phone (it may live on another host, such as a
 * Google profile picture, that the page cannot read).
 */
export async function GET() {
  const userId = getSessionUserId(await getServerSession(getAuthOptions()));
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { image: true } });
  const image = user?.image?.trim();
  if (!image || !/^https:\/\//i.test(image)) return NextResponse.json({ error: "no_image" }, { status: 404 });
  try {
    const response = await fetch(image, { signal: AbortSignal.timeout(PHOTO_FETCH_TIMEOUT_MS) });
    const contentType = (response.headers.get("content-type") ?? "").toLowerCase();
    if (!response.ok || !contentType.startsWith("image/")) {
      return NextResponse.json({ error: "image_unreadable" }, { status: 502 });
    }
    const bytes = await response.arrayBuffer();
    if (bytes.byteLength <= 0 || bytes.byteLength > MAX_PHOTO_BYTES) {
      return NextResponse.json({ error: "image_unreadable" }, { status: 502 });
    }
    return new NextResponse(bytes, {
      headers: { "Content-Type": contentType, "Cache-Control": "private, no-store" },
    });
  } catch {
    return NextResponse.json({ error: "image_unreadable" }, { status: 502 });
  }
}

/**
 * The phone's answer for a photo that was never checked. Only a never-checked
 * photo takes it; a new photo carries its own answer with the upload.
 */
export async function POST(request: NextRequest) {
  const userId = getSessionUserId(await getServerSession(getAuthOptions()));
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  let body: { result?: unknown } | null = null;
  try {
    body = await request.json();
  } catch {
    body = null;
  }
  const result = parseImageFaceCheck(body?.result);
  if (!result) return NextResponse.json({ error: "invalid_result" }, { status: 400 });
  const updated = await prisma.user.updateMany({
    where: { id: userId, image: { not: null }, imageFaceCheck: null },
    data: { imageFaceCheck: result },
  });
  return NextResponse.json({ ok: true, updated: updated.count > 0 }, { headers: { "Cache-Control": "private, no-store" } });
}
