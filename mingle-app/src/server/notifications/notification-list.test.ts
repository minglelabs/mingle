import { describe, expect, it } from "vitest";
import { buildNotificationListResponse, type RawNotificationRow } from "./notification-list";

function actor(id: string) {
  return { id, handle: `${id}.h`, name: id, image: null };
}

function row(overrides: Partial<RawNotificationRow> & { id: string; type: string }): RawNotificationRow {
  return {
    postId: null,
    commentId: null,
    readAt: null,
    createdAt: new Date("2026-08-15T10:00:00.000Z"),
    actor: actor("a"),
    ...overrides,
  };
}

describe("buildNotificationListResponse", () => {
  it("groups post likes on the same post into one entry with a distinct-actor count", () => {
    const { items } = buildNotificationListResponse([
      row({ id: "1", type: "post_like", postId: "p1", actor: actor("a1"), createdAt: new Date("2026-08-15T12:00:00.000Z") }),
      row({ id: "2", type: "post_like", postId: "p1", actor: actor("a2") }),
      row({ id: "3", type: "post_like", postId: "p1", actor: actor("a2") }), // duplicate actor
    ]);
    expect(items).toHaveLength(1);
    expect(items[0].id).toBe("1"); // newest row id
    expect(items[0].actorCount).toBe(2);
    expect(items[0].actors).toHaveLength(2);
  });

  it("does not merge likes on different comments", () => {
    const { items } = buildNotificationListResponse([
      row({ id: "1", type: "comment_like", commentId: "c1", actor: actor("a1") }),
      row({ id: "2", type: "comment_like", commentId: "c2", actor: actor("a2") }),
    ]);
    expect(items).toHaveLength(2);
  });

  it("keeps follow, comment, reply and report entries individual", () => {
    const { items } = buildNotificationListResponse([
      row({ id: "1", type: "follow", actor: actor("a1") }),
      row({ id: "2", type: "follow", actor: actor("a1") }), // same actor, still two rows
      row({ id: "3", type: "comment", postId: "p1", commentId: "c1", actor: actor("a2") }),
      row({ id: "4", type: "report_resolved", actor: actor("a2") }),
    ]);
    expect(items).toHaveLength(4);
    expect(items.every((item) => item.actorCount === 1)).toBe(true);
  });

  it("marks a grouped entry read only when all its rows are read, and counts unread", () => {
    const { items, unreadCount } = buildNotificationListResponse([
      row({ id: "1", type: "post_like", postId: "p1", actor: actor("a1"), readAt: new Date() }),
      row({ id: "2", type: "post_like", postId: "p1", actor: actor("a2"), readAt: null }),
      row({ id: "3", type: "follow", actor: actor("a3"), readAt: new Date() }),
    ]);
    const grouped = items.find((item) => item.type === "post_like")!;
    expect(grouped.isRead).toBe(false); // one row unread → group unread
    expect(unreadCount).toBe(1);
  });
});
