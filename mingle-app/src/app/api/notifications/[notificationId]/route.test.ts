import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const {
  mockGetServerSession,
  mockNotificationUpdateMany,
} = vi.hoisted(() => ({
  mockGetServerSession: vi.fn(),
  mockNotificationUpdateMany: vi.fn(),
}));

vi.mock("next-auth", () => ({
  getServerSession: mockGetServerSession,
}));

vi.mock("@/lib/auth-options", () => ({
  getAuthOptions: () => ({}),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    userNotification: {
      updateMany: mockNotificationUpdateMany,
    },
  },
}));

import { PATCH } from "@/app/api/notifications/[notificationId]/route";

describe("/api/notifications/[notificationId] route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetServerSession.mockResolvedValue({ user: { id: "user_123" } });
    mockNotificationUpdateMany.mockResolvedValue({ count: 1 });
  });

  it("marks only the viewer's unread follow notification as read", async () => {
    const response = await PATCH(
      new NextRequest("https://example.com/api/notifications/notification_1", { method: "PATCH" }),
      { params: Promise.resolve({ notificationId: "notification_1" }) },
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ isRead: true });
    expect(mockNotificationUpdateMany).toHaveBeenCalledWith({
      where: {
        id: "notification_1",
        recipientId: "user_123",
        type: "follow",
        readAt: null,
      },
      data: { readAt: expect.any(Date) },
    });
  });

  it("requires an authenticated viewer", async () => {
    mockGetServerSession.mockResolvedValue(null);

    const response = await PATCH(
      new NextRequest("https://example.com/api/notifications/notification_1", { method: "PATCH" }),
      { params: Promise.resolve({ notificationId: "notification_1" }) },
    );

    expect(response.status).toBe(401);
    expect(mockNotificationUpdateMany).not.toHaveBeenCalled();
  });
});
