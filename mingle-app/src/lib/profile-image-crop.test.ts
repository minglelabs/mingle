import { describe, expect, it } from "vitest";
import {
  buildProfileImageTransform,
  clampProfileImageCropToImage,
  normalizeProfileImageCrop,
} from "@/lib/profile-image-crop";

describe("profile image crop", () => {
  it("normalizes missing and out-of-range crop values", () => {
    expect(normalizeProfileImageCrop({ scale: 99, x: -4, y: Number.NaN })).toEqual({
      scale: 4,
      x: -1,
      y: 0,
    });
  });

  it("keeps the crop inside the circular viewport for the source aspect ratio", () => {
    expect(clampProfileImageCropToImage({
      crop: { scale: 1, x: 1, y: -1 },
      imageWidth: 400,
      imageHeight: 200,
      viewportSize: 240,
    })).toEqual({
      scale: 1,
      x: 0.5,
      y: 0,
    });
  });

  it("serializes the same crop state into the avatar transform", () => {
    expect(buildProfileImageTransform(96, { scale: 2, x: -0.25, y: 0.5 }))
      .toBe("translate3d(-24px, 48px, 0) scale(2)");
  });
});
