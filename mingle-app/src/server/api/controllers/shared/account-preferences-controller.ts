import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { getAuthOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";
import {
  ensureTrackingContext,
  parseClientContext,
  upsertTrackedUser,
} from "@/lib/app-analytics";
import {
  normalizeSelectableTranslationModel,
  resolveDefaultSelectableTranslationModel,
} from "@/lib/translation-models";

export const runtime = "nodejs";

const MIN_TEXT_SIZE_LEVEL = 1;
const MAX_TEXT_SIZE_LEVEL = 5;
const DEFAULT_TEXT_SIZE_LEVEL = 2;
const MIN_SILENCE_MS = 500;
const MAX_SILENCE_MS = 3000;
const DEFAULT_SILENCE_MS = 500;
const DEFAULT_ENDPOINT_MAX_DELAY_MS = 3000;
const MIN_ENDPOINT_TUNING_STEP = 0;
const MAX_ENDPOINT_TUNING_STEP = 4;
const DEFAULT_ENDPOINT_TUNING_STEP = 2;
const AD_BANNER_POSITIONS = new Set(["top", "bottom"]);
const ENABLE_ACCOUNT_PREFERENCES_DEBUG_LOGS = process.env.NODE_ENV !== "production";

type PreferencesBody = {
  textSizeLevel?: unknown;
  sonioxManualFinalizeSilenceMs?: unknown;
  sonioxEndpointMaxDelayMs?: unknown;
  sonioxEndpointTuningStep?: unknown;
  translationModel?: unknown;
  adBannerPosition?: unknown;
};

type SessionUserIdentity = {
  id: string;
  email: string;
  externalUserId: string;
  sessionKey: string;
};

type UserPreferencesRecord = {
  id: string;
  demoTextSizeLevel: number | null;
  demoSilenceFinalizeMs: number | null;
  demoEndpointMaxDelayMs: number | null;
  demoEndpointTuningStep: number | null;
  translationModel: string | null;
  adBannerPosition: string | null;
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
  clientPlatform: null,
  apiNamespace: null,
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

function normalizeAdBannerPosition(value: unknown): "top" | "bottom" | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return AD_BANNER_POSITIONS.has(normalized)
    ? (normalized as "top" | "bottom")
    : null;
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

function resolveTrackingClientContext(request: Request) {
  return parseClientContext({
    appVersion: request.headers.get("x-mingle-app-version"),
    apiNamespace: request.headers.get("x-mingle-api-namespace"),
    clientPlatform: request.headers.get("x-mingle-client-platform"),
  });
}

function mergeUniqueHistory(history: string[], nextValue: string | null): string[] | null {
  if (!nextValue || history.includes(nextValue)) return null;
  return [...history, nextValue];
}

async function syncUserVersionContext(userId: string, request: Request) {
  const clientContext = resolveTrackingClientContext(request);
  if (!clientContext.appVersion && !clientContext.apiNamespace && !clientContext.clientPlatform) {
    return;
  }

  const record = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      latestAppVersion: true,
      latestApiNamespace: true,
      latestClientPlatform: true,
      appVersionHistory: true,
      apiNamespaceHistory: true,
    },
  });
  if (!record) return;

  const nextAppVersionHistory = mergeUniqueHistory(record.appVersionHistory, clientContext.appVersion);
  const nextApiNamespaceHistory = mergeUniqueHistory(record.apiNamespaceHistory, clientContext.apiNamespace);
  const data = {
    ...(clientContext.appVersion && record.latestAppVersion !== clientContext.appVersion
      ? { latestAppVersion: clientContext.appVersion }
      : {}),
    ...(clientContext.apiNamespace && record.latestApiNamespace !== clientContext.apiNamespace
      ? { latestApiNamespace: clientContext.apiNamespace }
      : {}),
    ...(clientContext.clientPlatform && record.latestClientPlatform !== clientContext.clientPlatform
      ? { latestClientPlatform: clientContext.clientPlatform }
      : {}),
    ...(nextAppVersionHistory ? { appVersionHistory: nextAppVersionHistory } : {}),
    ...(nextApiNamespaceHistory ? { apiNamespaceHistory: nextApiNamespaceHistory } : {}),
  };

  if (Object.keys(data).length === 0) return;

  await prisma.user.update({
    where: { id: userId },
    data,
  });
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
    id: true,
    demoTextSizeLevel: true,
    demoSilenceFinalizeMs: true,
    demoEndpointMaxDelayMs: true,
    demoEndpointTuningStep: true,
    translationModel: true,
    adBannerPosition: true,
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
  const requestClientContext = resolveTrackingClientContext(request);
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
  if (preferences) {
    await syncUserVersionContext(preferences.id, request);
  }
  if (!preferences && identity.externalUserId) {
    await upsertTrackedUser({
      tracking,
      clientContext: {
        ...EMPTY_CLIENT_CONTEXT,
        ...requestClientContext,
      },
    });
    preferences = await findUserPreferences(identity);
  }

  const response = NextResponse.json({
    textSizeLevel: preferences?.demoTextSizeLevel ?? DEFAULT_TEXT_SIZE_LEVEL,
    sonioxManualFinalizeSilenceMs: preferences?.demoSilenceFinalizeMs ?? DEFAULT_SILENCE_MS,
    sonioxEndpointMaxDelayMs: preferences?.demoEndpointMaxDelayMs ?? DEFAULT_ENDPOINT_MAX_DELAY_MS,
    sonioxEndpointTuningStep: preferences?.demoEndpointTuningStep ?? DEFAULT_ENDPOINT_TUNING_STEP,
    translationModel: normalizeSelectableTranslationModel(preferences?.translationModel)
      ?? resolveDefaultSelectableTranslationModel(),
    adBannerPosition: normalizeAdBannerPosition(preferences?.adBannerPosition),
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
  const requestClientContext = resolveTrackingClientContext(request);
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
  const nextEndpointMaxDelayMs = asClampedInteger(body.sonioxEndpointMaxDelayMs, MIN_SILENCE_MS, MAX_SILENCE_MS);
  const nextEndpointTuningStep = asClampedInteger(
    body.sonioxEndpointTuningStep,
    MIN_ENDPOINT_TUNING_STEP,
    MAX_ENDPOINT_TUNING_STEP,
  );
  const nextTranslationModel = normalizeSelectableTranslationModel(body.translationModel);
  const nextAdBannerPosition = normalizeAdBannerPosition(body.adBannerPosition);
  if (
    nextTextSizeLevel === null
    && nextSilenceMs === null
    && nextEndpointMaxDelayMs === null
    && nextEndpointTuningStep === null
    && nextTranslationModel === null
    && nextAdBannerPosition === null
  ) {
    return NextResponse.json({ error: "no_valid_fields" }, { status: 400 });
  }

  const data = {
    ...(nextTextSizeLevel !== null ? { demoTextSizeLevel: nextTextSizeLevel } : {}),
    ...(nextSilenceMs !== null ? { demoSilenceFinalizeMs: nextSilenceMs } : {}),
    ...(nextEndpointMaxDelayMs !== null ? { demoEndpointMaxDelayMs: nextEndpointMaxDelayMs } : {}),
    ...(nextEndpointTuningStep !== null ? { demoEndpointTuningStep: nextEndpointTuningStep } : {}),
    ...(nextTranslationModel !== null ? { translationModel: nextTranslationModel } : {}),
    ...(nextAdBannerPosition !== null ? { adBannerPosition: nextAdBannerPosition } : {}),
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
        endpointMaxDelayMs: nextEndpointMaxDelayMs,
        endpointTuningStep: nextEndpointTuningStep,
        translationModel: nextTranslationModel,
        adBannerPosition: nextAdBannerPosition,
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
        endpointMaxDelayMs: nextEndpointMaxDelayMs,
        endpointTuningStep: nextEndpointTuningStep,
        translationModel: nextTranslationModel,
        adBannerPosition: nextAdBannerPosition,
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
        endpointMaxDelayMs: nextEndpointMaxDelayMs,
        endpointTuningStep: nextEndpointTuningStep,
        translationModel: nextTranslationModel,
        adBannerPosition: nextAdBannerPosition,
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
          endpointMaxDelayMs: nextEndpointMaxDelayMs,
          endpointTuningStep: nextEndpointTuningStep,
          translationModel: nextTranslationModel,
          adBannerPosition: nextAdBannerPosition,
        });
        return NextResponse.json({ ok: true });
      }
    }
  }

  const createdUserId = await upsertTrackedUser({
    tracking,
    clientContext: {
      ...EMPTY_CLIENT_CONTEXT,
      ...requestClientContext,
    },
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
      endpointMaxDelayMs: nextEndpointMaxDelayMs,
      endpointTuningStep: nextEndpointTuningStep,
      translationModel: nextTranslationModel,
      adBannerPosition: nextAdBannerPosition,
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
