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
