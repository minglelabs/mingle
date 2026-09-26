import { describe, expect, it, vi } from "vitest";
import {
  clearRecentSearches,
  deleteRecentSearch,
  listRecentSearches,
  normalizeRecentSearchQuery,
  recordRecentSearch,
  RECENT_SEARCH_LIMIT,
  RECENT_SEARCH_RETENTION_DAYS,
  type RecentSearchPrisma,
} from "./recent-search-service";

function mockPrisma(overrides: Partial<RecentSearchPrisma["recentSearch"]> = {}): RecentSearchPrisma {
  return {
    recentSearch: {
      findMany: vi.fn().mockResolvedValue([]),
      upsert: vi.fn().mockResolvedValue(undefined),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      ...overrides,
    },
  } as unknown as RecentSearchPrisma;
}

describe("normalizeRecentSearchQuery", () => {
  it("trims, collapses whitespace and caps length", () => {
    expect(normalizeRecentSearchQuery("  hello   world  ")).toBe("hello world");
    expect(normalizeRecentSearchQuery("a".repeat(200)).length).toBe(80);
    expect(normalizeRecentSearchQuery("   ")).toBe("");
    expect(normalizeRecentSearchQuery(42)).toBe("");
  });
});

describe("listRecentSearches", () => {
  it("queries newest-first, limited, within the retention window", async () => {
    const prisma = mockPrisma({
      findMany: vi.fn().mockResolvedValue([
        { query: "mina", searchedAt: new Date("2026-09-20T00:00:00.000Z") },
      ]),
    });
    const now = new Date("2026-09-26T00:00:00.000Z");
    const result = await listRecentSearches(prisma, "user_1", now);

    expect(result).toEqual([{ query: "mina", searchedAt: "2026-09-20T00:00:00.000Z" }]);
    const args = (prisma.recentSearch.findMany as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(args).toMatchObject({
      orderBy: { searchedAt: "desc" },
      take: RECENT_SEARCH_LIMIT,
    });
    const cutoff = args.where.searchedAt.gte as Date;
    const expectedCutoff = new Date(now.getTime() - RECENT_SEARCH_RETENTION_DAYS * 86_400_000);
    expect(cutoff.getTime()).toBe(expectedCutoff.getTime());
  });
});

describe("recordRecentSearch", () => {
  it("upserts on (userId, query) refreshing searchedAt", async () => {
    const prisma = mockPrisma();
    const now = new Date("2026-09-26T00:00:00.000Z");
    const stored = await recordRecentSearch(prisma, "user_1", "  Mina  ", now);

    expect(stored).toBe("Mina");
    expect(prisma.recentSearch.upsert).toHaveBeenCalledWith({
      where: { userId_query: { userId: "user_1", query: "Mina" } },
      create: { userId: "user_1", query: "Mina", searchedAt: now },
      update: { searchedAt: now },
    });
  });

  it("is a no-op for a blank query", async () => {
    const prisma = mockPrisma();
    expect(await recordRecentSearch(prisma, "user_1", "   ")).toBeNull();
    expect(prisma.recentSearch.upsert).not.toHaveBeenCalled();
  });
});

describe("deleteRecentSearch / clearRecentSearches", () => {
  it("deletes one term", async () => {
    const prisma = mockPrisma({ deleteMany: vi.fn().mockResolvedValue({ count: 1 }) });
    expect(await deleteRecentSearch(prisma, "user_1", "mina")).toBe(1);
    expect(prisma.recentSearch.deleteMany).toHaveBeenCalledWith({ where: { userId: "user_1", query: "mina" } });
  });

  it("clears all terms", async () => {
    const prisma = mockPrisma({ deleteMany: vi.fn().mockResolvedValue({ count: 3 }) });
    expect(await clearRecentSearches(prisma, "user_1")).toBe(3);
    expect(prisma.recentSearch.deleteMany).toHaveBeenCalledWith({ where: { userId: "user_1" } });
  });
});
