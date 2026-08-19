import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetServerSession } = vi.hoisted(() => ({
  mockGetServerSession: vi.fn(),
}));

vi.mock("next-auth", () => ({ getServerSession: mockGetServerSession }));
vi.mock("@/lib/auth-options", () => ({ getAuthOptions: () => ({}) }));

import { ConversationMessageError } from "@/server/conversation-messages";
import {
  conversationFailureResponse,
  conversationJson,
  normalizeRouteId,
  requireSessionUserId,
  unauthorizedResponse,
} from "./conversation-route-helpers";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("requireSessionUserId", () => {
  it("returns the trimmed id from a valid session", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "  u1  " } });

    expect(await requireSessionUserId()).toBe("u1");
  });

  it("returns empty for a missing session, a missing user, or a non-string id", async () => {
    mockGetServerSession.mockResolvedValue(null);
    expect(await requireSessionUserId()).toBe("");

    mockGetServerSession.mockResolvedValue({});
    expect(await requireSessionUserId()).toBe("");

    mockGetServerSession.mockResolvedValue({ user: { id: 42 } });
    expect(await requireSessionUserId()).toBe("");

    // A whitespace-only id must not read as signed in.
    mockGetServerSession.mockResolvedValue({ user: { id: "   " } });
    expect(await requireSessionUserId()).toBe("");
  });
});

describe("conversationFailureResponse", () => {
  it.each([
    ["not_a_member", 403],
    ["conversation_not_found", 404],
    ["user_not_found", 404],
    ["user_blocked", 409],
    ["cannot_message_self", 400],
    ["empty_text", 400],
  ])("maps %s to HTTP %i", async (reason, status) => {
    const response = conversationFailureResponse(new ConversationMessageError(
      reason as ConstructorParameters<typeof ConversationMessageError>[0],
    ));

    expect(response.status).toBe(status);
    expect(await response.json()).toEqual({ error: reason });
  });

  it("rethrows anything that is not a domain failure, so real faults stay 500s", () => {
    const fault = new TypeError("cannot read properties of undefined");

    expect(() => conversationFailureResponse(fault)).toThrow(fault);
  });
});

describe("conversationJson", () => {
  it("always marks responses private and uncacheable", () => {
    const response = conversationJson({ ok: true });

    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  });

  it("keeps the caller's status and lets extra headers through", () => {
    const response = conversationJson({ ok: true }, { status: 201, headers: { "X-Test": "1" } });

    expect(response.status).toBe(201);
    expect(response.headers.get("X-Test")).toBe("1");
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  });
});

describe("unauthorizedResponse", () => {
  it("is a 401 carrying the shared error shape", async () => {
    const response = unauthorizedResponse();

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "unauthorized" });
  });
});

describe("normalizeRouteId", () => {
  it("trims, and treats a blank segment as absent", () => {
    expect(normalizeRouteId("  conv-1 ")).toBe("conv-1");
    expect(normalizeRouteId("   ")).toBe("");
  });
});
