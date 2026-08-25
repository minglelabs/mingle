import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockUserFindUnique } = vi.hoisted(() => ({
  mockUserFindUnique: vi.fn(),
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
  resolveSessionAwareUserId,
  resolveTrackingExternalUserId,
} from "@/lib/request-user-identity";

describe("resolveSessionAwareUserId", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the fallback id when there is no logged-in session", async () => {
    const userId = await resolveSessionAwareUserId({
      session: null,
      fallbackUserId: "user_tracked",
    });

    expect(userId).toBe("user_tracked");
    expect(mockUserFindUnique).not.toHaveBeenCalled();
  });

  it("prefers the logged-in session's real account over the fallback id", async () => {
    mockUserFindUnique.mockResolvedValue({ id: "user_session_real" });

    const userId = await resolveSessionAwareUserId({
      session: { user: { id: "user_session_real" } },
      fallbackUserId: "user_tracked",
    });

    expect(userId).toBe("user_session_real");
  });

  it("falls back to the tracked id if the session's account can't be resolved", async () => {
    mockUserFindUnique.mockResolvedValue(null);

    const userId = await resolveSessionAwareUserId({
      session: { user: { id: "user_deleted" } },
      fallbackUserId: "user_tracked",
    });

    expect(userId).toBe("user_tracked");
  });

  it("uses the PostHog tracing distinct ID when the Mingle header is absent", () => {
    const request = new Request("https://mingle.example/api/conversations", {
      headers: { "x-posthog-distinct-id": "anon_posthog" },
    });

    expect(resolveTrackingExternalUserId(request)).toBe("anon_posthog");
  });
});
