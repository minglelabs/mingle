/**
 * Shapes raw UserNotification rows into the notification-center list.
 *
 * Grouping rule (plan §likes): likes are collapsed by target at read time —
 * every like on one post is a single `post_like` entry, every like on one
 * comment/reply is a single `comment_like` entry, and different comments never
 * merge. Each grouped entry carries the most recent actors and the total
 * count. Every other type (follow, comment, comment_reply, report_resolved)
 * stays as one entry per row.
 *
 * This is pure so it can be unit-tested without Prisma; the route feeds it a
 * page of rows already ordered newest-first and already visibility-filtered.
 */

export type NotificationActor = {
  id: string;
  handle: string | null;
  name: string | null;
  image: string | null;
};

export type RawNotificationRow = {
  id: string;
  type: string;
  postId: string | null;
  commentId: string | null;
  readAt: Date | string | null;
  createdAt: Date | string;
  actor: NotificationActor;
};

export type NotificationListItem = {
  /** Stable id: the newest row's id for a group, or the row id otherwise. */
  id: string;
  type: string;
  postId: string | null;
  commentId: string | null;
  isRead: boolean;
  createdAt: string;
  /** Newest-first actors (deduped). Grouped entries may list several. */
  actors: NotificationActor[];
  /** Distinct actor count in this entry (>= actors.length). */
  actorCount: number;
  /**
   * Grouping key ("post_like:<postId>", "comment_like:<commentId>", or
   * "row:<id>" for an ungrouped row). A client that loads further pages merges
   * entries with the same grouped key so a group split across pages still
   * reads as one entry.
   */
  groupKey: string;
  /** Every distinct actor id in this entry (uncapped, for cross-page merges). */
  actorIds: string[];
};

const GROUPED_TYPES = new Set(["post_like", "comment_like"]);
const MAX_ACTORS_PER_GROUP = 3;

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

export function notificationGroupKey(row: Pick<RawNotificationRow, "id" | "type" | "postId" | "commentId">): string {
  if (row.type === "post_like") return `post_like:${row.postId ?? ""}`;
  if (row.type === "comment_like") return `comment_like:${row.commentId ?? ""}`;
  // Non-grouped rows each get a unique key so they never merge.
  return `row:${row.id}`;
}

export function buildNotificationListResponse(rows: RawNotificationRow[]): {
  items: NotificationListItem[];
  unreadCount: number;
} {
  const order: string[] = [];
  const groups = new Map<
    string,
    {
      newest: RawNotificationRow;
      actors: NotificationActor[];
      actorIds: Set<string>;
      anyUnread: boolean;
    }
  >();

  // rows arrive newest-first, so the first row seen for a key is the newest.
  for (const row of rows) {
    const key = notificationGroupKey(row);
    const existing = groups.get(key);
    const isUnread = row.readAt === null || row.readAt === undefined;

    if (!existing) {
      order.push(key);
      groups.set(key, {
        newest: row,
        actors: [row.actor],
        actorIds: new Set([row.actor.id]),
        anyUnread: isUnread,
      });
      continue;
    }

    // Only grouped types accumulate extra actors; unique keys never reach here.
    if (!existing.actorIds.has(row.actor.id)) {
      existing.actorIds.add(row.actor.id);
      if (existing.actors.length < MAX_ACTORS_PER_GROUP) {
        existing.actors.push(row.actor);
      }
    }
    if (isUnread) existing.anyUnread = true;
  }

  const items: NotificationListItem[] = order.map((key) => {
    const group = groups.get(key)!;
    const { newest } = group;
    const isGrouped = GROUPED_TYPES.has(newest.type);
    return {
      id: newest.id,
      type: newest.type,
      postId: newest.postId,
      commentId: newest.commentId,
      isRead: !group.anyUnread,
      createdAt: toIso(newest.createdAt),
      actors: group.actors,
      actorCount: isGrouped ? group.actorIds.size : 1,
      groupKey: key,
      actorIds: [...group.actorIds],
    };
  });

  const unreadCount = items.reduce((total, item) => (item.isRead ? total : total + 1), 0);

  return { items, unreadCount };
}
