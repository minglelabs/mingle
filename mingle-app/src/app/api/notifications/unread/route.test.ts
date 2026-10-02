import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetServerSession, mockNotificationFindFirst } = vi.hoisted(() => ({
  mockGetServerSession: vi.fn(),
  mockNotificationFindFirst: vi.fn(),
}));

vi.mock("next-auth", () => ({ getServerSession: mockGetServerSession }));
vi.mock("@/lib/auth-options", () => ({ getAuthOptions: () => ({}) }));
vi.mock("@/lib/prisma", () => ({
  prisma: { userNotification: { findFirst: mockNotificationFindFirst } },
}));

import { GET } from "@/app/api/notifications/unread/route";
import { visibleNotificationWhere } from "@/server/notifications/notification-visibility";

describe("/api/notifications/unread route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetServerSession.mockResolvedValue({ user: { id: "user_123" } });
  });

  it("uses the same visibility filter as the list, so withheld rows never light the dot", async () => {
    mockNotificationFindFirst.mockResolvedValue(null);
    const response = await GET();
    expect(await response.json()).toEqual({ hasUnread: false });
    expect(mockNotificationFindFirst).toHaveBeenCalledWith({
      where: { ...visibleNotificationWhere("user_123"), readAt: null },
      select: { id: true },
    });
  });

  it("reports an unread visible notification", async () => {
    mockNotificationFindFirst.mockResolvedValue({ id: "n1" });
    const response = await GET();
    expect(await response.json()).toEqual({ hasUnread: true });
  });

  it("returns 401 for a signed-out viewer", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const response = await GET();
    expect(response.status).toBe(401);
    expect(mockNotificationFindFirst).not.toHaveBeenCalled();
  });
});
