import { afterEach, describe, expect, it } from "vitest";
import type { FeedPostDto } from "@/lib/feed-post-dto";
import {
  __setFeedEventSinkForTest,
  daysSinceBucket,
  evaluateFeedSession,
  FEED_EVENT_ALLOWED_KEYS,
  FEED_EVENT_FORBIDDEN_KEYS,
  FEED_EVENTS,
  FEED_SESSION_GAP_MS,
  feedEvents,
  feedPostContext,
  feedSurfaceForSource,
  noteFeedShown,
  pickAllowedProperties,
  recordFeedSeen,
  sanitizeLanguageCode,
  textLengthBucket,
  trackFeedEvent,
  type FeedAnalyticsEvent,
} from "./feed-analytics";

const SECRET_BODY = "SECRET BODY TEXT line";
const SECRET_NAME = "Secret Name";
const SECRET_HANDLE = "secret_handle";
const SECRET_URL = "https://cdn.example.com/secret-image.jpg";

function post(overrides: Partial<FeedPostDto> = {}): FeedPostDto {
  return {
    id: "post-1",
    author: { id: "user-9", handle: SECRET_HANDLE, name: SECRET_NAME, imageUrl: SECRET_URL, isOfficial: true },
    sourceText: SECRET_BODY,
    sourceLanguage: "ko",
    bodyVersion: 1,
    displayText: SECRET_BODY,
    displayLanguage: "en",
    translationState: "ready",
    backgroundKey: "warm-cream",
    image: { url: SECRET_URL, width: 10, height: 10 },
    likeCount: 0,
    commentCount: 0,
    likedByMe: false,
    followingAuthor: false,
    isMine: false,
    publishedAt: "2026-09-26T00:00:00.000Z",
    visibility: "public",
    deletedAt: null,
    ...overrides,
  };
}

const ctx = feedPostContext(post(), { surface: "home", position: 3, cycle: 1, displayLanguage: "en" });

function everyEvent(): FeedAnalyticsEvent[] {
  return [
    feedEvents.sessionStarted({ startsSession: true, daysSinceLast: "2-3" }, "home"),
    feedEvents.postImpressed(ctx),
    feedEvents.postSkipped(ctx, 420.4),
    feedEvents.postExpanded(ctx),
    feedEvents.postRead(ctx, "dwell"),
    feedEvents.postLiked(ctx, "double_tap"),
    feedEvents.postUnliked(ctx),
    feedEvents.translationToggled(ctx, "translated"),
    feedEvents.profileOpened(ctx),
    feedEvents.commentsOpened("post-1"),
    feedEvents.commentCreated("post-1", true),
    feedEvents.composeOpened("new"),
    feedEvents.publishSucceeded({ hasImage: true, text: SECRET_BODY }),
    feedEvents.publishFailed({ hasImage: false, text: SECRET_BODY, reason: "create" }),
  ];
}

describe("feed analytics builders", () => {
  it("covers every event name with a mingle_feed_ prefix", () => {
    const names = new Set(everyEvent().map((e) => e.event));
    expect([...names].sort()).toEqual(Object.values(FEED_EVENTS).sort());
    for (const name of names) expect(name).toMatch(/^mingle_feed_[a-z_]+$/);
  });

  it("only uses allow-listed keys and never a forbidden one", () => {
    const allowed = new Set<string>(FEED_EVENT_ALLOWED_KEYS);
    for (const e of everyEvent()) {
      for (const key of Object.keys(e.properties)) {
        expect(allowed.has(key), `${e.event}.${key}`).toBe(true);
        expect((FEED_EVENT_FORBIDDEN_KEYS as readonly string[]).includes(key), `${e.event}.${key}`).toBe(false);
      }
    }
  });

  it("never carries body text, names, handles or image URLs as values", () => {
    const serialized = JSON.stringify(everyEvent());
    for (const secret of [SECRET_BODY, SECRET_NAME, SECRET_HANDLE, SECRET_URL, "user-9"]) {
      expect(serialized).not.toContain(secret);
    }
  });

  it("builds the post context from ids, flags and language codes", () => {
    expect(ctx).toEqual({
      post_id: "post-1",
      surface: "home",
      position: 3,
      cycle: 1,
      has_image: true,
      source_language: "ko",
      display_language: "en",
      following_author: false,
      author_is_official: true,
      is_mine: false,
    });
    expect(feedPostContext(post({ image: null, author: { ...post().author, isOfficial: undefined } }), { surface: "search" }))
      .toMatchObject({ has_image: false, author_is_official: false, position: null, cycle: null });
  });

  it("carries the gesture, dwell and read trigger", () => {
    expect(feedEvents.postLiked(ctx, "button").properties.method).toBe("button");
    expect(feedEvents.postLiked(ctx, "double_tap").properties.method).toBe("double_tap");
    expect(feedEvents.postSkipped(ctx, 420.6).properties.dwell_ms).toBe(421);
    expect(feedEvents.postRead(ctx, "scrolled_to_end").properties.read_trigger).toBe("scrolled_to_end");
    expect(feedEvents.publishFailed({ hasImage: true, text: "", reason: "restricted" }).properties).toEqual({
      has_image: true,
      text_length_bucket: "0",
      failure_reason: "restricted",
    });
  });

  it("maps list sources to surfaces", () => {
    expect(feedSurfaceForSource({ kind: "home" })).toBe("home");
    expect(feedSurfaceForSource({ kind: "author", authorId: "a" })).toBe("profile");
    expect(feedSurfaceForSource({ kind: "search", query: "q" })).toBe("search");
  });

  it("keeps only language codes", () => {
    expect(sanitizeLanguageCode("zh-TW")).toBe("zh-TW");
    expect(sanitizeLanguageCode("en")).toBe("en");
    expect(sanitizeLanguageCode("hello world")).toBeNull();
    expect(sanitizeLanguageCode(null)).toBeNull();
  });
});

describe("buckets", () => {
  it("buckets text length without the text", () => {
    expect(textLengthBucket(null)).toBe("0");
    expect(textLengthBucket("   ")).toBe("0");
    expect(textLengthBucket("a".repeat(50))).toBe("1-50");
    expect(textLengthBucket("a".repeat(51))).toBe("51-200");
    expect(textLengthBucket("a".repeat(500))).toBe("201-500");
    expect(textLengthBucket("a".repeat(1000))).toBe("501-1000");
    expect(textLengthBucket("a".repeat(1001))).toBe("1001+");
    // Code points, not UTF-16 units.
    expect(textLengthBucket("😀".repeat(50))).toBe("1-50");
  });

  it("buckets days since the last visit", () => {
    const day = 24 * 60 * 60 * 1000;
    expect(daysSinceBucket(null, 0)).toBe("first");
    expect(daysSinceBucket(0, day - 1)).toBe("0");
    expect(daysSinceBucket(0, day)).toBe("1");
    expect(daysSinceBucket(0, 3 * day)).toBe("2-3");
    expect(daysSinceBucket(0, 7 * day)).toBe("4-7");
    expect(daysSinceBucket(0, 30 * day)).toBe("8-30");
    expect(daysSinceBucket(0, 31 * day)).toBe("31+");
  });
});

describe("revisit (30-minute rule)", () => {
  it("starts a session on first show and after a 30-minute gap only", () => {
    expect(evaluateFeedSession(null, 1000)).toEqual({ startsSession: true, daysSinceLast: "first" });
    expect(evaluateFeedSession(0, FEED_SESSION_GAP_MS - 1).startsSession).toBe(false);
    expect(evaluateFeedSession(0, FEED_SESSION_GAP_MS).startsSession).toBe(true);
  });

  it("measures the gap from the last show, not the session start", () => {
    const store = new Map<string, string>();
    const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
    const sent: FeedAnalyticsEvent[] = [];
    __setFeedEventSinkForTest((e) => sent.push(e));

    noteFeedShown("home", 0, storage); // first: session
    recordFeedSeen(25 * 60 * 1000, storage); // still browsing at 25 min
    noteFeedShown("home", 50 * 60 * 1000, storage); // 25 min after last show: same session
    noteFeedShown("home", 90 * 60 * 1000, storage); // 40 min gap: new session

    expect(sent.map((e) => e.event)).toEqual([FEED_EVENTS.sessionStarted, FEED_EVENTS.sessionStarted]);
    expect(sent[0].properties).toEqual({ surface: "home", days_since_last_bucket: "first" });
    expect(sent[1].properties.days_since_last_bucket).toBe("0");
  });
});

describe("delivery", () => {
  afterEach(() => __setFeedEventSinkForTest(null));

  it("strips keys outside the allow-list and never throws", () => {
    expect(pickAllowedProperties({ post_id: "p", text: "x", name: "n" })).toEqual({ post_id: "p" });
    const sent: FeedAnalyticsEvent[] = [];
    __setFeedEventSinkForTest((e) => sent.push(e));
    trackFeedEvent({ event: FEED_EVENTS.postExpanded, properties: { post_id: "p", body: "leak" } });
    expect(sent).toEqual([{ event: FEED_EVENTS.postExpanded, properties: { post_id: "p" } }]);

    __setFeedEventSinkForTest(() => {
      throw new Error("boom");
    });
    expect(() => trackFeedEvent(feedEvents.composeOpened("new"))).not.toThrow();
  });
});
