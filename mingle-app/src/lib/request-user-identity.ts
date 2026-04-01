import { type NextRequest, NextResponse } from "next/server";
import {
  ensureTrackingContext,
  parseClientContext,
  upsertTrackedUser,
  type TrackingContext,
} from "@/lib/app-analytics";
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

export async function resolveOrCreateUserIdForRequest(args: {
  request: NextRequest;
  session: { user?: { id?: unknown; email?: unknown } } | null;
  createIfMissing?: boolean;
}): Promise<{
  userId: string;
  identity: SessionUserIdentity;
  tracking: TrackingContext | null;
}> {
  const identity = {
    ...normalizeSessionUserIdentity(args.session),
    externalUserId: resolveTrackingExternalUserId(args.request),
    sessionKey: resolveTrackingSessionKey(args.request),
  };
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
