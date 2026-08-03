import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockAppEventLogCreate,
  mockAppEventLogUpsert,
} = vi.hoisted(() => ({
  mockAppEventLogCreate: vi.fn(),
  mockAppEventLogUpsert: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    appEventLog: {
      create: mockAppEventLogCreate,
      upsert: mockAppEventLogUpsert,
    },
  },
}));

import { createTrackedEventLog, type ClientContext, type TrackingContext } from "@/lib/app-analytics";

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
});
