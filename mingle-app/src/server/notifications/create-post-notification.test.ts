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
    await createPostNotification({ type: "report_resolved", recipientId: "u1", actorId: "u1", reportId: "r1" });
    expect(mockNotificationCreate).toHaveBeenCalledTimes(1);
    expect(mockNotificationCreate.mock.calls[0][0].data.reportId).toBe("r1");
    expect(mockSendPush).not.toHaveBeenCalled(); // report results never push
  });

  it("notifies the reporter once for EACH closed report, not only the first", async () => {
    // Simulate the table: findFirst matches only rows that satisfy every key.
    const rows: Array<Record<string, unknown>> = [];
    mockNotificationFindFirst.mockImplementation(async ({ where }: { where: Record<string, unknown> }) =>
      rows.find((row) => Object.entries(where).every(([k, v]) => row[k] === v)) ?? null,
    );
    mockNotificationCreate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
      rows.push({ ...data, id: `n${rows.length + 1}` });
      return { id: `n${rows.length}` };
    });

    await createPostNotification({ type: "report_resolved", recipientId: "u1", actorId: "u1", reportId: "r1" });
    await createPostNotification({ type: "report_resolved", recipientId: "u1", actorId: "u1", reportId: "r2" });
    // The same report closing again (reopened, then closed) must not re-notify.
    await createPostNotification({ type: "report_resolved", recipientId: "u1", actorId: "u1", reportId: "r1" });

    expect(mockNotificationCreate).toHaveBeenCalledTimes(2);
    expect(rows.map((row) => row.reportId)).toEqual(["r1", "r2"]);
    expect(mockNotificationFindFirst.mock.calls[1][0].where).toMatchObject({ type: "report_resolved", reportId: "r2" });
  });

  it("drops a report_resolved without a report id", async () => {
    await createPostNotification({ type: "report_resolved", recipientId: "u1", actorId: "u1", reportId: " " });
    expect(mockNotificationCreate).not.toHaveBeenCalled();
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
