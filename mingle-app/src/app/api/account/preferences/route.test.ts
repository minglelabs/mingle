import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockGetServerSession,
  mockUserFindUnique,
  mockUserUpdateMany,
} = vi.hoisted(() => ({
  mockGetServerSession: vi.fn(),
  mockUserFindUnique: vi.fn(),
  mockUserUpdateMany: vi.fn(),
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
      updateMany: mockUserUpdateMany,
    },
  },
}));

import { GET, PATCH } from "@/app/api/account/preferences/route";

describe("/api/account/preferences route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 for unauthenticated GET requests", async () => {
    mockGetServerSession.mockResolvedValue(null);

    const response = await GET(new Request("https://example.com/api/account/preferences"));
    const json = await response.json();

    expect(response.status).toBe(401);
    expect(json).toEqual({ error: "unauthorized" });
  });

  it("returns the stored DB-backed preferences for authenticated users", async () => {
    mockGetServerSession.mockResolvedValue({
      user: {
        id: "user_123",
        email: "user@example.com",
      },
    });
    mockUserFindUnique.mockResolvedValue({
      demoTextSizeLevel: 4,
      demoSilenceFinalizeMs: 1000,
      translationModel: "qwen/qwen3.5-9b",
    });

    const response = await GET(new Request("https://example.com/api/account/preferences"));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({
      textSizeLevel: 4,
      sonioxManualFinalizeSilenceMs: 1000,
      translationModel: "qwen/qwen3.5-9b",
    });
    expect(mockUserFindUnique).toHaveBeenCalledWith({
      where: { id: "user_123" },
      select: {
        demoTextSizeLevel: true,
        demoSilenceFinalizeMs: true,
        translationModel: true,
      },
    });
  });

  it("falls back to the 500ms DB default when silence finalize is unset", async () => {
    mockGetServerSession.mockResolvedValue({
      user: {
        id: "user_123",
        email: "user@example.com",
      },
    });
    mockUserFindUnique.mockResolvedValue({
      demoTextSizeLevel: null,
      demoSilenceFinalizeMs: null,
      translationModel: null,
    });

    const response = await GET(new Request("https://example.com/api/account/preferences"));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({
      textSizeLevel: 2,
      sonioxManualFinalizeSilenceMs: 500,
      translationModel: "gemini-2.5-flash-lite",
    });
  });

  it("clamps and persists silence finalize updates through PATCH", async () => {
    mockGetServerSession.mockResolvedValue({
      user: {
        id: "user_123",
        email: "user@example.com",
      },
    });
    mockUserUpdateMany.mockResolvedValue({ count: 1 });

    const response = await PATCH(new Request("https://example.com/api/account/preferences", {
      method: "PATCH",
      body: JSON.stringify({
        sonioxManualFinalizeSilenceMs: 99999,
      }),
    }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({ ok: true });
    expect(mockUserUpdateMany).toHaveBeenCalledWith({
      where: { id: "user_123" },
      data: {
        demoSilenceFinalizeMs: 3000,
      },
    });
  });

  it("persists a supported translation model through PATCH", async () => {
    mockGetServerSession.mockResolvedValue({
      user: {
        id: "user_123",
        email: "user@example.com",
      },
    });
    mockUserUpdateMany.mockResolvedValue({ count: 1 });

    const response = await PATCH(new Request("https://example.com/api/account/preferences", {
      method: "PATCH",
      body: JSON.stringify({
        translationModel: "qwen/qwen3.5-9b",
      }),
    }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({ ok: true });
    expect(mockUserUpdateMany).toHaveBeenCalledWith({
      where: { id: "user_123" },
      data: {
        translationModel: "qwen/qwen3.5-9b",
      },
    });
  });

  it("returns the stored DB-backed preferences for tracking users without a session", async () => {
    mockGetServerSession.mockResolvedValue(null);
    mockUserFindUnique.mockResolvedValue({
      demoTextSizeLevel: 3,
      demoSilenceFinalizeMs: 1500,
      translationModel: "qwen/qwen3.5-9b",
    });

    const response = await GET(new Request("https://example.com/api/account/preferences", {
      headers: {
        "x-mingle-user-id": "anon_test_user",
      },
    }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({
      textSizeLevel: 3,
      sonioxManualFinalizeSilenceMs: 1500,
      translationModel: "qwen/qwen3.5-9b",
    });
    expect(mockUserFindUnique).toHaveBeenCalledWith({
      where: { externalUserId: "anon_test_user" },
      select: {
        demoTextSizeLevel: true,
        demoSilenceFinalizeMs: true,
        translationModel: true,
      },
    });
  });

  it("persists a supported translation model for tracking users without a session", async () => {
    mockGetServerSession.mockResolvedValue(null);
    mockUserUpdateMany.mockResolvedValue({ count: 0 }).mockResolvedValueOnce({ count: 1 });

    const response = await PATCH(new Request("https://example.com/api/account/preferences", {
      method: "PATCH",
      headers: {
        "x-mingle-user-id": "anon_test_user",
      },
      body: JSON.stringify({
        translationModel: "qwen/qwen3.5-9b",
      }),
    }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({ ok: true });
    expect(mockUserUpdateMany).toHaveBeenCalledWith({
      where: { externalUserId: "anon_test_user" },
      data: {
        translationModel: "qwen/qwen3.5-9b",
      },
    });
  });
});
