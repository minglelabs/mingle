import { describe, expect, it } from "vitest";
import { createClientMessageId, mergeServerMessages, type DirectMessage } from "./use-direct-message-thread";

function message(overrides: Partial<DirectMessage> & { id: string }): DirectMessage {
  return {
    clientMessageId: overrides.id,
    originalText: "hi",
    sourceLanguage: "en",
    translations: {},
    createdAt: "2026-08-19T00:00:00.000Z",
    sender: null,
    isMine: true,
    ...overrides,
  };
}

describe("mergeServerMessages", () => {
  it("keeps an optimistic row the server has not echoed back yet", () => {
    const pending = message({ id: "local-1", isPending: true });

    const merged = mergeServerMessages([pending], [message({ id: "server-1" })]);

    expect(merged.map((entry) => entry.id)).toEqual(["server-1", "local-1"]);
  });

  it("drops the optimistic row once the server confirms its clientMessageId", () => {
    const pending = message({ id: "local-1", isPending: true });
    const confirmed = message({ id: "server-1", clientMessageId: "local-1" });

    const merged = mergeServerMessages([pending], [confirmed]);

    expect(merged).toEqual([confirmed]);
  });

  it("keeps a failed row so its retry affordance survives a poll", () => {
    const failed = message({ id: "local-1", hasFailed: true });

    const merged = mergeServerMessages([failed], []);

    expect(merged).toEqual([failed]);
  });

  it("does not resurrect a delivered row that the server stopped returning", () => {
    const delivered = message({ id: "server-1" });

    const merged = mergeServerMessages([delivered], []);

    expect(merged).toEqual([]);
  });
});

describe("createClientMessageId", () => {
  it("produces distinct prefixed ids", () => {
    const first = createClientMessageId();
    const second = createClientMessageId();

    expect(first).toMatch(/^dm_/);
    expect(first).not.toBe(second);
  });
});
