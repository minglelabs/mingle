import { afterEach, describe, expect, it, vi } from "vitest";
import {
  formatChatBubbleTimestamp,
  formatChatBubbleTimestampLines,
  getNextChatBubbleTimestampUpdateDelayMs,
  hasRenderableChatBubbleTimestamp,
} from "./chat-bubble.timestamp";

function buildExpectedAbsoluteTimestampLines(
  createdAtMs: number,
  locale: string,
): string[] {
  const created = new Date(createdAtMs);
  const dateLine = `${created.getMonth() + 1}/${created.getDate()}`;
  const parts = new Intl.DateTimeFormat(locale, {
    hour: "numeric",
    minute: "2-digit",
  }).formatToParts(created);

  let hour = "";
  let minute = "";
  let dayPeriod = "";

  for (const part of parts) {
    if (part.type === "hour") hour = part.value;
    if (part.type === "minute") minute = part.value;
    if (part.type === "dayPeriod") dayPeriod = part.value.trim();
  }

  const timeLine = hour && minute
    ? `${hour}:${minute}`
    : new Intl.DateTimeFormat(locale, {
      hour: "numeric",
      minute: "2-digit",
    }).format(created);

  return dayPeriod ? [dateLine, timeLine, dayPeriod] : [dateLine, timeLine];
}

describe("formatChatBubbleTimestamp", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns compact seconds-ago timestamps", () => {
    vi.spyOn(Date, "now").mockReturnValue(
      new Date("2026-03-11T13:06:10+09:00").getTime(),
    );
    const createdAtMs = new Date("2026-03-11T13:06:00+09:00").getTime();

    expect(formatChatBubbleTimestamp(createdAtMs, "ko")).toBe("10s ago");
    expect(formatChatBubbleTimestampLines(createdAtMs, "en")).toEqual(["10s ago"]);
  });

  it("returns compact minute and hour timestamps", () => {
    vi.spyOn(Date, "now").mockReturnValue(
      new Date("2026-03-11T13:06:10+09:00").getTime(),
    );

    const minutesAgoMs = new Date("2026-03-11T12:58:00+09:00").getTime();
    const hoursAgoMs = new Date("2026-03-11T11:06:00+09:00").getTime();

    expect(formatChatBubbleTimestamp(minutesAgoMs, "en")).toBe("8m ago");
    expect(formatChatBubbleTimestamp(hoursAgoMs, "en")).toBe("2h ago");
  });

  it("returns multiline absolute timestamps for older messages", () => {
    vi.spyOn(Date, "now").mockReturnValue(
      new Date("2026-03-11T13:06:10+09:00").getTime(),
    );
    const createdAtMs = new Date("2026-03-09T15:44:00+09:00").getTime();

    expect(formatChatBubbleTimestampLines(createdAtMs, "en")).toEqual(
      buildExpectedAbsoluteTimestampLines(createdAtMs, "en"),
    );
  });

  it("returns an empty timestamp for missing timestamps", () => {
    expect(formatChatBubbleTimestamp(undefined, "ko")).toBe("");
    expect(formatChatBubbleTimestampLines(undefined, "ko")).toEqual([]);
  });

  it("computes the next refresh boundary for relative timestamps", () => {
    const nowMs = new Date("2026-03-11T13:06:10.250+09:00").getTime();

    expect(getNextChatBubbleTimestampUpdateDelayMs(nowMs - 10_250, nowMs)).toBe(750);
    expect(getNextChatBubbleTimestampUpdateDelayMs(nowMs - (8 * 60_000 + 10_250), nowMs)).toBe(49_750);
    expect(getNextChatBubbleTimestampUpdateDelayMs(nowMs - (2 * 60 * 60_000 + 10_250), nowMs)).toBe(59 * 60_000 + 49_750);
  });

  it("clamps sub-millisecond refresh delays away from immediate update loops", () => {
    const nowMs = new Date("2026-03-11T13:06:10.250+09:00").getTime();

    expect(getNextChatBubbleTimestampUpdateDelayMs(nowMs - 10_999.75, nowMs)).toBe(50);
  });

  it("stops refreshing once the timestamp becomes absolute", () => {
    const nowMs = new Date("2026-03-11T13:06:10+09:00").getTime();
    const oldCreatedAtMs = new Date("2026-03-10T13:06:10+09:00").getTime();

    expect(getNextChatBubbleTimestampUpdateDelayMs(oldCreatedAtMs, nowMs)).toBeNull();
    expect(hasRenderableChatBubbleTimestamp(oldCreatedAtMs)).toBe(true);
    expect(hasRenderableChatBubbleTimestamp(undefined)).toBe(false);
  });
});
