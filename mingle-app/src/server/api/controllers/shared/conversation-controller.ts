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
  updateConversationChannelTitle,
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

  let body: { status?: unknown; selectedLanguages?: unknown; title?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const hasStatus = typeof body.status === "string";
  const hasSelectedLanguages = body.selectedLanguages !== undefined;
  const hasTitle = typeof body.title === "string";

  if (!hasStatus && !hasSelectedLanguages && !hasTitle) {
    return NextResponse.json({ error: "invalid_patch" }, { status: 400 });
  }

  const selectedLanguages = hasSelectedLanguages
    ? sanitizeSttLanguageSelection(body.selectedLanguages)
    : null;
  if (hasSelectedLanguages && (!selectedLanguages || selectedLanguages.length === 0)) {
    return NextResponse.json({ error: "invalid_selected_languages" }, { status: 400 });
  }

  const requestedStatus = hasStatus && typeof body.status === "string"
    ? body.status.trim().toLowerCase()
    : "";
  if (
    hasStatus
    && requestedStatus !== APP_CONVERSATION_STATUS_ACTIVE
    && requestedStatus !== APP_CONVERSATION_STATUS_PAUSED
  ) {
    return NextResponse.json({ error: "invalid_status" }, { status: 400 });
  }

  const requestedTitle = hasTitle && typeof body.title === "string"
    ? body.title.trim()
    : "";
  if (hasTitle && !requestedTitle) {
    return NextResponse.json({ error: "invalid_title" }, { status: 400 });
  }

  let conversation = null;

  if (hasSelectedLanguages) {
    conversation = await updateConversationChannelSelectedLanguages({
      conversationId,
      userId: resolvedUser.userId,
      selectedLanguages: selectedLanguages!,
    });
  }

  if (hasStatus) {
    conversation = await updateConversationChannelStatus({
      conversationId,
      userId: resolvedUser.userId,
      status: normalizeConversationChannelStatus(requestedStatus),
    });
  }

  if (hasTitle) {
    conversation = await updateConversationChannelTitle({
      conversationId,
      userId: resolvedUser.userId,
      title: requestedTitle,
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
