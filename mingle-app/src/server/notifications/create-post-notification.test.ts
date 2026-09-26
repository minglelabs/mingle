import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockUserFindUnique,
  mockNotificationFindFirst,
  mockNotificationCreate,
  mockSendPush,
} = vi.hoisted(() => ({
  mockUserFindUnique: vi.fn(),
  mockNotificationFindFirst: vi.fn(),
  mockNotificationCreate: vi.fn(),
  mockSendPush: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: mockUserFindUnique },
    userNotification: {
      findFirst: mockNotificationFindFirst,
      create: mockNotificationCreate,
    },
  },
}));

vi.mock("@/server/push-notifications", () => ({
  sendPushNotificationForUserNotification: mockSendPush,
}));

import { createPostNotification } from "./create-post-notification";

describe("createPostNotification", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUserFindUnique.mockResolvedValue({ inAppNotificationsEnabled: true });
    mockNotificationFindFirst.mockResolvedValue(null);
    mockNotificationCreate.mockResolvedValue({ id: "notif_1" });
    mockSendPush.mockResolvedValue(undefined);
  });

  it("suppresses a notification about the actor's own action", async () => {
    await createPostNotification({ type: "post_like", recipientId: "u1", actorId: "u1", postId: "p1" });
    expect(mockNotificationCreate).not.toHaveBeenCalled();
  });

  it("still delivers report_resolved to the reporter (recipient === actor)", async () => {
    await createPostNotification({ type: "report_resolved", recipientId: "u1", actorId: "u1" });
    expect(mockNotificationCreate).toHaveBeenCalledTimes(1);
    expect(mockSendPush).not.toHaveBeenCalled(); // report results never push
  });

  it("skips creation when the recipient disabled in-app notifications", async () => {
    mockUserFindUnique.mockResolvedValue({ inAppNotificationsEnabled: false });
    await createPostNotification({ type: "comment", recipientId: "u1", actorId: "u2", postId: "p1", commentId: "c1" });
    expect(mockNotificationCreate).not.toHaveBeenCalled();
    expect(mockSendPush).not.toHaveBeenCalled();
  });

  it("dedupes the same person on the same target", async () => {
    mockNotificationFindFirst.mockResolvedValue({ id: "existing" });
    await createPostNotification({ type: "post_like", recipientId: "u1", actorId: "u2", postId: "p1" });
    expect(mockNotificationCreate).not.toHaveBeenCalled();
  });

  it("pushes for comment and reply, but not for likes", async () => {
    await createPostNotification({ type: "comment", recipientId: "u1", actorId: "u2", postId: "p1", commentId: "c1" });
    expect(mockSendPush).toHaveBeenCalledWith("notif_1");

    mockSendPush.mockClear();
    mockNotificationCreate.mockResolvedValue({ id: "notif_2" });
    await createPostNotification({ type: "post_like", recipientId: "u1", actorId: "u2", postId: "p1" });
    expect(mockSendPush).not.toHaveBeenCalled();
  });

  it("never throws when the database fails", async () => {
    mockUserFindUnique.mockRejectedValue(new Error("db_down"));
    await expect(
      createPostNotification({ type: "comment", recipientId: "u1", actorId: "u2", postId: "p1", commentId: "c1" }),
    ).resolves.toBeUndefined();
  });

  it("swallows a push failure without throwing", async () => {
    mockSendPush.mockRejectedValue(new Error("apns_down"));
    await expect(
      createPostNotification({ type: "comment_reply", recipientId: "u1", actorId: "u2", postId: "p1", commentId: "c1" }),
    ).resolves.toBeUndefined();
    expect(mockNotificationCreate).toHaveBeenCalledTimes(1);
  });
});
