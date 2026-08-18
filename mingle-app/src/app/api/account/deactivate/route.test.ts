import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockGetServerSession,
  mockUserUpdate,
  mockUserUpdateMany,
} = vi.hoisted(() => {
  return {
    mockGetServerSession: vi.fn(),
    mockUserUpdate: vi.fn(),
    mockUserUpdateMany: vi.fn(),
  };
});

vi.mock("next-auth", () => ({
  getServerSession: mockGetServerSession,
}));

vi.mock("@/lib/auth-options", () => ({
  getAuthOptions: () => ({}),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      update: mockUserUpdate,
      updateMany: mockUserUpdateMany,
    },
  },
}));

import { POST } from "@/app/api/account/deactivate/route";

describe("/api/account/deactivate route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when session is missing", async () => {
    mockGetServerSession.mockResolvedValue(null);

    const response = await POST();
    const json = await response.json();

    expect(response.status).toBe(401);
    expect(json).toEqual({ error: "unauthorized" });
    expect(mockUserUpdate).not.toHaveBeenCalled();
  });

  it("deactivates user by id successfully", async () => {
    mockGetServerSession.mockResolvedValue({
      user: { id: "user_123", email: "test@example.com" },
    });
    mockUserUpdate.mockResolvedValue({ id: "user_123", isActive: false });

    const response = await POST();
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({ ok: true, updatedUsers: 1 });
    expect(mockUserUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "user_123" },
        data: expect.objectContaining({
          isActive: false,
        }),
      }),
    );
  });

  it("falls back to deactivating by email if id lookup fails", async () => {
    mockGetServerSession.mockResolvedValue({
      user: { id: "missing_id", email: "test@example.com" },
    });
    mockUserUpdate.mockRejectedValue(new Error("Record not found"));
    mockUserUpdateMany.mockResolvedValue({ count: 1 });

    const response = await POST();
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({ ok: true, updatedUsers: 1 });
    expect(mockUserUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { email: "test@example.com" },
        data: expect.objectContaining({
          isActive: false,
        }),
      }),
    );
  });
});
