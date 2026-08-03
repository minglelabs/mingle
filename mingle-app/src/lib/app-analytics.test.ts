import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockAppEventLogFindFirst,
  mockAppEventLogCreate,
  mockAppEventLogUpdate,
} = vi.hoisted(() => ({
  mockAppEventLogFindFirst: vi.fn(),
  mockAppEventLogCreate: vi.fn(),
  mockAppEventLogUpdate: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    appEventLog: {
      findFirst: mockAppEventLogFindFirst,
      create: mockAppEventLogCreate,
      update: mockAppEventLogUpdate,
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

  it("creates a new row when no prior event log exists for the message", async () => {
    mockAppEventLogFindFirst.mockResolvedValue(null);

    await createTrackedEventLog({
      userId: "user-1",
      tracking,
      clientContext,
      eventType: "stt_turn_finalized",
      messageId: "msg-1",
      metadata: { text: "local partial" },
    });

    expect(mockAppEventLogCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ eventType: "stt_turn_finalized" }),
    }));
    expect(mockAppEventLogUpdate).not.toHaveBeenCalled();
  });

  it("updates the existing row instead of dropping a reconciled finalize for the same message", async () => {
    mockAppEventLogFindFirst.mockResolvedValue({ id: "log-1" });

    await createTrackedEventLog({
      userId: "user-1",
      tracking,
      clientContext,
      eventType: "stt_turn_finalized",
      messageId: "msg-1",
      metadata: { text: "server final" },
    });

    expect(mockAppEventLogUpdate).toHaveBeenCalledWith({
      where: { id: "log-1" },
      data: expect.objectContaining({
        eventType: "stt_turn_finalized",
        metadata: { text: "server final" },
      }),
    });
    expect(mockAppEventLogCreate).not.toHaveBeenCalled();
  });

  it("creates directly without a dedupe lookup when there is no messageId", async () => {
    await createTrackedEventLog({
      userId: "user-1",
      tracking,
      clientContext,
      eventType: "stt_session_started",
    });

    expect(mockAppEventLogFindFirst).not.toHaveBeenCalled();
    expect(mockAppEventLogCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ eventType: "stt_session_started" }),
    }));
  });
});
