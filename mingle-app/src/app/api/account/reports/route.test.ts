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
import { USER_IDENTITY_SELECT } from "@/server/identity/user-identity-select";

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

  it("labels a reported operator account and asks the DB for the badge flags", async () => {
    mockUserReportFindMany.mockResolvedValue([
      {
        id: "report_op",
        reason: "spam",
        message: null,
        status: "pending",
        createdAt: new Date("2026-08-15T00:00:00.000Z"),
        updatedAt: new Date("2026-08-15T00:00:00.000Z"),
        reportedUser: { id: "op", handle: "mingle.mina", name: "Mina", image: null, imageCropScale: 1, imageCropX: 0, imageCropY: 0, isOfficial: false, isOperator: true },
        replies: [],
      },
      {
        id: "report_member",
        reason: "spam",
        message: null,
        status: "pending",
        createdAt: new Date("2026-08-14T00:00:00.000Z"),
        updatedAt: new Date("2026-08-14T00:00:00.000Z"),
        reportedUser: { id: "member", handle: "fan", name: "Fan", image: null, imageCropScale: 1, imageCropX: 0, imageCropY: 0, isOfficial: false, isOperator: false },
        replies: [],
      },
    ]);

    const { reports } = await (await GET()).json();

    expect(reports[0].reportedUser).toEqual({ id: "op", handle: "mingle.mina", name: "Mina", image: null, isOperator: true });
    expect(reports[1].reportedUser).toEqual({ id: "member", handle: "fan", name: "Fan", image: null });
    expect(mockUserReportFindMany.mock.calls[0][0].select.reportedUser).toEqual({ select: USER_IDENTITY_SELECT });
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
