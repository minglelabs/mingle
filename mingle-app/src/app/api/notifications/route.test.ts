import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const {
  mockGetServerSession,
  mockNotificationFindMany,
  mockNotificationCount,
  mockUserFollowFindMany,
} = vi.hoisted(() => ({
  mockGetServerSession: vi.fn(),
  mockNotificationFindMany: vi.fn(),
  mockNotificationCount: vi.fn(),
  mockUserFollowFindMany: vi.fn(),
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
      findMany: mockNotificationFindMany,
      count: mockNotificationCount,
    },
    userFollow: {
      findMany: mockUserFollowFindMany,
    },
  },
}));

import { GET } from "@/app/api/notifications/route";

describe("/api/notifications route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetServerSession.mockResolvedValue({ user: { id: "user_123" } });
    mockNotificationFindMany.mockResolvedValue([
      {
        id: "notification_1",
        type: "follow",
        readAt: null,
        createdAt: new Date("2026-08-15T10:00:00.000Z"),
        actor: {
          id: "actor_1",
          handle: "mina.song",
          name: "Mina",
          image: "https://example.com/mina.png",
        },
      },
      {
        id: "notification_2",
        type: "follow",
        readAt: new Date("2026-08-14T10:00:00.000Z"),
        createdAt: new Date("2026-08-14T10:00:00.000Z"),
        actor: {
          id: "actor_2",
          handle: "alex",
          name: "Alex",
          image: null,
        },
      },
    ]);
    mockNotificationCount.mockResolvedValue(1);
    mockUserFollowFindMany.mockResolvedValue([{ followingId: "actor_2" }]);
  });

  it("returns the viewer's follow notifications with current follow state", async () => {
    const response = await GET(new NextRequest("https://example.com/api/notifications?limit=2"));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      notifications: [
        {
          id: "notification_1",
          type: "follow",
          isRead: false,
          createdAt: "2026-08-15T10:00:00.000Z",
          actor: {
            id: "actor_1",
            handle: "mina.song",
            name: "Mina",
            image: "https://example.com/mina.png",
          },
          isFollowing: false,
        },
        {
          id: "notification_2",
          type: "follow",
          isRead: true,
          createdAt: "2026-08-14T10:00:00.000Z",
          actor: {
            id: "actor_2",
            handle: "alex",
            name: "Alex",
            image: null,
          },
          isFollowing: true,
        },
      ],
      unreadCount: 1,
    });
    expect(mockNotificationFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { recipientId: "user_123", type: "follow" },
      take: 2,
      orderBy: [{ readAt: "asc" }, { createdAt: "desc" }],
    }));
    expect(mockUserFollowFindMany).toHaveBeenCalledWith({
      where: {
        followerId: "user_123",
        followingId: { in: ["actor_1", "actor_2"] },
      },
      select: { followingId: true },
    });
  });

  it("requires an authenticated viewer", async () => {
    mockGetServerSession.mockResolvedValue(null);

    const response = await GET(new NextRequest("https://example.com/api/notifications"));

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "unauthorized" });
    expect(mockNotificationFindMany).not.toHaveBeenCalled();
  });
});
