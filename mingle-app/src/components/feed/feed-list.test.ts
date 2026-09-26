import { describe, expect, it } from "vitest";
import type { FeedPostDto } from "@/lib/feed-post-dto";
import {
  appendCyclePage,
  appendPage,
  createCycleList,
  patchCycleList,
  patchCycleListByAuthor,
  removeAuthorFromCycleList,
  removeFromCycleList,
  replaceInCycleList,
  type FeedCycleList,
  patchPost,
  prependDeepLinkPost,
  removeByAuthor,
  removePost,
  replacePost,
  resolveDisplayText,
} from "./feed-list";

function post(id: string, authorId = `a-${id}`): FeedPostDto {
  return {
    id,
    author: { id: authorId, handle: `h-${id}`, name: `N ${id}`, imageUrl: null },
    sourceText: `source ${id}`,
    sourceLanguage: "en",
    bodyVersion: 1,
    displayText: null,
    displayLanguage: null,
    translationState: "none",
    backgroundKey: "warm-cream",
    image: null,
    likeCount: 0,
    commentCount: 0,
    likedByMe: false,
    followingAuthor: false,
    isMine: false,
    publishedAt: "2026-09-25T00:00:00Z",
    visibility: "public",
    deletedAt: null,
  };
}

describe("appendPage", () => {
  it("appends new posts in order and drops duplicates", () => {
    const existing = [post("1"), post("2")];
    const incoming = [post("2"), post("3"), post("4")];
    const merged = appendPage(existing, incoming);
    expect(merged.map((p) => p.id)).toEqual(["1", "2", "3", "4"]);
  });

  it("returns the same reference when nothing new arrives", () => {
    const existing = [post("1")];
    expect(appendPage(existing, [])).toBe(existing);
  });

  it("never reorders posts already on screen", () => {
    const existing = [post("3"), post("1"), post("2")];
    const merged = appendPage(existing, [post("1"), post("4")]);
    expect(merged.map((p) => p.id)).toEqual(["3", "1", "2", "4"]);
  });
});

describe("prependDeepLinkPost", () => {
  it("places the deep-linked post first and removes its later copy", () => {
    const ranked = [post("1"), post("2"), post("3")];
    const merged = prependDeepLinkPost(post("2"), ranked);
    expect(merged.map((p) => p.id)).toEqual(["2", "1", "3"]);
  });

  it("prepends without duplication when absent from the ranked list", () => {
    const ranked = [post("1"), post("2")];
    const merged = prependDeepLinkPost(post("9"), ranked);
    expect(merged.map((p) => p.id)).toEqual(["9", "1", "2"]);
  });
});

describe("replace / patch / remove", () => {
  it("replaces a post in place", () => {
    const posts = [post("1"), post("2")];
    const next = { ...post("2"), likeCount: 5 };
    expect(replacePost(posts, next)[1].likeCount).toBe(5);
  });

  it("patches specific fields preserving position", () => {
    const posts = [post("1"), post("2")];
    const patched = patchPost(posts, "1", { likeCount: 9, likedByMe: true });
    expect(patched[0].likeCount).toBe(9);
    expect(patched[0].likedByMe).toBe(true);
    expect(patched[1]).toBe(posts[1]);
  });

  it("returns same reference when id is absent", () => {
    const posts = [post("1")];
    expect(patchPost(posts, "x", { likeCount: 1 })).toBe(posts);
    expect(removePost(posts, "x")).toBe(posts);
  });

  it("removes one post and all posts by an author", () => {
    const posts = [post("1", "a"), post("2", "b"), post("3", "a")];
    expect(removePost(posts, "2").map((p) => p.id)).toEqual(["1", "3"]);
    expect(removeByAuthor(posts, "a").map((p) => p.id)).toEqual(["2"]);
  });
});

describe("resolveDisplayText", () => {
  it("shows the source when same_language regardless of toggle", () => {
    const p = { sourceText: "orig", displayText: "trans", translationState: "same_language" as const };
    expect(resolveDisplayText(p, true)).toBe("orig");
  });

  it("shows the translation only when ready and toggled on", () => {
    const p = { sourceText: "orig", displayText: "trans", translationState: "ready" as const };
    expect(resolveDisplayText(p, true)).toBe("trans");
    expect(resolveDisplayText(p, false)).toBe("orig");
  });

  it("keeps the original while pending / failed / none", () => {
    for (const state of ["pending", "failed", "none"] as const) {
      const p = { sourceText: "orig", displayText: null, translationState: state };
      expect(resolveDisplayText(p, true)).toBe("orig");
    }
  });
});

describe("cycle list (feed wrap-around)", () => {
  const keys = (list: FeedCycleList) => list.entries.map((e) => e.key);
  const entryIds = (list: FeedCycleList) => list.entries.map((e) => e.post.id);

  it("appends pages within one cycle", () => {
    let list = createCycleList([post("1"), post("2")]);
    list = appendCyclePage(list, [post("3"), post("4")]);
    expect(entryIds(list)).toEqual(["1", "2", "3", "4"]);
    expect(list.cycle).toBe(0);
  });

  it("treats a page with an already-shown id as a new cycle and appends it (not dropped)", () => {
    let list = createCycleList([post("1"), post("2"), post("3")]);
    // Server reached the end and restarted from offset 0 with a fresh snapshot.
    list = appendCyclePage(list, [post("2"), post("1")]);
    expect(entryIds(list)).toEqual(["1", "2", "3", "2", "1"]);
    expect(list.cycle).toBe(1);
    // A later page of the new cycle continues it.
    list = appendCyclePage(list, [post("3")]);
    expect(entryIds(list)).toEqual(["1", "2", "3", "2", "1", "3"]);
    expect(list.cycle).toBe(1);
  });

  it("the old appendPage dropped the whole wrapped page (regression guard)", () => {
    expect(appendPage([post("1"), post("2")], [post("1"), post("2")]).map((p) => p.id)).toEqual(["1", "2"]);
  });

  it("gives every appearance a unique key", () => {
    let list = createCycleList([post("1")]);
    list = appendCyclePage(list, [post("1")]);
    list = appendCyclePage(list, [post("1")]);
    expect(entryIds(list)).toEqual(["1", "1", "1"]);
    expect(new Set(keys(list)).size).toBe(3);
  });

  it("drops the pinned deep-link post silently when the first cycle brings it again", () => {
    let list = createCycleList([post("1"), post("2")], post("9"));
    expect(entryIds(list)).toEqual(["9", "1", "2"]);
    list = appendCyclePage(list, [post("3"), post("9"), post("4")]);
    expect(entryIds(list)).toEqual(["9", "1", "2", "3", "4"]);
    expect(list.cycle).toBe(0);
    // After that, a real wrap still repeats it.
    list = appendCyclePage(list, [post("9"), post("1")]);
    expect(list.cycle).toBe(1);
    expect(entryIds(list).slice(-2)).toEqual(["9", "1"]);
  });

  it("a pinned post already in the first page counts as delivered", () => {
    let list = createCycleList([post("1"), post("9")], post("9"));
    expect(entryIds(list)).toEqual(["9", "1"]);
    expect(list.pendingPinnedId).toBeNull();
    list = appendCyclePage(list, [post("9")]);
    expect(list.cycle).toBe(1);
    expect(entryIds(list)).toEqual(["9", "1", "9"]);
  });

  it("a page holding only the pinned repeat adds nothing and is not a wrap", () => {
    const list = appendCyclePage(createCycleList([post("1")], post("9")), [post("9")]);
    expect(entryIds(list)).toEqual(["9", "1"]);
    expect(list.cycle).toBe(0);
    expect(list.pendingPinnedId).toBeNull();
  });

  it("patches, replaces and removes every appearance of a post", () => {
    let list = createCycleList([post("1", "a"), post("2", "b")]);
    list = appendCyclePage(list, [post("1", "a"), post("2", "b")]);

    const liked = patchCycleList(list, "1", { likeCount: 7, likedByMe: true });
    expect(liked.entries.filter((e) => e.post.id === "1").map((e) => e.post.likeCount)).toEqual([7, 7]);
    expect(liked.entries[1]).toBe(list.entries[1]);

    const followed = patchCycleListByAuthor(list, "b", { followingAuthor: true });
    expect(followed.entries.filter((e) => e.post.author.id === "b").every((e) => e.post.followingAuthor)).toBe(true);

    const replaced = replaceInCycleList(list, { ...post("2", "b"), commentCount: 4 });
    expect(replaced.entries.filter((e) => e.post.id === "2").map((e) => e.post.commentCount)).toEqual([4, 4]);

    expect(entryIds(removeFromCycleList(list, "1"))).toEqual(["2", "2"]);
    expect(entryIds(removeAuthorFromCycleList(list, "b"))).toEqual(["1", "1"]);
    // Keys stay the per-appearance keys after removal.
    expect(keys(removeFromCycleList(list, "1"))).toEqual(["0:2", "1:2"]);
  });

  it("returns the same reference when nothing matches", () => {
    const list = createCycleList([post("1")]);
    expect(patchCycleList(list, "x", { likeCount: 1 })).toBe(list);
    expect(removeFromCycleList(list, "x")).toBe(list);
    expect(appendCyclePage(list, [])).toBe(list);
  });
});
