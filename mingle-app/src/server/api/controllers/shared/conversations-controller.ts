import { type NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { getAuthOptions } from "@/lib/auth-options";
import {
  createConversationChannelForUser,
  listConversationChannelsForUser,
} from "@/lib/app-conversations";
import { ensureTrackingContext } from "@/lib/app-analytics";
import {
  resolveOrCreateUserIdForRequest,
  sanitizeRequestIdentityValue,
} from "@/lib/request-user-identity";

export const runtime = "nodejs";

function applyTrackingCookies(
  request: NextRequest,
  response: NextResponse,
  trackingHints: {
    externalUserId?: string;
    sessionKey?: string;
  },
) {
  const externalUserId = (trackingHints.externalUserId || "").trim();
  const sessionKey = (trackingHints.sessionKey || "").trim();
  if (!externalUserId && !sessionKey) return;

  ensureTrackingContext(request, response, {
    externalUserIdHint: externalUserId || null,
    sessionKeyHint: sessionKey || null,
  });
}

export async function getConversationsResponse(request: NextRequest) {
  const session = await getServerSession(getAuthOptions());
  const resolvedUser = await resolveOrCreateUserIdForRequest({
    request,
    session,
  });

  if (!resolvedUser.userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const trackingHints = resolvedUser.tracking
    ? {
        externalUserId: resolvedUser.tracking.externalUserId,
        sessionKey: resolvedUser.tracking.sessionKey,
      }
    : resolvedUser.identity;
  const conversations = await listConversationChannelsForUser(resolvedUser.userId);
  const response = NextResponse.json({ conversations });
  applyTrackingCookies(request, response, trackingHints);
  return response;
}

export async function postConversationResponse(request: NextRequest) {
  const session = await getServerSession(getAuthOptions());
  const resolvedUser = await resolveOrCreateUserIdForRequest({
    request,
    session,
  });

  if (!resolvedUser.userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: { legacySessionKey?: unknown } | null = null;
  try {
    body = await request.json();
  } catch {
    body = null;
  }

  const legacySessionKey = typeof body?.legacySessionKey === "string"
    ? sanitizeRequestIdentityValue(body.legacySessionKey)
    : "";

  const trackingHints = resolvedUser.tracking
    ? {
        externalUserId: resolvedUser.tracking.externalUserId,
        sessionKey: resolvedUser.tracking.sessionKey,
      }
    : resolvedUser.identity;
  const conversation = await createConversationChannelForUser(resolvedUser.userId, {
    preferredSessionKey: legacySessionKey || undefined,
  });
  const response = NextResponse.json({ conversation }, { status: 201 });
  applyTrackingCookies(request, response, trackingHints);
  return response;
}
