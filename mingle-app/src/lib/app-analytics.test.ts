import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockAppEventLogCreate,
  mockAppEventLogUpsert,
  mockCaptureMingleEvent,
  mockUserUpdate,
} = vi.hoisted(() => ({
  mockAppEventLogCreate: vi.fn(),
  mockAppEventLogUpsert: vi.fn(),
  mockCaptureMingleEvent: vi.fn(),
  mockUserUpdate: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      update: mockUserUpdate,
    },
    appEventLog: {
      create: mockAppEventLogCreate,
      upsert: mockAppEventLogUpsert,
    },
  },
}));

vi.mock("@/lib/posthog-server", () => ({
  captureMingleEvent: mockCaptureMingleEvent,
}));

import {
  createTrackedEventLog,
  recordTrackedUserActivity,
  type ClientContext,
  type TrackingContext,
} from "@/lib/app-analytics";

const tracking: TrackingContext = {
  externalUserId: "anon_1",
  sessionKey: "sess_1",
  ipAddress: null,
  userAgent: null,
  requestLocale: null,
  requestFullUrl: null,
  requestPathname: null,
};

const clientContext: ClientContext = {
  language: null,
  pageLanguage: null,
  referrer: null,
  fullUrl: null,
  queryParams: null,
  screenWidth: null,
  screenHeight: null,
  timezone: null,
  platform: null,
  clientPlatform: null,
  apiNamespace: null,
  pathname: null,
  appVersion: null,
  usageSec: null,
};

describe("createTrackedEventLog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("upserts keyed on messageId + eventType so a retried finalize updates the same row atomically", async () => {
    await createTrackedEventLog({
      userId: "user-1",
      tracking,
      clientContext,
      eventType: "stt_turn_finalized",
      messageId: "msg-1",
      metadata: { text: "server final" },
    });

    expect(mockAppEventLogUpsert).toHaveBeenCalledWith({
      where: {
        messageId_eventType: {
          messageId: "msg-1",
          eventType: "stt_turn_finalized",
        },
      },
      create: expect.objectContaining({
        eventType: "stt_turn_finalized",
        metadata: { text: "server final" },
      }),
      update: expect.objectContaining({
        eventType: "stt_turn_finalized",
        metadata: { text: "server final" },
      }),
    });
    expect(mockAppEventLogCreate).not.toHaveBeenCalled();
  });

  it("issues one atomic upsert per call, so two overlapping retries for the same message can't race between a check and a write", async () => {
    let releaseFirstUpsert: () => void = () => {};
    const firstUpsertStarted = new Promise<void>((resolve) => {
      mockAppEventLogUpsert.mockImplementationOnce(() => {
        resolve();
        return new Promise((resolveUpsert) => {
          releaseFirstUpsert = () => resolveUpsert(undefined);
        });
      });
    });
    mockAppEventLogUpsert.mockImplementationOnce(async () => undefined);

    const firstRequest = createTrackedEventLog({
      userId: "user-1",
      tracking,
      clientContext,
      eventType: "stt_turn_finalized",
      messageId: "msg-1",
      metadata: { text: "local partial" },
    });

    // Wait until the first call is in flight before starting the retry, mirroring
    // a client retry landing while the original request is still being processed.
    await firstUpsertStarted;

    const secondRequest = createTrackedEventLog({
      userId: "user-1",
      tracking,
      clientContext,
      eventType: "stt_turn_finalized",
      messageId: "msg-1",
      metadata: { text: "server final" },
    });

    releaseFirstUpsert();
    await Promise.all([firstRequest, secondRequest]);

    // Both calls target the same DB-enforced unique key via a single upsert each,
    // instead of a separate check step something could slip between.
    expect(mockAppEventLogUpsert).toHaveBeenCalledTimes(2);
    for (const [args] of mockAppEventLogUpsert.mock.calls) {
      expect(args.where).toEqual({
        messageId_eventType: { messageId: "msg-1", eventType: "stt_turn_finalized" },
      });
    }
    expect(mockAppEventLogCreate).not.toHaveBeenCalled();
  });

  it("creates directly without an upsert lookup when there is no messageId", async () => {
    await createTrackedEventLog({
      userId: "user-1",
      tracking,
      clientContext,
      eventType: "stt_session_started",
    });

    expect(mockAppEventLogUpsert).not.toHaveBeenCalled();
    expect(mockAppEventLogCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ eventType: "stt_session_started" }),
    }));
  });

  it("forwards release-safe analytics properties without message text", async () => {
    await createTrackedEventLog({
      userId: "user-1",
      tracking,
      clientContext: {
        ...clientContext,
        apiNamespace: "android/v2.0.0",
        appVersion: "2.0.0",
        clientPlatform: "android",
        language: "ko",
        pathname: "/conversation",
      },
      eventType: "stt_turn_finalized",
      messageId: "msg-1",
      metadata: {
        sourceLanguage: "ko",
        sourceText: "비공개 원문",
        translations: { en: "Private translation" },
        translationLanguages: ["en", "ja"],
        model: "model-id",
        clientMetadata: {
          speaker: "self",
          reason: "manual_text_input",
          sourceText: "또 다른 비공개 원문",
        },
      },
    });

    expect(mockCaptureMingleEvent).toHaveBeenCalledWith({
      distinctId: "anon_1",
      event: "mingle_stt_turn_finalized",
      properties: expect.objectContaining({
        app_version: "2.0.0",
        api_namespace: "android/v2.0.0",
        client_platform: "android",
        translation_language_count: 2,
        speaker: "self",
        message_input_mode: "keyboard",
        has_message: true,
      }),
    });

    expect(mockCaptureMingleEvent).toHaveBeenCalledWith({
      distinctId: "anon_1",
      event: "mingle_message_sent",
      properties: expect.objectContaining({
        message_input_mode: "keyboard",
        has_message: true,
      }),
    });

    const capturedProperties = mockCaptureMingleEvent.mock.calls.at(-1)?.[0]?.properties;
    expect(capturedProperties).not.toHaveProperty("sourceText");
    expect(capturedProperties).not.toHaveProperty("translations");
  });
});

describe("recordTrackedUserActivity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUserUpdate.mockResolvedValue({
      id: "account-user-1",
      totalUsageSec: 0,
      appVersionHistory: [],
      apiNamespaceHistory: [],
    });
  });

  it("enriches the canonical account by id without adopting the device tracking id", async () => {
    await recordTrackedUserActivity({
      userId: "account-user-1",
      tracking: {
        ...tracking,
        externalUserId: "anon_device_that_must_not_become_the_owner",
        ipAddress: "127.0.0.1",
      },
      clientContext: {
        ...clientContext,
        apiNamespace: "ios/v2.0.0",
        appVersion: "2.0.0",
        usageSec: 12,
      },
    });

    expect(mockUserUpdate).toHaveBeenNthCalledWith(1, expect.objectContaining({
      where: { id: "account-user-1" },
      data: expect.objectContaining({
        latestIpAddress: "127.0.0.1",
        latestApiNamespace: "ios/v2.0.0",
        latestAppVersion: "2.0.0",
      }),
    }));
    expect(mockUserUpdate.mock.calls[0]?.[0]?.data).not.toHaveProperty("externalUserId");
    expect(mockUserUpdate).toHaveBeenNthCalledWith(2, {
      where: { id: "account-user-1" },
      data: {
        totalUsageSec: 12,
        appVersionHistory: ["2.0.0"],
        apiNamespaceHistory: ["ios/v2.0.0"],
      },
    });
  });
});
