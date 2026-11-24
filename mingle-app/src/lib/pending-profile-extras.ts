/**
 * What the one-pass onboarding (owner, 2026-11-24) collects before there is an
 * account, beyond the language keys in live-phone-demo.preferences: the
 * height (men) and the profile photo. Saved to the profile right after sign-in
 * by PendingProfileSync.
 */
const HEIGHT_KEY = "mingle.pending.heightCm.v1";
const PHOTO_KEY = "mingle.pending.profilePhoto.v1";

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function writePendingHeight(heightCm: number | null): void {
  try {
    if (heightCm && heightCm > 0) storage()?.setItem(HEIGHT_KEY, String(Math.round(heightCm)));
    else storage()?.removeItem(HEIGHT_KEY);
  } catch {
    // Asked again later by the profile basics gate.
  }
}

export function readPendingHeight(): number | null {
  try {
    const value = Number(storage()?.getItem(HEIGHT_KEY));
    return Number.isInteger(value) && value >= 100 && value <= 250 ? value : null;
  } catch {
    return null;
  }
}

export function clearPendingHeight(): void {
  try {
    storage()?.removeItem(HEIGHT_KEY);
  } catch {
    // Harmless: saved again on the next visit.
  }
}

/** A square JPEG as a data URL (already cropped and shrunk on the phone). */
export function writePendingPhoto(dataUrl: string | null): boolean {
  try {
    if (dataUrl) storage()?.setItem(PHOTO_KEY, dataUrl);
    else storage()?.removeItem(PHOTO_KEY);
    return true;
  } catch {
    // Storage full or blocked: the photo is added from My page instead.
    return false;
  }
}

export function readPendingPhoto(): string | null {
  try {
    const value = storage()?.getItem(PHOTO_KEY) ?? null;
    return value && value.startsWith("data:image/") ? value : null;
  } catch {
    return null;
  }
}

export function clearPendingPhoto(): void {
  try {
    storage()?.removeItem(PHOTO_KEY);
  } catch {
    // Harmless: uploaded again on the next visit.
  }
}

export async function dataUrlToFile(dataUrl: string, name: string): Promise<File> {
  const blob = await (await fetch(dataUrl)).blob();
  return new File([blob], name, { type: blob.type || "image/jpeg" });
}

/** Center-crops an image file to a square and shrinks it to `size` px, as a JPEG data URL. */
export async function squarePhotoDataUrl(file: File, size = 720): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error("image_load_failed"));
      element.src = url;
    });
    const side = Math.min(image.naturalWidth, image.naturalHeight);
    const target = Math.min(size, side);
    const canvas = document.createElement("canvas");
    canvas.width = target;
    canvas.height = target;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("canvas_unavailable");
    context.drawImage(
      image,
      (image.naturalWidth - side) / 2,
      (image.naturalHeight - side) / 2,
      side,
      side,
      0,
      0,
      target,
      target,
    );
    return canvas.toDataURL("image/jpeg", 0.85);
  } finally {
    URL.revokeObjectURL(url);
  }
}
