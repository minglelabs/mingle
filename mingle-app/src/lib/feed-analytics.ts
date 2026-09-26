/**
 * Posting-feed measurement events (checklist items 90, 91).
 *
 * Every feed event goes through a typed builder in this file, so the set of
 * properties an event can carry is fixed here and nowhere else. Builders copy
 * only allow-listed, content-free fields: ids, surfaces, positions, booleans,
 * language codes and coarse buckets. Post bodies, image URLs, names, handles
 * and comment text are never read into an event (91); the unit test pins the
 * forbidden keys.
 *
 * Delivery goes through `captureMingleClientEvent`, which already applies the
 * PostHog init / consent / DNT / sanitising rules. Nothing here bypasses it.
 */

import type { FeedPostDto } from "@/lib/feed-post-dto";
import type { FeedSource } from "@/lib/feed-routes";
import { captureMingleClientEvent } from "@/lib/posthog-client";

// ---------------------------------------------------------------------------
// Event names (`mingle_<area>_<action>`, like the existing client events)
// ---------------------------------------------------------------------------

export const FEED_EVENTS = {
  sessionStarted: "mingle_feed_session_started",
  postImpressed: "mingle_feed_post_impressed",
  postSkipped: "mingle_feed_post_skipped",
  postExpanded: "mingle_feed_post_expanded",
  postRead: "mingle_feed_post_read",
  postLiked: "mingle_feed_post_liked",
  postUnliked: "mingle_feed_post_unliked",
  translationToggled: "mingle_feed_translation_toggled",
  profileOpened: "mingle_feed_profile_opened",
  commentsOpened: "mingle_feed_comments_opened",
  commentCreated: "mingle_feed_comment_created",
  composeOpened: "mingle_feed_compose_opened",
  publishSucceeded: "mingle_feed_publish_succeeded",
  publishFailed: "mingle_feed_publish_failed",
} as const;

export type FeedEventName = (typeof FEED_EVENTS)[keyof typeof FEED_EVENTS];

/** Where a post was shown. `viewer` = a single-post full-screen host without a list source. */
export type FeedSurface = "home" | "profile" | "search" | "viewer";

/** Surface of a feed list: home feed, an author's viewer (profile), search results. */
export function feedSurfaceForSource(source: FeedSource): FeedSurface {
  switch (source.kind) {
    case "home":
      return "home";
    case "author":
      return "profile";
    case "search":
      return "search";
    default:
      return "viewer";
  }
}

export type FeedEventValue = string | number | boolean | null;
export type FeedEventProperties = Record<string, FeedEventValue>;

export type FeedAnalyticsEvent = {
  event: FeedEventName;
  properties: FeedEventProperties;
};

/**
 * Keys any feed event may carry. A builder that tried to add anything else
 * would fail the allow-list test.
 */
export const FEED_EVENT_ALLOWED_KEYS = [
  "post_id",
  "surface",
  "position",
  "cycle",
  "has_image",
  "source_language",
  "display_language",
  "following_author",
  "author_is_official",
  "is_mine",
  "dwell_ms",
  "method",
  "to",
  "read_trigger",
  "is_reply",
  "entry",
  "text_length_bucket",
  "failure_reason",
  "days_since_last_bucket",
] as const;

/** Content-bearing keys that must never appear on a feed event (91). */
export const FEED_EVENT_FORBIDDEN_KEYS = [
  "text",
  "body",
  "source_text",
  "sourceText",
  "display_text",
  "displayText",
  "comment_text",
  "image_url",
  "imageUrl",
  "url",
  "name",
  "author_name",
  "handle",
  "author_handle",
  "author_id",
] as const;

// ---------------------------------------------------------------------------
// Post context: the shared, content-free description of one card appearance
// ---------------------------------------------------------------------------

export type FeedPostContext = {
  post_id: string;
  surface: FeedSurface;
  /** 0-based index of the appearance in the rendered list. */
  position: number | null;
  /** Feed cycle of the appearance (0 = first pass; ids repeat in later cycles). */
  cycle: number | null;
  has_image: boolean;
  source_language: string | null;
  display_language: string | null;
  following_author: boolean | null;
  author_is_official: boolean;
  is_mine: boolean;
};

const LANGUAGE_CODE = /^[a-z]{2,3}(?:-[A-Za-z0-9]{2,4})?$/;

/** A BCP-47-ish language code, or null for anything else (never free text). */
export function sanitizeLanguageCode(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return LANGUAGE_CODE.test(trimmed) ? trimmed : null;
}

export function feedPostContext(
  post: FeedPostDto,
  where: { surface: FeedSurface; position?: number | null; cycle?: number | null; displayLanguage?: string | null },
): FeedPostContext {
  return {
    post_id: post.id,
    surface: where.surface,
    position: typeof where.position === "number" && where.position >= 0 ? where.position : null,
    cycle: typeof where.cycle === "number" && where.cycle >= 0 ? where.cycle : null,
    has_image: Boolean(post.image?.url),
    source_language: sanitizeLanguageCode(post.sourceLanguage),
    display_language: sanitizeLanguageCode(where.displayLanguage ?? post.displayLanguage),
    following_author: post.followingAuthor,
    author_is_official: post.author.isOfficial === true,
    is_mine: post.isMine,
  };
}

function withContext(event: FeedEventName, ctx: FeedPostContext, extra?: FeedEventProperties): FeedAnalyticsEvent {
  return {
    event,
    properties: {
      post_id: ctx.post_id,
      surface: ctx.surface,
      position: ctx.position,
      cycle: ctx.cycle,
      has_image: ctx.has_image,
      source_language: ctx.source_language,
      display_language: ctx.display_language,
      following_author: ctx.following_author,
      author_is_official: ctx.author_is_official,
      is_mine: ctx.is_mine,
      ...extra,
    },
  };
}

// ---------------------------------------------------------------------------
// Buckets
// ---------------------------------------------------------------------------

export type TextLengthBucket = "0" | "1-50" | "51-200" | "201-500" | "501-1000" | "1001+";

/** Coarse body length (Unicode code points), never the text itself. */
export function textLengthBucket(text: string | null | undefined): TextLengthBucket {
  const n = text ? Array.from(text.trim()).length : 0;
  if (n === 0) return "0";
  if (n <= 50) return "1-50";
  if (n <= 200) return "51-200";
  if (n <= 500) return "201-500";
  if (n <= 1000) return "501-1000";
  return "1001+";
}

export type DaysSinceBucket = "first" | "0" | "1" | "2-3" | "4-7" | "8-30" | "31+";

const DAY_MS = 24 * 60 * 60 * 1000;

export function daysSinceBucket(lastAt: number | null, now: number): DaysSinceBucket {
  if (lastAt === null || !Number.isFinite(lastAt) || lastAt > now) return "first";
  const days = Math.floor((now - lastAt) / DAY_MS);
  if (days <= 0) return "0";
  if (days === 1) return "1";
  if (days <= 3) return "2-3";
  if (days <= 7) return "4-7";
  if (days <= 30) return "8-30";
  return "31+";
}

// ---------------------------------------------------------------------------
// Revisit: a feed session starts when the feed is shown >= 30 min after the
// last time it was shown.
// ---------------------------------------------------------------------------

export const FEED_SESSION_GAP_MS = 30 * 60 * 1000;

export type FeedSessionDecision = {
  startsSession: boolean;
  daysSinceLast: DaysSinceBucket;
};

/**
 * `lastSeenAt` is the last moment the feed was on screen (updated on every
 * show / activity), not the start of the previous session.
 */
export function evaluateFeedSession(lastSeenAt: number | null, now: number): FeedSessionDecision {
  if (lastSeenAt === null || !Number.isFinite(lastSeenAt) || lastSeenAt > now) {
    return { startsSession: true, daysSinceLast: "first" };
  }
  return {
    startsSession: now - lastSeenAt >= FEED_SESSION_GAP_MS,
    daysSinceLast: daysSinceBucket(lastSeenAt, now),
  };
}

// ---------------------------------------------------------------------------
// Builders (one per event)
// ---------------------------------------------------------------------------

export type LikeMethod = "button" | "double_tap";
export type ReadTrigger = "scrolled_to_end" | "dwell";
export type PublishFailureReason = "image_upload" | "create" | "restricted" | "rate_limited" | "network";

export const feedEvents = {
  sessionStarted(decision: FeedSessionDecision, surface: FeedSurface): FeedAnalyticsEvent {
    return {
      event: FEED_EVENTS.sessionStarted,
      properties: { surface, days_since_last_bucket: decision.daysSinceLast },
    };
  },
  postImpressed(ctx: FeedPostContext): FeedAnalyticsEvent {
    return withContext(FEED_EVENTS.postImpressed, ctx);
  },
  postSkipped(ctx: FeedPostContext, dwellMs: number): FeedAnalyticsEvent {
    return withContext(FEED_EVENTS.postSkipped, ctx, { dwell_ms: Math.max(0, Math.round(dwellMs)) });
  },
  postExpanded(ctx: FeedPostContext): FeedAnalyticsEvent {
    return withContext(FEED_EVENTS.postExpanded, ctx);
  },
  postRead(ctx: FeedPostContext, trigger: ReadTrigger): FeedAnalyticsEvent {
    return withContext(FEED_EVENTS.postRead, ctx, { read_trigger: trigger });
  },
  postLiked(ctx: FeedPostContext, method: LikeMethod): FeedAnalyticsEvent {
    return withContext(FEED_EVENTS.postLiked, ctx, { method });
  },
  postUnliked(ctx: FeedPostContext): FeedAnalyticsEvent {
    return withContext(FEED_EVENTS.postUnliked, ctx, { method: "button" });
  },
  translationToggled(ctx: FeedPostContext, to: "translated" | "original"): FeedAnalyticsEvent {
    return withContext(FEED_EVENTS.translationToggled, ctx, { to });
  },
  profileOpened(ctx: FeedPostContext): FeedAnalyticsEvent {
    return withContext(FEED_EVENTS.profileOpened, ctx);
  },
  commentsOpened(postId: string): FeedAnalyticsEvent {
    return { event: FEED_EVENTS.commentsOpened, properties: { post_id: postId } };
  },
  commentCreated(postId: string, isReply: boolean): FeedAnalyticsEvent {
    return { event: FEED_EVENTS.commentCreated, properties: { post_id: postId, is_reply: isReply } };
  },
  composeOpened(entry: "new" | "draft"): FeedAnalyticsEvent {
    return { event: FEED_EVENTS.composeOpened, properties: { entry } };
  },
  publishSucceeded(input: { hasImage: boolean; text: string | null }): FeedAnalyticsEvent {
    return {
      event: FEED_EVENTS.publishSucceeded,
      properties: { has_image: input.hasImage, text_length_bucket: textLengthBucket(input.text) },
    };
  },
  publishFailed(input: { hasImage: boolean; text: string | null; reason: PublishFailureReason }): FeedAnalyticsEvent {
    return {
      event: FEED_EVENTS.publishFailed,
      properties: {
        has_image: input.hasImage,
        text_length_bucket: textLengthBucket(input.text),
        failure_reason: input.reason,
      },
    };
  },
} as const;

// ---------------------------------------------------------------------------
// Delivery
// ---------------------------------------------------------------------------

type FeedEventSink = (event: FeedAnalyticsEvent) => void;

const defaultSink: FeedEventSink = ({ event, properties }) => {
  captureMingleClientEvent(event, properties);
};

let sink: FeedEventSink = defaultSink;

/** Drop any key outside the allow-list (defence in depth for the builders). */
export function pickAllowedProperties(properties: FeedEventProperties): FeedEventProperties {
  const allowed = new Set<string>(FEED_EVENT_ALLOWED_KEYS);
  const out: FeedEventProperties = {};
  for (const [key, value] of Object.entries(properties)) {
    if (allowed.has(key)) out[key] = value;
  }
  return out;
}

/** Send one feed event. Never throws: measurement must not break the feed. */
export function trackFeedEvent(event: FeedAnalyticsEvent): void {
  try {
    sink({ event: event.event, properties: pickAllowedProperties(event.properties) });
  } catch {
    // ignore
  }
}

/** TEST-ONLY: capture events instead of sending them. Pass null to restore. */
export function __setFeedEventSinkForTest(next: FeedEventSink | null): void {
  sink = next ?? defaultSink;
}

// ---------------------------------------------------------------------------
// Revisit storage
// ---------------------------------------------------------------------------

const LAST_SEEN_KEY = "mingle.feed.lastSeenAt";

type KeyValueStorage = Pick<Storage, "getItem" | "setItem">;

function defaultStorage(): KeyValueStorage | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

/**
 * Called whenever the feed is on screen (mount, return to foreground, card
 * change). Starts a session event when the previous show was >= 30 min ago,
 * then records `now` as the last show.
 */
export function noteFeedShown(
  surface: FeedSurface,
  now: number = Date.now(),
  storage: KeyValueStorage | null = defaultStorage(),
): FeedSessionDecision {
  let lastSeenAt: number | null = null;
  try {
    const raw = storage?.getItem(LAST_SEEN_KEY);
    const parsed = raw ? Number(raw) : NaN;
    lastSeenAt = Number.isFinite(parsed) ? parsed : null;
  } catch {
    lastSeenAt = null;
  }
  const decision = evaluateFeedSession(lastSeenAt, now);
  if (decision.startsSession) trackFeedEvent(feedEvents.sessionStarted(decision, surface));
  try {
    storage?.setItem(LAST_SEEN_KEY, String(now));
  } catch {
    // ignore
  }
  return decision;
}

/**
 * Record that the feed is on screen right now without evaluating a new
 * session (card changes, going to the background).
 */
export function recordFeedSeen(now: number = Date.now(), storage: KeyValueStorage | null = defaultStorage()): void {
  try {
    storage?.setItem(LAST_SEEN_KEY, String(now));
  } catch {
    // ignore
  }
}
