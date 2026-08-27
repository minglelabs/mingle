import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const {
  mockEnsureTrackingContext,
  mockRecordTrackedUserActivity,
  mockUpsertTrackedUser,
  mockUserFindUnique,
} = vi.hoisted(() => ({
  mockEnsureTrackingContext: vi.fn(),
  mockRecordTrackedUserActivity: vi.fn(),
  mockUpsertTrackedUser: vi.fn(),
  mockUserFindUnique: vi.fn(),
}));

vi.mock("@/lib/app-analytics", () => ({
  ensureTrackingContext: mockEnsureTrackingContext,
  parseClientContext: vi.fn(() => ({})),
  recordTrackedUserActivity: mockRecordTrackedUserActivity,
  upsertTrackedUser: mockUpsertTrackedUser,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: mockUserFindUnique,
    },
    appEventLog: {
      findFirst: vi.fn(),
    },
    appMessage: {
      findFirst: vi.fn(),
    },
  },
}));

import {
  requestAllowsLegacyAnonymousUser,
  resolveOrCreateUserIdForRequest,
  resolveTrackingExternalUserId,
  resolveUserIdForTrackedWrite,
} from "@/lib/request-user-identity";

describe("request user identity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEnsureTrackingContext.mockReturnValue({
      externalUserId: "anon_generated",
      sessionKey: "sess_generated",
    });
    mockRecordTrackedUserActivity.mockResolvedValue("user_session_real");
    mockUpsertTrackedUser.mockResolvedValue("user_legacy_anon");
  });

  it("uses the PostHog tracing distinct ID when the Mingle header is absent", () => {
    const request = new Request("https://mingle.example/api/conversations", {
      headers: { "x-posthog-distinct-id": "anon_posthog" },
    });

    expect(resolveTrackingExternalUserId(request)).toBe("anon_posthog");
  });

  it("allows anonymous ownership only for explicit 1.x API namespaces", () => {
    expect(requestAllowsLegacyAnonymousUser(new Request(
      "https://mingle.example/api/ios/v1.1.4/conversations",
    ))).toBe(true);
    expect(requestAllowsLegacyAnonymousUser(new Request(
      "https://mingle.example/api/android/v2.0.0/conversations",
    ))).toBe(false);
    expect(requestAllowsLegacyAnonymousUser(new Request(
      "https://mingle.example/api/conversations",
    ))).toBe(false);
    expect(requestAllowsLegacyAnonymousUser(new Request(
      "https://mingle.example/api/conversations",
      { headers: { "x-mingle-api-namespace": "ios/v1.1.4" } },
    ))).toBe(false);
    expect(requestAllowsLegacyAnonymousUser(new Request(
      "https://mingle.example/api/ios/v1.1.4/conversations",
      { headers: { "x-mingle-api-namespace": "ios/v2.0.0" } },
    ))).toBe(false);
  });

  it("resolves current conversation data only from the authenticated account", async () => {
    mockUserFindUnique.mockResolvedValue({ id: "user_session_real" });
    const request = new NextRequest("https://mingle.example/api/ios/v2.0.0/conversations", {
      headers: { "x-mingle-user-id": "anon_device" },
    });

    const result = await resolveOrCreateUserIdForRequest({
      request,
      session: { user: { id: "user_session_real" } },
    });

    expect(result.userId).toBe("user_session_real");
    expect(mockUserFindUnique).toHaveBeenCalledTimes(1);
    expect(mockUserFindUnique).toHaveBeenCalledWith({
      where: { id: "user_session_real" },
      select: { id: true },
    });
    expect(mockUpsertTrackedUser).not.toHaveBeenCalled();
  });

  it("fails closed when a session references a missing account", async () => {
    mockUserFindUnique.mockResolvedValue(null);
    const request = new NextRequest("https://mingle.example/api/ios/v2.0.0/conversations", {
      headers: { "x-mingle-user-id": "anon_device" },
    });

    const result = await resolveOrCreateUserIdForRequest({
      request,
      session: { user: { id: "deleted_account" } },
    });

    expect(result.userId).toBe("");
    expect(mockUpsertTrackedUser).not.toHaveBeenCalled();
  });

  it("rejects current conversation ownership while the session is missing", async () => {
    const request = new NextRequest("https://mingle.example/api/ios/v2.0.0/conversations", {
      headers: { "x-mingle-user-id": "anon_device" },
    });

    const result = await resolveOrCreateUserIdForRequest({ request, session: null });

    expect(result.userId).toBe("");
    expect(mockUserFindUnique).not.toHaveBeenCalled();
    expect(mockUpsertTrackedUser).not.toHaveBeenCalled();
  });

  it("updates canonical account telemetry without upserting by tracking id", async () => {
    mockUserFindUnique.mockResolvedValue({ id: "user_session_real" });
    const request = new NextRequest("https://mingle.example/api/ios/v2.0.0/log/client-event");
    const tracking = { externalUserId: "anon_device", sessionKey: "sess_123" } as never;
    const clientContext = {} as never;

    const userId = await resolveUserIdForTrackedWrite({
      request,
      session: { user: { id: "user_session_real" } },
      tracking,
      clientContext,
    });

    expect(userId).toBe("user_session_real");
    expect(mockRecordTrackedUserActivity).toHaveBeenCalledWith({
      userId: "user_session_real",
      tracking,
      clientContext,
    });
    expect(mockUpsertTrackedUser).not.toHaveBeenCalled();
  });

  it("keeps legacy anonymous tracked writes compatible", async () => {
    const request = new NextRequest("https://mingle.example/api/ios/v1.1.4/log/client-event");
    const tracking = { externalUserId: "anon_device", sessionKey: "sess_123" } as never;
    const clientContext = {} as never;

    const userId = await resolveUserIdForTrackedWrite({
      request,
      session: null,
      tracking,
      clientContext,
    });

    expect(userId).toBe("user_legacy_anon");
    expect(mockUpsertTrackedUser).toHaveBeenCalledWith({ tracking, clientContext });
  });

  it("does not create a tracked user for a current unauthenticated write", async () => {
    const request = new NextRequest("https://mingle.example/api/ios/v2.0.0/log/client-event");

    const userId = await resolveUserIdForTrackedWrite({
      request,
      session: null,
      tracking: {} as never,
      clientContext: {} as never,
    });

    expect(userId).toBe("");
    expect(mockRecordTrackedUserActivity).not.toHaveBeenCalled();
    expect(mockUpsertTrackedUser).not.toHaveBeenCalled();
  });
});
