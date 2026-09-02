import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const {
  mockGetServerSession,
  mockUserFindUnique,
  mockUserUpdate,
  mockPutProfileImage,
  mockDeleteProfileImage,
  mockSerializeUserProfile,
} = vi.hoisted(() => ({
  mockGetServerSession: vi.fn(),
  mockUserFindUnique: vi.fn(),
  mockUserUpdate: vi.fn(),
  mockPutProfileImage: vi.fn(),
  mockDeleteProfileImage: vi.fn(),
  mockSerializeUserProfile: vi.fn(),
}));

vi.mock("next-auth", () => ({
  getServerSession: mockGetServerSession,
}));

vi.mock("@/lib/auth-options", () => ({
  getAuthOptions: () => ({}),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: mockUserFindUnique,
      update: mockUserUpdate,
    },
  },
}));

vi.mock("@/server/profile-image-storage", () => ({
  putProfileImage: mockPutProfileImage,
  deleteProfileImage: mockDeleteProfileImage,
}));

vi.mock("@/server/user-profile", () => ({
  userProfileSelect: { id: true },
  serializeUserProfile: mockSerializeUserProfile,
}));

import { POST } from "@/app/api/profile/image/route";

function makeRequest(file: File, crop = { scale: "2", x: "0.25", y: "-0.1" }) {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("imageCropScale", crop.scale);
  formData.append("imageCropX", crop.x);
  formData.append("imageCropY", crop.y);
  return new NextRequest("https://example.com/api/profile/image", {
    method: "POST",
    body: formData,
  });
}

function makeImageFile(type = "image/png", size = 3) {
  return new File([new Uint8Array(size).fill(7)], "avatar.png", { type });
}

describe("/api/profile/image route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetServerSession.mockResolvedValue({ user: { id: "user_123" } });
    mockPutProfileImage.mockResolvedValue("https://images.example.com/profiles/user_123/new.png");
    mockDeleteProfileImage.mockResolvedValue(undefined);
    mockSerializeUserProfile.mockImplementation((profile) => ({
      id: profile.id,
      image: profile.image,
      imageCropScale: profile.imageCropScale,
      imageCropX: profile.imageCropX,
      imageCropY: profile.imageCropY,
    }));
  });

  it("requires an authenticated session", async () => {
    mockGetServerSession.mockResolvedValue(null);

    const response = await POST(makeRequest(makeImageFile()));

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "unauthorized" });
    expect(mockPutProfileImage).not.toHaveBeenCalled();
  });

  it("rejects unsupported image types", async () => {
    const response = await POST(makeRequest(makeImageFile("image/gif")));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid_image" });
    expect(mockPutProfileImage).not.toHaveBeenCalled();
  });

  it("rejects crop values outside the supported range", async () => {
    const response = await POST(makeRequest(makeImageFile(), { scale: "5", x: "0", y: "0" }));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid_image_crop" });
    expect(mockPutProfileImage).not.toHaveBeenCalled();
  });

  it("uploads the original file, persists its crop, and cleans up the previous object", async () => {
    mockUserFindUnique.mockResolvedValue({ imageObjectKey: "profiles/user_123/old.jpg" });
    mockUserUpdate.mockResolvedValue({
      id: "user_123",
      image: "https://images.example.com/profiles/user_123/new.png",
      imageCropScale: 2,
      imageCropX: 0.25,
      imageCropY: -0.1,
    });

    const response = await POST(makeRequest(makeImageFile()));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      id: "user_123",
      image: "https://images.example.com/profiles/user_123/new.png",
      imageCropScale: 2,
      imageCropX: 0.25,
      imageCropY: -0.1,
    });
    expect(mockPutProfileImage).toHaveBeenCalledWith(expect.objectContaining({
      objectKey: expect.stringMatching(/^profiles\/user_123\/.+\.png$/),
      contentType: "image/png",
      body: expect.any(Uint8Array),
    }));
    expect(mockUserUpdate).toHaveBeenCalledWith({
      where: { id: "user_123" },
      data: {
        image: "https://images.example.com/profiles/user_123/new.png",
        imageObjectKey: expect.stringMatching(/^profiles\/user_123\/.+\.png$/),
        imageCropScale: 2,
        imageCropX: 0.25,
        imageCropY: -0.1,
      },
      select: { id: true },
    });
    expect(mockDeleteProfileImage).toHaveBeenCalledWith("profiles/user_123/old.jpg");
  });

  it("reports a missing R2 configuration without changing the profile", async () => {
    mockPutProfileImage.mockRejectedValue(new Error("profile_image_storage_not_configured"));

    const response = await POST(makeRequest(makeImageFile()));

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "image_storage_not_configured" });
    expect(mockUserFindUnique).not.toHaveBeenCalled();
    expect(mockUserUpdate).not.toHaveBeenCalled();
  });
});
