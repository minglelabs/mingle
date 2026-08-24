import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { getAuthOptions } from "@/lib/auth-options";
import {
  APP_CONVERSATION_STATUS_ACTIVE,
  APP_CONVERSATION_STATUS_PAUSED,
  type ConversationHydrationCursor,
  deleteConversationChannel,
  getConversationHydrationStateForUser,
  getConversationSessionKeyForMember,
  leaveConversationChannel,
  listChannelMemberUserIdsBySessionKey,
  listConversationMembersForUser,
  markConversationChannelRead,
  normalizeConversationChannelStatus,
  updateConversationChannelStatus,
  updateConversationChannelSelectedLanguages,
  updateConversationChannelSpeechLanguages,
  updateConversationChannelTranslationLanguagesLinked,
  updateConversationChannelDefaultDisplayLanguage,
  updateConversationChannelTitle,
} from "@/lib/app-conversations";
import { ensureTrackingContext } from "@/lib/app-analytics";
import { resolveOrCreateUserIdForRequest } from "@/lib/request-user-identity";
import { sanitizeSttLanguageSelection } from "@/lib/stt-languages";
import { mintConversationRealtimeToken, notifyConversationMessage } from "@/server/conversation-realtime";

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

function readConversationHydrationCursor(
  request: NextRequest,
): { cursor: ConversationHydrationCursor | null; errorResponse: NextResponse | null } {
  const beforeCreatedAtMsRaw = request.nextUrl.searchParams.get("beforeCreatedAtMs");
  const beforeMessageIdRaw = request.nextUrl.searchParams.get("beforeMessageId");

  if (!beforeCreatedAtMsRaw && !beforeMessageIdRaw) {
    return { cursor: null, errorResponse: null };
  }

  const beforeCreatedAtMs = Number(beforeCreatedAtMsRaw);
  const beforeMessageId = (beforeMessageIdRaw || "").trim();
  if (!Number.isFinite(beforeCreatedAtMs) || beforeCreatedAtMs <= 0 || !beforeMessageId) {
    return {
      cursor: null,
      errorResponse: NextResponse.json({ error: "invalid_cursor" }, { status: 400 }),
    };
  }

  return {
    cursor: {
      createdAtMs: Math.floor(beforeCreatedAtMs),
      messageId: beforeMessageId,
    },
    errorResponse: null,
  };
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

  let body: {
    status?: unknown;
    selectedLanguages?: unknown;
    speechLanguages?: unknown;
    translationLanguagesLinked?: unknown;
    defaultDisplayLanguage?: unknown;
    title?: unknown;
    markRead?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const hasStatus = typeof body.status === "string";
  const hasSelectedLanguages = body.selectedLanguages !== undefined;
  const hasSpeechLanguages = body.speechLanguages !== undefined;
  const hasTranslationLanguagesLinked = body.translationLanguagesLinked !== undefined;
  const hasDefaultDisplayLanguage = body.defaultDisplayLanguage !== undefined;
  const hasTitle = typeof body.title === "string";
  const hasMarkRead = body.markRead !== undefined;

  if (!hasStatus && !hasSelectedLanguages && !hasSpeechLanguages && !hasTranslationLanguagesLinked && !hasDefaultDisplayLanguage && !hasTitle && !hasMarkRead) {
    return NextResponse.json({ error: "invalid_patch" }, { status: 400 });
  }

  if (hasMarkRead && body.markRead !== true) {
    return NextResponse.json({ error: "invalid_mark_read" }, { status: 400 });
  }

  if (hasTranslationLanguagesLinked && typeof body.translationLanguagesLinked !== "boolean") {
    return NextResponse.json({ error: "invalid_translation_languages_linked" }, { status: 400 });
  }

  if (
    hasDefaultDisplayLanguage
    && body.defaultDisplayLanguage !== null
    && typeof body.defaultDisplayLanguage !== "string"
  ) {
    return NextResponse.json({ error: "invalid_default_display_language" }, { status: 400 });
  }

  const requestedDefaultDisplayLanguage = hasDefaultDisplayLanguage
    ? (typeof body.defaultDisplayLanguage === "string"
      ? body.defaultDisplayLanguage.trim() || null
      : null)
    : null;

  const selectedLanguages = hasSelectedLanguages
    ? sanitizeSttLanguageSelection(body.selectedLanguages)
    : null;
  if (hasSelectedLanguages && (!selectedLanguages || selectedLanguages.length === 0)) {
    return NextResponse.json({ error: "invalid_selected_languages" }, { status: 400 });
  }
  const speechLanguages = hasSpeechLanguages
    ? sanitizeSttLanguageSelection(body.speechLanguages)
    : null;
  if (hasSpeechLanguages && (!speechLanguages || speechLanguages.length === 0)) {
    return NextResponse.json({ error: "invalid_speech_languages" }, { status: 400 });
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
    if (!conversation) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
  }

  if (hasSpeechLanguages) {
    conversation = await updateConversationChannelSpeechLanguages({
      conversationId,
      userId: resolvedUser.userId,
      speechLanguages: speechLanguages!,
    });
    if (!conversation) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
  }

  if (hasTranslationLanguagesLinked) {
    conversation = await updateConversationChannelTranslationLanguagesLinked({
      conversationId,
      userId: resolvedUser.userId,
      translationLanguagesLinked: body.translationLanguagesLinked as boolean,
    });
    if (!conversation) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
  }

  if (hasDefaultDisplayLanguage) {
    try {
      conversation = await updateConversationChannelDefaultDisplayLanguage({
        conversationId,
        userId: resolvedUser.userId,
        defaultDisplayLanguage: requestedDefaultDisplayLanguage,
      });
    } catch (error) {
      if (error instanceof Error && error.message === "invalid_default_display_language") {
        return NextResponse.json({ error: "invalid_default_display_language" }, { status: 400 });
      }
      throw error;
    }
    if (!conversation) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
  }

  if (hasStatus) {
    conversation = await updateConversationChannelStatus({
      conversationId,
      userId: resolvedUser.userId,
      status: normalizeConversationChannelStatus(requestedStatus),
    });
    if (!conversation) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
  }

  if (hasTitle) {
    conversation = await updateConversationChannelTitle({
      conversationId,
      userId: resolvedUser.userId,
      title: requestedTitle,
    });
    if (!conversation) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
  }

  if (hasMarkRead) {
    const markedRead = await markConversationChannelRead({
      conversationId,
      userId: resolvedUser.userId,
    });
    if (!markedRead) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
  }

  if (!conversation) {
    if (hasMarkRead) {
      const trackingHints = resolvedUser.tracking
        ? {
            externalUserId: resolvedUser.tracking.externalUserId,
            sessionKey: resolvedUser.tracking.sessionKey,
          }
        : resolvedUser.identity;
      const response = NextResponse.json({ read: true });
      applyTrackingCookies(request, response, trackingHints);
      return response;
    }
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

  const { cursor, errorResponse } = readConversationHydrationCursor(request);
  if (errorResponse) {
    return errorResponse;
  }

  const conversationState = await getConversationHydrationStateForUser({
    conversationId,
    userId: resolvedUser.userId,
    ...(cursor ? { before: cursor } : {}),
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

/**
 * Mints the token the client hands mingle-stt to open a push channel for
 * this conversation. This is the one place membership actually gets
 * checked — mingle-stt has no database, so everything downstream trusts
 * this signature.
 */
export async function getConversationRealtimeTokenResponse(
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

  const sessionKey = await getConversationSessionKeyForMember({
    conversationId,
    userId: resolvedUser.userId,
  });

  if (!sessionKey) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const token = mintConversationRealtimeToken({ sessionKey, userId: resolvedUser.userId });
  // Realtime push is unconfigured in this environment — not an error the
  // caller needs to see, since the client falls back to polling.
  return NextResponse.json({ token });
}

export async function getConversationMembersResponse(
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

  const members = await listConversationMembersForUser({
    conversationId,
    userId: resolvedUser.userId,
  });

  if (!members) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  return NextResponse.json({ members });
}

export async function deleteConversationResponse(
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

  let conversation;
  try {
    conversation = await deleteConversationChannel({
      conversationId,
      userId: resolvedUser.userId,
    });
  } catch (error) {
    console.error("[conversations] delete_failed", error);
    return NextResponse.json({ error: "conversation_channel_delete_conflict" }, { status: 409 });
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
  const response = NextResponse.json({
    deletedConversationId: conversation.id,
  });
  applyTrackingCookies(request, response, trackingHints);
  return response;
}

export async function leaveConversationResponse(
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

  let conversation;
  try {
    conversation = await leaveConversationChannel({
      conversationId,
      userId: resolvedUser.userId,
    });
  } catch (error) {
    console.error("[conversations] leave_failed", error);
    return NextResponse.json({ error: "conversation_channel_leave_conflict" }, { status: 409 });
  }

  if (!conversation) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  // Same best-effort push used for a landed message (see
  // log-client-event-handler.ts) — lets any remaining member's already-open
  // room and conversation-list screen pick up the departure and the new "X
  // left" notice without waiting on their own poll cycle.
  const memberUserIds = await listChannelMemberUserIdsBySessionKey(conversation.sessionKey).catch(() => []);
  notifyConversationMessage(conversation.sessionKey, memberUserIds);

  const trackingHints = resolvedUser.tracking
    ? {
        externalUserId: resolvedUser.tracking.externalUserId,
        sessionKey: resolvedUser.tracking.sessionKey,
      }
    : resolvedUser.identity;
  const response = NextResponse.json({
    leftConversationId: conversation.id,
  });
  applyTrackingCookies(request, response, trackingHints);
  return response;
}
