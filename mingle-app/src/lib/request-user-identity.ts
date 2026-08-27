import { type NextRequest, NextResponse } from "next/server";
import {
  ensureTrackingContext,
  parseClientContext,
  recordTrackedUserActivity,
  upsertTrackedUser,
  type ClientContext,
  type TrackingContext,
} from "@/lib/app-analytics";
import { parseApiNamespaceVersion } from "@/lib/api-namespace-version";
import { prisma } from "@/lib/prisma";

export type SessionUserIdentity = {
  id: string;
  email: string;
  externalUserId: string;
  sessionKey: string;
};

export function sanitizeRequestIdentityValue(rawValue: string | null | undefined): string {
  return (rawValue || "").trim().slice(0, 128);
}

export function normalizeSessionUserIdentity(
  session: { user?: { id?: unknown; email?: unknown } } | null,
): SessionUserIdentity {
  return {
    id: typeof session?.user?.id === "string" ? session.user.id.trim() : "",
    email: typeof session?.user?.email === "string" ? session.user.email.trim().toLowerCase() : "",
    externalUserId: "",
    sessionKey: "",
  };
}

function hasAuthenticatedSessionIdentity(identity: SessionUserIdentity): boolean {
  return Boolean(identity.id || identity.email);
}

// Anonymous User rows are a compatibility mechanism for pre-account clients.
// Current (2.x+) and unversioned routes are account-only by default. Requiring
// an explicit 1.x namespace keeps a missing/late session from silently routing
// current app data into a device-cookie-owned User.
export function requestAllowsLegacyAnonymousUser(request: Request): boolean {
  const pathname = (() => {
    try {
      return new URL(request.url).pathname;
    } catch {
      return "";
    }
  })();
  const pathNamespace = pathname.match(
    /^\/api\/((?:android|ios)\/v\d+\.\d+\.\d+)(?:\/|$)/,
  )?.[1] ?? "";
  const headerNamespace = sanitizeRequestIdentityValue(
    request.headers.get("x-mingle-api-namespace"),
  );
  const parsedPathNamespace = parseApiNamespaceVersion(pathNamespace);
  if (!parsedPathNamespace || parsedPathNamespace.version[0] !== 1) {
    return false;
  }

  const parsedHeaderNamespace = parseApiNamespaceVersion(headerNamespace);
  return !parsedHeaderNamespace || parsedHeaderNamespace.version[0] === 1;
}

function readCookieValue(request: Request, cookieName: string): string {
  const cookieHeader = request.headers.get("cookie") || "";
  for (const segment of cookieHeader.split(";")) {
    const trimmed = segment.trim();
    if (!trimmed) continue;
    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex <= 0) continue;
    const name = trimmed.slice(0, separatorIndex).trim();
    if (name !== cookieName) continue;
    const value = trimmed.slice(separatorIndex + 1).trim();
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  }
  return "";
}

export function resolveTrackingExternalUserId(request: Request): string {
  return sanitizeRequestIdentityValue(
    request.headers.get("x-mingle-user-id")
    || request.headers.get("x-posthog-distinct-id")
    || readCookieValue(request, "mingle_uid")
    || null,
  );
}

export function resolveTrackingSessionKey(request: Request): string {
  return sanitizeRequestIdentityValue(
    request.headers.get("x-mingle-session-key")
    || readCookieValue(request, "mingle_sid")
    || null,
  );
}

function resolveTrackingClientContext(request: Request) {
  return parseClientContext({
    appVersion: request.headers.get("x-mingle-app-version"),
    apiNamespace: request.headers.get("x-mingle-api-namespace"),
    clientPlatform: request.headers.get("x-mingle-client-platform"),
  });
}

export async function findUserIdBySessionKey(sessionKey: string): Promise<string | null> {
  if (!sessionKey) return null;

  const recentEvent = await prisma.appEventLog.findFirst({
    where: {
      sessionKey,
      userId: { not: null },
    },
    orderBy: { createdAt: "desc" },
    select: { userId: true },
  });
  if (recentEvent?.userId) return recentEvent.userId;

  const recentMessage = await prisma.appMessage.findFirst({
    where: {
      sessionKey,
      userId: { not: null },
    },
    orderBy: { createdAt: "desc" },
    select: { userId: true },
  });
  return recentMessage?.userId || null;
}

export async function findUserIdForIdentity(identity: SessionUserIdentity): Promise<string | null> {
  if (identity.id) {
    const user = await prisma.user.findUnique({
      where: { id: identity.id },
      select: { id: true },
    });
    if (user?.id) return user.id;
  }

  if (identity.email) {
    const user = await prisma.user.findUnique({
      where: { email: identity.email },
      select: { id: true },
    });
    if (user?.id) return user.id;
  }

  if (identity.externalUserId) {
    const user = await prisma.user.findUnique({
      where: { externalUserId: identity.externalUserId },
      select: { id: true },
    });
    if (user?.id) return user.id;
  }

  if (identity.sessionKey) {
    return findUserIdBySessionKey(identity.sessionKey);
  }

  return null;
}

export async function resolveUserIdForTrackedWrite(args: {
  request: NextRequest;
  session: { user?: { id?: unknown; email?: unknown } } | null;
  tracking: TrackingContext;
  clientContext: ClientContext;
}): Promise<string> {
  const sessionIdentity = normalizeSessionUserIdentity(args.session);
  if (hasAuthenticatedSessionIdentity(sessionIdentity)) {
    const userId = await findUserIdForIdentity(sessionIdentity);
    if (!userId) return "";

    await recordTrackedUserActivity({
      userId,
      tracking: args.tracking,
      clientContext: args.clientContext,
    });
    return userId;
  }

  if (!requestAllowsLegacyAnonymousUser(args.request)) {
    return "";
  }

  return upsertTrackedUser({
    tracking: args.tracking,
    clientContext: args.clientContext,
  });
}

export async function resolveOrCreateUserIdForRequest(args: {
  request: NextRequest;
  session: { user?: { id?: unknown; email?: unknown } } | null;
  createIfMissing?: boolean;
}): Promise<{
  userId: string;
  identity: SessionUserIdentity;
  tracking: TrackingContext | null;
}> {
  const sessionIdentity = normalizeSessionUserIdentity(args.session);
  const identity: SessionUserIdentity = {
    ...sessionIdentity,
    externalUserId: resolveTrackingExternalUserId(args.request),
    sessionKey: resolveTrackingSessionKey(args.request),
  };

  if (hasAuthenticatedSessionIdentity(sessionIdentity)) {
    const userId = await findUserIdForIdentity(sessionIdentity);
    return { userId: userId || "", identity, tracking: null };
  }

  if (!requestAllowsLegacyAnonymousUser(args.request)) {
    return { userId: "", identity, tracking: null };
  }

  const userId = await findUserIdForIdentity(identity);
  if (userId) {
    return { userId, identity, tracking: null };
  }

  if (args.createIfMissing === false) {
    return { userId: "", identity, tracking: null };
  }

  const tracking = ensureTrackingContext(args.request, new NextResponse(), {
    externalUserIdHint: identity.externalUserId || null,
    sessionKeyHint: identity.sessionKey || null,
  });
  const trackedUserId = await upsertTrackedUser({
    tracking,
    clientContext: resolveTrackingClientContext(args.request),
  });

  return {
    userId: trackedUserId,
    identity: {
      ...identity,
      externalUserId: identity.externalUserId || tracking.externalUserId,
      sessionKey: identity.sessionKey || tracking.sessionKey,
    },
    tracking,
  };
}
