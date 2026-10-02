"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { adminLoginThrottle, isAdminAuthConfigured, verifyAdminLogin } from "@/lib/admin-auth";
import { sanitizeAdminReturnTo } from "@/lib/admin-return-to";
import { writeAdminAudit } from "@/server/admin/audit";
import { readAdminRequestMeta, requireAdmin } from "@/server/admin/guard";
import {
  adminSessionCookie,
  createAdminSession,
  expiredAdminSessionCookie,
  revokeAdminSession,
} from "@/server/admin/session";

const ADMIN_HOME = "/admin";
const ADMIN_LANDING = "/admin/inbox";
/** Throttle bucket for requests that carry no client IP (local dev without a proxy). */
const UNKNOWN_CLIENT_KEY = "unknown";

type AdminLoginError = "invalid_credentials" | "too_many_attempts" | "not_configured";

/** The login page with an error code, keeping an accepted return path for the next attempt. */
function loginErrorPath(error: AdminLoginError, next: string): string {
  const params = new URLSearchParams({ error });
  if (next !== ADMIN_HOME && next !== ADMIN_LANDING) params.set("next", next);
  return `${ADMIN_HOME}?${params.toString()}`;
}

/**
 * Login form action. Checks the env credential, throttles per client IP
 * (5 failures / 15 min), starts a DB session and returns to `next` (only an
 * `/admin/**` path accepted by `sanitizeAdminReturnTo`, else `/admin/inbox`).
 * Every failure is audited as `admin.login_failed` with the request's ip; the
 * typed username is never stored.
 */
export async function loginAdminAction(formData: FormData): Promise<void> {
  const next = sanitizeAdminReturnTo(formData.get("next"), ADMIN_LANDING);
  const meta = await readAdminRequestMeta();
  const requestContext = { sessionId: null, ...meta };
  const throttleKey = meta.ip ?? UNKNOWN_CLIENT_KEY;

  if (!isAdminAuthConfigured()) redirect(loginErrorPath("not_configured", next));

  if (adminLoginThrottle.isThrottled(throttleKey)) {
    await writeAdminAudit(requestContext, {
      action: "admin.login_failed",
      metadata: { reason: "throttled", userAgent: meta.userAgent },
    });
    redirect(loginErrorPath("too_many_attempts", next));
  }

  if (!verifyAdminLogin(formData.get("username"), formData.get("password"))) {
    const reachedLimit = adminLoginThrottle.recordFailure(throttleKey);
    await writeAdminAudit(requestContext, {
      action: "admin.login_failed",
      metadata: { reason: "invalid_credentials", userAgent: meta.userAgent },
    });
    redirect(loginErrorPath(reachedLimit ? "too_many_attempts" : "invalid_credentials", next));
  }

  adminLoginThrottle.clear(throttleKey);
  const { token, session } = await createAdminSession(meta);
  const cookieStore = await cookies();
  cookieStore.set(adminSessionCookie(token));
  await writeAdminAudit({ sessionId: session.id, ...meta }, { action: "admin.login" });
  redirect(next);
}

/** Logout: revokes the session server-side (the cookie is dead everywhere), then clears it here. */
export async function logoutAdminAction(): Promise<void> {
  const ctx = await requireAdmin();
  if (ctx.sessionId) await revokeAdminSession(ctx.sessionId);
  const cookieStore = await cookies();
  cookieStore.set(expiredAdminSessionCookie());
  await writeAdminAudit(ctx, { action: "admin.logout" });
  redirect(ADMIN_HOME);
}
