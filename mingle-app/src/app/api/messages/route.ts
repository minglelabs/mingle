import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { getAuthOptions } from "@/lib/auth-options";
import { ensureTrackingContext } from "@/lib/app-analytics";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

type SessionUserIdentity = {
  id: string;
  email: string;
  externalUserId: string;
  sessionKey: string;
};

function normalizeSessionUserIdentity(session: {
  user?: { id?: unknown; email?: unknown };
} | null): SessionUserIdentity {
  return {
    id: typeof session?.user?.id === "string" ? session.user.id.trim() : "",
    email: typeof session?.user?.email === "string"
      ? session.user.email.trim().toLowerCase()
      : "",
    externalUserId: "",
    sessionKey: "",
  };
}

function sanitizeTrackingValue(rawValue: string | null): string {
  return (rawValue || "").trim().slice(0, 128);
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

function resolveTrackingSessionKey(request: Request): string {
  return sanitizeTrackingValue(
    request.headers.get("x-mingle-session-key")
    || readCookieValue(request, "mingle_sid")
    || null,
  );
}

function resolveTrackingExternalUserId(request: Request): string {
  return sanitizeTrackingValue(
    request.headers.get("x-mingle-user-id")
    || readCookieValue(request, "mingle_uid")
    || null,
  );
}

async function resolveMessageOwnerUserIds(identity: SessionUserIdentity): Promise<string[]> {
  const userIds = new Set<string>();

  if (identity.id) {
    const user = await prisma.user.findUnique({
      where: { id: identity.id },
      select: { id: true },
    });
    if (user?.id) userIds.add(user.id);
  }

  if (identity.email) {
    const user = await prisma.user.findUnique({
      where: { email: identity.email },
      select: { id: true },
    });
    if (user?.id) userIds.add(user.id);
  }

  if (identity.externalUserId) {
    const user = await prisma.user.findUnique({
      where: { externalUserId: identity.externalUserId },
      select: { id: true },
    });
    if (user?.id) userIds.add(user.id);
  }

  return [...userIds];
}

function withTrackingCookies(
  request: NextRequest,
  response: NextResponse,
  tracking: { externalUserId: string; sessionKey: string },
): NextResponse {
  ensureTrackingContext(request, response, {
    externalUserIdHint: tracking.externalUserId,
    sessionKeyHint: tracking.sessionKey,
  });
  return response;
}

export async function DELETE(request: Request) {
  const nextRequest = request as NextRequest;
  const trackingSeedResponse = new NextResponse();
  const tracking = ensureTrackingContext(nextRequest, trackingSeedResponse, {
    externalUserIdHint: resolveTrackingExternalUserId(request) || null,
    sessionKeyHint: resolveTrackingSessionKey(request) || null,
  });

  try {
    const session = await getServerSession(getAuthOptions());
    const identity = {
      ...normalizeSessionUserIdentity(session),
      externalUserId: resolveTrackingExternalUserId(request) || tracking.externalUserId,
      sessionKey: resolveTrackingSessionKey(request) || tracking.sessionKey,
    };
    const userIds = await resolveMessageOwnerUserIds(identity);
    const ownerFilters = [
      ...(userIds.length > 0 ? [{ userId: { in: userIds } }] : []),
      ...(identity.sessionKey ? [{ sessionKey: identity.sessionKey }] : []),
    ];

    if (ownerFilters.length === 0) {
      const response = NextResponse.json({
        ok: true,
        deletedMessageCount: 0,
        deletedContentCount: 0,
      });
      return withTrackingCookies(nextRequest, response, tracking);
    }

    const messages = await prisma.appMessage.findMany({
      where: {
        OR: ownerFilters,
        isDeleted: { not: true },
      },
      select: {
        id: true,
      },
    });
    const messageIds = messages.map((message) => message.id);

    if (messageIds.length === 0) {
      const response = NextResponse.json({
        ok: true,
        deletedMessageCount: 0,
        deletedContentCount: 0,
      });
      return withTrackingCookies(nextRequest, response, tracking);
    }

    const [messageResult, contentResult] = await prisma.$transaction([
      prisma.appMessage.updateMany({
        where: {
          id: { in: messageIds },
        },
        data: {
          isDeleted: true,
        },
      }),
      prisma.appMessageContent.updateMany({
        where: {
          messageId: { in: messageIds },
        },
        data: {
          isDeleted: true,
        },
      }),
    ]);

    const response = NextResponse.json({
      ok: true,
      deletedMessageCount: messageResult.count,
      deletedContentCount: contentResult.count,
    });
    return withTrackingCookies(nextRequest, response, tracking);
  } catch (error) {
    console.error("[messages/delete] failed", error);
    const response = NextResponse.json(
      { error: "message_delete_failed" },
      { status: 500 },
    );
    return withTrackingCookies(nextRequest, response, tracking);
  }
}
