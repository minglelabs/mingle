import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const {
  mockGetServerSession,
  mockUserFindUnique,
  mockUserReportCreate,
} = vi.hoisted(() => ({
  mockGetServerSession: vi.fn(),
  mockUserFindUnique: vi.fn(),
  mockUserReportCreate: vi.fn(),
}));

vi.mock("next-auth", () => ({
  getServerSession: mockGetServerSession,
}));

vi.mock("@/lib/auth-options", () => ({
  getAuthOptions: () => ({}),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: mockUserFindUnique },
    userReport: { create: mockUserReportCreate },
  },
}));

import { POST } from "@/app/api/users/[userId]/report/route";

describe("/api/users/[userId]/report route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetServerSession.mockResolvedValue({ user: { id: "user_123" } });
    mockUserFindUnique.mockResolvedValue({ id: "user_456" });
    mockUserReportCreate.mockResolvedValue({ id: "report_123", status: "open" });
  });

  it("creates a report with an optional message", async () => {
    const response = await POST(
      new NextRequest("https://example.com/api/users/user_456/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "harassment", message: "불쾌한 메시지를 반복해서 보냈습니다." }),
      }),
      { params: Promise.resolve({ userId: "user_456" }) },
    );

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ reportId: "report_123", status: "open" });
    expect(mockUserReportCreate).toHaveBeenCalledWith({
      data: {
        reporterId: "user_123",
        reportedUserId: "user_456",
        reason: "harassment",
        message: "불쾌한 메시지를 반복해서 보냈습니다.",
      },
      select: { id: true, status: true },
    });
  });

  it("rejects an unsupported reason", async () => {
    const response = await POST(
      new NextRequest("https://example.com/api/users/user_456/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "not-a-reason" }),
      }),
      { params: Promise.resolve({ userId: "user_456" }) },
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid_reason" });
    expect(mockUserReportCreate).not.toHaveBeenCalled();
  });

  it("rejects a non-string message", async () => {
    const response = await POST(
      new NextRequest("https://example.com/api/users/user_456/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "other", message: 123 }),
      }),
      { params: Promise.resolve({ userId: "user_456" }) },
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid_message" });
    expect(mockUserReportCreate).not.toHaveBeenCalled();
  });

  it("returns not found when reporting a missing user", async () => {
    mockUserFindUnique.mockResolvedValue(null);

    const response = await POST(
      new NextRequest("https://example.com/api/users/missing/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "spam" }),
      }),
      { params: Promise.resolve({ userId: "missing" }) },
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "user_not_found" });
    expect(mockUserReportCreate).not.toHaveBeenCalled();
  });
});
