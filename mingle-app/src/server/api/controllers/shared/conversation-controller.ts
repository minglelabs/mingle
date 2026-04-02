import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { getAuthOptions } from "@/lib/auth-options";
import {
  APP_CONVERSATION_STATUS_ACTIVE,
  APP_CONVERSATION_STATUS_PAUSED,
  getConversationHydrationStateForUser,
  normalizeConversationChannelStatus,
  updateConversationChannelStatus,
  updateConversationChannelSelectedLanguages,
} from "@/lib/app-conversations";
import { ensureTrackingContext } from "@/lib/app-analytics";
import { resolveOrCreateUserIdForRequest } from "@/lib/request-user-identity";
import { sanitizeSttLanguageSelection } from "@/lib/stt-languages";

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

export async function patchConversationResponse(
  request: NextRequest,
  conversationId: string,
) {
  const session = await getServerSession(getAuthOptions());
  const resolvedUser = await resolveOrCreateUserIdForRequest({
    request,
    session,
  });

  if (!resolvedUser.userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: { status?: unknown; selectedLanguages?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const hasStatus = typeof body.status === "string";
  const hasSelectedLanguages = body.selectedLanguages !== undefined;

  if (!hasStatus && !hasSelectedLanguages) {
    return NextResponse.json({ error: "invalid_patch" }, { status: 400 });
  }

  let conversation = null;

  if (hasSelectedLanguages) {
    const selectedLanguages = sanitizeSttLanguageSelection(body.selectedLanguages);
    if (selectedLanguages.length === 0) {
      return NextResponse.json({ error: "invalid_selected_languages" }, { status: 400 });
    }

    conversation = await updateConversationChannelSelectedLanguages({
      conversationId,
      userId: resolvedUser.userId,
      selectedLanguages,
    });
  }

  if (hasStatus) {
    const requestedStatus = typeof body.status === "string"
      ? body.status.trim().toLowerCase()
      : "";
    if (
      requestedStatus !== APP_CONVERSATION_STATUS_ACTIVE
      && requestedStatus !== APP_CONVERSATION_STATUS_PAUSED
    ) {
      return NextResponse.json({ error: "invalid_status" }, { status: 400 });
    }

    conversation = await updateConversationChannelStatus({
      conversationId,
      userId: resolvedUser.userId,
      status: normalizeConversationChannelStatus(requestedStatus),
    });
  }

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

export async function getConversationResponse(
  request: NextRequest,
  conversationId: string,
) {
  const session = await getServerSession(getAuthOptions());
  const resolvedUser = await resolveOrCreateUserIdForRequest({
    request,
    session,
  });

  if (!resolvedUser.userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const conversationState = await getConversationHydrationStateForUser({
    conversationId,
    userId: resolvedUser.userId,
  });

  if (!conversationState) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const trackingHints = resolvedUser.tracking
    ? {
        externalUserId: resolvedUser.tracking.externalUserId,
        sessionKey: resolvedUser.tracking.sessionKey,
      }
    : resolvedUser.identity;
  const response = NextResponse.json(conversationState);
  applyTrackingCookies(request, response, trackingHints);
  return response;
}
