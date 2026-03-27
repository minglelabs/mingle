import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { getAuthOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";
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

type PreferencesBody = {
  textSizeLevel?: unknown;
  sonioxManualFinalizeSilenceMs?: unknown;
  translationModel?: unknown;
};

type SessionUserIdentity = {
  id: string;
  email: string;
  externalUserId: string;
};

type UserPreferencesRecord = {
  demoTextSizeLevel: number | null;
  demoSilenceFinalizeMs: number | null;
  translationModel: string | null;
};

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
  };
}

function sanitizeTrackingValue(rawValue: string | null): string {
  return (rawValue || "").trim().slice(0, 128);
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

  return null;
}

function hasIdentity(identity: SessionUserIdentity): boolean {
  return Boolean(identity.id || identity.email || identity.externalUserId);
}

export async function GET(request: Request) {
  const session = await getServerSession(getAuthOptions());
  const identity = {
    ...normalizeSessionUserIdentity(session),
    externalUserId: resolveTrackingExternalUserId(request),
  };

  if (!hasIdentity(identity)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const preferences = await findUserPreferences(identity);
  if (!preferences) {
    return NextResponse.json({ error: "user_not_found" }, { status: 404 });
  }

  return NextResponse.json({
    textSizeLevel: preferences.demoTextSizeLevel ?? DEFAULT_TEXT_SIZE_LEVEL,
    sonioxManualFinalizeSilenceMs: preferences.demoSilenceFinalizeMs ?? DEFAULT_SILENCE_MS,
    translationModel: normalizeSelectableTranslationModel(preferences.translationModel)
      ?? resolveDefaultSelectableTranslationModel(),
  });
}

export async function PATCH(request: Request) {
  const session = await getServerSession(getAuthOptions());
  const identity = {
    ...normalizeSessionUserIdentity(session),
    externalUserId: resolveTrackingExternalUserId(request),
  };

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
      return NextResponse.json({ ok: true });
    }
  }

  if (identity.email) {
    const result = await prisma.user.updateMany({
      where: { email: identity.email },
      data,
    });
    if (result.count > 0) {
      return NextResponse.json({ ok: true });
    }
  }

  if (identity.externalUserId) {
    const result = await prisma.user.updateMany({
      where: { externalUserId: identity.externalUserId },
      data,
    });
    if (result.count > 0) {
      return NextResponse.json({ ok: true });
    }
  }

  return NextResponse.json({ error: "user_not_found" }, { status: 404 });
}
