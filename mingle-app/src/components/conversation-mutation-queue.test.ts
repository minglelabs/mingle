import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type MutationModule = typeof import("./conversation-mutation-queue");

function createStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear() {
      values.clear();
    },
    getItem(key: string) {
      return values.get(key) ?? null;
    },
    key(index: number) {
      return [...values.keys()][index] ?? null;
    },
    removeItem(key: string) {
      values.delete(key);
    },
    setItem(key: string, value: string) {
      values.set(key, value);
    },
  };
}

function buildConversation() {
  return {
    id: "conversation-1",
    sequenceNumber: 1,
    title: "Original title",
    status: "active" as const,
    sessionKey: "session-1",
    isMultiMember: false,
    isBlockedCounterpart: false,
    selectedLanguages: ["en"],
    speechLanguages: ["en"],
    translationLanguagesLinked: true,
    defaultDisplayLanguage: "en",
    otherMembers: [],
    createdAt: "2026-08-26T00:00:00.000Z",
    updatedAt: "2026-08-26T00:00:00.000Z",
    pausedAt: null,
  };
}

describe("conversation mutation queue", () => {
  let mutations: MutationModule;
  let localStorage: Storage;
  const identity = {
    apiNamespace: "ios/v2.0.0",
    authenticatedUserId: "user-1",
    externalUserId: "tracking-1",
  };

  beforeEach(async () => {
    localStorage = createStorage();
    vi.stubGlobal("window", { localStorage, fetch: vi.fn() });
    vi.resetModules();
    mutations = await import("./conversation-mutation-queue");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("coalesces a setting and overlays it on an older server snapshot", () => {
    mutations.enqueueConversationMutation(identity, {
      conversationId: "conversation-1",
      kind: "selected-languages",
      endpoint: "/api/ios/v2.0.0/conversations/conversation-1",
      body: { selectedLanguages: ["ko"] },
      patch: { selectedLanguages: ["ko"], viewerSelectedLanguages: ["ko"] },
      rollback: { selectedLanguages: ["en"], viewerSelectedLanguages: ["en"] },
      now: 1_000,
    });
    mutations.enqueueConversationMutation(identity, {
      conversationId: "conversation-1",
      kind: "selected-languages",
      endpoint: "/api/ios/v2.0.0/conversations/conversation-1",
      body: { selectedLanguages: ["ja"] },
      patch: { selectedLanguages: ["ja"], viewerSelectedLanguages: ["ja"] },
      rollback: { selectedLanguages: ["en"], viewerSelectedLanguages: ["en"] },
      now: 2_000,
    });

    expect(mutations.readConversationMutationRecords(identity, 2_000)).toHaveLength(1);
    expect(mutations.readConversationMutationRecords(identity, 2_000)[0]).toEqual(
      expect.objectContaining({ body: '{"selectedLanguages":["ja"]}' }),
    );
    expect(mutations.applyPendingConversationMutations([buildConversation()], mutations.readConversationMutationRecords(identity, 2_000))).toEqual([
      expect.objectContaining({ selectedLanguages: ["ja"], viewerSelectedLanguages: ["ja"] }),
    ]);
  });

  it("retains a transient failure and retries it in order", async () => {
    mutations.enqueueConversationMutation(identity, {
      conversationId: "conversation-1",
      kind: "title",
      endpoint: "/api/ios/v2.0.0/conversations/conversation-1",
      body: { title: "New title" },
      patch: { title: "New title" },
      rollback: { title: "Original title" },
      now: 1_000,
    });

    const fetchImpl = vi.fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(new Response(JSON.stringify({ conversation: buildConversation() }), { status: 200 }));

    await expect(mutations.flushConversationMutationQueue({
      identity,
      fetchImpl,
      force: true,
      now: (() => 2_000),
    })).resolves.toEqual({ delivered: 0, retained: 1 });
    expect(mutations.readConversationMutationRecords(identity, 2_000)[0]).toEqual(
      expect.objectContaining({ attemptCount: 1, nextAttemptAt: 4_000 }),
    );

    await expect(mutations.flushConversationMutationQueue({
      identity,
      fetchImpl,
      force: true,
      now: (() => 2_500),
    })).resolves.toEqual({ delivered: 1, retained: 0 });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("does not acknowledge an older response after a newer coalesced edit", () => {
    const first = mutations.enqueueConversationMutation(identity, {
      conversationId: "conversation-1",
      kind: "title",
      endpoint: "/api/ios/v2.0.0/conversations/conversation-1",
      body: { title: "First" },
      patch: { title: "First" },
      rollback: { title: "Original title" },
      now: 1_000,
    });
    mutations.enqueueConversationMutation(identity, {
      conversationId: "conversation-1",
      kind: "title",
      endpoint: "/api/ios/v2.0.0/conversations/conversation-1",
      body: { title: "Second" },
      patch: { title: "Second" },
      rollback: { title: "Original title" },
      now: 2_100,
    });

    expect(mutations.acknowledgeConversationMutation(identity, first)).toBe(false);
    expect(mutations.readConversationMutationRecords(identity, 2_100)).toHaveLength(1);
    expect(mutations.readConversationMutationRecords(identity, 2_100)[0]).toEqual(
      expect.objectContaining({ body: '{"title":"Second"}' }),
    );
  });

  it("hides a pending removal and treats an already-removed server room as success", async () => {
    mutations.enqueueConversationMutation(identity, {
      conversationId: "conversation-1",
      kind: "remove",
      endpoint: "/api/ios/v2.0.0/conversations/conversation-1",
      method: "DELETE",
      body: {},
      patch: { removed: true },
      now: 1_000,
    });

    expect(mutations.applyPendingConversationMutations(
      [buildConversation()],
      mutations.readConversationMutationRecords(identity, 1_000),
    )).toEqual([]);

    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 404 }));
    await expect(mutations.flushConversationMutationQueue({
      identity,
      fetchImpl,
      force: true,
      now: () => 1_500,
    })).resolves.toEqual({ delivered: 1, retained: 0 });
  });

  it("removes a permanent rejection and invokes the rollback hook", async () => {
    mutations.enqueueConversationMutation(identity, {
      conversationId: "conversation-1",
      kind: "title",
      endpoint: "/api/ios/v2.0.0/conversations/conversation-1",
      body: { title: "Rejected title" },
      patch: { title: "Rejected title" },
      rollback: { title: "Original title" },
      now: 1_000,
    });

    const onPermanentFailure = vi.fn();
    await expect(mutations.flushConversationMutationQueue({
      identity,
      fetchImpl: vi.fn().mockResolvedValue(new Response(null, { status: 403 })),
      force: true,
      now: () => 1_500,
      onPermanentFailure,
    })).resolves.toEqual({ delivered: 0, retained: 0 });

    expect(onPermanentFailure).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "title" }),
      expect.objectContaining({ status: 403 }),
      true,
    );
  });

  it("keeps both memory and storage bounded to the newest mutations", () => {
    for (let index = 0; index < 205; index += 1) {
      mutations.enqueueConversationMutation(identity, {
        conversationId: `conversation-${index}`,
        kind: "title",
        endpoint: `/api/ios/v2.0.0/conversations/conversation-${index}`,
        body: { title: `Title ${index}` },
        patch: { title: `Title ${index}` },
        now: 1_000 + index,
      });
    }

    const records = mutations.readConversationMutationRecords(identity, 2_000);
    expect(records).toHaveLength(200);
    expect(records[0]?.conversationId).toBe("conversation-5");
    const storageKey = localStorage.key(0);
    expect(storageKey).toBeTruthy();
    expect(JSON.parse(localStorage.getItem(storageKey ?? "") ?? "[]")).toHaveLength(200);
  });
});
