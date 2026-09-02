import { type NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { getAuthOptions } from "@/lib/auth-options";
import {
  PROFILE_IMAGE_MAX_SCALE,
  PROFILE_IMAGE_MIN_SCALE,
} from "@/lib/profile-image-crop";
import { prisma } from "@/lib/prisma";
import {
  deleteProfileImage,
  putProfileImage,
} from "@/server/profile-image-storage";
import {
  serializeUserProfile,
  userProfileSelect,
  type UserProfile,
} from "@/server/user-profile";

export const runtime = "nodejs";

const MAX_PROFILE_IMAGE_BYTES = 10 * 1024 * 1024;
const SUPPORTED_IMAGE_TYPES = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
]);

function getSessionUserId(session: { user?: { id?: unknown } } | null): string {
  return typeof session?.user?.id === "string" ? session.user.id.trim() : "";
}

function profileResponse(profile: UserProfile): NextResponse {
  return NextResponse.json(profile, {
    headers: { "Cache-Control": "private, no-store" },
  });
}

function parseCropValue(
  value: FormDataEntryValue | null,
  fallback: number,
  minimum: number,
  maximum: number,
): number | null {
  if (value === null) return fallback;
  if (typeof value !== "string") return null;

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < minimum || parsed > maximum) return null;
  return parsed;
}

export async function POST(request: NextRequest) {
  const userId = getSessionUserId(await getServerSession(getAuthOptions()));
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "invalid_form_data" }, { status: 400 });
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "image_required" }, { status: 400 });
  }

  const contentType = file.type.toLowerCase();
  const extension = SUPPORTED_IMAGE_TYPES.get(contentType);
  if (!extension || file.size <= 0 || file.size > MAX_PROFILE_IMAGE_BYTES) {
    return NextResponse.json({ error: "invalid_image" }, { status: 400 });
  }

  const imageCropScale = parseCropValue(
    formData.get("imageCropScale"),
    PROFILE_IMAGE_MIN_SCALE,
    PROFILE_IMAGE_MIN_SCALE,
    PROFILE_IMAGE_MAX_SCALE,
  );
  const imageCropX = parseCropValue(formData.get("imageCropX"), 0, -1, 1);
  const imageCropY = parseCropValue(formData.get("imageCropY"), 0, -1, 1);
  if (imageCropScale === null || imageCropX === null || imageCropY === null) {
    return NextResponse.json({ error: "invalid_image_crop" }, { status: 400 });
  }

  const objectKey = `profiles/${userId}/${crypto.randomUUID()}.${extension}`;
  let imageUrl: string;
  try {
    imageUrl = await putProfileImage({
      objectKey,
      body: new Uint8Array(await file.arrayBuffer()),
      contentType,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "profile_image_storage_not_configured") {
      return NextResponse.json({ error: "image_storage_not_configured" }, { status: 503 });
    }
    console.error("[profile/image] upload_failed", error);
    return NextResponse.json({ error: "image_upload_failed" }, { status: 502 });
  }

  let previousObjectKey: string | null = null;
  try {
    const existing = await prisma.user.findUnique({
      where: { id: userId },
      select: { imageObjectKey: true },
    });
    previousObjectKey = existing?.imageObjectKey ?? null;

    const updated = await prisma.user.update({
      where: { id: userId },
      data: {
        image: imageUrl,
        imageObjectKey: objectKey,
        imageCropScale,
        imageCropX,
        imageCropY,
      },
      select: userProfileSelect,
    });

    if (previousObjectKey && previousObjectKey !== objectKey) {
      try {
        await deleteProfileImage(previousObjectKey);
      } catch (error) {
        console.warn("[profile/image] previous_object_delete_failed", error);
      }
    }

    return profileResponse(serializeUserProfile(updated));
  } catch (error) {
    console.error("[profile/image] profile_update_failed", error);
    try {
      await deleteProfileImage(objectKey);
    } catch {
      // Keep the original profile error when cleanup also fails.
    }
    return NextResponse.json({ error: "profile_update_failed" }, { status: 500 });
  }
}
