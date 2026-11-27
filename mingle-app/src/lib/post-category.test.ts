import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { resolvePostCategoryCopy } from "@/i18n/post-category-copy";
import { PRIMARY_UI_LOCALES } from "@/i18n/mingle-locales";
import {
  EMPTY_POST_INTRO_EXTRAS,
  POST_CALL_TITLE_MAX,
  POST_CATEGORIES,
  POST_HOBBIES,
  parsePostCategory,
  postIntroProblem,
  postMinutesLeft,
  readPostCallTitle,
  readPostIntro,
  sanitizePostCallTitle,
  sanitizePostHobbies,
} from "@/lib/post-category";
import { postNotExpiredWhere, visiblePostWhere } from "@/server/posts/post-visibility";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("post categories", () => {
  it("is free, 1 hour or a self-introduction; anything else is an ordinary post", () => {
    expect([...POST_CATEGORIES]).toEqual(["free", "hour", "intro", "call"]);
    expect(parsePostCategory("hour")).toBe("hour");
    expect(parsePostCategory("call")).toBe("call");
    expect(parsePostCategory("story")).toBe("free");
    expect(parsePostCategory(undefined)).toBe("free");
  });

  it("asks a self-introduction for a hobby and some text", () => {
    expect(sanitizePostHobbies(["travel", "travel", "nope", "music"])).toEqual(["travel", "music"]);
    expect(sanitizePostHobbies([...POST_HOBBIES])).toHaveLength(5);
    expect(postIntroProblem({ text: "안녕하세요, 서울에 사는 민지예요", hobbies: [] })).toBe("hobbies");
    expect(postIntroProblem({ text: "안녕", hobbies: ["travel"] })).toBe("text");
    expect(postIntroProblem({ text: "안녕하세요, 서울에 사는 민지예요", hobbies: ["travel"] })).toBeNull();
    const route = read("src/app/api/posts/route.ts");
    expect(route).toContain("'intro_hobbies_required'");
    expect(route).toContain("await applyPostCategory({ postId: result.post.id, authorId: userId, category, hobbies, introExtras, callTitle, publishedAt: result.post.publishedAt })");
  });

  it("takes an hour post out of every list once its hour is over", () => {
    const now = new Date("2026-11-25T12:00:00Z");
    expect(postNotExpiredWhere(now)).toEqual({ OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] });
    expect(visiblePostWhere(null).AND).toHaveLength(1);
    expect(read("src/app/api/search/posts/post-search-query.ts")).toContain("AND (p.expires_at IS NULL OR p.expires_at > CURRENT_TIMESTAMP)");
    expect(read("src/server/posts/post-category.ts")).toContain("expiresAt: new Date(args.publishedAt.getTime() + POST_HOUR_MS),");
    // The card counts the minutes down, never below one while it is up.
    const end = "2026-11-25T13:00:00Z";
    expect(postMinutesLeft(end, Date.parse("2026-11-25T12:00:00Z"))).toBe(60);
    expect(postMinutesLeft(end, Date.parse("2026-11-25T12:59:40Z"))).toBe(1);
    expect(postMinutesLeft(null, 0)).toBeNull();
  });

  it("reads a stored self-introduction defensively", () => {
    expect(readPostIntro({ country: "kr", age: 27, heightCm: 177.4, hobbies: ["travel", "x"] })).toEqual({ country: "KR", age: 27, heightCm: 177, hobbies: ["travel"], ...EMPTY_POST_INTRO_EXTRAS });
    expect(readPostIntro(null)).toBeNull();
    expect(readPostIntro({ country: "Korea", age: -1 })).toEqual({ country: null, age: null, heightCm: null, hobbies: [], ...EMPTY_POST_INTRO_EXTRAS });
  });

  it("is picked on the write screen and shown on the card, in every app language", () => {
    const screen = read("src/components/compose/compose-screen.tsx");
    expect(screen).toContain("<ComposeCategoryPicker");
    expect(screen).toContain("const publishable = canPublish({ sourceText: text, hasImage }) && !introProblem");
    expect(read("src/components/feed/feed-post-card.tsx")).toContain("<PostCategoryStrip category={post.category} expiresAt={post.expiresAt} intro={post.intro} callTitle={post.callTitle} locale={locale} postId={post.id} ownPost={Boolean(viewerId) && post.author.id === viewerId} />");
  });

  it("lets a voice talk post carry its own title (방제), kept in its intro column", () => {
    expect(sanitizePostCallTitle("  같이   영어로 수다 떨어요  ")).toBe("같이 영어로 수다 떨어요");
    expect(sanitizePostCallTitle("   ")).toBeNull();
    expect(sanitizePostCallTitle(42)).toBeNull();
    expect(sanitizePostCallTitle("a".repeat(80))?.length).toBe(POST_CALL_TITLE_MAX);
    expect(readPostCallTitle({ callTitle: "밤에 수다" })).toBe("밤에 수다");
    expect(readPostCallTitle(null)).toBeNull();
    expect(read("src/server/posts/post-category.ts")).toContain("intro: { callTitle: args.callTitle }");
    expect(read("src/server/posts/feed-post-serializer.ts")).toContain("callTitle: readPostCallTitle(post.intro)");
    for (const locale of PRIMARY_UI_LOCALES) {
      const copy = resolvePostCategoryCopy(locale);
      for (const category of POST_CATEGORIES) expect(copy.categories[category].length).toBeGreaterThan(0);
      for (const hobby of POST_HOBBIES) expect(copy.hobbies[hobby].length).toBeGreaterThan(0);
      expect(copy.minutesLeft).toContain("{n}");
      for (const text of [copy.label, copy.hourHint, copy.introHint, copy.hobbiesLabel, copy.needHobby, copy.needText]) expect(text.length).toBeGreaterThan(0);
    }
  });
});
