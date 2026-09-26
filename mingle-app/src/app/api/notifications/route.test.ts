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

  it("marks every unread notification (all types) up to now when no snapshot is sent", async () => {
    const response = await PATCH();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ isRead: true, updatedCount: 3 });
    expect(mockNotificationUpdateMany).toHaveBeenCalledWith({
      where: { recipientId: "user_123", readAt: null, createdAt: { lte: expect.any(Date) } },
      data: { readAt: expect.any(Date) },
    });
  });

  it("marks read only what had arrived by the list read (before snapshot)", async () => {
    const before = "2026-09-26T10:00:00.000Z";
    const response = await PATCH(new Request("https://example.com/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ before }),
    }));
    expect(response.status).toBe(200);
    const where = mockNotificationUpdateMany.mock.calls[0][0].where;
    expect(where.createdAt.lte.toISOString()).toBe(before);
    // Not scoped by the list visibility: withheld rows are cleared too.
    expect(where).toEqual({ recipientId: "user_123", readAt: null, createdAt: { lte: expect.any(Date) } });
  });

  it("clamps a future snapshot to now", async () => {
    const response = await PATCH(new Request("https://example.com/api/notifications", {
      method: "PATCH",
      body: JSON.stringify({ before: "2999-01-01T00:00:00.000Z" }),
    }));
    expect(response.status).toBe(200);
    const lte: Date = mockNotificationUpdateMany.mock.calls[0][0].where.createdAt.lte;
    expect(lte.getTime()).toBeLessThanOrEqual(Date.now());
  });

  it("returns the entry snapshot and filters the first page by the shared visibility rule", async () => {
    mockNotificationFindMany.mockResolvedValue([]);
    const response = await GET(new NextRequest("https://example.com/api/notifications"));
    const body = await response.json();
    expect(typeof body.readBefore).toBe("string");
    const where = mockNotificationFindMany.mock.calls[0][0].where;
    expect(where).toMatchObject({ recipientId: "user_123", createdAt: { lte: expect.any(Date) } });
    expect(where.actor).toBeDefined();
    expect(where.OR).toHaveLength(2);
  });

  it("returns groupKey and actorIds so pages can merge like groups", async () => {
    mockNotificationFindMany.mockResolvedValue([
      { id: "n2", type: "post_like", postId: "p1", commentId: null, readAt: null, createdAt: new Date("2026-08-15T11:00:00.000Z"), actor: actor("a2") },
      { id: "n1", type: "post_like", postId: "p1", commentId: null, readAt: null, createdAt: new Date("2026-08-15T10:00:00.000Z"), actor: actor("a1") },
    ]);
    const body = await (await GET(new NextRequest("https://example.com/api/notifications"))).json();
    expect(body.notifications[0].groupKey).toBe("post_like:p1");
    expect(body.notifications[0].actorIds).toEqual(["a2", "a1"]);
  });

  it("requires an authenticated viewer when marking read", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const response = await PATCH();
    expect(response.status).toBe(401);
    expect(mockNotificationUpdateMany).not.toHaveBeenCalled();
  });
});
