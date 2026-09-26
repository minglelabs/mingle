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

  it("scopes only by reporter so post and comment report replies are included too", async () => {
    mockUserReportFindMany.mockResolvedValue([
      {
        id: "report_post",
        reason: "harassment",
        message: null,
        status: "resolved",
        createdAt: new Date("2026-08-14T00:00:00.000Z"),
        updatedAt: new Date("2026-08-14T01:00:00.000Z"),
        reportedUser: { id: "author_1", handle: "author.one", name: "Author", image: null },
        replies: [{
          id: "reply_post",
          authorType: "team",
          message: "게시물 신고 처리했습니다.",
          createdAt: new Date("2026-08-14T02:00:00.000Z"),
        }],
      },
    ]);

    const response = await GET();
    const body = await response.json();

    // The route filters purely on reporterId — target type never enters the where.
    expect(mockUserReportFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { reporterId: "user_123" } }),
    );
    expect(body.reports[0].replies).toEqual([{
      id: "reply_post",
      authorType: "team",
      message: "게시물 신고 처리했습니다.",
      createdAt: "2026-08-14T02:00:00.000Z",
    }]);
  });
});
