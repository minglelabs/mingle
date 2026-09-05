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

  it.each(["title", "mark-read", "status"] as const)("preserves display language during %s and after reload", async (kind) => {
    mutations.enqueueConversationMutation(identity, {
      conversationId: "conversation-1", kind, endpoint: "/api/conversations/conversation-1",
      body: {}, patch: { title: "New", unreadMessageCount: 0, status: "paused" }, now: 1_000,
    });
    const assertLanguage = () => {
      const records = mutations.readConversationMutationRecords(identity, 1_000);
      expect(records[0].patch).not.toHaveProperty("defaultDisplayLanguage");
      expect(mutations.applyPendingConversationMutations([buildConversation()], records)[0].defaultDisplayLanguage).toBe("en");
    };
    assertLanguage();
    vi.resetModules();
    mutations = await import("./conversation-mutation-queue");
    assertLanguage();
  });

  it("still allows an explicit display-language reset", () => {
    mutations.enqueueConversationMutation(identity, {
      conversationId: "conversation-1", kind: "default-display-language", endpoint: "/api/conversations/conversation-1",
      body: { defaultDisplayLanguage: null }, patch: { defaultDisplayLanguage: null }, now: 1_000,
    });
    expect(mutations.applyPendingConversationMutations([buildConversation()], mutations.readConversationMutationRecords(identity, 1_000))[0].defaultDisplayLanguage).toBeNull();
  });

  it("preserves a shared room union larger than one member's selection limit", () => {
    const union = ["ko", "en", "ja", "fr", "de", "es"];
    mutations.enqueueConversationMutation(identity, {
      conversationId: "conversation-1", kind: "selected-languages", endpoint: "/api/conversations/conversation-1",
      body: { selectedLanguages: ["ko"] }, patch: { selectedLanguages: union }, now: 1_000,
    });
    expect(mutations.readConversationMutationRecords(identity, 1_000)[0].patch.selectedLanguages).toEqual(union);
  });

  it("does not let a later setting pass a failed setting, even on forced flush", async () => {
    for (const [index, kind] of (["speech-languages", "translation-languages-linked"] as const).entries()) {
      mutations.enqueueConversationMutation(identity, {
        conversationId: "conversation-1", kind, endpoint: "/api/conversations/conversation-1",
        body: { kind }, patch: {}, now: 1_000 + index,
      });
    }
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 503 }));
    await mutations.flushConversationMutationQueue({ identity, fetchImpl, now: () => 2_000, force: true });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    await mutations.flushConversationMutationQueue({ identity, fetchImpl, now: () => 2_001 });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    fetchImpl.mockImplementation(async () => new Response("{}", { status: 200 }));
    await mutations.flushConversationMutationQueue({ identity, fetchImpl, now: () => 5_000 });
    expect(fetchImpl.mock.calls.map(([, init]) => JSON.parse(init.body).kind)).toEqual([
      "speech-languages", "speech-languages", "translation-languages-linked",
    ]);
  });

  it("keeps coalesced selection/link edits in latest user-action order", async () => {
    const select = (now: number) => mutations.enqueueConversationMutation(identity, {
      conversationId: "conversation-1", kind: "selected-languages", endpoint: "/api/conversations/conversation-1",
      body: { selectedLanguages: ["ko"] }, patch: { selectedLanguages: ["ko"], translationLanguagesLinked: false },
      rollback: { selectedLanguages: ["en"] }, now,
    });
    select(1_000);
    mutations.enqueueConversationMutation(identity, {
      conversationId: "conversation-1", kind: "translation-languages-linked", endpoint: "/api/conversations/conversation-1",
      body: { translationLanguagesLinked: true }, patch: { translationLanguagesLinked: true }, now: 2_000,
    });
    select(3_000);
    const records = mutations.readConversationMutationRecords(identity, 3_000);
    expect(records.map((record) => record.kind)).toEqual(["translation-languages-linked", "selected-languages"]);
    expect(records[1].rollback).toEqual({ selectedLanguages: ["en"] });
    expect(mutations.applyPendingConversationMutations([buildConversation()], records)[0].translationLanguagesLinked).toBe(false);
    const fetchImpl = vi.fn(async () => new Response("{}"));
    await mutations.flushConversationMutationQueue({ identity, fetchImpl, now: () => 4_000 });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it.each([204, 404])("discards superseded writes after removal returns %s", async (status) => {
    mutations.enqueueConversationMutation(identity, {
      conversationId: "conversation-1", kind: "title", endpoint: "/api/conversations/conversation-1",
      body: { title: "New" }, patch: { title: "New" }, now: 1_000,
    });
    await mutations.flushConversationMutationQueue({ identity, fetchImpl: async () => new Response(null, { status: 503 }), now: () => 2_000 });
    mutations.enqueueConversationMutation(identity, {
      conversationId: "conversation-1", kind: "remove", endpoint: "/api/conversations/conversation-1", method: "DELETE",
      body: {}, patch: { removed: true }, now: 2_001,
    });
    const fetchImpl = vi.fn(async () => new Response(null, { status }));
    await expect(mutations.flushConversationMutationQueue({ identity, fetchImpl, now: () => 2_002 })).resolves.toEqual({ delivered: 1, retained: 0 });
    expect(fetchImpl).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ method: "DELETE" }));
    await mutations.flushConversationMutationQueue({ identity, fetchImpl, now: () => 10_000 });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("retains superseded edits when removal is rejected", async () => {
    mutations.enqueueConversationMutation(identity, {
      conversationId: "conversation-1", kind: "title", endpoint: "/api/conversations/conversation-1",
      body: { title: "New" }, patch: { title: "New" }, now: 1_000,
    });
    mutations.enqueueConversationMutation(identity, {
      conversationId: "conversation-1", kind: "remove", endpoint: "/api/conversations/conversation-1", method: "DELETE",
      body: {}, patch: { removed: true }, now: 1_001,
    });
    const fetchImpl = vi.fn().mockResolvedValueOnce(new Response(null, { status: 403 })).mockResolvedValueOnce(new Response(null, { status: 503 }));
    await mutations.flushConversationMutationQueue({ identity, fetchImpl, now: () => 2_000 });
    expect(mutations.readConversationMutationRecords(identity, 2_000).map((record) => record.kind)).toEqual(["title"]);
  });
});
