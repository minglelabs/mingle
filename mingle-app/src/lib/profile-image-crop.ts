export const PROFILE_IMAGE_MIN_SCALE = 1;
export const PROFILE_IMAGE_MAX_SCALE = 4;

export type ProfileImageCrop = {
  scale: number;
  x: number;
  y: number;
};

export type ProfileImageCropInput = {
  scale?: number | null;
  x?: number | null;
  y?: number | null;
} | null;

export const DEFAULT_PROFILE_IMAGE_CROP: ProfileImageCrop = {
  scale: PROFILE_IMAGE_MIN_SCALE,
  x: 0,
  y: 0,
};

function clamp(value: number, minimum: number, maximum: number): number {
  const clamped = Math.min(maximum, Math.max(minimum, value));
  return Object.is(clamped, -0) ? 0 : clamped;
}

function finiteOrFallback(value: number | null | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function normalizeProfileImageCrop(
  value?: ProfileImageCropInput,
): ProfileImageCrop {
  return {
    scale: clamp(
      finiteOrFallback(value?.scale, DEFAULT_PROFILE_IMAGE_CROP.scale),
      PROFILE_IMAGE_MIN_SCALE,
      PROFILE_IMAGE_MAX_SCALE,
    ),
    x: clamp(
      finiteOrFallback(value?.x, DEFAULT_PROFILE_IMAGE_CROP.x),
      -1,
      1,
    ),
    y: clamp(
      finiteOrFallback(value?.y, DEFAULT_PROFILE_IMAGE_CROP.y),
      -1,
      1,
    ),
  };
}

export function buildProfileImageTransform(
  size: number,
  crop?: ProfileImageCropInput,
): string {
  const normalized = normalizeProfileImageCrop(crop);
  const offsetX = normalized.x * size;
  const offsetY = normalized.y * size;
  return `translate3d(${offsetX}px, ${offsetY}px, 0) scale(${normalized.scale})`;
}

export function clampProfileImageCropToImage(args: {
  crop: ProfileImageCrop;
  imageWidth: number;
  imageHeight: number;
  viewportSize: number;
}): ProfileImageCrop {
  const viewportSize = Math.max(1, args.viewportSize);
  const imageWidth = Math.max(1, args.imageWidth);
  const imageHeight = Math.max(1, args.imageHeight);
  const baseScale = Math.max(viewportSize / imageWidth, viewportSize / imageHeight);
  const scale = clamp(args.crop.scale, PROFILE_IMAGE_MIN_SCALE, PROFILE_IMAGE_MAX_SCALE);
  const renderedWidth = imageWidth * baseScale * scale;
  const renderedHeight = imageHeight * baseScale * scale;
  const maxX = Math.max(0, (renderedWidth - viewportSize) / 2 / viewportSize);
  const maxY = Math.max(0, (renderedHeight - viewportSize) / 2 / viewportSize);

  return {
    scale,
    x: clamp(args.crop.x, -maxX, maxX),
    y: clamp(args.crop.y, -maxY, maxY),
  };
}
