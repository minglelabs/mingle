import { describe, expect, it } from "vitest";
import type { FeedPostDto } from "@/lib/feed-post-dto";
import {
  appendPage,
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
