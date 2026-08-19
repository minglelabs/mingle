import { type NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { getAuthOptions } from "@/lib/auth-options";
import {
  createConversationChannelForUser,
  findOrCreateDirectConversation,
  listConversationChannelsForExternalUserId,
  listConversationChannelsForUser,
} from "@/lib/app-conversations";
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

  const trackingHints = resolvedUser.tracking
    ? {
        externalUserId: resolvedUser.tracking.externalUserId,
        sessionKey: resolvedUser.tracking.sessionKey,
      }
    : resolvedUser.identity;
  let conversation;
  try {
    conversation = await createConversationChannelForUser(resolvedUser.userId, {
      locale,
      preferredSessionKey: legacySessionKey || undefined,
      selectedLanguages,
      speechLanguages,
      translationLanguagesLinked,
    });
  } catch (error) {
    console.error("[conversations] create_failed", error);
    return NextResponse.json({ error: "conversation_channel_create_conflict" }, { status: 409 });
  }
  const response = NextResponse.json({ conversation }, { status: 201 });
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

  let body: { targetUserId?: unknown; locale?: unknown } | null = null;
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

  const trackingHints = resolvedUser.tracking
    ? {
        externalUserId: resolvedUser.tracking.externalUserId,
        sessionKey: resolvedUser.tracking.sessionKey,
      }
    : resolvedUser.identity;

  let conversation;
  try {
    conversation = await findOrCreateDirectConversation({
      userId: resolvedUser.userId,
      targetUserId,
      locale,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "target_user_not_found") {
      return NextResponse.json({ error: "target_user_not_found" }, { status: 404 });
    }
    if (error instanceof Error && error.message === "invalid_target_user") {
      return NextResponse.json({ error: "invalid_target_user" }, { status: 400 });
    }
    console.error("[conversations/direct] create_failed", error);
    return NextResponse.json({ error: "conversation_channel_create_conflict" }, { status: 409 });
  }
  const response = NextResponse.json({ conversation }, { status: 200 });
  applyTrackingCookies(request, response, trackingHints);
  return response;
}
