import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const {
  mockGetServerSession,
  mockFindOrCreateDirectConversation,
  mockEnsureTrackingContext,
  mockResolveOrCreateUserIdForRequest,
} = vi.hoisted(() => ({
  mockGetServerSession: vi.fn(),
  mockFindOrCreateDirectConversation: vi.fn(),
  mockEnsureTrackingContext: vi.fn(),
  mockResolveOrCreateUserIdForRequest: vi.fn(),
}));

vi.mock("next-auth", () => ({
  getServerSession: mockGetServerSession,
}));

vi.mock("@/lib/auth-options", () => ({
  getAuthOptions: () => ({}),
}));

vi.mock("@/lib/app-conversations", () => ({
  findOrCreateDirectConversation: mockFindOrCreateDirectConversation,
}));

vi.mock("@/lib/app-analytics", () => ({
  ensureTrackingContext: mockEnsureTrackingContext,
}));

vi.mock("@/lib/request-user-identity", () => ({
  resolveOrCreateUserIdForRequest: mockResolveOrCreateUserIdForRequest,
}));

import { POST } from "@/app/api/conversations/direct/route";

describe("/api/conversations/direct route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetServerSession.mockResolvedValue(null);
    mockResolveOrCreateUserIdForRequest.mockResolvedValue({
      userId: "user-1",
      identity: { id: "user-1", email: "", externalUserId: "", sessionKey: "" },
      tracking: null,
    });
  });

  it("finds or creates a 1:1 room with the target user", async () => {
    mockFindOrCreateDirectConversation.mockResolvedValue({
      id: "conv-dm",
      sequenceNumber: 1,
      title: "Bob",
      status: "paused",
      sessionKey: "session-dm",
      selectedLanguages: ["en"],
      createdAt: "2026-04-02T00:00:00.000Z",
      updatedAt: "2026-04-02T00:00:00.000Z",
      pausedAt: null,
    });

    const response = await POST(new NextRequest("https://example.com/api/conversations/direct", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetUserId: "user-2", locale: "ko" }),
    }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({
      conversation: expect.objectContaining({ id: "conv-dm", title: "Bob" }),
    });
    expect(mockFindOrCreateDirectConversation).toHaveBeenCalledWith({
      userId: "user-1",
      targetUserId: "user-2",
      locale: "ko",
    });
  });

  it("rejects a request with no target user", async () => {
    const response = await POST(new NextRequest("https://example.com/api/conversations/direct", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    }));

    expect(response.status).toBe(400);
    expect(mockFindOrCreateDirectConversation).not.toHaveBeenCalled();
  });

  it("returns 404 when the target user doesn't exist", async () => {
    mockFindOrCreateDirectConversation.mockRejectedValue(new Error("target_user_not_found"));

    const response = await POST(new NextRequest("https://example.com/api/conversations/direct", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetUserId: "ghost" }),
    }));
    const json = await response.json();

    expect(response.status).toBe(404);
    expect(json).toEqual({ error: "target_user_not_found" });
  });

  it("returns 403 when the target user is blocked in either direction", async () => {
    mockFindOrCreateDirectConversation.mockRejectedValue(new Error("target_user_blocked"));

    const response = await POST(new NextRequest("https://example.com/api/conversations/direct", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetUserId: "user-2" }),
    }));
    const json = await response.json();

    expect(response.status).toBe(403);
    expect(json).toEqual({ error: "target_user_blocked" });
  });

  it("returns unauthorized when the request identity cannot resolve to a user", async () => {
    mockResolveOrCreateUserIdForRequest.mockResolvedValue({
      userId: "",
      identity: { id: "", email: "", externalUserId: "", sessionKey: "" },
      tracking: null,
    });

    const response = await POST(new NextRequest("https://example.com/api/conversations/direct", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetUserId: "user-2" }),
    }));
    const json = await response.json();

    expect(response.status).toBe(401);
    expect(json).toEqual({ error: "unauthorized" });
    expect(mockFindOrCreateDirectConversation).not.toHaveBeenCalled();
  });
});
