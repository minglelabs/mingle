import { afterEach, describe, expect, it, vi } from "vitest";
import {
  formatChatBubbleTimestamp,
  formatChatBubbleTimestampLines,
} from "./chat-bubble.timestamp";

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

    expect(formatChatBubbleTimestampLines(createdAtMs, "en")).toEqual([
      "3/9",
      "3:44",
      "PM",
    ]);
  });

  it("returns an empty timestamp for missing timestamps", () => {
    expect(formatChatBubbleTimestamp(undefined, "ko")).toBe("");
    expect(formatChatBubbleTimestampLines(undefined, "ko")).toEqual([]);
  });
});
