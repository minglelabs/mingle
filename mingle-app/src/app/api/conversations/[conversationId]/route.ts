import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { getAuthOptions } from "@/lib/auth-options";
import {
  APP_CONVERSATION_STATUS_ACTIVE,
  APP_CONVERSATION_STATUS_PAUSED,
  normalizeConversationChannelStatus,
  updateConversationChannelStatus,
} from "@/lib/app-conversations";
import {
  resolveOrCreateUserIdForRequest,
} from "@/lib/request-user-identity";
import { ensureTrackingContext } from "@/lib/app-analytics";

type ConversationRouteProps = {
  params: Promise<{
    conversationId: string;
  }>;
};

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

export async function PATCH(request: NextRequest, { params }: ConversationRouteProps) {
  const session = await getServerSession(getAuthOptions());
  const resolvedUser = await resolveOrCreateUserIdForRequest({
    request,
    session,
  });
  const userId = resolvedUser.userId;

  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: { status?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  if (typeof body.status !== "string") {
    return NextResponse.json({ error: "invalid_status" }, { status: 400 });
  }

  const normalizedStatus = normalizeConversationChannelStatus(body.status);
  const requestedStatus = body.status.trim().toLowerCase();
  if (
    requestedStatus !== APP_CONVERSATION_STATUS_ACTIVE
    && requestedStatus !== APP_CONVERSATION_STATUS_PAUSED
  ) {
    return NextResponse.json({ error: "invalid_status" }, { status: 400 });
  }

  const { conversationId } = await params;
  const conversation = await updateConversationChannelStatus({
    conversationId,
    userId,
    status: normalizedStatus,
  });

  if (!conversation) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const trackingHints = resolvedUser.tracking
    ? {
        externalUserId: resolvedUser.tracking.externalUserId,
        sessionKey: resolvedUser.tracking.sessionKey,
      }
    : resolvedUser.identity;
  const response = NextResponse.json({ conversation });
  applyTrackingCookies(request, response, trackingHints);
  return response;
}
