import { buildClientApiPath } from "@/lib/api-contract";
import { checkPhotoForFace } from "@/lib/native-face-check";

export type ProfilePhotoUploadResult =
  | { status: "uploaded"; image: string | null }
  | { status: "no_face" | "failed" };

/**
 * Uploads a new profile photo once the phone has found a face in it (iOS
 * Vision / Android ML Kit). A photo with no face is not uploaded. The server
 * keeps the check's answer (`faceCheck`) and clears the selfie badge.
 */
export async function uploadProfilePhotoWithFaceCheck(
  file: File,
  expectedAccountId?: string | null,
): Promise<ProfilePhotoUploadResult> {
  const result = await checkPhotoForFace(file);
  if (result === "no_face") return { status: "no_face" };
  try {
    const form = new FormData();
    form.append("file", file);
    form.append("imageCropScale", "1");
    form.append("imageCropX", "0");
    form.append("imageCropY", "0");
    form.append("faceCheck", result);
    const response = await fetch(buildClientApiPath("/profile/image"), {
      method: "POST",
      headers: expectedAccountId ? { "x-mingle-expected-account-id": expectedAccountId } : undefined,
      body: form,
    });
    if (!response.ok) return { status: "failed" };
    const profile = await response.json().catch(() => null) as { image?: unknown } | null;
    return { status: "uploaded", image: typeof profile?.image === "string" ? profile.image : null };
  } catch {
    return { status: "failed" };
  }
}
