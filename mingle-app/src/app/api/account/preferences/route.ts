import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { getAuthOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";

const MIN_TEXT_SIZE_LEVEL = 1;
const MAX_TEXT_SIZE_LEVEL = 5;
const MIN_SILENCE_MS = 500;
const MAX_SILENCE_MS = 3000;

type PreferencesBody = {
  textSizeLevel?: unknown;
  sonioxManualFinalizeSilenceMs?: unknown;
};

function asClampedInteger(value: unknown, min: number, max: number): number | null {
  const asNumber = Number(value);
  if (!Number.isFinite(asNumber)) return null;
  return Math.max(min, Math.min(max, Math.round(asNumber)));
}

export async function PATCH(request: Request) {
  const session = await getServerSession(getAuthOptions());
  if (!session?.user) {
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
  if (nextTextSizeLevel === null && nextSilenceMs === null) {
    return NextResponse.json({ error: "no_valid_fields" }, { status: 400 });
  }

  const normalizedUserId = typeof session.user.id === "string" ? session.user.id.trim() : "";
  const normalizedEmail = typeof session.user.email === "string" ? session.user.email.trim().toLowerCase() : "";

  const data = {
    ...(nextTextSizeLevel !== null ? { demoTextSizeLevel: nextTextSizeLevel } : {}),
    ...(nextSilenceMs !== null ? { demoSilenceFinalizeMs: nextSilenceMs } : {}),
  };

  if (normalizedUserId) {
    const result = await prisma.user.updateMany({
      where: { id: normalizedUserId },
      data,
    });
    if (result.count > 0) {
      return NextResponse.json({ ok: true });
    }
  }

  if (normalizedEmail) {
    const result = await prisma.user.updateMany({
      where: { email: normalizedEmail },
      data,
    });
    if (result.count > 0) {
      return NextResponse.json({ ok: true });
    }
  }

  return NextResponse.json({ error: "user_not_found" }, { status: 404 });
}
