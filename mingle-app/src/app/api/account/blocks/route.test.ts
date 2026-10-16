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
import { USER_IDENTITY_SELECT } from "@/server/identity/user-identity-select";

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
        blocked: { select: USER_IDENTITY_SELECT },
      },
    });
  });

  it("shows a blocked operator account like any other user", async () => {
    mockUserBlockFindMany.mockResolvedValue([
      {
        id: "block_1",
        createdAt: new Date("2026-08-13T00:00:00.000Z"),
        blocked: { id: "op", handle: "mingle.mina", name: "Mina", image: null, imageCropScale: 1, imageCropX: 0, imageCropY: 0, isOfficial: false, isOperator: true },
      },
      {
        id: "block_2",
        createdAt: new Date("2026-08-12T00:00:00.000Z"),
        blocked: { id: "member", handle: "fan", name: "Fan", image: null, imageCropScale: 1, imageCropX: 0, imageCropY: 0, isOfficial: false, isOperator: false },
      },
    ]);

    const { blocks } = await (await GET()).json();

    expect(blocks[0].user).toEqual({ id: "op", handle: "mingle.mina", name: "Mina", image: null });
    expect(blocks[1].user).toEqual({ id: "member", handle: "fan", name: "Fan", image: null });
  });

  it("requires authentication", async () => {
    mockGetServerSession.mockResolvedValue(null);

    const response = await GET();

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "unauthorized" });
    expect(mockUserBlockFindMany).not.toHaveBeenCalled();
  });
});
