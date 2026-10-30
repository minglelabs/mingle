import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  cookieSet: vi.fn(),
  redirect: vi.fn((url: string): never => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
  readMeta: vi.fn(),
  requireAdmin: vi.fn(),
  createSession: vi.fn(),
  revokeSession: vi.fn(),
  audit: vi.fn(),
}));

vi.mock("next/headers", () => ({ cookies: async () => ({ set: m.cookieSet }) }));
vi.mock("next/navigation", () => ({ redirect: m.redirect }));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/server/admin/guard", () => ({ readAdminRequestMeta: m.readMeta, requireAdmin: m.requireAdmin }));
vi.mock("@/server/admin/audit", () => ({ writeAdminAudit: m.audit }));
vi.mock("@/server/admin/session", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/admin/session")>()),
  createAdminSession: m.createSession,
  revokeAdminSession: m.revokeSession,
}));

import { adminLoginThrottle } from "@/lib/admin-auth";
import { loginAdminAction, logoutAdminAction } from "./session-actions";

const META = { ip: "203.0.113.7", userAgent: "Mozilla/5.0 (iPhone)" };

function loginForm(fields: { username?: string; password?: string; next?: string } = {}): FormData {
  const form = new FormData();
  form.set("username", fields.username ?? "admin");
  form.set("password", fields.password ?? "correct-horse");
  if (fields.next !== undefined) form.set("next", fields.next);
  return form;
}

/** Runs the action and returns where it redirected. */
async function redirectOf(action: Promise<void>): Promise<string> {
  const error = await action.then(() => null, (thrown: unknown) => thrown);
  const match = error instanceof Error ? /^NEXT_REDIRECT:(.*)$/.exec(error.message) : null;
  if (!match) throw new Error(`expected a redirect, got ${String(error)}`);
  return match[1];
}

beforeEach(() => {
  vi.clearAllMocks();
  adminLoginThrottle.reset();
  vi.stubEnv("MINGLE_ADMIN_USERNAME", "admin");
  vi.stubEnv("MINGLE_ADMIN_PASSWORD", "correct-horse");
  m.readMeta.mockResolvedValue(META);
  m.createSession.mockResolvedValue({ token: "session-token", session: { id: "admin_sess_1" } });
  m.audit.mockResolvedValue(undefined);
  m.revokeSession.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("loginAdminAction", () => {
  it("starts a DB session, sets the admin cookie, audits admin.login and returns to next", async () => {
    await expect(redirectOf(loginAdminAction(loginForm({ next: "/admin/inbox/conv_1" })))).resolves.toBe("/admin/inbox/conv_1");

    expect(m.createSession).toHaveBeenCalledWith(META);
    expect(m.cookieSet).toHaveBeenCalledWith(expect.objectContaining({
      name: "mingle_admin_session",
      value: "session-token",
      path: "/admin",
      httpOnly: true,
      sameSite: "lax",
      maxAge: 30 * 24 * 60 * 60,
    }));
    expect(m.audit).toHaveBeenCalledWith({ sessionId: "admin_sess_1", ...META }, { action: "admin.login" });
  });

  it("opens the operator inbox when there is no next", async () => {
    await expect(redirectOf(loginAdminAction(loginForm()))).resolves.toBe("/admin/inbox");
  });

  it.each([
    "https://evil.example/admin",
    "//evil.example/admin",
    "/\\evil.example",
    "/administrator",
    "/admin/../api/users",
    "/ko/feed",
    "javascript:alert(1)",
  ])("never redirects outside /admin: next=%s", async (next) => {
    await expect(redirectOf(loginAdminAction(loginForm({ next })))).resolves.toBe("/admin/inbox");
    expect(m.createSession).toHaveBeenCalledOnce();
  });

  it("refuses wrong credentials without a session, and audits the failure with the ip only", async () => {
    const target = await redirectOf(loginAdminAction(loginForm({ username: "typed-name", password: "wrong", next: "/admin/reports" })));

    expect(target).toBe(`/admin?error=invalid_credentials&next=${encodeURIComponent("/admin/reports")}`);
    expect(m.createSession).not.toHaveBeenCalled();
    expect(m.cookieSet).not.toHaveBeenCalled();
    expect(m.audit).toHaveBeenCalledWith(
      { sessionId: null, ...META },
      { action: "admin.login_failed", metadata: { reason: "invalid_credentials", userAgent: META.userAgent } },
    );
    expect(JSON.stringify(m.audit.mock.calls)).not.toContain("typed-name");
    expect(JSON.stringify(m.audit.mock.calls)).not.toContain("wrong");
  });

  it("locks an ip after 5 failures in 15 minutes, even for the right password", async () => {
    for (let attempt = 1; attempt <= 4; attempt += 1) {
      await expect(redirectOf(loginAdminAction(loginForm({ password: "nope" })))).resolves.toBe("/admin?error=invalid_credentials");
    }
    await expect(redirectOf(loginAdminAction(loginForm({ password: "nope" })))).resolves.toBe("/admin?error=too_many_attempts");

    await expect(redirectOf(loginAdminAction(loginForm()))).resolves.toBe("/admin?error=too_many_attempts");
    expect(m.createSession).not.toHaveBeenCalled();
    expect(m.audit).toHaveBeenLastCalledWith(
      { sessionId: null, ...META },
      { action: "admin.login_failed", metadata: { reason: "throttled", userAgent: META.userAgent } },
    );

    // Another ip is not affected.
    m.readMeta.mockResolvedValue({ ip: "198.51.100.4", userAgent: null });
    await expect(redirectOf(loginAdminAction(loginForm()))).resolves.toBe("/admin/inbox");
    expect(m.createSession).toHaveBeenCalledOnce();
  });

  it("lets the ip in again 15 minutes after the oldest failure", async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-09-30T10:00:00Z"));
      for (let attempt = 0; attempt < 5; attempt += 1) await redirectOf(loginAdminAction(loginForm({ password: "nope" })));
      await expect(redirectOf(loginAdminAction(loginForm()))).resolves.toBe("/admin?error=too_many_attempts");

      vi.setSystemTime(new Date("2026-09-30T10:15:00Z"));
      await expect(redirectOf(loginAdminAction(loginForm()))).resolves.toBe("/admin/inbox");
    } finally {
      vi.useRealTimers();
    }
  });

  it("clears an ip's failures after a successful login", async () => {
    for (let attempt = 0; attempt < 4; attempt += 1) await redirectOf(loginAdminAction(loginForm({ password: "nope" })));
    await expect(redirectOf(loginAdminAction(loginForm()))).resolves.toBe("/admin/inbox");
    for (let attempt = 0; attempt < 4; attempt += 1) {
      await expect(redirectOf(loginAdminAction(loginForm({ password: "nope" })))).resolves.toBe("/admin?error=invalid_credentials");
    }
  });

  it("reports a missing credential config instead of checking the password", async () => {
    vi.stubEnv("MINGLE_ADMIN_PASSWORD", "");
    await expect(redirectOf(loginAdminAction(loginForm({ next: "/admin/more" })))).resolves.toBe(
      `/admin?error=not_configured&next=${encodeURIComponent("/admin/more")}`,
    );
    expect(m.createSession).not.toHaveBeenCalled();
  });
});

describe("logoutAdminAction", () => {
  it("revokes the session server-side, expires the cookie, audits admin.logout", async () => {
    const ctx = { sessionId: "admin_sess_1", ...META };
    m.requireAdmin.mockResolvedValue(ctx);

    await expect(redirectOf(logoutAdminAction())).resolves.toBe("/admin");

    expect(m.revokeSession).toHaveBeenCalledWith("admin_sess_1");
    expect(m.cookieSet).toHaveBeenCalledWith(expect.objectContaining({ name: "mingle_admin_session", value: "", path: "/admin", maxAge: 0 }));
    expect(m.audit).toHaveBeenCalledWith(ctx, { action: "admin.logout" });
    expect(m.revokeSession.mock.invocationCallOrder[0]).toBeLessThan(m.cookieSet.mock.invocationCallOrder[0]);
  });

  it("does nothing when there is no admin session (requireAdmin redirects to login)", async () => {
    m.requireAdmin.mockImplementation(async () => m.redirect("/admin"));
    await expect(redirectOf(logoutAdminAction())).resolves.toBe("/admin");
    expect(m.revokeSession).not.toHaveBeenCalled();
    expect(m.cookieSet).not.toHaveBeenCalled();
    expect(m.audit).not.toHaveBeenCalled();
  });
});
