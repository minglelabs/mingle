import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetServerSession, mockUserReportFindMany } = vi.hoisted(() => ({
  mockGetServerSession: vi.fn(),
  mockUserReportFindMany: vi.fn(),
}));

vi.mock("next-auth", () => ({
  getServerSession: mockGetServerSession,
}));

vi.mock("@/lib/auth-options", () => ({
  getAuthOptions: () => ({}),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: { userReport: { findMany: mockUserReportFindMany } },
}));

import { GET } from "@/app/api/account/reports/route";

describe("/api/account/reports route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetServerSession.mockResolvedValue({ user: { id: "user_123" } });
    mockUserReportFindMany.mockResolvedValue([
      {
        id: "report_123",
        reason: "spam",
        message: "도배 메시지입니다.",
        status: "in_review",
        createdAt: new Date("2026-08-13T00:00:00.000Z"),
        updatedAt: new Date("2026-08-13T01:00:00.000Z"),
        reportedUser: { id: "user_456", handle: "mina.song", name: "미나", image: null },
        replies: [{
          id: "reply_123",
          authorType: "team",
          message: "확인 중입니다.",
          createdAt: new Date("2026-08-13T02:00:00.000Z"),
        }],
      },
    ]);
  });

  it("returns report threads with team replies", async () => {
    const response = await GET();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      reports: [{
        id: "report_123",
        reason: "spam",
        message: "도배 메시지입니다.",
        status: "in_review",
        createdAt: "2026-08-13T00:00:00.000Z",
        updatedAt: "2026-08-13T01:00:00.000Z",
        reportedUser: { id: "user_456", handle: "mina.song", name: "미나", image: null },
        replies: [{
          id: "reply_123",
          authorType: "team",
          message: "확인 중입니다.",
          createdAt: "2026-08-13T02:00:00.000Z",
        }],
      }],
    });
  });

  it("requires authentication", async () => {
    mockGetServerSession.mockResolvedValue(null);

    const response = await GET();

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "unauthorized" });
    expect(mockUserReportFindMany).not.toHaveBeenCalled();
  });
});
