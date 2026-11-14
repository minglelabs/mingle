import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { mockGetServerSession, mockUserFindUnique, mockUserFindMany, mockQueryRaw } = vi.hoisted(() => ({
  mockGetServerSession: vi.fn(),
  mockUserFindUnique: vi.fn(),
  mockUserFindMany: vi.fn(),
  mockQueryRaw: vi.fn(),
}));

vi.mock("next-auth", () => ({ getServerSession: mockGetServerSession }));
vi.mock("@/lib/auth-options", () => ({ getAuthOptions: () => ({}) }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    $queryRaw: mockQueryRaw,
    user: { findUnique: mockUserFindUnique, findMany: mockUserFindMany },
  },
}));

import { GET } from "@/app/api/users/discover/route";
import { GET as getIos } from "@/app/api/ios/v2.2.0/users/discover/route";
import { GET as getAndroid } from "@/app/api/android/v2.2.0/users/discover/route";

const request = (query = "") => new NextRequest(`https://example.com/api/users/discover${query}`);

describe("/api/users/discover route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetServerSession.mockResolvedValue({ user: { id: "viewer" } });
    mockUserFindUnique.mockResolvedValue({ nationalityCountry: "US", nationality: null, primaryLanguages: ["en"] });
  });

  it("is served unchanged from the mobile namespaces", () => {
    expect(getIos).toBe(GET);
    expect(getAndroid).toBe(GET);
  });

  it("requires a signed-in viewer", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const response = await GET(request());
    expect(response.status).toBe(401);
    expect(mockQueryRaw).not.toHaveBeenCalled();
  });

  it("rejects a malformed cursor before querying", async () => {
    const response = await GET(request("?cursor=garbage"));
    expect(response.status).toBe(400);
    expect(mockQueryRaw).not.toHaveBeenCalled();
  });

  it("ranks Korean speakers first for a foreign viewer and serializes the card fields", async () => {
    const now = Date.now();
    mockQueryRaw.mockResolvedValue([
      { id: "mina", tier: 0, lastSeenAt: new Date(now - 60_000) },
      { id: "yuki", tier: 2, lastSeenAt: new Date(now - 120_000) },
    ]);
    mockUserFindMany.mockResolvedValue([
      {
        id: "yuki", handle: "yuki", name: "Yuki", image: null, imageCropScale: null, imageCropX: null, imageCropY: null,
        isOfficial: false, isOperator: false, birthDate: null, gender: null, nationality: null, nationalityCountry: null,
        primaryLanguages: ["ja"], interestLanguages: [], interestLanguageLevels: [],
        createdAt: new Date(now - 90 * 86_400_000), lastSeenAt: new Date(now - 72 * 3_600_000),
      },
      {
        id: "mina", handle: "mina", name: "Mina", image: "https://cdn.example/mina.jpg", imageCropScale: 1, imageCropX: 0, imageCropY: 0,
        isOfficial: false, isOperator: false, birthDate: new Date("2000-01-01T00:00:00.000Z"), gender: "female",
        nationality: null, nationalityCountry: "KR", primaryLanguages: ["ko"], interestLanguages: ["en", "ko"], interestLanguageLevels: [3, 5],
        createdAt: new Date(now - 2 * 86_400_000), lastSeenAt: new Date(now - 60_000),
      },
    ]);

    const response = await GET(request("?locale=en"));
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    const payload = await response.json();

    const sql = mockQueryRaw.mock.calls[0][0] as { sql: string };
    expect(sql.sql.replace(/\s+/g, " ")).toMatch(/THEN 0 ELSE 2 END/);
    expect(payload.nextCursor).toBeNull();
    expect(payload.users.map((user: { id: string }) => user.id)).toEqual(["mina", "yuki"]);
    expect(payload.users[0]).toMatchObject({
      id: "mina",
      name: "Mina",
      gender: "female",
      nationalityCountry: "KR",
      primaryLanguages: ["ko"],
      interestLanguages: [{ code: "en", level: 3 }],
      badge: "new",
    });
    expect(typeof payload.users[0].age).toBe("number");
    expect(payload.users[1]).toMatchObject({ id: "yuki", nationalityCountry: "JP", primaryLanguages: ["ja"] });
    expect(payload.users[1]).not.toHaveProperty("age");
    expect(payload.users[1]).not.toHaveProperty("badge");
    expect(payload.users[1]).not.toHaveProperty("isOperator");
  });

  it("ranks foreigners first for a Korean viewer", async () => {
    mockUserFindUnique.mockResolvedValue({ nationalityCountry: "KR", nationality: null, primaryLanguages: ["ko"] });
    mockQueryRaw.mockResolvedValue([]);
    const payload = await (await GET(request())).json();
    expect(payload).toEqual({ users: [], nextCursor: null });
    const sql = mockQueryRaw.mock.calls[0][0] as { sql: string };
    expect(sql.sql.replace(/\s+/g, " ")).toMatch(/THEN 2 ELSE 0 END/);
    expect(mockUserFindMany).not.toHaveBeenCalled();
  });

  it("returns a keyset cursor when there is another page", async () => {
    const base = Date.now();
    mockQueryRaw.mockResolvedValue(Array.from({ length: 21 }, (_, index) => ({
      id: `u${index}`, tier: 1, lastSeenAt: new Date(base - index * 1000),
    })));
    mockUserFindMany.mockResolvedValue([]);
    const payload = await (await GET(request())).json();
    const decoded = JSON.parse(Buffer.from(payload.nextCursor, "base64url").toString("utf8"));
    expect(decoded).toEqual({ tier: 1, lastSeenAt: new Date(base - 19_000).toISOString(), id: "u19" });
  });
});
