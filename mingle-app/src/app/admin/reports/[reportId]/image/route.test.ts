import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockCookieGet, mockVerify, mockReportFindUnique, mockGetPostImage } = vi.hoisted(() => ({
  mockCookieGet: vi.fn(),
  mockVerify: vi.fn(),
  mockReportFindUnique: vi.fn(),
  mockGetPostImage: vi.fn(),
}));

vi.mock("next/headers", () => ({ cookies: async () => ({ get: mockCookieGet }) }));
vi.mock("@/lib/admin-auth", () => ({
  ADMIN_SESSION_COOKIE_NAME: "admin_session",
  verifyAdminSessionToken: mockVerify,
}));
vi.mock("@/lib/prisma", () => ({ prisma: { userReport: { findUnique: mockReportFindUnique } } }));
vi.mock("@/server/posts/post-image-storage", () => ({ getPostImage: mockGetPostImage }));

import { GET } from "@/app/admin/reports/[reportId]/image/route";

const KEY = "post-images/author_1/123e4567-e89b-42d3-a456-426614174000.jpg";

function call(reportId = "r1") {
  return GET(new Request("https://example.com/admin/reports/r1/image"), { params: Promise.resolve({ reportId }) });
}

describe("/admin/reports/[reportId]/image", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCookieGet.mockReturnValue({ value: "token" });
    mockVerify.mockReturnValue(true);
    mockGetPostImage.mockResolvedValue(new Uint8Array([1, 2, 3]));
  });

  it("requires an admin session", async () => {
    mockVerify.mockReturnValue(false);
    const response = await call();
    expect(response.status).toBe(401);
    expect(mockReportFindUnique).not.toHaveBeenCalled();
  });

  it("serves the reported post's image, even when the post is hidden", async () => {
    mockReportFindUnique.mockResolvedValue({ targetPost: { authorId: "author_1", imageObjectKey: KEY } });
    const response = await call();
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("image/jpeg");
    expect(mockGetPostImage).toHaveBeenCalledWith(KEY);
  });

  it("refuses a key the post author was not issued", async () => {
    mockReportFindUnique.mockResolvedValue({ targetPost: { authorId: "author_1", imageObjectKey: "conversations/x.jpg" } });
    const response = await call();
    expect(response.status).toBe(404);
    expect(mockGetPostImage).not.toHaveBeenCalled();
  });

  it("404s for a report without a post image", async () => {
    mockReportFindUnique.mockResolvedValue({ targetPost: null });
    expect((await call()).status).toBe(404);
  });
});
