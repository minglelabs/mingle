import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { mockGetServerSession, mockUserFindUnique, mockPostFindFirst, mockProfileViewCreate } = vi.hoisted(() => ({
  mockGetServerSession: vi.fn(),
  mockUserFindUnique: vi.fn(),
  mockPostFindFirst: vi.fn(),
  mockProfileViewCreate: vi.fn(),
}));

vi.mock("next-auth", () => ({ getServerSession: mockGetServerSession }));
vi.mock("@/lib/auth-options", () => ({ getAuthOptions: () => ({}) }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: mockUserFindUnique },
    post: { findFirst: mockPostFindFirst },
    profileView: { create: mockProfileViewCreate },
  },
}));

import { POST } from "@/app/api/users/[userId]/view/route";
import { POST as postIos } from "@/app/api/ios/v2.2.0/users/[userId]/view/route";
import { POST as postAndroid } from "@/app/api/android/v2.2.0/users/[userId]/view/route";
import { __resetRateLimitStore } from "@/server/rate-limit/rate-limit";

function visit(userId: string, body?: unknown) {
  return POST(
    new NextRequest(`https://example.com/api/users/${userId}/view`, {
      method: "POST",
      ...(body === undefined ? {} : { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
    }),
    { params: Promise.resolve({ userId }) },
  );
}

describe("POST /api/users/[userId]/view", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    __resetRateLimitStore();
    mockGetServerSession.mockResolvedValue({ user: { id: "viewer" } });
    mockUserFindUnique.mockResolvedValue({ id: "owner" });
    mockPostFindFirst.mockResolvedValue({ id: "post_1" });
    mockProfileViewCreate.mockResolvedValue({ id: "visit_1" });
  });

  it("is served by the v2.2.0 namespaces", () => {
    expect(postIos).toBe(POST);
    expect(postAndroid).toBe(POST);
  });

  it("records a visit with the owner's post it was opened from", async () => {
    const response = await visit("owner", { sourcePostId: "post_1" });
    expect(response.status).toBe(200);
    expect(mockPostFindFirst).toHaveBeenCalledWith({ where: { id: "post_1", authorId: "owner" }, select: { id: true } });
    expect(mockProfileViewCreate).toHaveBeenCalledWith({
      data: { viewerId: "viewer", profileUserId: "owner", sourcePostId: "post_1" },
    });
  });

  it("drops a source post that is not the owner's", async () => {
    mockPostFindFirst.mockResolvedValue(null);
    await visit("owner", { sourcePostId: "someone_elses_post" });
    expect(mockProfileViewCreate).toHaveBeenCalledWith({
      data: { viewerId: "viewer", profileUserId: "owner", sourcePostId: null },
    });
  });

  it("records a visit without a source and without a body", async () => {
    await visit("owner");
    expect(mockPostFindFirst).not.toHaveBeenCalled();
    expect(mockProfileViewCreate).toHaveBeenCalledWith({
      data: { viewerId: "viewer", profileUserId: "owner", sourcePostId: null },
    });
  });

  it("ignores a malformed source id without looking it up", async () => {
    await visit("owner", { sourcePostId: "x'; drop table--" });
    expect(mockPostFindFirst).not.toHaveBeenCalled();
    expect(mockProfileViewCreate).toHaveBeenCalledWith({
      data: { viewerId: "viewer", profileUserId: "owner", sourcePostId: null },
    });
  });

  it("records nothing for the viewer's own profile", async () => {
    const response = await visit("viewer", { sourcePostId: "post_1" });
    expect(response.status).toBe(200);
    expect(mockProfileViewCreate).not.toHaveBeenCalled();
  });

  it("needs a signed-in viewer", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const response = await visit("owner");
    expect(response.status).toBe(401);
    expect(mockProfileViewCreate).not.toHaveBeenCalled();
  });

  it("answers 404 for an unknown or inactive profile", async () => {
    mockUserFindUnique.mockResolvedValue(null);
    const response = await visit("missing");
    expect(response.status).toBe(404);
    expect(mockProfileViewCreate).not.toHaveBeenCalled();
  });

  it("rate-limits a burst", async () => {
    for (let index = 0; index < 60; index += 1) await visit("owner");
    const response = await visit("owner");
    expect(response.status).toBe(429);
    expect(mockProfileViewCreate).toHaveBeenCalledTimes(60);
  });
});
