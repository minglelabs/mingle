import { describe, expect, it } from "vitest";

import {
  isNativeSttMessageForConversation,
  readNativeSttMessageQueue,
  removeNativeSttQueuedMessage,
  splitNativeSttMessagesForConversation,
} from "./native-stt-event-queue";

describe("native STT event queue helpers", () => {
  it("keeps only valid message events when reading the WebView queue", () => {
    expect(readNativeSttMessageQueue([
      { type: "message", queueId: "1", raw: "{}", conversationId: "room-a" },
      { type: "status", status: "running" },
      { type: "message", raw: "" },
      null,
    ])).toEqual([
      { queueId: "1", raw: "{}", conversationId: "room-a" },
    ]);
  });

  it("splits queued events by conversation without dropping another room's events", () => {
    const messages = readNativeSttMessageQueue([
      { type: "message", queueId: "a", raw: "a", conversationId: "room-a" },
      { type: "message", queueId: "b", raw: "b", conversationId: "room-b" },
      { type: "message", queueId: "legacy", raw: "legacy" },
    ]);

    expect(splitNativeSttMessagesForConversation(messages, "room-a")).toEqual({
      matching: [messages[0], messages[2]],
      remaining: [messages[1]],
    });
  });

  it("removes a delivered event by queue id", () => {
    const messages = readNativeSttMessageQueue([
      { type: "message", queueId: "a", raw: "a" },
      { type: "message", queueId: "b", raw: "b" },
    ]);

    expect(removeNativeSttQueuedMessage(messages, "a")).toEqual([
      { queueId: "b", raw: "b" },
    ]);
    expect(isNativeSttMessageForConversation({ conversationId: "room-a" }, "room-a")).toBe(true);
    expect(isNativeSttMessageForConversation({ conversationId: "room-a" }, "room-b")).toBe(false);
  });
});
