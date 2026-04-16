import { type NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { getAuthOptions } from "@/lib/auth-options";
import {
  createConversationChannelForUser,
  listConversationChannelsForUser,
} from "@/lib/app-conversations";
import { ensureTrackingContext } from "@/lib/app-analytics";
import { sanitizeSttLanguageSelection } from "@/lib/stt-languages";
import {
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

  const trackingHints = resolvedUser.tracking
    ? {
        externalUserId: resolvedUser.tracking.externalUserId,
        sessionKey: resolvedUser.tracking.sessionKey,
      }
    : resolvedUser.identity;
  const conversation = await createConversationChannelForUser(resolvedUser.userId, {
    locale,
    preferredSessionKey: legacySessionKey || undefined,
    selectedLanguages,
    speechLanguages,
  });
  const response = NextResponse.json({ conversation }, { status: 201 });
  applyTrackingCookies(request, response, trackingHints);
  return response;
}
