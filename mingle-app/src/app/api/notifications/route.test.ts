import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const {
  mockGetServerSession,
  mockNotificationFindMany,
  mockNotificationUpdateMany,
} = vi.hoisted(() => ({
  mockGetServerSession: vi.fn(),
  mockNotificationFindMany: vi.fn(),
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
      findMany: mockNotificationFindMany,
      updateMany: mockNotificationUpdateMany,
    },
  },
}));

import { GET, PATCH } from "@/app/api/notifications/route";

function actor(id: string) {
  return { id, handle: `${id}.h`, name: id, image: null };
}

describe("/api/notifications route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetServerSession.mockResolvedValue({ user: { id: "user_123" } });
    mockNotificationUpdateMany.mockResolvedValue({ count: 3 });
  });

  it("returns all notification types and groups likes per target", async () => {
    // Two likes on the same post collapse into one entry; a comment stays separate.
    mockNotificationFindMany.mockResolvedValue([
      { id: "n3", type: "comment", postId: "p1", commentId: "c9", readAt: null, createdAt: new Date("2026-08-15T12:00:00.000Z"), actor: actor("a3") },
      { id: "n2", type: "post_like", postId: "p1", commentId: null, readAt: null, createdAt: new Date("2026-08-15T11:00:00.000Z"), actor: actor("a2") },
      { id: "n1", type: "post_like", postId: "p1", commentId: null, readAt: new Date("2026-08-15T10:00:00.000Z"), createdAt: new Date("2026-08-15T10:00:00.000Z"), actor: actor("a1") },
    ]);

    const response = await GET(new NextRequest("https://example.com/api/notifications?limit=30"));
    expect(response.status).toBe(200);
    const body = await response.json();

    expect(body.notifications).toHaveLength(2);
    const [comment, like] = body.notifications;
    expect(comment.type).toBe("comment");
    expect(comment.actorCount).toBe(1);
    expect(like.type).toBe("post_like");
    expect(like.postId).toBe("p1");
    expect(like.actorCount).toBe(2); // two distinct likers on the same post
    expect(body.unreadCount).toBe(2); // comment + grouped like both have an unread row
    expect(body.hasMore).toBe(false);
    expect(body.nextCursor).toBeNull();
  });

  it("paginates with a cursor when more rows exist", async () => {
    const rows = Array.from({ length: 31 }, (_, i) => ({
      id: `n${i}`,
      type: "follow",
      postId: null,
      commentId: null,
      readAt: null,
      createdAt: new Date(2026, 7, 15, 12, 0, 31 - i),
      actor: actor(`a${i}`),
    }));
    mockNotificationFindMany.mockResolvedValue(rows);

    const response = await GET(new NextRequest("https://example.com/api/notifications?limit=30"));
    const body = await response.json();
    expect(body.hasMore).toBe(true);
    expect(body.nextCursor).toBe("n29");
    expect(body.notifications).toHaveLength(30);
  });

  it("requires an authenticated viewer", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const response = await GET(new NextRequest("https://example.com/api/notifications"));
    expect(response.status).toBe(401);
    expect(mockNotificationFindMany).not.toHaveBeenCalled();
  });

  it("marks every unread notification (all types) as read on entry", async () => {
    const response = await PATCH();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ isRead: true, updatedCount: 3 });
    expect(mockNotificationUpdateMany).toHaveBeenCalledWith({
      where: { recipientId: "user_123", readAt: null },
      data: { readAt: expect.any(Date) },
    });
  });

  it("requires an authenticated viewer when marking read", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const response = await PATCH();
    expect(response.status).toBe(401);
    expect(mockNotificationUpdateMany).not.toHaveBeenCalled();
  });
});
