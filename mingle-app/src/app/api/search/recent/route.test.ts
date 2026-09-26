import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const {
  mockGetServerSession,
  mockFindMany,
  mockUpsert,
  mockDeleteMany,
} = vi.hoisted(() => ({
  mockGetServerSession: vi.fn(),
  mockFindMany: vi.fn(),
  mockUpsert: vi.fn(),
  mockDeleteMany: vi.fn(),
}));

vi.mock("next-auth", () => ({ getServerSession: mockGetServerSession }));
vi.mock("@/lib/auth-options", () => ({ getAuthOptions: () => ({}) }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    recentSearch: {
      findMany: mockFindMany,
      upsert: mockUpsert,
      deleteMany: mockDeleteMany,
    },
  },
}));

import { GET, POST, DELETE } from "@/app/api/search/recent/route";

describe("/api/search/recent route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetServerSession.mockResolvedValue({ user: { id: "user_1" } });
    mockFindMany.mockResolvedValue([]);
    mockUpsert.mockResolvedValue(undefined);
    mockDeleteMany.mockResolvedValue({ count: 0 });
  });

  it("returns unauthorized when signed out (recent searches are hidden)", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const response = await GET();
    expect(response.status).toBe(401);
    expect(mockFindMany).not.toHaveBeenCalled();
  });

  it("lists recent searches for the account", async () => {
    mockFindMany.mockResolvedValue([{ query: "mina", searchedAt: new Date("2026-09-20T00:00:00.000Z") }]);
    const response = await GET();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ searches: [{ query: "mina", searchedAt: "2026-09-20T00:00:00.000Z" }] });
  });

  it("records a searched term and returns the refreshed list", async () => {
    mockFindMany.mockResolvedValue([{ query: "mina", searchedAt: new Date("2026-09-26T00:00:00.000Z") }]);
    const response = await POST(new NextRequest("https://example.com/api/search/recent", {
      method: "POST",
      body: JSON.stringify({ query: "  mina  " }),
    }));
    expect(response.status).toBe(200);
    expect(mockUpsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId_query: { userId: "user_1", query: "mina" } },
    }));
  });

  it("rejects a blank recorded term", async () => {
    const response = await POST(new NextRequest("https://example.com/api/search/recent", {
      method: "POST",
      body: JSON.stringify({ query: "   " }),
    }));
    expect(response.status).toBe(400);
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it("clears all terms with ?all=true", async () => {
    const response = await DELETE(new NextRequest("https://example.com/api/search/recent?all=true", { method: "DELETE" }));
    expect(response.status).toBe(200);
    expect(mockDeleteMany).toHaveBeenCalledWith({ where: { userId: "user_1" } });
    expect(await response.json()).toEqual({ searches: [] });
  });

  it("deletes one term with ?q=", async () => {
    const response = await DELETE(new NextRequest("https://example.com/api/search/recent?q=mina", { method: "DELETE" }));
    expect(response.status).toBe(200);
    expect(mockDeleteMany).toHaveBeenCalledWith({ where: { userId: "user_1", query: "mina" } });
  });
});
