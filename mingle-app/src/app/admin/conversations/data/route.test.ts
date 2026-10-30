import { NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  requireAdminApi: vi.fn(),
  userFindUnique: vi.fn(),
  channelFindMany: vi.fn(),
  messageGroupBy: vi.fn(),
}));

vi.mock("@/server/admin/guard", () => ({ requireAdminApi: m.requireAdminApi }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: m.userFindUnique },
    appConversationChannel: { findMany: m.channelFindMany },
    appMessage: { groupBy: m.messageGroupBy },
  },
}));

import { GET } from "@/app/admin/conversations/data/route";

const CREATED = new Date("2026-09-01T00:00:00Z");

function userRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "u1",
    externalUserId: "ext_1",
    email: null,
    name: "Mina",
    handle: "mina",
    isOfficial: false,
    isOperator: false,
    isActive: true,
    isDeleted: false,
    deactivatedAt: null,
    withdrawnAt: null,
    scheduledDeleteAt: null,
    deletedAt: null,
    createdAt: CREATED,
    lastSeenAt: CREATED,
    latestClientPlatform: "ios",
    latestAppVersion: "2.2.0",
    latestApiNamespace: "ios/v2.2.0",
    ...overrides,
  };
}

function call(query = "userId=ext_1") {
  return GET(new Request(`https://example.com/admin/conversations/data?${query}`));
}

describe("/admin/conversations/data", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.requireAdminApi.mockResolvedValue({ ok: true, ctx: { sessionId: "admin_sess_1", ip: null, userAgent: null } });
    m.channelFindMany.mockResolvedValue([]);
    m.messageGroupBy.mockResolvedValue([]);
  });

  it("requires an admin session", async () => {
    m.requireAdminApi.mockResolvedValue({ ok: false, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) });
    expect((await call()).status).toBe(401);
    expect(m.userFindUnique).not.toHaveBeenCalled();
  });

  it("shows an operator account as an ordinary one and selects both badge flags", async () => {
    m.userFindUnique.mockResolvedValue(userRow({ isOperator: true }));
    const response = await call();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.user).not.toHaveProperty("isOperator");
    expect(body.user).not.toHaveProperty("isOfficial");
    expect(m.userFindUnique.mock.calls[0][0].select).toMatchObject({ isOperator: true, isOfficial: true });
  });

  it("adds no badge flag for an ordinary account", async () => {
    m.userFindUnique.mockResolvedValue(userRow());
    const body = await (await call()).json();
    expect(body.user).not.toHaveProperty("isOperator");
    expect(body.user).not.toHaveProperty("isOfficial");
  });
});
