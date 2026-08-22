import { type NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { getAuthOptions } from "@/lib/auth-options";
import {
  createConversationChannelForUser,
  findExistingConversationWithExactMembers,
  findOrCreateDirectConversation,
  listConversationChannelsForExternalUserId,
  listConversationChannelsForUser,
  MAX_CONVERSATION_MEMBERS,
} from "@/lib/app-conversations";
import { mintConversationListRealtimeToken } from "@/server/conversation-realtime";
import { ensureTrackingContext } from "@/lib/app-analytics";
import { sanitizeSttLanguageSelection } from "@/lib/stt-languages";
import {
  normalizeSessionUserIdentity,
  resolveTrackingExternalUserId,
  resolveTrackingSessionKey,
  resolveOrCreateUserIdForRequest,
  sanitizeRequestIdentityValue,
} from "@/lib/request-user-identity";
import { isSupportedLocale } from "@/i18n/config";
import { prisma } from "@/lib/prisma";

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

  // Native tab switches already carry a trusted session identity or the
  // stable external tracking identity. Resolve the conversation list directly
  // for this read-only path so Railway does not spend one round-trip resolving
  // the user and another round-trip loading the same user's channels.
  if (request.nextUrl.searchParams.get("view") === "native-list") {
    const sessionIdentity = normalizeSessionUserIdentity(session);
    const externalUserId = resolveTrackingExternalUserId(request);
    const sessionKey = resolveTrackingSessionKey(request);
    const conversations = sessionIdentity.id
      ? await listConversationChannelsForUser(sessionIdentity.id)
      : externalUserId
        ? await listConversationChannelsForExternalUserId(externalUserId)
        : null;

    if (conversations) {
      const response = NextResponse.json({ conversations });
      applyTrackingCookies(request, response, {
        externalUserId: externalUserId || undefined,
        sessionKey: sessionKey || undefined,
      });
      return response;
    }
  }

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

  let body: {
    locale?: unknown;
    legacySessionKey?: unknown;
    selectedLanguages?: unknown;
    speechLanguages?: unknown;
    translationLanguagesLinked?: unknown;
    inviteeUserIds?: unknown;
    force?: unknown;
  } | null = null;
  try {
    body = await request.json();
  } catch {
    body = null;
  }

  const locale = typeof body?.locale === "string" && isSupportedLocale(body.locale.trim())
    ? body.locale.trim()
    : "en";
  const legacySessionKey = typeof body?.legacySessionKey === "string"
    ? sanitizeRequestIdentityValue(body.legacySessionKey)
    : "";
  const selectedLanguages = sanitizeSttLanguageSelection(body?.selectedLanguages);
  const speechLanguages = sanitizeSttLanguageSelection(body?.speechLanguages);
  const translationLanguagesLinked = typeof body?.translationLanguagesLinked === "boolean"
    ? body.translationLanguagesLinked
    : true;
  const inviteeUserIds = Array.isArray(body?.inviteeUserIds)
    ? [...new Set(
        body.inviteeUserIds
          .filter((id): id is string => typeof id === "string")
          .map((id) => id.trim())
          .filter((id) => id && id !== resolvedUser.userId),
      )]
    : [];

  // 10 people total including the creator, matching the invite picker's cap.
  if (inviteeUserIds.length > MAX_CONVERSATION_MEMBERS - 1) {
    return NextResponse.json({ error: "too_many_invitees" }, { status: 400 });
  }

  if (inviteeUserIds.length > 0) {
    const existingInvitees = await prisma.user.findMany({
      where: { id: { in: inviteeUserIds } },
      select: { id: true },
    });
    const existingInviteeIds = new Set(existingInvitees.map((user) => user.id));
    if (inviteeUserIds.some((inviteeUserId) => !existingInviteeIds.has(inviteeUserId))) {
      return NextResponse.json({ error: "invalid_invitee_user_ids" }, { status: 400 });
    }
  }

  const force = body?.force === true;

  const trackingHints = resolvedUser.tracking
    ? {
        externalUserId: resolvedUser.tracking.externalUserId,
        sessionKey: resolvedUser.tracking.sessionKey,
      }
    : resolvedUser.identity;

  // Group-start flow only (inviteeUserIds.length > 0) — plain "start alone"
  // always creates fresh. A 1:1 "message this person" gets the same
  // reused/create choice through the direct endpoint below. Here `force`
  // lets the "create new anyway" button skip this check and always create a
  // duplicate on purpose.
  if (inviteeUserIds.length > 0 && !force) {
    const existing = await findExistingConversationWithExactMembers({
      userId: resolvedUser.userId,
      otherUserIds: inviteeUserIds,
    });
    if (existing) {
      const response = NextResponse.json({ conversation: existing, reused: true }, { status: 200 });
      applyTrackingCookies(request, response, trackingHints);
      return response;
    }
  }

  let conversation;
  try {
    conversation = await createConversationChannelForUser(resolvedUser.userId, {
      locale,
      preferredSessionKey: legacySessionKey || undefined,
      selectedLanguages,
      speechLanguages,
      translationLanguagesLinked,
      inviteeUserIds,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "target_user_blocked") {
      return NextResponse.json({ error: "target_user_blocked" }, { status: 403 });
    }
    console.error("[conversations] create_failed", error);
    return NextResponse.json({ error: "conversation_channel_create_conflict" }, { status: 409 });
  }
  const response = NextResponse.json({ conversation, reused: false }, { status: 201 });
  applyTrackingCookies(request, response, trackingHints);
  return response;
}

export async function postDirectConversationResponse(request: NextRequest) {
  const session = await getServerSession(getAuthOptions());
  const resolvedUser = await resolveOrCreateUserIdForRequest({
    request,
    session,
  });

  if (!resolvedUser.userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: { targetUserId?: unknown; locale?: unknown; force?: unknown } | null = null;
  try {
    body = await request.json();
  } catch {
    body = null;
  }

  const targetUserId = typeof body?.targetUserId === "string" ? body.targetUserId.trim() : "";
  if (!targetUserId) {
    return NextResponse.json({ error: "invalid_target_user" }, { status: 400 });
  }

  const locale = typeof body?.locale === "string" && isSupportedLocale(body.locale.trim())
    ? body.locale.trim()
    : "en";
  const force = body?.force === true;

  const trackingHints = resolvedUser.tracking
    ? {
        externalUserId: resolvedUser.tracking.externalUserId,
        sessionKey: resolvedUser.tracking.sessionKey,
      }
    : resolvedUser.identity;

  let conversationResult;
  try {
    conversationResult = await findOrCreateDirectConversation({
      userId: resolvedUser.userId,
      targetUserId,
      locale,
      force,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "target_user_not_found") {
      return NextResponse.json({ error: "target_user_not_found" }, { status: 404 });
    }
    if (error instanceof Error && error.message === "invalid_target_user") {
      return NextResponse.json({ error: "invalid_target_user" }, { status: 400 });
    }
    if (error instanceof Error && error.message === "target_user_blocked") {
      return NextResponse.json({ error: "target_user_blocked" }, { status: 403 });
    }
    console.error("[conversations/direct] create_failed", error);
    return NextResponse.json({ error: "conversation_channel_create_conflict" }, { status: 409 });
  }
  const response = NextResponse.json({
    conversation: conversationResult.conversation,
    reused: conversationResult.reused,
  }, { status: conversationResult.reused ? 200 : 201 });
  applyTrackingCookies(request, response, trackingHints);
  return response;
}

// Lets the conversation LIST screen (not any one open room) subscribe to a
// push channel for "a message landed in one of my rooms," so a new message
// shows up there without the user opening the room or refreshing the page.
export async function getConversationListRealtimeTokenResponse(request: NextRequest) {
  const session = await getServerSession(getAuthOptions());
  const resolvedUser = await resolveOrCreateUserIdForRequest({
    request,
    session,
  });

  if (!resolvedUser.userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const token = mintConversationListRealtimeToken(resolvedUser.userId);
  // Realtime push is unconfigured in this environment — not an error the
  // caller needs to see, since the client falls back to polling.
  return NextResponse.json({ token });
}
