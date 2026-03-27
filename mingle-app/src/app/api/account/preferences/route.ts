import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { getAuthOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";
import {
  ensureTrackingContext,
  upsertTrackedUser,
} from "@/lib/app-analytics";
import {
  normalizeSelectableTranslationModel,
  resolveDefaultSelectableTranslationModel,
} from "@/lib/translation-models";

const MIN_TEXT_SIZE_LEVEL = 1;
const MAX_TEXT_SIZE_LEVEL = 5;
const DEFAULT_TEXT_SIZE_LEVEL = 2;
const MIN_SILENCE_MS = 500;
const MAX_SILENCE_MS = 3000;
const DEFAULT_SILENCE_MS = 500;
const ENABLE_ACCOUNT_PREFERENCES_DEBUG_LOGS = process.env.NODE_ENV !== "production";

type PreferencesBody = {
  textSizeLevel?: unknown;
  sonioxManualFinalizeSilenceMs?: unknown;
  translationModel?: unknown;
};

type SessionUserIdentity = {
  id: string;
  email: string;
  externalUserId: string;
  sessionKey: string;
};

type UserPreferencesRecord = {
  demoTextSizeLevel: number | null;
  demoSilenceFinalizeMs: number | null;
  translationModel: string | null;
};

const EMPTY_CLIENT_CONTEXT = {
  language: null,
  pageLanguage: null,
  referrer: null,
  fullUrl: null,
  queryParams: null,
  screenWidth: null,
  screenHeight: null,
  timezone: null,
  platform: null,
  pathname: null,
  appVersion: null,
  usageSec: null,
} as const;

function logAccountPreferencesDebug(event: string, details: Record<string, unknown>) {
  if (!ENABLE_ACCOUNT_PREFERENCES_DEBUG_LOGS) return;
  console.info("[account/preferences]", event, details);
}

function asClampedInteger(value: unknown, min: number, max: number): number | null {
  const asNumber = Number(value);
  if (!Number.isFinite(asNumber)) return null;
  return Math.max(min, Math.min(max, Math.round(asNumber)));
}

function normalizeSessionUserIdentity(session: { user?: { id?: unknown; email?: unknown } } | null): SessionUserIdentity {
  return {
    id: typeof session?.user?.id === "string" ? session.user.id.trim() : "",
    email: typeof session?.user?.email === "string" ? session.user.email.trim().toLowerCase() : "",
    externalUserId: "",
    sessionKey: "",
  };
}

function sanitizeTrackingValue(rawValue: string | null): string {
  return (rawValue || "").trim().slice(0, 128);
}

function resolveTrackingSessionKey(request: Request): string {
  return sanitizeTrackingValue(
    request.headers.get("x-mingle-session-key")
    || readCookieValue(request, "mingle_sid")
    || null,
  );
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

function resolveTrackingExternalUserId(request: Request): string {
  return sanitizeTrackingValue(
    request.headers.get("x-mingle-user-id")
    || readCookieValue(request, "mingle_uid")
    || null,
  );
}

async function findUserIdBySessionKey(sessionKey: string): Promise<string | null> {
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

async function findUserPreferences(identity: SessionUserIdentity): Promise<UserPreferencesRecord | null> {
  const select = {
    demoTextSizeLevel: true,
    demoSilenceFinalizeMs: true,
    translationModel: true,
  } as const;

  if (identity.id) {
    const record = await prisma.user.findUnique({
      where: { id: identity.id },
      select,
    });
    if (record) {
      return record;
    }
  }

  if (identity.email) {
    const record = await prisma.user.findUnique({
      where: { email: identity.email },
      select,
    });
    if (record) {
      return record;
    }
  }

  if (identity.externalUserId) {
    const record = await prisma.user.findUnique({
      where: { externalUserId: identity.externalUserId },
      select,
    });
    if (record) {
      return record;
    }
  }

  if (identity.sessionKey) {
    const userId = await findUserIdBySessionKey(identity.sessionKey);
    if (userId) {
      const record = await prisma.user.findUnique({
        where: { id: userId },
        select,
      });
      if (record) {
        return record;
      }
    }
  }

  return null;
}

function hasIdentity(identity: SessionUserIdentity): boolean {
  return Boolean(identity.id || identity.email || identity.externalUserId || identity.sessionKey);
}

export async function GET(request: Request) {
  const nextRequest = request as NextRequest;
  const session = await getServerSession(getAuthOptions());
  const trackingSeedResponse = new NextResponse();
  const tracking = ensureTrackingContext(nextRequest, trackingSeedResponse, {
    externalUserIdHint: resolveTrackingExternalUserId(request) || null,
    sessionKeyHint: resolveTrackingSessionKey(request) || null,
  });
  const identity = {
    ...normalizeSessionUserIdentity(session),
    externalUserId: resolveTrackingExternalUserId(request) || tracking.externalUserId,
    sessionKey: resolveTrackingSessionKey(request) || tracking.sessionKey,
  };
  logAccountPreferencesDebug("get_request", {
    headerExternalUserId: resolveTrackingExternalUserId(request) || null,
    resolvedExternalUserId: identity.externalUserId || null,
    resolvedSessionUserId: identity.id || null,
    resolvedSessionKey: identity.sessionKey || null,
  });

  if (!hasIdentity(identity)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let preferences = await findUserPreferences(identity);
  if (!preferences && identity.externalUserId) {
    await upsertTrackedUser({
      tracking,
      clientContext: EMPTY_CLIENT_CONTEXT,
    });
    preferences = await findUserPreferences(identity);
  }

  const response = NextResponse.json({
    textSizeLevel: preferences?.demoTextSizeLevel ?? DEFAULT_TEXT_SIZE_LEVEL,
    sonioxManualFinalizeSilenceMs: preferences?.demoSilenceFinalizeMs ?? DEFAULT_SILENCE_MS,
    translationModel: normalizeSelectableTranslationModel(preferences?.translationModel)
      ?? resolveDefaultSelectableTranslationModel(),
  });
  ensureTrackingContext(nextRequest, response, {
    externalUserIdHint: tracking.externalUserId,
    sessionKeyHint: tracking.sessionKey,
  });
  return response;
}

export async function PATCH(request: Request) {
  const nextRequest = request as NextRequest;
  const session = await getServerSession(getAuthOptions());
  const trackingSeedResponse = new NextResponse();
  const tracking = ensureTrackingContext(nextRequest, trackingSeedResponse, {
    externalUserIdHint: resolveTrackingExternalUserId(request) || null,
    sessionKeyHint: resolveTrackingSessionKey(request) || null,
  });
  const identity = {
    ...normalizeSessionUserIdentity(session),
    externalUserId: resolveTrackingExternalUserId(request) || tracking.externalUserId,
    sessionKey: resolveTrackingSessionKey(request) || tracking.sessionKey,
  };
  logAccountPreferencesDebug("patch_request", {
    headerExternalUserId: resolveTrackingExternalUserId(request) || null,
    resolvedExternalUserId: identity.externalUserId || null,
    resolvedSessionUserId: identity.id || null,
    resolvedSessionKey: identity.sessionKey || null,
  });

  if (!hasIdentity(identity)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: PreferencesBody;
  try {
    body = (await request.json()) as PreferencesBody;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const nextTextSizeLevel = asClampedInteger(body.textSizeLevel, MIN_TEXT_SIZE_LEVEL, MAX_TEXT_SIZE_LEVEL);
  const nextSilenceMs = asClampedInteger(body.sonioxManualFinalizeSilenceMs, MIN_SILENCE_MS, MAX_SILENCE_MS);
  const nextTranslationModel = normalizeSelectableTranslationModel(body.translationModel);
  if (nextTextSizeLevel === null && nextSilenceMs === null && nextTranslationModel === null) {
    return NextResponse.json({ error: "no_valid_fields" }, { status: 400 });
  }

  const data = {
    ...(nextTextSizeLevel !== null ? { demoTextSizeLevel: nextTextSizeLevel } : {}),
    ...(nextSilenceMs !== null ? { demoSilenceFinalizeMs: nextSilenceMs } : {}),
    ...(nextTranslationModel !== null ? { translationModel: nextTranslationModel } : {}),
  };

  if (identity.id) {
    const result = await prisma.user.updateMany({
      where: { id: identity.id },
      data,
    });
    if (result.count > 0) {
      logAccountPreferencesDebug("patch_persisted", {
        via: "session_user_id",
        targetUserId: identity.id,
        headerExternalUserId: resolveTrackingExternalUserId(request) || null,
        translationModel: nextTranslationModel,
      });
      return NextResponse.json({ ok: true });
    }
  }

  if (identity.email) {
    const result = await prisma.user.updateMany({
      where: { email: identity.email },
      data,
    });
    if (result.count > 0) {
      logAccountPreferencesDebug("patch_persisted", {
        via: "session_email",
        targetUserEmail: identity.email,
        headerExternalUserId: resolveTrackingExternalUserId(request) || null,
        translationModel: nextTranslationModel,
      });
      return NextResponse.json({ ok: true });
    }
  }

  if (identity.externalUserId) {
    const result = await prisma.user.updateMany({
      where: { externalUserId: identity.externalUserId },
      data,
    });
    if (result.count > 0) {
      logAccountPreferencesDebug("patch_persisted", {
        via: "external_user_id",
        targetExternalUserId: identity.externalUserId,
        headerExternalUserId: resolveTrackingExternalUserId(request) || null,
        translationModel: nextTranslationModel,
      });
      return NextResponse.json({ ok: true });
    }
  }

  if (identity.sessionKey) {
    const userId = await findUserIdBySessionKey(identity.sessionKey);
    if (userId) {
      const result = await prisma.user.updateMany({
        where: { id: userId },
        data: {
          ...data,
          ...(identity.externalUserId ? { externalUserId: identity.externalUserId } : {}),
        },
      });
      if (result.count > 0) {
        logAccountPreferencesDebug("patch_persisted", {
          via: "session_key_lookup",
          targetUserId: userId,
          targetExternalUserId: identity.externalUserId || null,
          headerExternalUserId: resolveTrackingExternalUserId(request) || null,
          resolvedSessionKey: identity.sessionKey,
          translationModel: nextTranslationModel,
        });
        return NextResponse.json({ ok: true });
      }
    }
  }

  const createdUserId = await upsertTrackedUser({
    tracking,
    clientContext: EMPTY_CLIENT_CONTEXT,
  });
  const createResult = await prisma.user.updateMany({
    where: { id: createdUserId },
    data,
  });
  if (createResult.count > 0) {
    logAccountPreferencesDebug("patch_persisted", {
      via: "tracked_user_create",
      targetUserId: createdUserId,
      targetExternalUserId: tracking.externalUserId,
      headerExternalUserId: resolveTrackingExternalUserId(request) || null,
      resolvedSessionKey: tracking.sessionKey,
      translationModel: nextTranslationModel,
    });
    const response = NextResponse.json({ ok: true });
    ensureTrackingContext(nextRequest, response, {
      externalUserIdHint: tracking.externalUserId,
      sessionKeyHint: tracking.sessionKey,
    });
    return response;
  }

  const notFoundResponse = NextResponse.json({ error: "user_not_found" }, { status: 404 });
  ensureTrackingContext(nextRequest, notFoundResponse, {
    externalUserIdHint: tracking.externalUserId,
    sessionKeyHint: tracking.sessionKey,
  });
  return notFoundResponse;
}
