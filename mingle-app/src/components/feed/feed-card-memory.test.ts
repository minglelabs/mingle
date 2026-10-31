import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { feedCopy } from "@/i18n/feed-copy";
import type { FeedPostDto } from "@/lib/feed-post-dto";
import FeedPostCard, { type FeedPostCardProps } from "./feed-post-card";
import FeedPostView, { FeedPostPlaceholder, clampPhotoIndex } from "./feed-post-view";
import { createFeedCardMemory, type FeedPostMemory } from "./feed-card-memory";
import { restoreTranslateState, seedTranslateState } from "./use-feed-translate";

const noop = () => {};

function post(overrides: Partial<FeedPostDto> = {}): FeedPostDto {
  return {
    id: "p1",
    author: { id: "u1", handle: "mina", name: "Mina", imageUrl: null },
    sourceText: "안녕하세요",
    sourceLanguage: "ko",
    bodyVersion: 1,
    displayText: "Hello there",
    displayLanguage: "en",
    translationState: "ready",
    backgroundKey: "warm-cream",
    image: null,
    likeCount: 0,
    commentCount: 0,
    likedByMe: false,
    followingAuthor: false,
    isMine: false,
    publishedAt: "2026-09-30T00:00:00.000Z",
    visibility: "public",
    deletedAt: null,
    ...overrides,
  };
}

/** A card as the shell mounts it (or mounts it again after swiping back). */
function renderCard(props: Partial<FeedPostCardProps> & { post: FeedPostDto }): string {
  return renderToStaticMarkup(
    createElement(FeedPostCard, {
      cardHeight: "640px",
      locale: "en",
      copy: feedCopy("en"),
      viewerId: "viewer",
      viewerLanguage: "en",
      reducedMotion: true,
      onRequireLogin: noop,
      onOpenComments: noop,
      onOpenActions: noop,
      onOpenAuthor: noop,
      onOpenImage: noop,
      onLikeChange: noop,
      onFollowed: noop,
      onToast: noop,
      ...props,
    }),
  );
}

describe("createFeedCardMemory (what an unmounted card keeps)", () => {
  it("merges each change into what is kept for the post", () => {
    const memory = createFeedCardMemory();
    expect(memory.post("p1")).toBeNull();
    memory.rememberPost("p1", { translation: { translatedText: "Hi", showingTranslation: false } });
    memory.rememberPost("p1", { photoIndex: 2 });
    memory.rememberPost("p1", { pickedLanguage: "ja", otherTranslations: { ja: "こんにちは" } });
    expect(memory.post("p1")).toEqual({
      translation: { translatedText: "Hi", showingTranslation: false },
      photoIndex: 2,
      pickedLanguage: "ja",
      otherTranslations: { ja: "こんにちは" },
    });
    // Back to the default chips: the pick is cleared, the fetched texts stay.
    memory.rememberPost("p1", { pickedLanguage: null });
    expect(memory.post("p1")).toMatchObject({ pickedLanguage: null, otherTranslations: { ja: "こんにちは" } });
    expect(memory.post("p2")).toBeNull();
  });

  it("keeps read progress per appearance, so a post repeated in a later cycle reports on its own", () => {
    const memory = createFeedCardMemory();
    memory.rememberRead("0:p1", { readReported: true, readDwellMs: 3000 });
    memory.rememberRead("0:p2", { readReported: false, readDwellMs: 1200 });
    expect(memory.read("0:p1")).toEqual({ readReported: true, readDwellMs: 3000 });
    expect(memory.read("0:p2")).toEqual({ readReported: false, readDwellMs: 1200 });
    expect(memory.read("1:p1")).toBeNull();
  });

  it("drops an appearance with nothing to carry over", () => {
    const memory = createFeedCardMemory();
    memory.rememberRead("0:p1", { readReported: false, readDwellMs: 800 });
    // Collapsed since: the dwell started over at 0.
    memory.rememberRead("0:p1", { readReported: false, readDwellMs: 0 });
    expect(memory.read("0:p1")).toBeNull();
  });
});

describe("restoreTranslateState (translate choice after a remount)", () => {
  const ready = seedTranslateState({ translationState: "ready", displayText: "Hello there" });
  const none = seedTranslateState({ translationState: "none", displayText: null });

  it("without a kept choice, the post's payload decides", () => {
    expect(restoreTranslateState(ready, null)).toBe(ready);
    expect(restoreTranslateState(none, undefined)).toBe(none);
  });

  it("keeps the original on screen when the reader switched the translation off", () => {
    const state = restoreTranslateState(ready, { translatedText: "Hello there", showingTranslation: false });
    expect(state.showingTranslation).toBe(false);
    expect(state.translatedText).toBe("Hello there");
  });

  it("keeps a translation the reader requested (none in the payload)", () => {
    const failed = seedTranslateState({ translationState: "failed", displayText: null });
    const state = restoreTranslateState(failed, { translatedText: "Hi", showingTranslation: true });
    expect(state).toMatchObject({ translatedText: "Hi", showingTranslation: true, failed: false, loading: false });
  });

  it("prefers the payload's fresh translation over a kept older text", () => {
    const fresh = seedTranslateState({ translationState: "ready", displayText: "New text" });
    expect(restoreTranslateState(fresh, { translatedText: "Old text", showingTranslation: true }).translatedText).toBe(
      "New text",
    );
  });

  it("ignores a choice with no translation to show", () => {
    expect(restoreTranslateState(none, { translatedText: null, showingTranslation: true })).toBe(none);
  });
});

describe("a card mounted again after swiping back", () => {
  it("shows the translation by default, and the original when the reader had switched it off", () => {
    expect(renderCard({ post: post() })).toContain('aria-label="Mina: Hello there"');

    const memory = createFeedCardMemory();
    // What the card saved when the reader tapped the original chip.
    memory.rememberPost("p1", { translation: { translatedText: "Hello there", showingTranslation: false } });
    const html = renderCard({ post: post(), restoreMemory: memory.post("p1") });
    expect(html).toContain('aria-label="Mina: 안녕하세요"');
    expect(html).not.toContain("Hello there");
  });

  it("shows a translation the reader had requested", () => {
    const memory = createFeedCardMemory();
    memory.rememberPost("p1", { translation: { translatedText: "Hi!", showingTranslation: true } });
    const html = renderCard({
      post: post({ translationState: "none", displayText: null }),
      restoreMemory: memory.post("p1"),
    });
    expect(html).toContain('aria-label="Mina: Hi!"');
  });

  it("shows the flag-chip language the reader had picked", () => {
    const memory: FeedPostMemory = { pickedLanguage: "ja", otherTranslations: { ja: "こんにちは" } };
    const html = renderCard({ post: post({ translationLanguages: ["ja"] }), restoreMemory: memory });
    expect(html).toContain('aria-label="Mina: こんにちは"');
  });

  it("opens with the caption expanded when it was expanded (the shell's expand state)", () => {
    const collapsed = renderCard({ post: post({ translationState: "same_language", displayText: null }) });
    const expanded = renderCard({
      post: post({ translationState: "same_language", displayText: null }),
      restoreExpanded: true,
    });
    const collapseLabel = feedCopy("en").collapse;
    expect(collapsed).not.toContain(collapseLabel);
    expect(expanded).toContain(collapseLabel);
  });

  it("opens a multi-photo post on the photo that was on screen, loading that one", () => {
    const photos = [0, 1, 2].map((i) => ({ url: `/api/posts/p1/image?index=${i}`, width: 800, height: 1000 }));
    const html = renderCard({
      post: post({ image: photos[0], images: photos }),
      eagerImage: true,
      restoreMemory: { photoIndex: 2 },
    });
    expect(html).toContain("3/3");
    const loadingOf = (index: number) =>
      new RegExp(`<img[^>]*loading="(\\w+)"[^>]*src="/api/posts/p1/image\\?index=${index}"|<img[^>]*src="/api/posts/p1/image\\?index=${index}"[^>]*loading="(\\w+)"`)
        .exec(html)
        ?.slice(1)
        .find(Boolean);
    expect(loadingOf(2)).toBe("eager");
    expect(loadingOf(0)).toBe("lazy");
    expect(loadingOf(1)).toBe("lazy");
  });

  it("a photo index kept for a post that has fewer photos now falls back to a valid one", () => {
    expect(clampPhotoIndex(5, 3)).toBe(2);
    expect(clampPhotoIndex(-1, 3)).toBe(0);
    expect(clampPhotoIndex(Number.NaN, 3)).toBe(0);
    expect(clampPhotoIndex(1, 0)).toBe(0);
  });
});

describe("FeedPostPlaceholder (a card outside the mounted window)", () => {
  it("keeps the card's height and snap point, with the post background and nothing else", () => {
    const placeholder = renderToStaticMarkup(
      createElement(FeedPostPlaceholder, { cardHeight: "640px", backgroundKey: "warm-cream" }),
    );
    const card = renderToStaticMarkup(
      createElement(FeedPostView, {
        cardHeight: "640px",
        backgroundKey: "warm-cream",
        imageUrl: "/api/posts/p1/image",
        displayText: "Hi",
        previewText: "Hi",
        expanded: false,
        authorSlot: null,
        ariaLabel: "Mina: Hi",
      }),
    );
    for (const html of [placeholder, card]) {
      expect(html).toMatch(/class="[^"]*\bsnap-start\b[^"]*\bsnap-always\b/);
      expect(html).toMatch(/style="height:640px;background:#fdf6ec/);
    }
    expect(placeholder).toContain('aria-hidden="true"');
    expect(placeholder).not.toContain("<img");
    // Not an overlay: no positioning, no handlers, nothing that could take a touch.
    expect(placeholder).not.toMatch(/absolute|fixed|pointer-events|onclick|role=/i);
  });
});
