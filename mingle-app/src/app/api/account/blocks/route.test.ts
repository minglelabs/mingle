import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetServerSession, mockUserBlockFindMany } = vi.hoisted(() => ({
  mockGetServerSession: vi.fn(),
  mockUserBlockFindMany: vi.fn(),
}));

vi.mock("next-auth", () => ({
  getServerSession: mockGetServerSession,
}));

vi.mock("@/lib/auth-options", () => ({
  getAuthOptions: () => ({}),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: { userBlock: { findMany: mockUserBlockFindMany } },
}));

import { GET } from "@/app/api/account/blocks/route";

describe("/api/account/blocks route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetServerSession.mockResolvedValue({ user: { id: "user_123" } });
    mockUserBlockFindMany.mockResolvedValue([
      {
        id: "block_123",
        createdAt: new Date("2026-08-13T00:00:00.000Z"),
        blocked: { id: "user_456", handle: "mina.song", name: "미나", image: null },
      },
    ]);
  });

  it("lists the current user's blocks", async () => {
    const response = await GET();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      blocks: [{
        id: "block_123",
        createdAt: "2026-08-13T00:00:00.000Z",
        user: { id: "user_456", handle: "mina.song", name: "미나", image: null },
      }],
    });
    expect(mockUserBlockFindMany).toHaveBeenCalledWith({
      where: { blockerId: "user_123" },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        createdAt: true,
        blocked: { select: { id: true, handle: true, name: true, image: true } },
      },
    });
  });

  it("requires authentication", async () => {
    mockGetServerSession.mockResolvedValue(null);

    const response = await GET();

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "unauthorized" });
    expect(mockUserBlockFindMany).not.toHaveBeenCalled();
  });
});
