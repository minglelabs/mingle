import { describe, expect, it } from "vitest";
import {
  createDeepLinkCommentLatch,
  createFeedRestoreSession,
  planFeedStart,
  type FeedRestoreState,
} from "./feed-restore-state";

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  const writes: string[] = [];
  return {
    data,
    writes,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      writes.push(value);
      data.set(key, value);
    },
  };
}

const HOME_KEY = "mingle:feed-restore:home";
const saved: FeedRestoreState = {
  activePostId: "p7",
  posts: { p7: { expanded: true, scrollTop: 120 } },
};

describe("createFeedRestoreSession (read / write order)", () => {
  it("reads the saved state synchronously at creation, before any card mounts", () => {
    const storage = memoryStorage({ [HOME_KEY]: JSON.stringify(saved) });
    const session = createFeedRestoreSession({ kind: "home" }, storage);
    expect(session.initial).toEqual(saved);
    expect(session.initial?.posts.p7.expanded).toBe(true);
  });

  it("ignores writes until markReady, so the empty first render cannot wipe the saved state", () => {
    const storage = memoryStorage({ [HOME_KEY]: JSON.stringify(saved) });
    const session = createFeedRestoreSession({ kind: "home" }, storage);
    // What the old shell wrote on its first render (posts=[]):
    session.persist({ activePostId: null, posts: {} });
    expect(storage.writes).toHaveLength(0);
    expect(JSON.parse(storage.data.get(HOME_KEY)!)).toEqual(saved);

    session.markReady();
    session.persist({ activePostId: "p8", posts: {} });
    expect(JSON.parse(storage.data.get(HOME_KEY)!).activePostId).toBe("p8");
  });

  it("a remount reads what the previous shell saved", () => {
    const storage = memoryStorage();
    const first = createFeedRestoreSession({ kind: "home" }, storage);
    first.markReady();
    first.persist(saved);
    const second = createFeedRestoreSession({ kind: "home" }, storage);
    expect(second.initial).toEqual(saved);
  });

  it("keys by source and degrades to null on corrupt data or no storage", () => {
    const storage = memoryStorage({ [HOME_KEY]: "{not json" });
    expect(createFeedRestoreSession({ kind: "home" }, storage).initial).toBeNull();
    expect(createFeedRestoreSession({ kind: "author", authorId: "u1" }, storage).initial).toBeNull();
    const none = createFeedRestoreSession({ kind: "home" }, null);
    none.markReady();
    expect(() => none.persist(saved)).not.toThrow();
    expect(none.initial).toBeNull();
  });
});

describe("planFeedStart (deep link precedence)", () => {
  it("a deep link wins over the remembered post", () => {
    expect(planFeedStart({ deepLinkPostId: "d1", startPostId: null, saved })).toEqual({
      kind: "deep-link",
      postId: "d1",
      restorePostId: null,
    });
  });

  it("a viewer start post wins over the remembered post", () => {
    expect(planFeedStart({ deepLinkPostId: null, startPostId: "v1", saved })).toMatchObject({
      kind: "viewer",
      postId: "v1",
      restorePostId: null,
    });
  });

  it("otherwise restores the remembered post (fetched and placed first)", () => {
    expect(planFeedStart({ deepLinkPostId: null, startPostId: null, saved })).toEqual({
      kind: "restore",
      postId: "p7",
      restorePostId: "p7",
    });
  });

  it("starts at the top with nothing saved", () => {
    expect(planFeedStart({ deepLinkPostId: null, startPostId: null, saved: null }).kind).toBe("top");
    expect(
      planFeedStart({ deepLinkPostId: null, startPostId: null, saved: { activePostId: null, posts: {} } }).kind,
    ).toBe("top");
  });
});

describe("createDeepLinkCommentLatch (open the sheet once)", () => {
  it("waits for the post, then fires exactly once", () => {
    const latch = createDeepLinkCommentLatch("p1", "c1");
    expect(latch.take(() => false)).toBeNull();
    expect(latch.take((id) => id === "p1")).toEqual({ postId: "p1", commentId: "c1" });
    // Closing the sheet then loading more posts must not reopen it.
    expect(latch.take((id) => id === "p1")).toBeNull();
    expect(latch.take(() => true)).toBeNull();
    expect(latch.consumed).toBe(true);
  });

  it("never fires without both ids", () => {
    expect(createDeepLinkCommentLatch("p1", null).take(() => true)).toBeNull();
    expect(createDeepLinkCommentLatch(null, "c1").take(() => true)).toBeNull();
  });
});
